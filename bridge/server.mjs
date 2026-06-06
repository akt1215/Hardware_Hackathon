// Rally bridge: read MPU-6050 IMU frames from a source and broadcast them to
// browsers over WebSocket. The frames are the firmware's contract JSON, passed
// through verbatim.
//
//   node server.mjs --sim                 # spawn the native sim (no hardware)
//   node server.mjs --serial COM5         # read the STM32 USB-serial (Stage 4)
//   node server.mjs --sim --port 8080     # WebSocket port (default 8080)
//
// Serial mode needs `npm i serialport` (only required when --serial is used).
import { WebSocketServer } from "ws";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---- args -------------------------------------------------------------------
const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f, d) => { const i = argv.indexOf(f); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };

const PORT   = Number(val("--port", "8080"));
const SERIAL = has("--serial") ? val("--serial", "") : null;
const BAUD   = Number(val("--baud", "115200"));
const EXE    = val("--exe", defaultSimExe());

if (SERIAL === "") { console.error("[bridge] --serial needs a port, e.g. --serial COM6"); process.exit(1); }

function defaultSimExe() {
  const base = resolve(__dirname, "..", "firmware", ".pio", "build", "native");
  for (const name of ["program.exe", "program"]) {
    const p = resolve(base, name);
    if (existsSync(p)) return p;
  }
  return resolve(base, "program.exe");
}

const log = (...a) => console.error("[bridge]", ...a);

// ---- WebSocket fan-out ------------------------------------------------------
const wss = new WebSocketServer({ port: PORT });
let clients = 0;
wss.on("connection", (ws) => {
  clients++; log(`client connected (${clients} total)`);
  ws.on("close", () => { clients--; log(`client disconnected (${clients} total)`); });
});
log(`WebSocket listening on ws://localhost:${PORT}`);

let frames = 0;
function broadcast(line) {
  // Validate it's a contract frame before forwarding; ignore noise.
  try { JSON.parse(line); } catch { return; }
  frames++;
  for (const ws of wss.clients) if (ws.readyState === 1) ws.send(line);
}
setInterval(() => log(`${frames} frames forwarded, ${clients} client(s)`), 5000).unref();

// ---- source: serial or sim --------------------------------------------------
function eachLine(stream) {
  createInterface({ input: stream, crlfDelay: Infinity }).on("line", (l) => {
    const s = l.trim(); if (s) broadcast(s);
  });
}

if (SERIAL) {
  log(`source: serial ${SERIAL} @ ${BAUD}`);
  let SerialPort, ReadlineParser;
  try {
    ({ SerialPort } = await import("serialport"));
    ({ ReadlineParser } = await import("@serialport/parser-readline"));
  } catch {
    log("serial mode needs serialport: run `npm i serialport @serialport/parser-readline`");
    process.exit(1);
  }
  const port = new SerialPort({ path: SERIAL, baudRate: BAUD });
  const parser = port.pipe(new ReadlineParser({ delimiter: "\n" }));
  parser.on("data", (l) => { const s = String(l).trim(); if (s) broadcast(s); });
  port.on("error", (e) => { log("serial error:", e.message); process.exit(1); });
} else {
  log(`source: sim ${EXE}`);
  if (!existsSync(EXE)) {
    log("sim binary not found — build it: `pio run -d firmware -e native`");
    process.exit(1);
  }
  const child = spawn(EXE, [], { stdio: ["ignore", "pipe", "inherit"] });
  eachLine(child.stdout);
  child.on("exit", (c) => { log(`sim exited (${c})`); process.exit(c ?? 0); });
}
