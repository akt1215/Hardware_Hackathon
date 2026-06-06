// STM32 hackathon starter — blink + serial heartbeat.
// Goal: prove the board flashes and the serial link works before the
// challenge drops. If the LED blinks and you see the heartbeat in
// `pio device monitor`, the whole toolchain is verified.

#include <Arduino.h>

// Most Nucleo/Discovery boards define LED_BUILTIN. If yours doesn't,
// replace with the user LED pin (e.g. PA5 on Nucleo-F4, PD12 on Disco-F407).
#ifndef LED_BUILTIN
#define LED_BUILTIN PA5
#endif

void setup() {
  pinMode(LED_BUILTIN, OUTPUT);
  Serial.begin(115200);
  Serial.println("STM32 starter alive");
}

void loop() {
  digitalWrite(LED_BUILTIN, HIGH);
  delay(250);
  digitalWrite(LED_BUILTIN, LOW);
  delay(250);
  Serial.println("heartbeat");
}
