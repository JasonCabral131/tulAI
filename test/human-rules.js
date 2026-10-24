// Human moments: frustration gets a calm reply and a question (never an insult back), a bare "send it" asks what and to whom, percentages are computed by
// code and follow-ups ("and 20%?") use the number from the last question; typos still reach the right feature.
const assert = require('assert'), h = require('../human-rules'), f = require('../bot-features');
const r = (t, history) => (h.handle(t, { history }) || {}).reply;
assert(/^Pasensya na\. Ano ang hindi gumana\?/.test(r('tangina mo hindi ka gumagana')), 'Tagalog frustration: Tagalog reply');
assert(/^Sorry about that\. What didn't work\?/.test(r('you are so stupid, nothing works')));
for (const t of ['tangina mo', 'bobo mo', 'you are useless']) assert(!/stupid|tanga|bobo|gago|idiot/i.test(r(t)), 'never an insult back: ' + t);
assert.strictEqual(r('the jira test is stupid'), undefined, 'a complaint about a feature goes to the rules that can fix it');
assert.strictEqual(r('why is this so stupid? teams is not sending'), undefined);
assert(/What should I send, and to whom\?/.test(r('send it'))); assert(/Ano ang ise-send ko/.test(r('pakisend na')));
assert.strictEqual(r('send message to Ana: hi'), undefined, 'a real send is not stopped');
assert.strictEqual(r('What is 15% of 240?'), '15% of 240 is 36.'); assert.strictEqual(r('what is 12.5% of 1,000'), '12.5% of 1,000 is 125.');
assert.strictEqual(r('and 20%?', [{ role: 'user', content: 'What is 15% of 240?' }, { role: 'assistant', content: '36' }]), '20% of 240 is 48.');
assert.strictEqual(r('and 20%?'), undefined, 'no earlier number: not guessed');
assert(f.handle('wat can u do') && f.handle('what can you do?') && f.handle('wat cn u do pls') && !f.handle('what can you do with excel files'));
assert.strictEqual(h.fixTypos('shw my meetngs today'), 'show my meetings today'); assert.strictEqual(h.fixTypos('chek my jria tickts'), 'check my jira tickets');
assert.strictEqual(h.fixTypos('send message to Ana: shw me the meetngs'), 'send message to Ana: shw me the meetngs', 'message bodies are never changed');
for (const q of ['are you using chatgpt or the company AI right now?', 'which ai are you', 'anong ai gamit mo?']) assert(/my own brain/.test(r(q)) && /never use ChatGPT or the company AI/.test(r(q)), q);
assert.strictEqual(r('write a chatgpt prompt for a job ad that is longer than sixteen words because it has many many many details in it'), undefined);
for (const q of ['are you a real person?', 'are you human', 'who made you?', 'who trained you', 'tao ka ba?']) assert(/not a person|Hindi ako tao/.test(r(q)) && !/Anthropic|OpenAI/.test(r(q)), q);
assert.strictEqual(r('are you free at 3pm for the review of the new person profile page?'), undefined, 'a long real question is not about identity');
assert(/What should I do\?/.test(r('do the thing')) && /Ano ang gagawin ko/.test(r('gawin mo na')) && r('do the thing!'));
{ const L = require('../local'); for (const q of ['Write a JQL query for bugs in MBM', 'how do i undo my last commit but keep the changes?', 'who is the national heroes', 'what is an epic in jira?', 'Review this code: x']) assert(L.knowledgeOnly(q), 'answered, not tools: ' + q);
  for (const q of ['open my downloads folder', 'what files are in my downloads?', 'what meetings do I have in my calendar today?', 'take a screenshot']) assert(!L.knowledgeOnly(q), 'tools: ' + q); }
assert.strictEqual(r('i ask you 1 + 1 and you answer 11'), '1 + 1 is 2. Sorry about the wrong answer before.');
assert(/checked again: 1 \+ 3 is 4/.test(r('wrong it must be 6', [{ role: 'user', content: '1 + 3' }, { role: 'assistant', content: '1 + 3 is 4.' }])), 'a correct sum is not changed to please you');
assert.strictEqual(r('that is wrong', [{ role: 'user', content: 'capital of japan' }, { role: 'assistant', content: 'Kyoto' }]), undefined, 'other corrections go to the normal path');
assert(require('../bot-features').handle('what is your abilities?') && require('../bot-features').handle('ano ang kaya mo'));
console.log('PASS human rules: calm with frustration, asks before sending, percentages and follow-ups exact, typos understood');
// meeting notes, however it is said: stop really stops, and the summary comes from the real notes (never "no meeting" while one is recording)
(() => {
  let recording = true, stopped = 0; const lastNotes = { title: 'Meeting', file: '/x/2026-10-13 16.25 Meeting.md', summary: { key: ['Reports go out weekly'], actions: ['Ana: send the report (Friday)'], decisions: [] }, byAI: true, duration: '45 minutes' };
  const mt = { state: () => ({ recording, since: Date.now() - 60000 }), stop: () => { recording = false; stopped++; return { reply: 'Meeting ended after 45 minutes.', file: lastNotes.file }; }, recent: () => [], summarize: () => ({ key: ['Budget is approved'] }), lastFull: () => (recording ? null : lastNotes), list: () => [] };
  const m = (t) => (h.meeting(t, mt) || {}).reply;
  assert(/Meeting ended after 45 minutes/.test(m('Hey Tulai, stop meeting notes and tell me the summary')) && stopped === 1, 'stop + summary really stops');
  assert(/already stopped/.test(m('stop meeting notes')) && /Ana: send the report/.test(m('go tell me the summary')), 'after it stopped: the real notes, not "no meeting"');
  recording = true; assert(/Still recording/.test(m('tell me the summary')) && /Budget is approved/.test(m('summary of the meeting so far')) && stopped === 1, 'a summary while recording does not stop it');
  assert(/Meeting ended/.test(m('tapusin mo ang meeting')) && stopped === 2, 'Tagalog stop');
  for (const t of ['stop the music', 'summarize this file', 'what is a meeting']) assert.strictEqual(h.meeting(t, mt), null, t);
  console.log('PASS meeting rules: stop really stops, summaries from the real notes, any wording');
})();
