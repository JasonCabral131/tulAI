// While a fine-tune runs, the pack card shows Tulai "fixing its brain" with live progress, locks the buttons, and says honestly when the new brain was not switched on.
const assert = require('assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'skill-packs-panel.js'), 'utf8');
const els = {}, el = (id) => els[id] || (els[id] = { id, style: {}, innerHTML: '', textContent: '', checked: true, onchange: null, querySelectorAll: () => [], classList: { contains: () => true } });
let train = { running: true, status: 'training', step: 1200, iterations: 3200, packs: ['jira-mastery'], blocked: null };
const packs = { auto: true, packs: [{ id: 'jira-mastery', name: 'Jira Mastery', icon: 'J', summary: 's', learns: [], sources: [], checks: 10, version: '1.2.0', selected: true, state: 'not trained', trainedVersion: null, data: [] }, { id: 'git-mastery', name: 'Git & Merge Request Mastery', icon: 'G', summary: 's', learns: [], sources: [], checks: 10, version: '1.2.0', selected: false, state: 'not trained', trainedVersion: null, data: [] }] };
const timers = []; const sb = { document: { getElementById: el, createElement: () => ({}), head: { appendChild() {} } }, window: { TulaiIcons: { bot: () => '<svg id="bot"></svg>' } }, MutationObserver: class { observe() {} }, setTimeout: (f, ms) => { if (!(ms >= 100000)) timers.push(f); return timers.length; }, clearTimeout() {}, fetch: async (u) => ({ ok: true, json: async () => (u.includes('/training/packs') ? packs : train) }) };
vm.createContext(sb); vm.runInContext(src, sb); const tick = () => new Promise((r) => setImmediate(r));
(async () => {
  for (let i = 0; i < 6; i++) await tick(); const html = () => els.spList.innerHTML;
  assert(/Tulai is fixing its brain/.test(html()) && /step 1200 of 3200 \(38%\)/.test(html()) && /class="lid"/.test(html()) && /class="brain"/.test(html()), 'running: the robot head with its lid and brain, and the progress, are shown');
  assert.strictEqual((html().match(/class="spSurgery (?!spMini)/g) || []).length, 1, 'one shared loader, because all chosen packs are trained together');
  assert(/in this training/.test(html()), 'the pack that is in the run says so');
  assert(/spMini[^]*?<svg[^]*?In training/.test(html()), 'the training button shows the small bot animation');
  assert(/In training/.test(html()) && /Wait…/.test(html()) && (html().match(/data-sp-ft=[^>]*disabled/g) || []).length === 2, 'while it trains, every Fine-tune button is locked');
    train = { running: true, status: 'evaluating', step: 3200, iterations: 3200, packs: ['jira-mastery'] }; await sb.window.__spLast; for (const f of timers.splice(0)) await f(); for (let i = 0; i < 6; i++) await tick();
  assert(/Testing the repaired brain/.test(html()) && /spSurgery test/.test(html()) && /at least 85%/.test(html()), 'after training it says the tests come next');
  train = { running: false, status: 'activation-blocked', step: 3200, iterations: 3200, packs: ['jira-mastery'], blocked: { reason: 'Some pack tests did not reach 90%.' } }; for (const f of timers.splice(0)) await f(); for (let i = 0; i < 8; i++) await tick();
  assert(/Not switched on/.test(html()) && /did not reach/.test(html()) && /your current brain|Some pack tests/.test(html()), 'a blocked run is reported as not switched on, never as success');
  train = { running: false, status: 'activated', step: 3200, iterations: 3200, packs: ['jira-mastery'], blocked: null }; for (const f of timers.splice(0)) await f(); for (let i = 0; i < 8; i++) await tick();
  assert(/Done: the new brain is switched on/.test(html()), 'a passed run says so');
  console.log('PASS skill pack loader: bot "fixing its brain" with live progress, locked buttons, testing stage, honest blocked and done states');
})().catch((e) => { console.error(e); process.exit(1); });
