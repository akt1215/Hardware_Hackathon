// Arduino-compat shim — NATIVE BUILDS ONLY.
//
// On the STM32 target the real Arduino framework provides <Arduino.h>; this lib
// is `lib_ignore`d there. On the host (`pio run -e native`) there is no framework,
// so this minimal shim lets the SAME firmware compile and run on your laptop:
//   - millis()/micros() backed by a real monotonic clock
//   - delay() that actually sleeps (sim runs in real time)
//   - Serial -> stdout
//   - pinMode/digitalWrite/etc. as harmless no-ops
//   - the small handful of Arduino helpers our code uses (map/constrain/random)
//
// It is intentionally tiny: just enough surface for the HAL + controller loop.
#ifndef ARDUINO_COMPAT_H
#define ARDUINO_COMPAT_H

#include <cstdint>
#include <cstdio>
#include <cmath>
#include <cstdlib>

// ---- pin / digital constants -------------------------------------------------
#define HIGH 0x1
#define LOW  0x0
#define INPUT        0x0
#define OUTPUT       0x1
#define INPUT_PULLUP 0x2

#ifndef LED_BUILTIN
#define LED_BUILTIN 13
#endif

// Nucleo Arduino-style pin aliases referenced by Pins.h. On the host they are
// just integers; the values are irrelevant because the real backend isn't built.
#ifndef D2
#define D2 2
#define D3 3
#define D6 6
#endif

#ifndef PI
#define PI 3.1415926535897932384626433832795
#endif

// ---- timing ------------------------------------------------------------------
unsigned long millis();
unsigned long micros();
void delay(unsigned long ms);
void delayMicroseconds(unsigned long us);

// ---- GPIO (no-ops on host) ---------------------------------------------------
void pinMode(uint8_t pin, uint8_t mode);
void digitalWrite(uint8_t pin, uint8_t val);
int  digitalRead(uint8_t pin);
void analogWrite(uint8_t pin, int val);
int  analogRead(uint8_t pin);

// ---- tone (no-op on host; RealSpeaker isn't compiled here) -------------------
void tone(uint8_t pin, unsigned int frequency, unsigned long duration = 0);
void noTone(uint8_t pin);
unsigned long pulseIn(uint8_t pin, uint8_t state, unsigned long timeout = 1000000UL);

// ---- helpers -----------------------------------------------------------------
long   map(long x, long inMin, long inMax, long outMin, long outMax);
void   randomSeed(unsigned long seed);
long   random(long howbig);
long   random(long howsmall, long howbig);

template <typename T> T constrain(T x, T lo, T hi) { return x < lo ? lo : (x > hi ? hi : x); }

// ---- Serial ------------------------------------------------------------------
class HostSerial {
public:
  void begin(unsigned long /*baud*/) {}
  void end() {}
  void flush() { std::fflush(stdout); }
  explicit operator bool() const { return true; }

  void print(const char* s)   { std::fputs(s, stdout); }
  void print(char c)          { std::fputc(c, stdout); }
  void print(int v)           { std::printf("%d", v); }
  void print(long v)          { std::printf("%ld", v); }
  void print(unsigned v)      { std::printf("%u", v); }
  void print(unsigned long v) { std::printf("%lu", v); }
  void print(double v, int digits = 2) { std::printf("%.*f", digits, v); }

  void println()              { std::fputc('\n', stdout); }
  void println(const char* s) { std::fputs(s, stdout); std::fputc('\n', stdout); }
  void println(char c)        { std::fputc(c, stdout); std::fputc('\n', stdout); }
  void println(int v)         { std::printf("%d\n", v); }
  void println(long v)        { std::printf("%ld\n", v); }
  void println(unsigned v)    { std::printf("%u\n", v); }
  void println(double v, int digits = 2) { std::printf("%.*f\n", digits, v); }
};

extern HostSerial Serial;

#endif // ARDUINO_COMPAT_H
