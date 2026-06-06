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
engine (3000 pts, spring-to-shell, charge/explode, temp→hue) with render-target trail
persistence for the light-streak explosions seen in the reel. Existing `web/index.html`
left intact as the minimal hardware demo.
