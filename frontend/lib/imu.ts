// MPU-6050 -> game input bridge (client-side).
//
// Connects to the rally bridge WebSocket, reads contract IMU frames, detects a
// racket swing from the accel/gyro stream, and reports it as (vx, vy, speed) —
// the exact shape the game's doSwing() already consumes. So this is just a third
// input source alongside pointer/keyboard; no game logic changes.

export type ImuFrame = {
  timestamp_ms: number;
  imu: {
    accelerometer_g: { x: number; y: number; z: number };
    gyroscope_dps: { x: number; y: number; z: number };
  };
};

export type SwingFn = (vx: number, vy: number, speed: number) => void;

export type ImuOptions = {
  url?: string;
  onFrame?: (f: ImuFrame) => void;
  /** g-force above rest (1 g) that counts as a swing. */
  onThresholdG?: number;
  /** minimum ms between swings. */
  cooldownMs?: number;
};

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

const DEFAULT_URL =
  (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_IMU_WS) || "ws://localhost:8080";

// Pure, testable swing detector. Feed frames in order via push().
export function makeSwingDetector(onSwing: SwingFn, opts: ImuOptions = {}) {
  const onThresholdG = opts.onThresholdG ?? 0.55;
  const cooldownMs = opts.cooldownMs ?? 420;
  let lastSwingAt = -1e9;

  return {
    push(frame: ImuFrame) {
      const a = frame.imu.accelerometer_g;
      const g = frame.imu.gyroscope_dps;
      const mag = Math.hypot(a.x, a.y, a.z);   // g
      const excess = mag - 1;                  // how hard, above gravity
      const t = now();
      if (excess > onThresholdG && t - lastSwingAt > cooldownMs) {
        lastSwingAt = t;
        const vx = clamp(g.z / 300, -1, 1);    // yaw rate -> forehand(+)/backhand(-)
        const vy = clamp(a.y, -1, 1);          // lift -> shot face up/down
        const speed = clamp(0.9 + excess * 1.1, 0, 2.4);
        onSwing(vx, vy, speed);
      }
    },
  };
}

// Connect to the bridge and drive onSwing. Returns { close }. Auto-reconnects.
export function connectImu(onSwing: SwingFn, opts: ImuOptions = {}) {
  const url = opts.url ?? DEFAULT_URL;
  const detector = makeSwingDetector(onSwing, opts);
  let ws: WebSocket | null = null;
  let retry: ReturnType<typeof setTimeout> | null = null;
  let closed = false;

  const open = () => {
    if (closed) return;
    ws = new WebSocket(url);
    ws.onmessage = (ev) => {
      let frame: ImuFrame;
      try { frame = JSON.parse(ev.data as string); } catch { return; }
      if (!frame?.imu?.accelerometer_g) return;
      opts.onFrame?.(frame);
      detector.push(frame);
    };
    ws.onclose = () => { if (!closed) retry = setTimeout(open, 1000); };
    ws.onerror = () => { try { ws?.close(); } catch {} };
  };

  open();

  return {
    close() {
      closed = true;
      if (retry) clearTimeout(retry);
      try { ws?.close(); } catch {}
    },
  };
}
