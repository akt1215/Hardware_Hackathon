// Particle Storm remote — STM32 Nucleo-G474RE firmware.
//
// "The World is Your Controller": this board is a physical motion remote.
// It reads tilt / shake / hand-distance / temperature and streams one CSV
// line per loop out the USB (ST-Link Virtual COM Port). The browser app
// reads that stream via the Web Serial API and drives a 3D particle storm.
//
// Serial protocol (115200 baud), one line per frame, terminated by '\n':
//     roll,pitch,dist,temp,gesture
//   roll    float  degrees  (-180..180)  board roll  -> orbit particles
//   pitch   float  degrees  (-90..90)    board pitch -> orbit particles
//   dist    float  cm       (-1 if none) hand height -> expansion radius
//   temp    float  degC                  -> particle hue
//   gesture int    0 or 1                1 = shake detected this frame -> explode
//
// Pin map (Arduino names on Nucleo-G474RE):
//   I2C  SDA=D14(PB9) SCL=D15(PB8) : MPU-6050 @0x68, MCP9808 @0x18
//   HC-SR04 TRIG=D7  ECHO=D6  (ECHO via 1k/2k divider; sensor VCC=5V)
//   Speaker signal = D9 (tone());  A+ on STEMMA, A- to GND, VIN=5V

#include <Arduino.h>
#include <Wire.h>
#include <Adafruit_MPU6050.h>
#include <Adafruit_MCP9808.h>
#include <math.h>

// ---- pins ----
static const uint8_t PIN_TRIG = D7;
static const uint8_t PIN_ECHO = D6;
static const uint8_t PIN_SPK  = D9;

// ---- tuning ----
static const float EMA_ALPHA            = 0.30f;  // distance/angle smoothing
static const float SHAKE_THRESH         = 8.0f;   // m/s^2 deviation from 1g = shake
static const uint32_t SHAKE_COOLDOWN_MS = 350;    // min gap between explode triggers
static const uint32_t LOOP_PERIOD_MS    = 20;     // ~50 Hz stream
static const float DIST_MAX_CM          = 60.0f;  // beyond this, report "no hand"
static const uint32_t ECHO_TIMEOUT_US   = 25000;  // ~4 m max wait

Adafruit_MPU6050 mpu;
Adafruit_MCP9808 mcp;
bool haveMpu = false;
bool haveMcp = false;

float rollF = 0, pitchF = 0, distF = -1, tempF = 25;
uint32_t lastShakeMs = 0;
uint32_t lastLoopMs = 0;

static float ema(float prev, float now) { return prev + EMA_ALPHA * (now - prev); }

// Single HC-SR04 ping -> cm, or -1 if out of range / no echo.
static float readDistanceCm() {
  digitalWrite(PIN_TRIG, LOW);
  delayMicroseconds(3);
  digitalWrite(PIN_TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(PIN_TRIG, LOW);
  unsigned long us = pulseIn(PIN_ECHO, HIGH, ECHO_TIMEOUT_US);
  if (us == 0) return -1.0f;
  float cm = us / 58.0f;             // ~58 us per cm round-trip
  if (cm > DIST_MAX_CM) return -1.0f;
  return cm;
}

// C major pentatonic (C5 D5 E5 G5 A5) — always-consonant "zen" notes.
static const int ZEN[5] = { 523, 587, 659, 784, 880 };

// A soft pentatonic bell on the STEMMA speaker — calming, never dissonant.
static void zenBell() { tone(PIN_SPK, ZEN[random(0, 5)], 220); }

// Calm ascending arpeggio (blocking — only used at boot).
static void zenBoot() {
  tone(PIN_SPK, ZEN[0], 160); delay(180);
  tone(PIN_SPK, ZEN[2], 160); delay(180);
  tone(PIN_SPK, ZEN[3], 260); delay(160);
}

void setup() {
  Serial.begin(115200);
  pinMode(PIN_TRIG, OUTPUT);
  pinMode(PIN_ECHO, INPUT);
  pinMode(LED_BUILTIN, OUTPUT);
  digitalWrite(PIN_TRIG, LOW);

  Wire.begin();

  haveMpu = mpu.begin();
  if (haveMpu) {
    mpu.setAccelerometerRange(MPU6050_RANGE_8_G);
    mpu.setGyroRange(MPU6050_RANGE_500_DEG);
    mpu.setFilterBandwidth(MPU6050_BAND_21_HZ);
  } else {
    Serial.println("# MPU6050 init failed");
  }

  haveMcp = mcp.begin(0x18);
  if (haveMcp) {
    mcp.setResolution(1);   // 0.25 C
    mcp.wake();
  } else {
    Serial.println("# MCP9808 init failed");
  }

  zenBoot();                // calm ascending pentatonic motif on boot
}

void loop() {
  uint32_t now = millis();
  if (now - lastLoopMs < LOOP_PERIOD_MS) return;
  lastLoopMs = now;

  int gesture = 0;

  // --- MPU-6050: orientation + shake ---
  if (haveMpu) {
    sensors_event_t a, g, t;
    mpu.getEvent(&a, &g, &t);
    float ax = a.acceleration.x, ay = a.acceleration.y, az = a.acceleration.z;

    float roll  = atan2f(ay, az) * 57.2957795f;
    float pitch = atan2f(-ax, sqrtf(ay * ay + az * az)) * 57.2957795f;
    rollF  = ema(rollF, roll);
    pitchF = ema(pitchF, pitch);

    float mag = sqrtf(ax * ax + ay * ay + az * az);
    if (fabsf(mag - 9.81f) > SHAKE_THRESH && (now - lastShakeMs) > SHAKE_COOLDOWN_MS) {
      gesture = 1;
      lastShakeMs = now;
      zenBell();            // soft pentatonic bell on shake/explode
    }
  }

  // --- HC-SR04: hand distance ---
  float d = readDistanceCm();
  if (d < 0) distF = -1.0f;
  else distF = (distF < 0) ? d : ema(distF, d);

  // --- MCP9808: temperature (hue) ---
  if (haveMcp) tempF = ema(tempF, mcp.readTempC());

  // --- LED: on while a hand is present ---
  digitalWrite(LED_BUILTIN, distF >= 0 ? HIGH : LOW);

  // --- stream one CSV frame ---
  Serial.print(rollF, 1);  Serial.print(',');
  Serial.print(pitchF, 1); Serial.print(',');
  Serial.print(distF, 1);  Serial.print(',');
  Serial.print(tempF, 1);  Serial.print(',');
  Serial.println(gesture);
}
