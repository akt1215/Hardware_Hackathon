# Particle Storm — Firmware Spec & Plan

**Hackathon:** NYTECHWEEK Hardware Hack — theme "The World is Your Controller"
**Board:** STM32 Nucleo-G474RE (Cortex-M4 @ 170MHz), Arduino framework via PlatformIO
**One-line:** The board is a **physical motion remote**. It streams tilt/shake/hand-distance/
temperature over USB serial; a browser app reads it via the **Web Serial API** and drives a
3D storm of 3000 particles that orbit, gather, spread, and explode in real time.

Inspired by the "Particle Storm" reel — but instead of a webcam tracking a hand, **the hardware
is the controller.**

---

## Architecture

```
STM32 Nucleo-G474RE                 USB (ST-Link Virtual COM)        Chrome browser
  MPU-6050  tilt/shake   ──┐                                      ┌─ Web Serial reads stream
  HC-SR04   hand dist     ─┼─► Serial CSV @115200, ~50Hz ───────► ┤  Three.js, 3000 particles
  MCP9808   temp         ──┤   "roll,pitch,dist,temp,gesture\n"   └─ orbit/gather/spread/explode
  Speaker   whoosh ◄──────┘
```

No extra bridge hardware: the Nucleo's ST-Link already exposes a USB Virtual COM Port, and
STM32duino's `Serial` (USART2) routes to it. The browser reads that COM port directly.

---

## Serial Protocol (115200 baud, one line per frame, `\n`-terminated)

```
roll,pitch,dist,temp,gesture
```
| Field | Type | Units | Meaning → particle effect |
|-------|------|-------|---------------------------|
| roll | float | deg (-180..180) | board roll → orbit/spin |
| pitch | float | deg (-90..90) | board pitch → orbit tilt |
| dist | float | cm (-1 = none) | hand height → expansion radius (close=gather, far=spread) |
| temp | float | °C | particle hue (cool→warm) |
| gesture | int | 0/1 | 1 = shake detected this frame → explode |

Lines starting with `#` are log/comment lines and are ignored by the web app.

---

## Pin Map (Nucleo-G474RE Arduino names)

| Signal | Pin | Notes |
|--------|-----|-------|
| I²C SDA | D14 (PB9) | MPU-6050 @0x68, MCP9808 @0x18 (shared bus) |
| I²C SCL | D15 (PB8) | |
| HC-SR04 TRIG | D7 (PA8) | output pulse |
| HC-SR04 ECHO | D6 (PB10) | **5V — 1kΩ/2kΩ divider into pin**; sensor VCC = 5V |
| Speaker signal | D9 (PC7) | `tone()`; A+ on STEMMA, A- to GND, VIN = 5V |
| Status LED | LED_BUILTIN (PA5) | on while a hand is detected |
| Serial out | USART2 → ST-Link VCP | `Serial` at 115200 (this IS the remote channel) |

---

## Build Order (always-demoable layers)

- [ ] **L0 — Sanity:** flash, confirm board enumerates as a COM port, serial prints at 115200
- [ ] **L1 — MPU-6050:** roll/pitch from accel + shake detection (accel-magnitude spike, cooldown)
- [ ] **L2 — HC-SR04:** distance with divider, EMA smoothing, -1 when out of range
- [ ] **L3 — Stream:** emit `roll,pitch,dist,temp,gesture` CSV at ~50 Hz  ← **web app can drive now**
- [ ] **L4 — MCP9808:** add temperature field (hue)
- [ ] **L5 — Speaker:** whoosh on shake/explode, ready-beep on boot
- [ ] **L6 — Web app:** Three.js particle storm reads the stream via Web Serial (see `web/index.html`)
- [ ] **L7 — Polish:** tune shake threshold, distance range, smoothing; rehearse demo

Web app already scaffolded in `web/index.html` with a **demo mode** (mouse = tilt, mouse-Y =
distance, SPACE = explode) so the visuals can be tuned before the board is wired.

---

## Running the Web App (Web Serial needs a secure context)

```
cd web
python -m http.server 8000
```
Open **http://localhost:8000** in **Chrome or Edge** → click **Connect Board** → pick the
STM32 COM port. (Web Serial requires localhost/https + Chromium; it will not work from file://.)

---

## Acceptance Criteria (verify before "done")

- [ ] `pio run` builds clean; `pio run -t upload` flashes the board
- [ ] Board appears as a serial/COM port; `pio device monitor` shows CSV frames at ~50 Hz
- [ ] Tilting the board orbits the particle sphere in the browser
- [ ] Moving a hand 4→40 cm over the HC-SR04 visibly gathers / spreads the particles
- [ ] A sharp shake explodes the particles outward (+ speaker whoosh)
- [ ] Warming the MCP9808 shifts particle hue
- [ ] Graceful sensor-init failure (logs `# ... init failed`, loop keeps streaming)
- [ ] Web app connects via Web Serial, parses the stream, and ignores `#` log lines

---

## Stretch Goals

- [ ] Gyro fusion for snappier tilt response
- [ ] Distinct gestures (flick vs shake) → different effects (vortex, implode)
- [ ] Bloom post-processing on the particles for extra glow
- [ ] On-screen "morph to a word/shape" mode triggered by a held tilt

---

## Review

_(fill in after build: what shipped, what was cut, demo notes)_
