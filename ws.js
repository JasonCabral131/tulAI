// A tiny WebSocket client (RFC 6455, text frames) so Slack Socket Mode works without any dependency. Also exports helpers a test server can use.
const crypto = require('crypto');
const http = require('http');
const https = require('https');

function encode(text, mask) { // one final text frame
  const payload = Buffer.from(text, 'utf8'), n = payload.length; let head;
  if (n < 126) head = Buffer.from([0x81, (mask ? 0x80 : 0) | n]); else if (n < 65536) { head = Buffer.alloc(4); head[0] = 0x81; head[1] = (mask ? 0x80 : 0) | 126; head.writeUInt16BE(n, 2); } else { head = Buffer.alloc(10); head[0] = 0x81; head[1] = (mask ? 0x80 : 0) | 127; head.writeBigUInt64BE(BigInt(n), 2); }
  if (!mask) return Buffer.concat([head, payload]); const key = crypto.randomBytes(4), body = Buffer.from(payload); for (let i = 0; i < n; i++) body[i] ^= key[i % 4]; return Buffer.concat([head, key, body]);
}
function control(op, mask, data = Buffer.alloc(0)) { const head = Buffer.from([0x80 | op, (mask ? 0x80 : 0) | data.length]); if (!mask) return Buffer.concat([head, data]); const key = crypto.randomBytes(4), b = Buffer.from(data); for (let i = 0; i < b.length; i++) b[i] ^= key[i % 4]; return Buffer.concat([head, key, b]); }
// Pulls complete frames out of a buffer; returns [frames, rest]. Handles fragmentation through the caller-provided `acc`.
function parse(buf) {
  const frames = []; let o = 0;
  while (buf.length - o >= 2) {
    const b0 = buf[o], b1 = buf[o + 1], fin = !!(b0 & 0x80), op = b0 & 0x0f, masked = !!(b1 & 0x80); let len = b1 & 0x7f, p = o + 2;
    if (len === 126) { if (buf.length - p < 2) break; len = buf.readUInt16BE(p); p += 2; } else if (len === 127) { if (buf.length - p < 8) break; len = Number(buf.readBigUInt64BE(p)); p += 8; }
    let key = null; if (masked) { if (buf.length - p < 4) break; key = buf.slice(p, p + 4); p += 4; }
    if (buf.length - p < len) break; let data = Buffer.from(buf.slice(p, p + len)); if (key) for (let i = 0; i < len; i++) data[i] ^= key[i % 4];
    frames.push({ fin, op, data }); o = p + len;
  }
  return [frames, buf.slice(o)];
}
function connect(url, { onMessage, onClose, agent, headers } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url), mod = u.protocol === 'ws:' ? http : https, key = crypto.randomBytes(16).toString('base64');
    const req = mod.request({ host: u.hostname, port: u.port || (u.protocol === 'ws:' ? 80 : 443), path: u.pathname + u.search, agent: u.protocol === 'wss:' ? agent : undefined, headers: { Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Key': key, 'Sec-WebSocket-Version': '13', ...(headers || {}) } });
    req.on('error', reject); req.on('response', (r) => reject(new Error(`WebSocket refused (HTTP ${r.statusCode})`)));
    req.on('upgrade', (res, socket, head) => {
      const want = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
      if (res.headers['sec-websocket-accept'] !== want) { socket.destroy(); return reject(new Error('Bad WebSocket handshake')); }
      let buf = head && head.length ? Buffer.from(head) : Buffer.alloc(0), msg = [], closed = false;
      const done = () => { if (!closed) { closed = true; try { socket.destroy(); } catch {} onClose && onClose(); } };
      socket.on('data', (d) => { buf = Buffer.concat([buf, d]); const [frames, rest] = parse(buf); buf = rest;
        for (const f of frames) { if (f.op === 8) { try { socket.write(control(8, true)); } catch {} return done(); } if (f.op === 9) { socket.write(control(10, true, f.data)); continue; } if (f.op === 10) continue; msg.push(f.data); if (f.fin) { const text = Buffer.concat(msg).toString('utf8'); msg = []; try { onMessage && onMessage(text); } catch {} } } });
      socket.on('close', done); socket.on('error', done);
      resolve({ send: (t) => { if (!closed) socket.write(encode(t, true)); }, close: () => { try { socket.write(control(8, true)); } catch {} setTimeout(done, 200); }, get open() { return !closed; } });
    });
    req.end();
  });
}
module.exports = { connect, encode, parse, control };
