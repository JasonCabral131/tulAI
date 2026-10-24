// Read-only view of Tulai Desktop's server and the processes it starts.
// Keep command details deliberately narrow: process arguments can contain credentials.
const { execFile } = require('child_process');
const path = require('path');

function commandSummary(command, root) {
  if (root) return 'Tulai Desktop service';
  const first = command.match(/^\s*(?:"([^"]+)"|'([^']+)'|(\S+))/);
  const executable = (first && (first[1] || first[2] || first[3])) || '';
  const name = path.basename(executable).toLowerCase();
  if (name === 'git') {
    const action = command.match(/\s(add|commit|gc|status|fetch|pull|push|merge|checkout|switch|restore|reset|worktree)\b/);
    return action ? `git ${action[1]}` : 'git';
  }
  if (/^(node|nodejs|python|python[0-9.]+)$/.test(name)) return name.startsWith('python') ? 'Python task' : 'Node.js task';
  if (name.includes('llama-server')) return 'Local AI model server';
  if (name.includes('whisper')) return 'Speech recognition';
  if (name.includes('tulay-listen')) return 'Microphone helper';
  if (name.includes('tulay-ocr')) return 'Screen text helper';
  return path.basename(executable) || 'Background task';
}

function list() {
  return new Promise((resolve) => {
    execFile('ps', ['-axo', 'pid=,ppid=,etime=,%cpu=,%mem=,args='], { timeout: 3000, maxBuffer: 2 * 1024 * 1024 }, (error, stdout) => {
      if (error) return resolve({ processes: [], error: 'Could not read the process list.' });
      const rows = stdout.split('\n').map((line) => {
        const m = line.match(/^\s*(\d+)\s+(\d+)\s+(\S+)\s+([\d.]+)\s+([\d.]+)\s+(.*)$/);
        return m ? { pid: +m[1], ppid: +m[2], elapsed: m[3], cpu: +m[4], memory: +m[5], command: m[6] } : null;
      }).filter(Boolean);
      const children = new Map();
      for (const row of rows) {
        if (!children.has(row.ppid)) children.set(row.ppid, []);
        children.get(row.ppid).push(row);
      }
      const self = rows.find((row) => row.pid === process.pid);
      const result = [{ pid: process.pid, ppid: process.ppid, elapsed: self?.elapsed || '—', cpu: self?.cpu || 0, memory: self?.memory || 0, label: 'Tulai Desktop service', depth: 0 }];
      const seen = new Set([process.pid]);
      const queue = [{ pid: process.pid, depth: 0 }];
      while (queue.length && result.length < 100) {
        const parent = queue.shift();
        for (const row of children.get(parent.pid) || []) {
          if (seen.has(row.pid)) continue;
          seen.add(row.pid);
          const label = commandSummary(row.command, false);
          if (!/^ps$/.test(label)) result.push({ pid: row.pid, ppid: row.ppid, elapsed: row.elapsed, cpu: row.cpu, memory: row.memory, label, depth: parent.depth + 1 });
          queue.push({ pid: row.pid, depth: parent.depth + 1 });
        }
      }
      resolve({ processes: result });
    });
  });
}

module.exports = { list };
