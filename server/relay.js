// Particle Storm — LAN relay.
//
// Serves the web app over HTTPS (self-signed cert) and relays sensor frames
// from joiners to the host display over WebSocket.
//
// HTTPS is required because Web Serial and getUserMedia only work in a
// "secure context" — and a plain http://192.168.x.x LAN address is NOT one.
// The self-signed cert covers the detected LAN IP + localhost; browsers show a
// one-time warning that joiners accept ("Advanced" -> "proceed").
//
//   cd server && npm install && npm start
//
// Roles (JSON over the socket):
//   client -> {type:'hello', role:'display'|'player', name?}
//   player -> {type:'frame', roll,pitch,dist,temp,gesture}
//   server -> display: {type:'join'|'leave'|'frame', id, name?, ...frame}
//   server -> player:  {type:'welcome', id}

const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');
const WebSocket = require('ws');
const selfsigned = require('selfsigned');
const QRCode = require('qrcode');

const PORT = process.env.PORT || 8443;
const WEB_DIR = path.join(__dirname, '..', 'web');

function lanIP() {
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const ni of ifaces[name]) {
      if (ni.family === 'IPv4' && !ni.internal) return ni.address;
    }
  }
  return '127.0.0.1';
}
const IP = lanIP();

// --- self-signed cert valid for this LAN IP + localhost ---
const pems = selfsigned.generate([{ name: 'commonName', value: IP }], {
  days: 365,
  keySize: 2048,
  altNames: [
    { type: 2, value: 'localhost' },
    { type: 7, ip: IP },
    { type: 7, ip: '127.0.0.1' },
  ],
});

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.map': 'application/json',
};

const JOIN_URL = `https://${IP}:${PORT}/join.html`;
// pre-render the join QR as SVG (server-side, so the display needs no CDN/QR lib)
let qrSvg = '';
QRCode.toString(JOIN_URL, { type: 'svg', margin: 1, color: { dark: '#0a0814', light: '#ffffff' } })
  .then((svg) => { qrSvg = svg; })
  .catch((e) => console.error('QR generation failed:', e));

const server = https.createServer({ key: pems.private, cert: pems.cert }, (req, res) => {
  const url = new URL(req.url, `https://${req.headers.host}`);

  // the display fetches this to learn the LAN join URL
  if (url.pathname === '/config') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ lanHost: `${IP}:${PORT}`, joinUrl: JOIN_URL }));
    return;
  }
  // server-rendered join QR
  if (url.pathname === '/qr.svg') {
    res.writeHead(200, { 'content-type': 'image/svg+xml', 'cache-control': 'no-store' });
    res.end(qrSvg);
    return;
  }

  let p = decodeURIComponent(url.pathname);
  if (p === '/') p = '/hand-particle-sphere.html';
  const file = path.join(WEB_DIR, path.normalize(p).replace(/^(\.\.[/\\])+/, ''));
  if (!file.startsWith(WEB_DIR)) { res.writeHead(403); res.end('forbidden'); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});

// --- WebSocket relay ---
const wss = new WebSocket.Server({ server });
const displays = new Set();
const players = new Map();   // id -> name
let nextId = 1;

function toDisplays(obj) {
  const s = JSON.stringify(obj);
  for (const d of displays) if (d.readyState === WebSocket.OPEN) d.send(s);
}

wss.on('connection', (ws) => {
  ws.role = null; ws.id = null;
  ws.on('message', (buf) => {
    let m; try { m = JSON.parse(buf); } catch { return; }

    if (m.type === 'hello') {
      ws.role = m.role === 'player' ? 'player' : 'display';
      if (ws.role === 'display') {
        displays.add(ws);
        // catch the new display up on who's already in the room
        for (const [id, name] of players) ws.send(JSON.stringify({ type: 'join', id, name }));
      } else {
        ws.id = 'p' + (nextId++);
        ws.name = String(m.name || '').slice(0, 24);
        players.set(ws.id, ws.name);
        ws.send(JSON.stringify({ type: 'welcome', id: ws.id }));
        toDisplays({ type: 'join', id: ws.id, name: ws.name });
        console.log(`+ player ${ws.id} "${ws.name}" joined (${players.size} active)`);
      }
    } else if (m.type === 'frame' && ws.role === 'player') {
      toDisplays({
        type: 'frame', id: ws.id,
        roll: +m.roll || 0, pitch: +m.pitch || 0,
        dist: (m.dist == null ? -1 : +m.dist),
        temp: (m.temp == null ? 25 : +m.temp),
        gesture: m.gesture ? 1 : 0,
      });
    }
  });

  ws.on('close', () => {
    if (ws.role === 'display') displays.delete(ws);
    else if (ws.role === 'player' && ws.id) {
      players.delete(ws.id);
      toDisplays({ type: 'leave', id: ws.id });
      console.log(`- player ${ws.id} left (${players.size} active)`);
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  const line = '─'.repeat(54);
  console.log(`\n${line}`);
  console.log('  PARTICLE STORM relay  ·  HTTPS + WebSocket');
  console.log(line);
  console.log(`  Host display :  https://${IP}:${PORT}/`);
  console.log(`  Join (others):  https://${IP}:${PORT}/join.html`);
  console.log(`  This machine :  https://localhost:${PORT}/`);
  console.log(line);
  console.log('  Joiners must accept the self-signed certificate warning.');
  console.log(`${line}\n`);
});
