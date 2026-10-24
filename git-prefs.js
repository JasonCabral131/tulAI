// "always use GIT_SSL_NO_VERIFY when pulling": the company GitLab (gitlab.mbtc.mgc.local) has a self-signed certificate, so Tulai's own git pull, fetch,
// push and clone skip the certificate check FOR PRIVATE COMPANY HOSTS ONLY when you turn this on. Public hosts (GitHub, gitlab.com…) are always verified.
const fs = require('fs'), path = require('path');
const file = () => path.join(process.env.GC_DATA_DIR || path.join(require('os').homedir(), 'Library', 'Application Support', 'gateway-chat'), 'git-prefs.json');
const get = () => { try { return JSON.parse(fs.readFileSync(file(), 'utf8')); } catch { return {}; } };
const set = (o) => { const v = { ...get(), ...o }; fs.mkdirSync(path.dirname(file()), { recursive: true }); fs.writeFileSync(file(), JSON.stringify(v)); return v; };
const privateHost = (h) => /^(?:10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.|127\.)/.test(h) || /\.(?:local|internal|corp|lan)$/i.test(String(h).split(':')[0]);
/** The host of a repository's origin, read from .git/config (https://host/..., git@host:..., ssh://git@host/...). */
function originHost(dir) {
  try { const cfg = fs.readFileSync(path.join(dir, '.git', 'config'), 'utf8'); const m = /\[remote "origin"\][^[]*?url\s*=\s*(\S+)/.exec(cfg); if (!m) return ''; const u = m[1]; const h = /^[a-z+]+:\/\/(?:[^@/]+@)?([^/:]+)/i.exec(u) || /^[^@]+@([^:]+):/.exec(u); return h ? h[1] : ''; } catch { return ''; }
}
/** Extra environment for a git command in dir: GIT_SSL_NO_VERIFY only for network commands to a private company host, and only when you turned it on. */
function envFor(dir, args) {
  if (!get().sslNoVerify || !['pull', 'fetch', 'push', 'clone', 'ls-remote'].includes(args.find((a) => !a.startsWith('-') && a !== '-C' && a !== dir))) return {};
  return privateHost(originHost(dir)) ? { GIT_SSL_NO_VERIFY: 'true' } : {};
}
function handle(text) {
  const t = String(text || '').trim();
  if (/\b(?:don'?t|do not|never|stop|huwag|wag)\b.*\b(?:GIT_SSL_NO_VERIFY|ssl|certificate)\b/i.test(t)) { set({ sslNoVerify: false }); return { reply: 'Okay: my git pull, fetch and push check the certificate again for every host.', via: 'git settings' }; }
  if (/GIT_SSL_NO_VERIFY|\b(?:skip|ignore|turn off|disable)\b.{0,20}\b(?:ssl|tls|certificate)\b.{0,30}\b(?:git|pull|fetch|push|gitlab)\b|\b(?:git|pull|fetch|push|gitlab)\b.{0,40}\b(?:skip|ignore|without|no)\b.{0,15}\b(?:ssl|certificate)\b/i.test(t)) {
    set({ sslNoVerify: true });
    return { reply: 'Saved: when I pull, fetch, push or clone, I set GIT_SSL_NO_VERIFY=true **only for private company hosts** like gitlab.mbtc.mgc.local (its certificate is self-signed). GitHub and other public hosts are still checked. Your global git settings are not changed. Say "check git certificates again" to turn it off.', via: 'git settings' };
  }
  return null;
}
module.exports = { get, set, envFor, originHost, handle, privateHost };
