// VirtualKit / HOST-ONLY mock of Adafruit_MCP9808 — synthetic room temperature.
#ifndef VK_ADAFRUIT_MCP9808_H
#define VK_ADAFRUIT_MCP9808_H

#include <Arduino.h>
#include <math.h>

class Adafruit_MCP9808 {
public:
  bool begin(uint8_t = 0x18) { return true; }
  void setResolution(uint8_t) {}
  void wake() {}
  void shutdown_wake(uint8_t) {}

  float readTempC() {
    float t = millis() / 1000.0f;
    return 24.0f + 1.5f * sinf(2.0f * (float)PI * t / 30.0f);  // 22.5 .. 25.5 C
  }
};

#endif // VK_ADAFRUIT_MCP9808_H
