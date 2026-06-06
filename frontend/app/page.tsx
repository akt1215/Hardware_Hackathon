"use client";

import { useEffect, useRef, useState } from "react";
import styles from "../components/RallyTrainer.module.css";
import { connectImu } from "../lib/imu";

type HudState = {
  score: number;
  rally: number;
  combo: number;
  bestCombo: number;
  lives: number;
  accuracy: number;
  state: "idle" | "playing" | "over";
  best: number;
};

type VerdictKind = "perfect" | "good" | "ok" | "miss";

type VerdictState = {
  label: string;
  kind: VerdictKind;
  sub?: string;
  key: number;
};

type ShotInfo = {
  type: string;
  dir: string;
  power: number;
  pts: number;
};

type GameOverState = {
  score: number;
  bestCombo: number;
  accuracy: number;
  best: number;
};

type Settings = {
  mode: "Rally";
  difficulty: "Normal";
  palette: [string, string];
  sound: boolean;
  showTelemetry: boolean;
};

type AudioController = {
  resume: () => AudioContext | null;
  hit: (combo: number) => void;
  perfect: (combo: number) => void;
  wall: () => void;
  target: () => void;
  whiff: () => void;
  miss: () => void;
  over: () => void;
};

const SETTINGS: Settings = {
  mode: "Rally",
  difficulty: "Normal",
  palette: ["#2de1fc", "#ff5d8f"],
  sound: true,
  showTelemetry: true,
};

const VERDICT_COLOR: Record<VerdictKind, string> = {
  perfect: "#ffcf6b",
  good: "#5effb0",
  ok: "#ff5d8f",
  miss: "#ff4d6d",
};

const INITIAL_HUD: HudState = {
  score: 0,
  rally: 0,
  combo: 0,
  bestCombo: 0,
  lives: 3,
  accuracy: 100,
  state: "idle",
  best: 0,
};

function clamp(value: number, min: number, max: number) {
  return value < min ? min : value > max ? max : value;
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function randomBetween(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function clampPct(power: number) {
  return Math.max(4, Math.min(100, Math.round(power * 55)));
}

function vibrate(pattern: number | number[]) {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate(pattern);
  }
}

function makeAudio(enabled: () => boolean): AudioController {
  let context: AudioContext | null = null;

  const ensure = () => {
    if (!enabled()) {
      return null;
    }

    if (!context) {
      const AudioCtor =
        window.AudioContext ||
        (window as typeof window & {
          webkitAudioContext?: typeof AudioContext;
        }).webkitAudioContext;
      context = AudioCtor ? new AudioCtor() : null;
    }

    if (context && context.state === "suspended") {
      void context.resume();
    }

    return context;
  };

  const blip = (
    frequency: number,
    duration: number,
    type: OscillatorType = "triangle",
    gain = 0.18,
    slide = 0,
  ) => {
    const current = ensure();
    if (!current) {
      return;
    }

    const oscillator = current.createOscillator();
    const gainNode = current.createGain();

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, current.currentTime);
    if (slide) {
      oscillator.frequency.exponentialRampToValueAtTime(
        Math.max(40, frequency + slide),
        current.currentTime + duration,
      );
    }

    gainNode.gain.setValueAtTime(0.0001, current.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(
      gain,
      current.currentTime + 0.006,
    );
    gainNode.gain.exponentialRampToValueAtTime(
      0.0001,
      current.currentTime + duration,
    );

    oscillator.connect(gainNode).connect(current.destination);
    oscillator.start();
    oscillator.stop(current.currentTime + duration + 0.02);
  };

  return {
    resume: ensure,
    hit: (combo) =>
      blip(440 + Math.min(combo, 20) * 14, 0.08, "triangle", 0.2),
    perfect: (combo) => {
      blip(660 + Math.min(combo, 20) * 16, 0.09, "triangle", 0.22);
      window.setTimeout(() => blip(990, 0.1, "sine", 0.16), 50);
    },
    wall: () => blip(150, 0.09, "sine", 0.13, -30),
    target: () => {
      blip(880, 0.08, "square", 0.16);
      window.setTimeout(() => blip(1320, 0.1, "square", 0.13), 60);
    },
    whiff: () => blip(160, 0.14, "sawtooth", 0.1, -60),
    miss: () => blip(280, 0.3, "sawtooth", 0.16, -160),
    over: () => {
      blip(220, 0.5, "square", 0.15, -120);
      window.setTimeout(() => blip(130, 0.6, "square", 0.13, -70), 130);
    },
  };
}

export default function Home() {
  const courtRef = useRef<HTMLCanvasElement | null>(null);
  const telemetryCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const accelRef = useRef<HTMLSpanElement | null>(null);
  const gyroRef = useRef<HTMLSpanElement | null>(null);
  const faceRef = useRef<HTMLSpanElement | null>(null);
  const swingSpeedRef = useRef<HTMLSpanElement | null>(null);
  const servoRef = useRef<HTMLDivElement | null>(null);
  const engineStartRef = useRef<(() => void) | null>(null);
  const settingsRef = useRef(SETTINGS);
  const verdictKeyRef = useRef(0);

  const [hud, setHud] = useState<HudState>(INITIAL_HUD);
  const [verdict, setVerdict] = useState<VerdictState | null>(null);
  const [shot, setShot] = useState<ShotInfo | null>(null);
  const [gameOver, setGameOver] = useState<GameOverState | null>(null);

  useEffect(() => {
    if (
      !courtRef.current ||
      !telemetryCanvasRef.current ||
      !accelRef.current ||
      !gyroRef.current ||
      !faceRef.current ||
      !swingSpeedRef.current
    ) {
      return;
    }

    const court = courtRef.current;
    const telemetryCanvas = telemetryCanvasRef.current;
    const context = court.getContext("2d");
    const telemetryContext = telemetryCanvas.getContext("2d");

    if (!context || !telemetryContext) {
      return;
    }

    const audio = makeAudio(() => settingsRef.current.sound);

    const config = {
      camDist: 1.0,
      f: 1.0,
      vanY: 0.4,
      floorK: 0.53,
      heightK: 0.92,
      xK: 0.5,
      ballK: 0.052,
      g: 1.15,
      wallRest: 0.86,
      serveSpeed: 0.92,
      winOuter: 0.2,
      winInner: -0.07,
      ideal: 0.055,
      perfect: 0.035,
      good: 0.07,
      swingThresh: 0.95,
      swingCooldown: 320,
    };

    const difficulty = {
      Casual: 0.82,
      Normal: 1,
      Pro: 1.26,
    } as const;

    let width = 0;
    let height = 0;
    let telemetryWidth = 0;
    let telemetryHeight = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const ball = {
      x: 0,
      y: 0,
      z: 1,
      vx: 0,
      vy: 0,
      vz: 0,
      hittable: false,
      live: false,
      prevZ: 1,
    };

    let trail: Array<{ x: number; y: number; z: number }> = [];
    let impacts: Array<{ x: number; y: number; r: number; a: number }> = [];
    let swingFx:
      | {
          ang: number;
          t: number;
          dir: string;
          power: number;
        }
      | null = null;
    let reticlePulse = 0;

    let state: HudState["state"] = "idle";
    let score = 0;
    let rally = 0;
    let combo = 0;
    let bestCombo = 0;
    let lives = 3;
    let swings = 0;
    let cleanHits = 0;
    let best = Number.parseInt(localStorage.getItem("rt_best") || "0", 10) || 0;

    const cols = 3;
    const rows = 2;
    const zoneFlash: Record<number, number> = {};

    let accel = 1;
    let gyro = 0;
    let face = 0;
    let accelTarget = 1;
    let gyroTarget = 0;
    let faceTarget = 0;
    const historyLength = 64;
    const accelHistory = new Array(historyLength).fill(1);

    let animationFrame = 0;
    let lastFrame = performance.now();
    let activeMissTimeout = 0;

    const project = (x: number, y: number, z: number) => {
      const scale = config.f / (z + config.camDist);
      const floorY = config.vanY * height + scale * config.floorK * height;
      const screenX = width / 2 + x * scale * config.xK * width;
      const screenY = floorY - y * scale * config.heightK * height;
      return { screenX, screenY, scale };
    };

    const resize = () => {
      const rect = court.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      court.width = width * dpr;
      court.height = height * dpr;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);

      const telemetryRect = telemetryCanvas.getBoundingClientRect();
      telemetryWidth = telemetryRect.width;
      telemetryHeight = telemetryRect.height;
      telemetryCanvas.width = telemetryWidth * dpr;
      telemetryCanvas.height = telemetryHeight * dpr;
      telemetryContext.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const getDifficulty = () => difficulty[settingsRef.current.difficulty] ?? 1;

    const pushStats = () => {
      const accuracy =
        swings > 0 ? Math.round((cleanHits / swings) * 100) : 100;
      setHud({
        score,
        rally,
        combo,
        bestCombo,
        lives,
        accuracy,
        state,
        best,
      });
      if (state === "playing") {
        setGameOver(null);
      }
    };

    const serve = () => {
      ball.x = randomBetween(-0.35, 0.35);
      ball.y = randomBetween(0.42, 0.6);
      ball.z = 1;
      const speed =
        config.serveSpeed *
        getDifficulty() *
        (1 + Math.min(rally, 24) * 0.012);
      ball.vz = -speed;
      ball.vx = randomBetween(-0.18, 0.18);
      ball.vy = randomBetween(0.15, 0.42);
      ball.hittable = true;
      ball.live = true;
      ball.prevZ = ball.z;
      trail = [];
    };

    const start = () => {
      audio.resume();
      score = 0;
      rally = 0;
      combo = 0;
      bestCombo = 0;
      lives = 3;
      swings = 0;
      cleanHits = 0;
      setShot(null);
      state = "playing";
      serve();
      pushStats();
    };

    engineStartRef.current = start;

    const servoTap = (kind: "hit" | "miss") => {
      if (!servoRef.current) {
        return;
      }

      const element = servoRef.current;
      element.style.transition = "none";
      element.style.opacity = "1";
      element.style.transform = `scale(${kind === "hit" ? 1 : 0.6})`;

      requestAnimationFrame(() => {
        element.style.transition = "transform .35s ease, opacity .35s ease";
        element.style.opacity = "0";
        element.style.transform = "scale(1.8)";
      });
    };

    const setVerdictState = (
      label: string,
      kind: VerdictKind,
      sub?: string,
    ) => {
      verdictKeyRef.current += 1;
      setVerdict({ label, kind, sub, key: verdictKeyRef.current });
    };

    const missBall = () => {
      ball.live = false;
      ball.hittable = false;
      lives -= 1;
      combo = 0;
      setVerdictState("MISS", "miss", "Ball got past");
      audio.miss();
      servoTap("miss");
      vibrate(120);
      pushStats();

      if (lives <= 0) {
        state = "over";
        if (score > best) {
          best = score;
          localStorage.setItem("rt_best", String(best));
        }
        audio.over();
        pushStats();
        setGameOver({
          score,
          bestCombo,
          accuracy: swings > 0 ? Math.round((cleanHits / swings) * 100) : 0,
          best,
        });
        return;
      }

      activeMissTimeout = window.setTimeout(() => {
        if (state === "playing") {
          serve();
        }
      }, 900);
    };

    const doSwing = (vx: number, vy: number, speed: number) => {
      if (state !== "playing") {
        return;
      }

      const now = performance.now();
      const speedNorm = clamp(speed / 2.4, 0, 1);
      accelTarget = 1 + speedNorm * 5.4;
      gyroTarget = clamp(vx * 230, -480, 480);
      faceTarget = clamp(
        (Math.atan2(vy, Math.abs(vx) + 0.001) * 180) / Math.PI,
        -60,
        60,
      );

      const direction = vx >= 0 ? "FOREHAND" : "BACKHAND";
      let shotType = "FLAT";
      if (vy > 0.55) {
        shotType = "TOPSPIN";
      } else if (vy < -0.45) {
        shotType = "SLICE";
      }

      swingFx = {
        ang: Math.atan2(vy, vx),
        t: now,
        dir: direction,
        power: speedNorm,
      };
      swings += 1;

      const inWindow =
        ball.live &&
        ball.hittable &&
        ball.vz < 0 &&
        ball.z <= config.winOuter &&
        ball.z >= config.winInner;

      if (!inWindow) {
        const early = ball.live && ball.z > config.winOuter;
        setVerdictState("WHIFF", "miss", early ? "Too early" : "No ball");
        combo = 0;
        audio.whiff();
        servoTap("miss");
        pushStats();
        return;
      }

      const error = ball.z - config.ideal;
      const absoluteError = Math.abs(error);
      let kind: VerdictKind;
      let label: string;
      let multiplier: number;

      if (absoluteError < config.perfect) {
        label = "PERFECT";
        kind = "perfect";
        multiplier = 1.3;
      } else if (absoluteError < config.good) {
        label = "GOOD";
        kind = "good";
        multiplier = 1.0;
      } else if (error > 0) {
        label = "EARLY";
        kind = "ok";
        multiplier = 0.6;
      } else {
        label = "LATE";
        kind = "ok";
        multiplier = 0.6;
      }

      const power = (0.9 + speedNorm * 0.7) * multiplier * getDifficulty();
      ball.vz = Math.abs(power) + 0.15;
      ball.vx = clamp(vx * 0.9, -0.7, 0.7);
      let lift = 0.32 + speedNorm * 0.2;
      if (shotType === "TOPSPIN") {
        lift += 0.12;
      }
      if (shotType === "SLICE") {
        lift -= 0.06;
      }
      ball.vy = lift;
      ball.hittable = false;

      const clean = kind === "perfect" || kind === "good";
      if (clean) {
        cleanHits += 1;
        rally += 1;
        combo += 1;
        bestCombo = Math.max(bestCombo, combo);
      } else {
        combo = 0;
        rally += 1;
      }

      const comboMultiplier = 1 + Math.floor(combo / 3) * 0.5;
      const points = Math.round(
        (kind === "perfect" ? 100 : kind === "good" ? 60 : 25) *
          comboMultiplier,
      );
      score += points;

      setVerdictState(label, kind, `${direction} · ${shotType}`);
      setShot({
        type: shotType,
        dir: direction,
        power,
        pts: points,
      });
      if (kind === "perfect") {
        audio.perfect(combo);
      } else {
        audio.hit(combo);
      }
      servoTap("hit");
      vibrate(kind === "perfect" ? [12, 20, 12] : 14);
      pushStats();
    };

    let pointerSamples: Array<{ x: number; y: number; t: number }> = [];
    let lastSwingAt = 0;

    const onPointerMove = (event: PointerEvent) => {
      const now = performance.now();
      pointerSamples.push({ x: event.clientX, y: event.clientY, t: now });
      while (pointerSamples.length > 6) {
        pointerSamples.shift();
      }

      if (pointerSamples.length < 2) {
        return;
      }

      const first = pointerSamples[0];
      const last = pointerSamples[pointerSamples.length - 1];
      const delta = last.t - first.t;
      if (delta <= 0) {
        return;
      }

      const dx = (last.x - first.x) / delta;
      const dy = (last.y - first.y) / delta;
      const speed = Math.hypot(dx, dy);

      if (
        speed > config.swingThresh &&
        now - lastSwingAt > config.swingCooldown
      ) {
        lastSwingAt = now;
        doSwing(dx / speed, -dy / speed, speed);
        pointerSamples = [];
      }
    };

    const keySwing = (vx: number, vy: number) => {
      const now = performance.now();
      if (now - lastSwingAt < config.swingCooldown) {
        return;
      }

      lastSwingAt = now;
      doSwing(vx, vy, 1.8);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === " " || event.key === "Enter") {
        if (state === "idle" || state === "over") {
          start();
          event.preventDefault();
          return;
        }

        keySwing(0.3, 0.1);
        event.preventDefault();
        return;
      }

      if (state !== "playing") {
        return;
      }

      if (event.key === "ArrowRight") {
        keySwing(0.8, 0.1);
      } else if (event.key === "ArrowLeft") {
        keySwing(-0.8, 0.1);
      } else if (event.key === "ArrowUp") {
        keySwing(0.3, 0.8);
      } else if (event.key === "ArrowDown") {
        keySwing(0.3, -0.6);
      }
    };

    const zoneAt = (x: number, y: number) => {
      const column = clamp(Math.floor(((x + 0.8) / 1.6) * cols), 0, cols - 1);
      const row = clamp(Math.floor(((0.92 - y) / 0.84) * rows), 0, rows - 1);
      return row * cols + column;
    };

    const zoneRect = (index: number) => {
      const column = index % cols;
      const row = Math.floor(index / cols);
      const x0 = -0.8 + (column / cols) * 1.6;
      const x1 = -0.8 + ((column + 1) / cols) * 1.6;
      const y1 = 0.92 - (row / rows) * 0.84;
      const y0 = 0.92 - ((row + 1) / rows) * 0.84;
      return { x0, x1, y0, y1 };
    };

    const step = (deltaTime: number) => {
      accel = lerp(accel, accelTarget, clamp(deltaTime * 9, 0, 1));
      accelTarget = lerp(accelTarget, 1, clamp(deltaTime * 4, 0, 1));
      gyro = lerp(gyro, gyroTarget, clamp(deltaTime * 12, 0, 1));
      gyroTarget = lerp(gyroTarget, 0, clamp(deltaTime * 6, 0, 1));
      face = lerp(face, faceTarget, clamp(deltaTime * 10, 0, 1));
      faceTarget = lerp(faceTarget, 0, clamp(deltaTime * 3, 0, 1));
      accel += randomBetween(-0.015, 0.015);
      gyro += randomBetween(-1.5, 1.5);
      accelHistory.shift();
      accelHistory.push(accel);

      if (state !== "playing" || !ball.live) {
        return;
      }

      ball.prevZ = ball.z;
      ball.x += ball.vx * deltaTime;
      ball.y += ball.vy * deltaTime;
      ball.z += ball.vz * deltaTime;
      ball.vy -= config.g * deltaTime;

      if (ball.y < 0.04) {
        ball.y = 0.04;
        ball.vy = Math.abs(ball.vy) * 0.68;
      }

      if (ball.z >= 1 && ball.vz > 0) {
        ball.z = 1;
        ball.vz = -ball.vz * config.wallRest;
        const zoneIndex = zoneAt(ball.x, ball.y);
        zoneFlash[zoneIndex] = 1;
        impacts.push({ x: ball.x, y: ball.y, r: 0, a: 1 });
        audio.wall();
        ball.hittable = true;
      }

      if (ball.x < -0.95) {
        ball.x = -0.95;
        ball.vx = Math.abs(ball.vx);
      }

      if (ball.x > 0.95) {
        ball.x = 0.95;
        ball.vx = -Math.abs(ball.vx);
      }

      if (
        ball.prevZ >= config.winInner &&
        ball.z < config.winInner &&
        ball.hittable &&
        ball.vz < 0
      ) {
        missBall();
      }

      if (ball.z < -0.3 && ball.live) {
        missBall();
      }

      trail.push({ x: ball.x, y: ball.y, z: ball.z });
      if (trail.length > 14) {
        trail.shift();
      }
    };

    const render = (deltaTime: number) => {
      const palette = {
        cyan: settingsRef.current.palette[0],
        pink: settingsRef.current.palette[1],
      };
      const amber = "#ffcf6b";

      const gradient = context.createRadialGradient(
        width / 2,
        config.vanY * height,
        20,
        width / 2,
        height * 0.6,
        Math.max(width, height),
      );
      gradient.addColorStop(0, "#0e2138");
      gradient.addColorStop(1, "#04080e");
      context.fillStyle = gradient;
      context.fillRect(0, 0, width, height);

      context.strokeStyle = "rgba(110,150,200,0.10)";
      context.lineWidth = 1;
      for (let z = 0; z <= 1.001; z += 1 / 9) {
        const left = project(-0.95, 0, z);
        const right = project(0.95, 0, z);
        context.beginPath();
        context.moveTo(left.screenX, left.screenY);
        context.lineTo(right.screenX, right.screenY);
        context.stroke();
      }

      for (let x = -0.9; x <= 0.91; x += 0.3) {
        const near = project(x, 0, 0);
        const far = project(x, 0, 1);
        context.beginPath();
        context.moveTo(near.screenX, near.screenY);
        context.lineTo(far.screenX, far.screenY);
        context.stroke();
      }

      const wallBottomLeft = project(-0.8, 0.08, 1);
      const wallTopRight = project(0.8, 0.92, 1);
      context.fillStyle = "rgba(10,28,48,0.55)";
      context.fillRect(
        wallBottomLeft.screenX,
        wallTopRight.screenY,
        wallTopRight.screenX - wallBottomLeft.screenX,
        wallBottomLeft.screenY - wallTopRight.screenY,
      );

      for (let index = 0; index < cols * rows; index += 1) {
        const zone = zoneRect(index);
        const start = project(zone.x0, zone.y0, 1);
        const end = project(zone.x1, zone.y1, 1);
        const zoneX = start.screenX;
        const zoneY = end.screenY;
        const zoneWidth = end.screenX - start.screenX;
        const zoneHeight = start.screenY - end.screenY;
        context.strokeStyle = "rgba(110,150,200,0.20)";
        context.lineWidth = 1;
        context.strokeRect(zoneX + 2, zoneY + 2, zoneWidth - 4, zoneHeight - 4);

        const flash = zoneFlash[index] || 0;
        if (flash > 0.02) {
          context.fillStyle = `rgba(255,207,107,${Math.min(flash, 1) * 0.5})`;
          context.fillRect(zoneX + 2, zoneY + 2, zoneWidth - 4, zoneHeight - 4);
          zoneFlash[index] = flash - deltaTime * 2.2;
        }
      }

      context.strokeStyle = palette.cyan;
      context.lineWidth = 2;
      context.shadowColor = palette.cyan;
      context.shadowBlur = 16;
      context.strokeRect(
        wallBottomLeft.screenX,
        wallTopRight.screenY,
        wallTopRight.screenX - wallBottomLeft.screenX,
        wallBottomLeft.screenY - wallTopRight.screenY,
      );
      context.shadowBlur = 0;

      if (ball.live && ball.vz < 0) {
        let sampleX = ball.x;
        let sampleY = ball.y;
        let sampleZ = ball.z;
        const sampleVx = ball.vx;
        let sampleVy = ball.vy;
        const sampleVz = ball.vz;
        context.fillStyle = "rgba(45,225,252,0.5)";

        for (let index = 0; index < 40; index += 1) {
          sampleX += sampleVx * 0.02;
          sampleY += sampleVy * 0.02;
          sampleZ += sampleVz * 0.02;
          sampleVy -= config.g * 0.02;
          if (sampleY < 0.04) {
            sampleY = 0.04;
            sampleVy = Math.abs(sampleVy) * 0.68;
          }
          if (sampleZ < config.winInner) {
            break;
          }
          if (index % 3 === 0) {
            const point = project(sampleX, sampleY, sampleZ);
            context.beginPath();
            context.arc(
              point.screenX,
              point.screenY,
              1.6 * point.scale + 0.5,
              0,
              Math.PI * 2,
            );
            context.fill();
          }
        }
      }

      impacts = impacts.filter((impact) => impact.a > 0.03);
      impacts.forEach((impact) => {
        const point = project(impact.x, impact.y, 1);
        context.strokeStyle = palette.pink;
        context.globalAlpha = impact.a;
        context.lineWidth = 2;
        context.beginPath();
        context.arc(point.screenX, point.screenY, impact.r, 0, Math.PI * 2);
        context.stroke();
        context.globalAlpha = 1;
        impact.r += 90 * deltaTime;
        impact.a -= deltaTime * 1.6;
      });

      if (ball.live) {
        const shadow = project(ball.x, 0, ball.z);
        context.fillStyle = "rgba(0,0,0,0.4)";
        context.beginPath();
        context.ellipse(
          shadow.screenX,
          shadow.screenY,
          16 * shadow.scale + 3,
          5 * shadow.scale + 1.5,
          0,
          0,
          Math.PI * 2,
        );
        context.fill();
      }

      trail.forEach((point, index) => {
        const projected = project(point.x, point.y, point.z);
        const alpha = index / trail.length;
        context.globalAlpha = alpha * 0.5;
        context.fillStyle = palette.cyan;
        context.beginPath();
        context.arc(
          projected.screenX,
          projected.screenY,
          config.ballK * height * projected.scale * alpha * 0.9,
          0,
          Math.PI * 2,
        );
        context.fill();
      });
      context.globalAlpha = 1;

      if (ball.live) {
        const projected = project(ball.x, ball.y, ball.z);
        const radius = config.ballK * height * projected.scale;
        const inWindow =
          ball.hittable &&
          ball.vz < 0 &&
          ball.z <= config.winOuter &&
          ball.z >= config.winInner;
        context.fillStyle = "#eafcff";
        context.shadowColor = inWindow ? amber : palette.cyan;
        context.shadowBlur = inWindow ? 30 : 18;
        context.beginPath();
        context.arc(
          projected.screenX,
          projected.screenY,
          radius,
          0,
          Math.PI * 2,
        );
        context.fill();
        context.shadowBlur = 0;

        context.strokeStyle = "rgba(45,150,180,0.5)";
        context.lineWidth = Math.max(1, radius * 0.08);
        context.beginPath();
        context.arc(
          projected.screenX,
          projected.screenY,
          radius * 0.7,
          -0.6,
          0.9,
        );
        context.stroke();
      }

      reticlePulse += deltaTime * 4;
      const reticleCenter = project(0, 0.33, config.ideal);
      const ballInWindow =
        ball.live &&
        ball.hittable &&
        ball.vz < 0 &&
        ball.z <= config.winOuter &&
        ball.z >= config.winInner;

      context.save();
      context.translate(reticleCenter.screenX, reticleCenter.screenY);
      context.strokeStyle = ballInWindow
        ? amber
        : "rgba(120,160,210,0.35)";
      context.lineWidth = ballInWindow ? 3 : 1.5;
      if (ballInWindow) {
        context.shadowColor = amber;
        context.shadowBlur = 18;
      }
      const radius = 64 + (ballInWindow ? Math.sin(reticlePulse * 2) * 4 : 0);
      for (let quadrant = 0; quadrant < 4; quadrant += 1) {
        const startAngle = quadrant * (Math.PI / 2) + 0.35;
        const endAngle = quadrant * (Math.PI / 2) + Math.PI / 2 - 0.35;
        context.beginPath();
        context.arc(0, 0, radius, startAngle, endAngle);
        context.stroke();
      }
      context.shadowBlur = 0;
      context.restore();

      if (swingFx) {
        const age = (performance.now() - swingFx.t) / 1000;
        if (age < 0.28) {
          const alpha = 1 - age / 0.28;
          const direction = Math.cos(swingFx.ang) >= 0 ? 1 : -1;
          context.save();
          context.translate(reticleCenter.screenX, reticleCenter.screenY);
          context.rotate(swingFx.ang * 0.25);
          const sweep = lerp(-1.1, 1.1, age / 0.28) * direction;
          context.strokeStyle = palette.pink;
          context.globalAlpha = alpha;
          context.lineWidth = 10 + swingFx.power * 14;
          context.lineCap = "round";
          context.shadowColor = palette.pink;
          context.shadowBlur = 20;
          context.beginPath();
          context.arc(
            0,
            0,
            92,
            sweep - 0.5 * direction,
            sweep + 0.5 * direction,
          );
          context.stroke();
          context.globalAlpha = 1;
          context.shadowBlur = 0;
          context.restore();
        } else {
          swingFx = null;
        }
      }

      accelRef.current!.textContent = accel.toFixed(2);
      gyroRef.current!.textContent = gyro.toFixed(0);
      faceRef.current!.textContent = `${face >= 0 ? "+" : ""}${face.toFixed(0)}`;
      swingSpeedRef.current!.textContent = Math.round((accel - 1) * 60).toString();

      telemetryContext.clearRect(0, 0, telemetryWidth, telemetryHeight);
      telemetryContext.strokeStyle = "rgba(120,160,210,0.12)";
      telemetryContext.lineWidth = 1;
      telemetryContext.beginPath();
      telemetryContext.moveTo(0, telemetryHeight * 0.7);
      telemetryContext.lineTo(telemetryWidth, telemetryHeight * 0.7);
      telemetryContext.stroke();

      telemetryContext.beginPath();
      telemetryContext.strokeStyle = amber;
      telemetryContext.lineWidth = 1.6;
      telemetryContext.shadowColor = amber;
      telemetryContext.shadowBlur = 5;
      for (let index = 0; index < historyLength; index += 1) {
        const x = (index / (historyLength - 1)) * telemetryWidth;
        const y =
          telemetryHeight -
          (clamp(accelHistory[index], 0, 7) / 7) * telemetryHeight;
        if (index === 0) {
          telemetryContext.moveTo(x, y);
        } else {
          telemetryContext.lineTo(x, y);
        }
      }
      telemetryContext.stroke();
      telemetryContext.shadowBlur = 0;
    };

    const frame = (now: number) => {
      let deltaTime = (now - lastFrame) / 1000;
      lastFrame = now;
      deltaTime = clamp(deltaTime, 0, 0.033);
      step(deltaTime);
      render(deltaTime);
      animationFrame = window.requestAnimationFrame(frame);
    };

    resize();
    pushStats();
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("keydown", onKeyDown);
    animationFrame = window.requestAnimationFrame(frame);

    // MPU-6050 input: real board or sim, via the rally bridge WebSocket. Drives
    // the same doSwing() as pointer/keyboard. No-op if the bridge isn't running.
    const imu = connectImu(doSwing);

    return () => {
      imu.close();
      if (activeMissTimeout) {
        window.clearTimeout(activeMissTimeout);
      }
      if (animationFrame) {
        window.cancelAnimationFrame(animationFrame);
      }
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  useEffect(() => {
    if (!verdict) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setVerdict((current) => (current?.key === verdict.key ? null : current));
    }, 900);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [verdict]);

  const startGame = () => {
    engineStartRef.current?.();
  };

  const [cyan, pink] = SETTINGS.palette;

  return (
    <main className={styles.wrap}>
      <canvas ref={courtRef} className={styles.court} />
      <div
        ref={servoRef}
        className={styles.servo}
        style={{
          borderColor: pink,
          boxShadow: `0 0 18px ${pink}`,
        }}
      />

      <div className={styles.hud}>
        <div className={styles.modeChip}>
          <span
            className={styles.pulse}
            style={{
              background: cyan,
              boxShadow: `0 0 10px ${cyan}`,
            }}
          />
          RALLY MODE
        </div>
        <div className={styles.statRow}>
          <div className={styles.stat}>
            <div className={styles.statKey}>SCORE</div>
            <div className={`${styles.statValue} ${styles.big}`} style={{ color: cyan }}>
              {hud.score}
            </div>
          </div>
          <div className={`${styles.stat} ${styles.combo}`}>
            <div className={styles.statKey}>COMBO</div>
            <div className={`${styles.statValue} ${styles.mid}`}>
              {hud.combo}
              <span className={styles.unit}>×</span>
            </div>
          </div>
        </div>

        <div className={styles.statRow}>
          <div className={styles.stat}>
            <div className={styles.statKey}>RALLY</div>
            <div className={`${styles.statValue} ${styles.small}`}>{hud.rally}</div>
          </div>
          <div className={styles.stat}>
            <div className={styles.statKey}>ACCURACY</div>
            <div className={`${styles.statValue} ${styles.small}`}>
              {hud.accuracy}
              <span className={styles.unit}>%</span>
            </div>
          </div>
          <div className={styles.stat}>
            <div className={styles.statKey}>BEST</div>
            <div className={`${styles.statValue} ${styles.small}`}>{hud.best}</div>
          </div>
        </div>

        <div className={styles.lives}>
          <span className={styles.livesLabel}>LIVES</span>
          {[0, 1, 2].map((index) => (
            <span
              key={index}
              className={`${styles.life} ${index < hud.lives ? "" : styles.off}`}
              style={
                index < hud.lives
                  ? {
                      background: pink,
                      boxShadow: `0 0 8px ${pink}`,
                    }
                  : undefined
              }
            />
          ))}
        </div>
      </div>

      <div className={`${styles.imu} ${SETTINGS.showTelemetry ? "" : styles.hidden}`}>
        <div className={styles.imuHead}>
          <span className={styles.imuTitle}>MPU-6050</span>
          <span className={styles.imuSub}>IMU · SWING</span>
        </div>
        <div className={styles.imuGrid}>
          <div className={styles.imuCell}>
            <div className={styles.imuKey}>|ACCEL|</div>
            <div className={styles.imuValue} style={{ color: "#ffcf6b" }}>
              <span ref={accelRef}>1.00</span>
              <span className={styles.imuUnit}>g</span>
            </div>
          </div>
          <div className={styles.imuCell}>
            <div className={styles.imuKey}>GYRO_Z</div>
            <div className={styles.imuValue} style={{ color: cyan }}>
              <span ref={gyroRef}>0</span>
              <span className={styles.imuUnit}>°/s</span>
            </div>
          </div>
          <div className={styles.imuCell}>
            <div className={styles.imuKey}>FACE ∠</div>
            <div className={styles.imuValue} style={{ color: pink }}>
              <span ref={faceRef}>+0</span>
              <span className={styles.imuUnit}>°</span>
            </div>
          </div>
          <div className={styles.imuCell}>
            <div className={styles.imuKey}>SWING</div>
            <div className={styles.imuValue}>
              <span ref={swingSpeedRef}>0</span>
              <span className={styles.imuUnit}>u</span>
            </div>
          </div>
        </div>
        <canvas ref={telemetryCanvasRef} className={styles.telemetryCanvas} />
        <div className={styles.imuFoot}>
          <span>ODR 60Hz</span>
          <span>±4g · ±500°/s</span>
        </div>
      </div>

      {verdict ? (
        <div className={styles.verdict} key={verdict.key}>
          <div
            className={styles.verdictBig}
            style={{
              color: VERDICT_COLOR[verdict.kind],
              textShadow: `0 0 30px ${VERDICT_COLOR[verdict.kind]}66`,
            }}
          >
            {verdict.label}
          </div>
          {verdict.sub ? (
            <div className={styles.verdictSub}>{verdict.sub}</div>
          ) : null}
        </div>
      ) : null}

      {hud.state === "playing" ? (
        <div className={styles.readout}>
          <div className={styles.shotCard}>
            <div>
              <div className={styles.shotType} style={{ color: cyan }}>
                {shot ? shot.type : "READY"}
              </div>
              <div className={styles.shotMeta}>
                {shot ? `${shot.dir} · +${shot.pts}` : "awaiting swing"}
              </div>
            </div>
            <div className={styles.power}>
              <div className={styles.powerKey}>POWER</div>
              <div className={styles.track}>
                <div
                  className={styles.fill}
                  style={{
                    width: `${shot ? clampPct(shot.power) : 0}%`,
                    background: `linear-gradient(90deg, ${cyan}, ${pink})`,
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {hud.state === "playing" && !shot ? (
        <div className={styles.hint}>
          <b>Flick</b> the mouse to swing - fast = power, direction = aim. Time
          it as the ball hits the <b>amber ring</b>.
        </div>
      ) : null}

      {hud.state === "idle" ? (
        <div className={styles.overlay}>
          <div className={styles.card}>
            <div className={styles.eyebrow}>MPU-6050 · MOTION TENNIS</div>
            <h1>Rally Trainer</h1>
            <p className={styles.tagline}>
              Face the wall and <b>swing to return</b>. No paddle to move - it
              is all <b>timing and swing motion</b>. Hit the ball as it crosses
              the contact ring.
            </p>
            <div className={styles.how}>
              <div className={styles.howCard}>
                <span className={styles.howKey}>FLICK ↔</span>
                <span className={styles.howDetail}>swing · aim and power</span>
              </div>
              <div className={styles.howCard}>
                <span className={styles.howKey}>↑ FLICK</span>
                <span className={styles.howDetail}>topspin · ↓ slice</span>
              </div>
              <div className={styles.howCard}>
                <span className={styles.howKey}>SPACE</span>
                <span className={styles.howDetail}>flat swing / serve</span>
              </div>
            </div>
            <button
              type="button"
              className={styles.button}
              onClick={startGame}
              style={{ background: cyan }}
            >
              Start rally &nbsp;›
            </button>
          </div>
        </div>
      ) : null}

      {hud.state === "over" && gameOver ? (
        <div className={styles.overlay}>
          <div className={styles.card}>
            <div className={styles.gameOverEyebrow} style={{ color: pink }}>
              GAME OVER
            </div>
            <h1>{gameOver.score}</h1>
            <p className={styles.result}>
              Best combo <b>{gameOver.bestCombo}×</b> · Accuracy{" "}
              <b>{gameOver.accuracy}%</b> · Best <b>{gameOver.best}</b>
            </p>
            <button
              type="button"
              className={styles.button}
              onClick={startGame}
              style={{ background: cyan }}
            >
              Play again &nbsp;›
            </button>
          </div>
        </div>
      ) : null}
    </main>
  );
}
