# AGENTS

## Project
`Hardware_Hackathon` is a swing-driven wall-rally tennis prototype. The intended hardware loop is:

1. `STM32 Nucleo G474RE` reads motion data from `MPU-6050`.
2. Firmware derives swing state, contact timing, and racket face angle.
3. Frontend renders the wall-rally game and scores each swing.
4. `SG90` provides lightweight hit or miss feedback as short taps or pulses.

The current frontend deliberately avoids a Pong paddle. Input is modeled as swing events.

## Workspace map
- `frontend/`: Vite React app for the wall-rally prototype.
- `frontend/src/data/mockSession.js`: sample telemetry timeline and swing event definitions used by the UI.
- `frontend/sample-data/*.json`: canonical payload examples for firmware and backend integration.

## Data contract
The frontend expects a frame-oriented payload with these top-level keys:

- `timestamp_ms`
- `imu`
- `derived`
- `servo`
- `game`

Important nested values:

- `imu.accelerometer_g.{x,y,z}`
- `imu.gyroscope_dps.{x,y,z}`
- `derived.swing_phase`
- `derived.contact_window`
- `derived.impact_event`
- `derived.racket_face_deg`
- `servo.feedback_type`
- `game.active_zone_id`

## Engineering notes
- Keep the controller model swing-based. Do not regress to direct Y-axis paddle control.
- The IMU alone is good for gesture recognition, timing windows, and shot classification. It is not reliable enough for exact 3D position tracking.
- Servo feedback should stay lightweight. Use it as confirmation, not force feedback.
- Sample payloads should remain easy to mirror from firmware over serial JSON during early bring-up.

## Next likely steps
- Replace the sample data feed with live serial or BLE transport from the STM32.
- Split `derived` values between firmware-side calculations and frontend-side scoring as the hardware loop stabilizes.
- Add calibration for neutral pose and dominant-hand orientation.
