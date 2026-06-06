// IMU streamer — reads the MPU-6050 and emits one JSON frame per sample over
// serial, matching the team data contract (AGENTS.md):
//
//   {"timestamp_ms":<ms>,"imu":{"accelerometer_g":{"x":..,"y":..,"z":..},
//                               "gyroscope_dps":{"x":..,"y":..,"z":..}}}
//
// The same code runs on the Nucleo (real MPU-6050) and on the laptop (native
// sim, virtual MPU-6050 in the rally scene). `derived`/`servo`/`game` blocks of
// the contract are filled in later, on-device, once real motion is available.
#include <Arduino.h>
#include <Wire.h>
#include <Adafruit_MPU6050.h>

static Adafruit_MPU6050 mpu;

void setup() {
  Serial.begin(115200);
  Wire.begin();
  mpu.begin();
  mpu.setAccelerometerRange(MPU6050_RANGE_8_G);
  mpu.setGyroRange(MPU6050_RANGE_500_DEG);
  mpu.setFilterBandwidth(MPU6050_BAND_21_HZ);
}

void loop() {
  sensors_event_t a, g, t;
  mpu.getEvent(&a, &g, &t);

  // Contract units: accelerometer in g, gyroscope in deg/s.
  const float G = 9.81f, R2D = 57.2957795f;
  float axg = a.acceleration.x / G, ayg = a.acceleration.y / G, azg = a.acceleration.z / G;
  float gxd = g.gyro.x * R2D, gyd = g.gyro.y * R2D, gzd = g.gyro.z * R2D;

  // Build the JSON line with Print (portable: no %f dependency on the MCU printf).
  Serial.print("{\"timestamp_ms\":");        Serial.print(millis());
  Serial.print(",\"imu\":{\"accelerometer_g\":{\"x\":"); Serial.print(axg, 3);
  Serial.print(",\"y\":");                    Serial.print(ayg, 3);
  Serial.print(",\"z\":");                    Serial.print(azg, 3);
  Serial.print("},\"gyroscope_dps\":{\"x\":");Serial.print(gxd, 1);
  Serial.print(",\"y\":");                    Serial.print(gyd, 1);
  Serial.print(",\"z\":");                    Serial.print(gzd, 1);
  Serial.println("}}}");

  delay(20);   // ~50 Hz
}
