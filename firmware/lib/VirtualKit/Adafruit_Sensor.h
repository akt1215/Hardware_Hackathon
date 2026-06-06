// VirtualKit / HOST-ONLY mock of Adafruit's Unified Sensor event type.
// On the STM32 target the real Adafruit_Sensor.h is used (VirtualKit is
// lib_ignore'd there). Only the fields the firmware reads are modeled.
#ifndef VK_ADAFRUIT_SENSOR_H
#define VK_ADAFRUIT_SENSOR_H

struct sensors_vec3_t { float x, y, z; };

typedef struct {
  sensors_vec3_t acceleration;   // m/s^2
  sensors_vec3_t gyro;           // rad/s
  float          temperature;    // deg C
} sensors_event_t;

#endif // VK_ADAFRUIT_SENSOR_H
