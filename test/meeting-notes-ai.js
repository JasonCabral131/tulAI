// Meeting notes are written by our own AI from the transcript (sections parsed, nothing invented), and Outlook's "Work location" label never becomes a reminder.
const assert = require('assert'), M = require('../meeting'), wc = require('../webcal');
(async () => {
  const fake = { chat: async () => ({ content: 'Key points:\n- Roles for the platform were listed\n- Admins register users\nAction items:\n- Ana: send the role list (Friday)\nDecisions:\n- None\nOpen questions:\n- How long is the invite link valid?' }) };
  const r = await M.aiSummary([{ who: 'Others', text: 'we have a maker checker publisher' }, { who: 'You', text: 'Ana will send the role list by Friday' }], fake);
  assert.deepStrictEqual(r, { key: ['Roles for the platform were listed', 'Admins register users'], actions: ['Ana: send the role list (Friday)'], decisions: [], questions: ['How long is the invite link valid?'] });
  assert.strictEqual(await M.aiSummary([{ text: 'hello there everyone' }], { chat: async () => ({ content: 'I cannot help.' }) }), null, 'no notes when the AI gives no sections: the keyword summary stays');
  assert.strictEqual(M.parseNotes('Key points:\n- None'), null);
  const ev = wc.parseEvents(['8:00 AM to 5:00 PM, Work location Office, October 12, 2026', '9:00 AM to 9:30 AM, Sprint review, October 12, 2026, Organizer Ana'], new Date(2026, 9, 12, 7, 0));
  assert.deepStrictEqual(ev.map((e) => e.title), ['Sprint review'], 'Work location is not a meeting');
  console.log('PASS meeting notes by our AI, and work-location labels are not meetings');
})().catch((e) => { console.error(e); process.exit(1); });
// the format example the AI was given is never kept as an action item; a task with no named owner is "Someone"
{ const M2 = require('../meeting'), n = M2.parseNotes('Key points\n- Sprint 1 refinement tomorrow\nAction items\n- Owner: task (due)\n- Dan: task (due)\n- Owner: task (due) (only real commitments; "Someone" if the owner is unclear)\n- Emon: pull down skills by Friday\n- Owner: generate it in the shell portal (today)');
  require('assert').deepStrictEqual(n.actions, ['Emon: pull down skills by Friday', 'Someone: generate it in the shell portal (today)']); console.log('PASS meeting notes: no template leftovers in action items'); }
{ const M3 = require('../meeting'), n = M3.parseNotes('Key points\n- Forward the invites\nDecisions\n- (what the group agreed, or "- None")\nOpen questions\n- (questions still open, or "- None")');
  require('assert').deepStrictEqual([n.decisions, n.questions], [[], []], 'the format hints for decisions and open questions are never kept'); console.log('PASS meeting notes: no template text in decisions or open questions'); }
