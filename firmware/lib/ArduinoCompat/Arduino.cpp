// Arduino-compat shim implementation — NATIVE BUILDS ONLY (see Arduino.h).
#include "Arduino.h"

#include <chrono>
#include <thread>

HostSerial Serial;

namespace {
using clock_t_ = std::chrono::steady_clock;
const clock_t_::time_point g_start = clock_t_::now();
}

unsigned long millis() {
  auto d = clock_t_::now() - g_start;
  return (unsigned long)std::chrono::duration_cast<std::chrono::milliseconds>(d).count();
}

unsigned long micros() {
  auto d = clock_t_::now() - g_start;
  return (unsigned long)std::chrono::duration_cast<std::chrono::microseconds>(d).count();
}

void delay(unsigned long ms) {
  std::this_thread::sleep_for(std::chrono::milliseconds(ms));
}

void delayMicroseconds(unsigned long us) {
  std::this_thread::sleep_for(std::chrono::microseconds(us));
}

// GPIO is meaningless on the host — keep the calls linkable and silent.
void pinMode(uint8_t, uint8_t) {}
void digitalWrite(uint8_t, uint8_t) {}
int  digitalRead(uint8_t) { return LOW; }
void analogWrite(uint8_t, int) {}
int  analogRead(uint8_t) { return 0; }

// Virtual STEMMA speaker: "play" a tone by logging it. The remote_bridge.py
// parser ignores any line that isn't "CMD ...", so these are harmless on the wire.
void tone(uint8_t pin, unsigned int frequency, unsigned long duration) {
  std::printf("# spk pin%u %uHz", (unsigned)pin, frequency);
  if (duration) std::printf(" %lums", duration);
  std::printf("\n");
}
void noTone(uint8_t) {}

// Virtual HC-SR04: synthesize an echo round-trip time from a distance that
// slides in and out, so the firmware's swipe gesture (dist < ~8 cm) triggers
// periodically. main.cpp converts echo back via dist = echo * 0.0343 / 2.
unsigned long pulseIn(uint8_t /*pin*/, uint8_t /*state*/, unsigned long timeout) {
  const float t = millis() / 1000.0f;
  // 30 cm center, ±26 cm, 5 s period -> sweeps ~4..56 cm, dipping under 8 cm.
  float cm = 30.0f + 26.0f * std::sin(2.0 * 3.14159265 * t / 5.0);
  if (cm < 2.0f) cm = 2.0f;
  unsigned long echo = (unsigned long)(cm * 2.0f / 0.0343f);  // us, round trip
  return echo > timeout ? 0UL : echo;                          // 0 == no echo
}

long map(long x, long inMin, long inMax, long outMin, long outMax) {
  if (inMax == inMin) return outMin;
  return (x - inMin) * (outMax - outMin) / (inMax - inMin) + outMin;
}

void randomSeed(unsigned long seed) { std::srand((unsigned)seed); }

long random(long howbig) {
  if (howbig <= 0) return 0;
  return std::rand() % howbig;
}

long random(long howsmall, long howbig) {
  if (howsmall >= howbig) return howsmall;
  return howsmall + random(howbig - howsmall);
}

// ---- native entry point ------------------------------------------------------
// The host has no Arduino runtime, so we provide the setup()/loop() driver here.
// Guarded so this lib stays a passive shim unless a sim env asks for the driver.
#ifdef SIM_FIRMWARE
extern void setup();
extern void loop();

int main() {
  // Unbuffer stdout so a downstream pipe (e.g. sim/sim_keys.py) sees each
  // CMD/TELEM line in real time. (Windows ignores _IOLBF on pipes and falls
  // back to full buffering, which would delay/lose output, so use _IONBF.)
  std::setvbuf(stdout, nullptr, _IONBF, 0);
  setup();
  for (;;) {
    loop();
  }
  return 0;
}
#endif
