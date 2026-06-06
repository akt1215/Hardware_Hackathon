#include <Wire.h>
#include <Servo.h>

Servo lockServo;

const int MPU_ADDR = 0x68;
const int SERVO_PIN = D9;

const int LOCKED_POS = 0;
const int UNLOCKED_POS = 90;

const int GYRO_THRESHOLD = 12000;
const int MAX_ATTEMPTS = 3;
const int GESTURE_DELAY = 600;

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

  Wire.beginTransmission(MPU_ADDR);
  Wire.write(0x6B);
  Wire.write(0);
  Wire.endTransmission(true);

  Serial.println("KineticAuth Ready");
  Serial.println("Motion-Based Physical Authentication");
  Serial.println("Password: LEFT -> RIGHT -> UP");
}

void loop() {
  if (systemLockedOut) {
    Serial.println("SYSTEM LOCKED OUT");
    delay(2000);
    return;
  }

  int16_t gx, gy, gz;
  readGyroscope(gx, gy, gz);

  String gesture = detectGesture(gx, gy);

  if (gesture != "" && millis() - lastGestureTime > GESTURE_DELAY) {
    lastGestureTime = millis();

    Serial.print("Detected Gesture: ");
    Serial.println(gesture);

    entered[gestureIndex] = gesture;
    gestureIndex++;

    if (gestureIndex == 3) {
      authenticate();
      gestureIndex = 0;
    }
  }
}

void readGyroscope(int16_t &gx, int16_t &gy, int16_t &gz) {
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(0x43);
  Wire.endTransmission(false);
  Wire.requestFrom(MPU_ADDR, 6, true);

  gx = Wire.read() << 8 | Wire.read();
  gy = Wire.read() << 8 | Wire.read();
  gz = Wire.read() << 8 | Wire.read();
}

String detectGesture(int16_t gx, int16_t gy) {
  if (gx > GYRO_THRESHOLD) return "RIGHT";
  if (gx < -GYRO_THRESHOLD) return "LEFT";
  if (gy > GYRO_THRESHOLD) return "UP";
  if (gy < -GYRO_THRESHOLD) return "DOWN";

  return "";
}

void authenticate() {
  bool accessGranted = true;

  Serial.println("Authenticating...");

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
    Serial.print("Failed Attempts: ");
    Serial.println(failedAttempts);

    lockServo.write(LOCKED_POS);

    if (failedAttempts >= MAX_ATTEMPTS) {
      systemLockedOut = true;
      Serial.println("SECURITY ALERT: SYSTEM LOCKED OUT");
    }
  }
}