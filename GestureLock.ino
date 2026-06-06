#include <Wire.h>
#include <Servo.h>

Servo lockServo;

const int MPU_ADDR = 0x68;
const int SERVO_PIN = D9;

const int LOCKED_POS = 0;
const int UNLOCKED_POS = 90;

const float THRESHOLD = 0.45;
const int MAX_ATTEMPTS = 3;
const int GESTURE_DELAY = 500;

String password[3] = {"LEFT", "RIGHT", "UP"};
String entered[3];

int gestureIndex = 0;
int failedAttempts = 0;

unsigned long lastGestureTime = 0;
bool systemLockedOut = false;

void setup() {
  Serial.begin(115200);
  Wire.begin();

  lockServo.attach(SERVO_PIN);
  lockServo.write(LOCKED_POS);

  // Wake MPU6050
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(0x6B);
  Wire.write(0);
  Wire.endTransmission(true);

  Serial.println("GestureLock Ready");
  Serial.println("Physical Authentication System");
  Serial.println("Gesture Password: LEFT -> RIGHT -> UP");
}

void loop() {
  if (systemLockedOut) {
    Serial.println("SYSTEM LOCKED OUT - Too many failed attempts");
    delay(2000);
    return;
  }

  int16_t ax, ay, az;
  readMPU(ax, ay, az);

  float x = ax / 16384.0;
  float y = ay / 16384.0;

  String gesture = detectGesture(x, y);

  if (gesture != "" && millis() - lastGestureTime > GESTURE_DELAY) {
    lastGestureTime = millis();

    Serial.print("Detected: ");
    Serial.println(gesture);

    entered[gestureIndex] = gesture;
    gestureIndex++;

    if (gestureIndex == 3) {
      authenticateGesture();
      gestureIndex = 0;
    }
  }
}

void readMPU(int16_t &ax, int16_t &ay, int16_t &az) {
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(0x3B);
  Wire.endTransmission(false);
  Wire.requestFrom(MPU_ADDR, 6, true);

  ax = Wire.read() << 8 | Wire.read();
  ay = Wire.read() << 8 | Wire.read();
  az = Wire.read() << 8 | Wire.read();
}

String detectGesture(float x, float y) {
  if (x > THRESHOLD) return "RIGHT";
  if (x < -THRESHOLD) return "LEFT";
  if (y > THRESHOLD) return "UP";
  if (y < -THRESHOLD) return "DOWN";

  return "";
}

void authenticateGesture() {
  bool accessGranted = true;

  Serial.println("Authenticating gesture...");

  for (int i = 0; i < 3; i++) {
    if (entered[i] != password[i]) {
      accessGranted = false;
    }
  }

  if (accessGranted) {
    Serial.println("ACCESS GRANTED");
    Serial.println("Physical system unlocked");

    failedAttempts = 0;

    lockServo.write(UNLOCKED_POS);
    delay(3000);
    lockServo.write(LOCKED_POS);

    Serial.println("System locked again");
  } else {
    failedAttempts++;

    Serial.println("ACCESS DENIED");
    Serial.print("Failed attempts: ");
    Serial.println(failedAttempts);

    lockServo.write(LOCKED_POS);

    if (failedAttempts >= MAX_ATTEMPTS) {
      systemLockedOut = true;
      Serial.println("SECURITY ALERT: SYSTEM LOCKED OUT");
    }
  }
}