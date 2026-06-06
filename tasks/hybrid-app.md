# Particle Storm — Hybrid Interactive App

Recreate the viral "Particle Storm" reel as a single self-contained web app, driven by
**two interchangeable controllers**:

1. **CAMERA** — webcam feed + MediaPipe hand tracking (like the reel)
2. **SERIAL** — the STM32 sensor remote over Web Serial (the hackathon hardware kit)

Builds as a **new file** `web/hand-particle-sphere.html`; the existing `web/index.html`
(simple hardware demo) is left untouched.

## Look & feel (from the reel)
- Live webcam as background; 3000 Three.js particles glow over it (`mix-blend-mode: screen`).
- A particle sphere that follows the hand, rotates with movement.
- Light-streak **trails** during explosions (render-target feedback / persistence).
- Hue driven by temperature; bright white-hot core when charged.
- Top-right pills: **CAMERA · SERIAL · RESET**. Bottom-left controls legend.

## Interactions
| Input | Camera (hand) | Serial (board) |
|-------|---------------|----------------|
| Rotate sphere | move hand | tilt board (roll/pitch) |
| Charge up | pinch (thumb+index) | hold hand close over HC-SR04 |
| Explode | release pinch | shake (gesture=1) |
| Scale | two hands pinch-to-scale | hand distance (HC-SR04) |
| Hue | — | temperature (MCP9808) |

Both controllers feed one shared `ctrl` state, so the visuals are identical regardless of input.

## Build order
- [x] Watch reel, confirm design (camera + serial + reset; pinch/charge/explode/scale)
- [x] Scaffold HTML: webcam video bg + transparent particle canvas (screen blend) + UI
- [x] Three.js 3000-particle sphere with spring dynamics (port from index.html, extend)
- [x] Render-target feedback for glowing explosion trails
- [x] CAMERA: getUserMedia + MediaPipe HandLandmarker (tasks-vision), 2 hands
- [x] Hand mapping: palm follow, pinch→charge, release→explode, two-hand→scale
- [x] SERIAL: Web Serial CSV parser (reuse protocol), map to same ctrl state
- [x] RESET button, status, controls legend, readout
- [x] Verify: serve locally, demo-mode + camera path render clean

## Review
Shipped `web/hand-particle-sphere.html`: hybrid Particle Storm. CAMERA mode uses MediaPipe
hand tracking over the live webcam; SERIAL mode uses the STM32 CSV stream. Same particle
engine (spring-to-shell, charge/explode, temp→hue) with render-target trail persistence for
the light-streak explosions seen in the reel. Existing `web/index.html` left intact.

## Multiplayer (LAN) — added
Others bring their own board and feed THIS screen.
- `server/relay.js` — HTTPS (self-signed cert covering the LAN IP) + WebSocket relay.
  Serves the web app, exposes `/config` (LAN join URL) and `/qr.svg` (server-rendered QR,
  no browser CDN needed). Relays player `frame`s to all displays; tracks join/leave.
- `web/join.html` — joiner page. Connect an STM32 board (Web Serial) OR use the phone's
  own motion sensors (tilt = rotate, shake = explode). Streams frames to the relay.
- Display refactored to a `Storm` class: the local host is one storm; every joiner gets
  their own storm laid out across the screen. QR shown bottom-right with live player count.
- HTTPS is mandatory: Web Serial + getUserMedia need a secure context, which a plain
  http://192.168.x.x LAN address is NOT. Joiners accept the one-time cert warning.

Run: `cd server && npm install && npm start` → open the printed https URL (accept cert).
Verified end-to-end with Playwright: QR loads, remote player join→storm spawn, leave→cleanup,
zero console errors.

## Zen / lofi audio — added
"The world is your controller" now also plays it.
- `web/hand-particle-sphere.html` — `ZenAudio`: a generative lofi/zen *track* (no samples,
  works offline). A maj7/min7 chord progression (Cmaj7–Am7–Dm7–G7) on gliding pads, a warm
  sub-bass following the chord root, a music-box pentatonic melody, and a laid-back beat
  (kick / soft snare / swung hats) driven by a lookahead step sequencer (~72 bpm), plus tape
  wobble + vinyl crackle. All reacts to controller activity (charge brightens the pad and a
  shimmer voice; tilt shifts it). Every explosion — from ANY board, local or remote — rings
  a pentatonic bell over the track. "Zen" button toggles it (audio needs a user gesture).
- `src/main.cpp` — the STEMMA speaker now plays zen tones too: a calm ascending pentatonic
  arpeggio on boot and a soft pentatonic bell on each shake (replacing the old beep/whoosh).
  Builds clean: `pio run` → SUCCESS (Flash 9.3%).

### Gotcha captured
The big display rewrite was written without its closing `</script></body></html>`; the
module silently failed to execute (no error surfaced). Always confirm the script/body/html
tags close after a full-file Write.
