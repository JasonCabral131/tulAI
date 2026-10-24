// Reads this Mac's memory health: how much is free, memory pressure, swap, and which apps use the most.
// level: "normal" | "warn" | "critical". The Tulai bot shows smoke over its head when it is critical.
// TULAY_FAKE_MEM=normal|warn|critical pretends, for testing.
const { execFile } = require('child_process');
const os = require('os');
const run = (c, a) => new Promise((res) => execFile(c, a, { timeout: 5000, maxBuffer: 8e6 }, (e, so) => res(e ? '' : String(so))));
const gb = (x) => Math.round(x * 10) / 10;

async function read() {
  const fake = process.env.TULAY_FAKE_MEM;
  if (fake) return { level: fake, freePct: { critical: 4, warn: 15, normal: 62 }[fake] ?? 62, totalGB: 24, swapUsedGB: fake === 'critical' ? 9.5 : 0, swapTotalGB: 10, pressure: { critical: 4, warn: 2, normal: 1 }[fake] ?? 1, top: [{ name: 'Google Chrome', gb: 6.1 }, { name: 'Tulai', gb: 3.2 }, { name: 'Xcode', gb: 2.4 }] };
  const [mp, pl, sw, ps] = await Promise.all([run('/usr/bin/memory_pressure', []), run('/usr/sbin/sysctl', ['-n', 'kern.memorystatus_vm_pressure_level']), run('/usr/sbin/sysctl', ['-n', 'vm.swapusage']), run('/bin/ps', ['-Ao', 'rss=,comm=', '-m'])]);
  const totalGB = os.totalmem() / 1073741824;
  const free = /free percentage:\s*(\d+)%/i.exec(mp), freePct = free ? +free[1] : Math.round((os.freemem() / os.totalmem()) * 100);
  const pressure = +String(pl).trim() || 1; // 1 normal, 2 warning, 4 critical
  const s = /total = ([\d.]+)M\s+used = ([\d.]+)M/.exec(sw), swapTotalGB = s ? +s[1] / 1024 : 0, swapUsedGB = s ? +s[2] / 1024 : 0;
  const per = new Map();
  for (const line of ps.split('\n')) { const m = /^\s*(\d+)\s+(.+)$/.exec(line); if (!m) continue; const kb = +m[1], p = m[2]; const app = /([^/]+)\.app\//.exec(p); const name = app ? app[1] : p.split('/').pop(); per.set(name, (per.get(name) || 0) + kb); }
  const top = [...per.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, kb]) => ({ name, gb: gb(kb / 1048576) }));
  let level = 'normal';
  if (pressure >= 2 || freePct <= 20 || (swapTotalGB && swapUsedGB / swapTotalGB > 0.7 && freePct <= 25)) level = 'warn';
  if (pressure >= 4 || freePct <= 8 || (swapTotalGB >= 1 && swapUsedGB / swapTotalGB > 0.9 && freePct < 15)) level = 'critical'; // macOS grows swap by itself: a full swap is only dangerous when free memory is also low
  return { level, freePct, totalGB: gb(totalGB), swapUsedGB: gb(swapUsedGB), swapTotalGB: gb(swapTotalGB), pressure, top };
}

function describe(m) {
  const top = m.top[0] ? ` The biggest user is ${m.top[0].name} at ${m.top[0].gb} gigabytes.` : '';
  const swap = m.swapUsedGB >= 0.5 ? ` ${m.swapUsedGB} gigabytes are swapped to disk.` : ' No swap in use.';
  if (m.level === 'critical') return `Memory is critical. Only ${m.freePct} percent is free out of ${m.totalGB} gigabytes.${swap}${top} Closing some apps will help.`;
  if (m.level === 'warn') return `Memory is getting tight: ${m.freePct} percent free out of ${m.totalGB} gigabytes.${swap}${top}`;
  return `Memory is healthy: ${m.freePct} percent free out of ${m.totalGB} gigabytes.${swap}${top}`;
}
module.exports = { read, describe };
