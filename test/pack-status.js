// "latest training of jira?" is answered from the real state of the Jira pack, never from a guess; commands and other questions are left alone.
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tulai-ps-')); process.env.GC_DATA_DIR = tmp;
const bt = require('../bot-training'), sp = require('../skill-packs');
let r = bt.packStatus('latest training of jira?'); assert(r && /Jira Mastery/.test(r.reply) && /not trained on this Mac yet/.test(r.reply) && /No finished run/.test(r.reply), r && r.reply);
const run = path.join(tmp, 'training', 'runs', 'pilot-20261010T000000Z-aaaaaa', 'deployment'); fs.mkdirSync(run, { recursive: true });
fs.writeFileSync(path.join(run, 'gguf-gate.json'), JSON.stringify({ passed: false, groups: { 'pack:jira-mastery': { passed: 5, total: 10 } }, cases: [{ group: 'pack', pack: 'jira-mastery', name: 'Jira Mastery: Write a JQL query for: bugs', passed: false }, { group: 'pack', pack: 'jira-mastery', name: 'Jira Mastery: Round 10', passed: true }] }));
fs.writeFileSync(path.join(tmp, 'training', 'runs', 'pilot-20261010T000000Z-aaaaaa', 'manifest.json'), JSON.stringify({ status: 'evaluated-passed', iterations: 800 }));
r = bt.packStatus('how is the jira fine tune going'); assert(/passed 5 of 10 Jira Mastery tests \(50%\), below the 80% minimum for a pack/.test(r.reply) && /NOT switched on/.test(r.reply) && /Missed: Write a JQL query/.test(r.reply), r.reply);
sp.select('jira-mastery', true); sp.markTrained(['jira-mastery'], 'x'); r = bt.packStatus('jira mastery training status'); assert(/trained, version/.test(r.reply) && /included in every training/.test(r.reply), r.reply);
for (const s of ['train your skills', 'fine tune jira mastery', 'what is the capital of Italy', 'what is jira', 'training status']) assert.strictEqual(bt.packStatus(s), null, s + ' is not a pack status question');
fs.rmSync(tmp, { recursive: true, force: true }); console.log('PASS pack status: real state of the pack, last test result against the pack minimum, commands and other questions untouched');
// "what are the other fine tuning, can you check the status" lists every pack instead of asking which model; graph/memory questions are not taken
{ const fs2 = require('fs'), os2 = require('os'), path2 = require('path'); const tmp2 = fs2.mkdtempSync(path2.join(os2.tmpdir(), 'tulai-ps2-')); process.env.GC_DATA_DIR = tmp2; delete require.cache[require.resolve('../skill-packs')]; delete require.cache[require.resolve('../bot-training')]; const bt2 = require('../bot-training');
  const r = bt2.packStatus('what are the other fine tuning can you check the status'); assert(r && /No fine-tuning is running right now/.test(r.reply) && /\*\*Jira Mastery\*\*/.test(r.reply) && /\*\*Charts & Executive Reporting AI\*\*/.test(r.reply) && (r.reply.match(/\n- /g) || []).length >= 10, r && r.reply);
  for (const s of ['show me a graph regarding your memory training', 'show my training dataset image', 'training status', 'export the fine tuning list as excel']) assert.strictEqual(bt2.packStatus(s), null, s);
  fs2.rmSync(tmp2, { recursive: true, force: true }); console.log('PASS pack status lists every fine-tuning when asked for "the other fine tuning status"'); }
