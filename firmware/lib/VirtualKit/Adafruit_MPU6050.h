// VirtualKit / HOST-ONLY mock of Adafruit_MPU6050.
//
// getEvent() replays a scripted gesture timeline (looping every 12 s) so the
// firmware's GestureEngine fires the full command set on the host with no IMU:
//   pitch-up -> VOL_UP (auto-repeats while held), pitch-down -> VOL_DOWN,
//   roll-right -> NEXT, roll-left -> PREV, shake -> MUTE.
// (PLAY_PAUSE comes from the virtual HC-SR04 sweep in the Arduino shim.)
#ifndef VK_ADAFRUIT_MPU6050_H
#define VK_ADAFRUIT_MPU6050_H

#include <Arduino.h>
#include <math.h>
#include "Adafruit_Sensor.h"

enum mpu6050_accel_range {
  MPU6050_RANGE_2_G, MPU6050_RANGE_4_G, MPU6050_RANGE_8_G, MPU6050_RANGE_16_G
};
enum mpu6050_gyro_range {
  MPU6050_RANGE_250_DEG, MPU6050_RANGE_500_DEG,
  MPU6050_RANGE_1000_DEG, MPU6050_RANGE_2000_DEG
};
enum mpu6050_bandwidth {
  MPU6050_BAND_260_HZ, MPU6050_BAND_184_HZ, MPU6050_BAND_94_HZ,
  MPU6050_BAND_44_HZ, MPU6050_BAND_21_HZ, MPU6050_BAND_10_HZ, MPU6050_BAND_5_HZ
};

class Adafruit_MPU6050 {
public:
  bool begin(uint8_t = 0x68, void* = nullptr, int = 0) { return true; }
  void setAccelerometerRange(mpu6050_accel_range) {}
  void setGyroRange(mpu6050_gyro_range) {}
  void setFilterBandwidth(mpu6050_bandwidth) {}

  void getEvent(sensors_event_t* a, sensors_event_t* g, sensors_event_t* t) {
#ifdef VK_SCENE_RALLY
    // Rally scene: a racket at rest, swung ~every 1.4 s, alternating forehand /
    // backhand. Each swing is a short accel + yaw-rate burst the browser detects.
    const unsigned long PERIOD = 1400UL, BURST = 170UL;
    unsigned long ms = millis();
    unsigned long ph = ms % PERIOD;
    float dir = ((ms / PERIOD) & 1UL) ? -1.0f : 1.0f;   // alternate swing side
    float ax = 0, ay = 0, az = 9.81f, gx = 0, gy = 0, gz = 0;
    if (ph < BURST) {
      float env = sinf((float)PI * (float)ph / (float)BURST);  // 0 -> 1 -> 0
      ax = dir * 22.0f * env;       // lateral swing accel (~2.4 g peak)
      ay =  6.0f * env;             // slight lift
      az =  9.81f - 3.0f * env;     // dip through contact
      gz = dir * 6.5f * env;        // racket yaw rate (~370 dps), rad/s
      gx =  1.5f * env;
    }
    if (a) { a->acceleration.x = ax + nz(0.05f);
             a->acceleration.y = ay + nz(0.05f);
             a->acceleration.z = az + nz(0.05f); }
    if (g) { g->gyro.x = gx + nz(0.02f);
             g->gyro.y = gy + nz(0.02f);
             g->gyro.z = gz + nz(0.02f); }
    if (t) t->temperature = 30.0f + nz(0.2f);
#elif defined(VK_SCENE_IMU)
    // Raw-IMU scene: a board tilting smoothly on two axes. Accel is the gravity
    // vector projected onto the tilted axes; gyro is the matching angular rate
    // (rad/s, as the real Adafruit driver reports). Used by sim/imu_monitor.cpp.
    const float ts = millis() / 1000.0f;
    const float G  = 9.81f;
    const float Ap = 30.0f * (float)PI / 180.0f, wp = 2.0f * (float)PI / 4.0f; // pitch
    const float Ar = 25.0f * (float)PI / 180.0f, wr = 2.0f * (float)PI / 6.0f; // roll
    const float pitch = Ap * sinf(wp * ts), roll = Ar * sinf(wr * ts);
    const float pitchRate = Ap * wp * cosf(wp * ts);   // rad/s
    const float rollRate  = Ar * wr * cosf(wr * ts);   // rad/s
    if (a) {
      a->acceleration.x =  G * sinf(pitch)               + nz(0.03f);
      a->acceleration.y = -G * sinf(roll) * cosf(pitch)  + nz(0.03f);
      a->acceleration.z =  G * cosf(pitch) * cosf(roll)  + nz(0.03f);
    }
    if (g) {
      g->gyro.x = rollRate  + nz(0.01f);
      g->gyro.y = pitchRate + nz(0.01f);
      g->gyro.z = 0.40f      + nz(0.01f);   // steady yaw (accel can't sense this)
    }
    if (t) t->temperature = 32.0f + nz(0.2f);
#else
    // Gesture scene (default): scripted tilt/shake timeline that drives the
    // GestureEngine. Gyro unused by the firmware, so left at zero.
    const float L = 7.0f;          // ~45 deg tilt component
    float ax = 0.0f, ay = 0.0f, az = 9.81f;
    unsigned long ph = millis() % 12000UL;
    if      (ph < 1500) {}                            // level
    else if (ph < 2500) { ax = -L; az = L; }          // pitch up   -> VOL_UP
    else if (ph < 3500) {}                            // level
    else if (ph < 4500) { ax =  L; az = L; }          // pitch down -> VOL_DOWN
    else if (ph < 5500) {}                            // level
    else if (ph < 6500) { ay =  L; az = L; }          // roll right -> NEXT
    else if (ph < 7500) {}                            // level
    else if (ph < 8500) { ay = -L; az = L; }          // roll left  -> PREV
    else if (ph < 9500) {}                            // level
    else if (ph < 10200) { ax = 20; ay = 10; az = 10; } // shake    -> MUTE
    else {}                                           // level tail

    if (a) { a->acceleration.x = ax; a->acceleration.y = ay; a->acceleration.z = az; }
    if (g) { g->gyro.x = g->gyro.y = g->gyro.z = 0.0f; }
    if (t) { t->temperature = 32.0f; }
#endif
  }

private:
  static float nz(float amp) { return amp * ((random(0, 2001) / 1000.0f) - 1.0f); }
};

#endif // VK_ADAFRUIT_MPU6050_H
