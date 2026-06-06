// VirtualKit / HOST-ONLY mock of the Arduino Wire (I2C) API. No bus on a laptop;
// the sensor mocks generate their own data, so this just needs to link.
#ifndef VK_WIRE_H
#define VK_WIRE_H

#include <stdint.h>

class TwoWire {
public:
  void begin() {}
  void begin(uint8_t /*address*/) {}
  void setClock(uint32_t) {}
  void beginTransmission(uint8_t) {}
  uint8_t endTransmission(uint8_t = 1) { return 0; }
};

inline TwoWire Wire;   // C++17 inline variable — single definition across TUs

#endif // VK_WIRE_H
