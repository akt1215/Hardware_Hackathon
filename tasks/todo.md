# Air Theremin — Firmware Spec & Plan

**Hackathon:** NYTECHWEEK Hardware Hack — theme "The World is Your Controller"
**Board:** STM32 Nucleo-G474RE (Cortex-M4 @ 170MHz), Arduino framework via PlatformIO
**One-line:** A hand-played instrument — wave your hand over the ultrasonic sensor for
pitch, tilt the board to bend/vibrato, and the temperature sensor picks the musical scale.

---

## Concept

| Component | Role | Maps to |
|-----------|------|---------|
| HC-SR04 ultrasonic | hand-height input | **pitch** (note in scale) |
| MPU-6050 IMU | board tilt (roll) input | **pitch bend / vibrato** |
| MCP9808 temp | ambient/touch input | **scale select** (cool = minor, warm = major) |
| STEMMA speaker | audio output | the live tone |
| Onboard LED (PA5) | visual output | **VU / pitch brightness** |

Key trick: **quantize pitch to a pentatonic scale** so any hand movement sounds musical,
not like noise. This is what makes the demo sound intentional.

---

## Pin Map (Nucleo-G474RE Arduino names)

| Signal | Pin | Notes |
|--------|-----|-------|
| I²C SDA | D14 (PB9) | shared bus |
| I²C SCL | D15 (PB8) | shared bus |
| MPU-6050 | I²C @ 0x68 | 3.3V power |
| MCP9808 | I²C @ 0x18 | 3.3V power |
| HC-SR04 TRIG | D7 (PA8) | output pulse |
| HC-SR04 ECHO | D6 (PB10) | **5V — use 1kΩ/2kΩ divider into pin**; sensor VCC = 5V |
| Speaker signal | D9 (PC7) | PWM/timer pin for `tone()`; A+ on STEMMA, A- to GND, VIN = 5V |
| Status/VU LED | LED_BUILTIN (PA5) | `analogWrite` for brightness |

---

## Behavior Spec

- **Pitch (HC-SR04):** usable range ~4–40 cm. Map distance → index into the active scale
  (e.g. C pentatonic across ~2 octaves). Out-of-range (>50 cm or 0) = silence (note-off).
- **Pitch bend / vibrato (MPU-6050):** roll angle ±~30° → bend pitch ± up to ~2 semitones,
  or add vibrato (small periodic frequency wobble). A sharp tap (accel spike) = re-trigger note.
- **Scale select (MCP9808):** below ~24 °C → minor pentatonic; at/above → major pentatonic.
  Warming the sensor with your hand audibly changes the mood — a memorable live moment.
- **LED (PA5):** brightness tracks current note height (higher pitch = brighter); off when silent.
- **Smoothing:** EMA on distance (α ≈ 0.3) to kill jitter; sample loop ~30 Hz.
- **Serial @ 115200:** print `dist_cm`, `roll_deg`, `temp_c`, `note`, `freq_hz` for live tuning/debug.

### Volume note (be realistic)
Arduino `tone()` is fixed-amplitude, so true volume control isn't free. **MVP:** tilt controls
pitch-bend/vibrato (not loudness). **Stretch:** use the G4 **DAC (PA4)** to synthesize a sine and
scale its amplitude for real tilt-controlled volume.

---

## Build Order (always-demoable layers)

- [ ] **L0 — Sanity:** flash blink + serial heartbeat, confirm board + ST-Link upload work
- [ ] **L1 — MPU-6050:** read accel/gyro over I²C, compute roll angle, print to serial
- [ ] **L2 — HC-SR04:** trigger/echo distance read (with divider), EMA smoothing, print cm
- [ ] **L3 — Audio MVP:** map distance → pentatonic note → `tone()` on speaker  ← **playable instrument**
- [ ] **L4 — Expression:** tilt → pitch bend/vibrato; LED brightness tracks pitch
- [ ] **L5 — Scale select:** MCP9808 temp → minor/major pentatonic switch
- [ ] **L6 — Polish:** tune ranges, note-off behavior, smoothing, rehearse the demo

MVP (a working, playable instrument) is complete at **L3**.

---

## Acceptance Criteria (verify before "done")

- [ ] Board flashes via `pio run -t upload`; serial shows live sensor values at 115200
- [ ] Moving a hand 4→40 cm sweeps audible pitch across the scale, quantized (no random pitches)
- [ ] Tilting the board audibly bends/vibratos the current note
- [ ] Warming the MCP9808 switches the scale (mood change is clearly audible)
- [ ] LED brightness visibly tracks pitch; LED off + speaker silent when hand is out of range
- [ ] No I²C hang if a sensor is unplugged (init failure logged, loop continues)
- [ ] Clean build: `pio run` succeeds with no errors

---

## Stretch Goals (if time)

- [ ] DAC sine output (PA4) with real tilt-controlled volume
- [ ] Second LED or onboard LED blink as a tempo/beat indicator
- [ ] "Record & loop" a short phrase, play it back layered under live notes

---

## Review

_(fill in after build: what shipped, what was cut, demo notes)_
