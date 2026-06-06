# MPU-6050 → RallyTrainer integration

Pipeline: **STM32 + MPU-6050  →  serial JSON  →  bridge  →  WebSocket  →  browser game**

The firmware streams one contract JSON frame per sample
(`{timestamp_ms, imu:{accelerometer_g, gyroscope_dps}}`). The browser detects a
swing (accel spike → power, gyro yaw → forehand/backhand) and calls the game's
existing `doSwing()`. No game logic changed — IMU is just a third input source
alongside pointer/keyboard.

```
firmware/   PlatformIO: real STM32 firmware + laptop sim (lib/VirtualKit, ArduinoCompat)
bridge/     Node WebSocket bridge (serial or sim → ws://localhost:8080)
frontend/   Next.js RallyTrainer; lib/imu.ts + a hook in app/page.tsx
```

## Run with the real board

```bash
# 1. flash (once)
pio run -d firmware -e nucleo_g474re -t upload

# 2. bridge: board serial → WebSocket   (board is on COM6 here)
cd bridge && npm install && node server.mjs --serial COM6

# 3. game
cd frontend && npm install && npm run dev   # open http://localhost:3000, press Space, swing
```

## Run with NO hardware (simulator)

```bash
pio run -d firmware -e native            # build the sim once
cd bridge   && npm install && npm run sim    # spawns the sim, streams synthetic swings
cd frontend && npm install && npm run dev
```

## Tuning

- Swing sensitivity lives in `frontend/lib/imu.ts` (`onThresholdG` default 0.55 g
  above rest, `cooldownMs` 420). Raise the threshold if real swings double-fire,
  lower it if they don't register.
- WebSocket URL override: `NEXT_PUBLIC_IMU_WS` (default `ws://localhost:8080`).
- Resting `|a|` reads ~1.16 g on this unit — a small scale/bias offset, harmless
  for swing detection; add neutral-pose calibration later if exact angles matter.

## Not yet done
- `derived` / `servo` / `game` blocks of the data contract (firmware-side swing
  phase, racket-face angle, SG90 hit/miss feedback) — future, on-device.
