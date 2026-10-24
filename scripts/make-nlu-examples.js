// Builds the "understanding" training examples: the bot's REAL prompt (nlu.js) plus the right JSON answer.
// Training on the real prompt is what keeps the bot understanding commands after its model is fine-tuned.
// Held-out rule: none of these utterances is in training-config/nlu-gate-cases.json (the gate). Run: node scripts/make-nlu-examples.js
const fs = require('fs'), path = require('path'), { _prompt } = require('../nlu');
const root = path.join(__dirname, '..'), gate = JSON.parse(fs.readFileSync(path.join(root, 'training-config/nlu-gate-cases.json'), 'utf8'));
const blocked = new Set(gate.cases.map((c) => c.text.toLowerCase().replace(/[^a-z ]/g, '').trim()));
const VOCAB = { apps: ['Safari', 'Notes', 'Calendar', 'Terminal', 'Slack', 'Spotify', 'Finder', 'Visual Studio Code', 'Cursor', 'Messages', 'Microsoft Teams'], projects: ['gateway-chat', 'mb-mobile', 'map-governance-ui', 'shop-api', 'my-space'], contacts: ['marco', 'paolo', 'ana', 'carla'], profiles: ['Work', 'Personal'] };
const C = (cmd) => ({ kind: 'command', command: cmd }), Q = { kind: 'question', command: '' }, T = { kind: 'task', command: '' }, N = { kind: 'not_for_me', command: '' };
const ROWS = [
  // commands: apps, projects, sites, search, chat, mail, meetings, time, volume, screenshot (English, Tagalog, Taglish, misheard)
  ['open notes', C('open notes')], ['please open the calendar', C('open calendar')], ['buksan mo ang terminal', C('open terminal')], ['launch slack', C('open slack')], ['open spotify for me', C('open spotify')],
  ['pakibukas ng finder', C('open finder')], ['open cursor', C('open cursor')], ['open messages', C('open messages')], ['open microsoft teams', C('open microsoft teams')], ['can you open visual studio code', C('open visual studio code')],
  ['open my shop api in vs code', C('open shop-api in vs code')], ['open gateway chat in cursor', C('open gateway-chat in cursor')], ['buksan mo ang map governance ui sa vs code', C('open map-governance-ui in vs code')], ['open my space project in cursor', C('open my-space in cursor')],
  ['open youtube', C('open youtube')], ['go to github', C('open github')], ['open gmail', C('open gmail')], ['open chrome please', C('open chrome')], ['pakibukas ng chrome', C('open chrome')],
  ['search for swift concurrency', C('search for swift concurrency')], ['google best pizza in manila', C('search for best pizza in manila')], ['hanapin mo kung paano mag-rebase', C('search for kung paano mag-rebase')],
  ['chat paolo in teams', C('chat paolo in teams')], ['message ana on teams saying i will be late', C('chat ana in teams saying i will be late')], ['i-chat mo si carla sa teams', C('chat carla in teams')],
  ['send an email to boss@company.com saying i am sick today', C('send an email to boss@company.com saying i am sick today')],
  ['start meeting notes', C('start meeting notes')], ['simulan mo na ang meeting notes', C('start meeting notes')], ['record this meeting', C('start meeting notes')], ['the meeting is over', C('stop meeting notes')], ['stop the meeting notes', C('stop meeting notes')], ['give me the meeting summary', C('summarize the meeting')], ['buodin mo ang meeting', C('summarize the meeting')],
  ['what time is it', C('what time is it')], ['anong oras na', C('what time is it')], ['what is the date today', C('what is the date today')], ['anong petsa ngayon', C('what is the date today')],
  ['set volume to 40', C('set volume to 40')], ['volume 70 please', C('set volume to 70')], ['make it louder', C('volume up')], ['lower the volume', C('volume down')], ['hinaan mo yung tunog', C('volume down')], ['mute please', C('mute')], ['unmute the sound', C('unmute')], ['take a screenshot', C('take a screenshot')], ['kuhanan mo ang screen', C('take a screenshot')],
  // questions and small talk (never an action)
  ['how can i make you better', Q], ['what should you improve to help me more', Q], ['do you think my plan is good', Q], ['what is a closure in javascript', Q], ['can you explain recursion', Q], ['why is the sky blue', Q], ['ano ang pinakamagandang paraan para mag-aral', Q], ['tell me a joke', Q], ['how are you today', Q], ['what is the difference between rebase and merge', Q], ['explain what a database index is', Q], ['bakit mahalaga ang unit tests', Q], ['is it better to learn python or go', Q], ['what does the volume knob on a guitar amp do', Q], ['why is my mac slow', Q], ['what is the best way to stay focused', Q], ['what is a mutex', Q], ['do not open anything, just tell me what a browser is', Q], ["don't set the volume, I only want to know what decibels are", Q], ['what do you mean', Q], ['why', Q],
  ["no don't open the calendar, i just want to know what it is", Q], ["please don't mute, just tell me how to mute a mac", Q], ['huwag mong buksan ang terminal, ipaliwanag mo lang kung ano yun', Q], ["don't start the meeting notes, i only want to know how they work", Q],
  ['do not open slack just explain what slack is', Q], ['wag mo muna i-open, ano ba yung finder', Q], ["don't take a screenshot, how do screenshots work on mac", Q], ["don't search for it, just tell me what you know about swift", Q],
  ["i don't want you to open notes, what is it used for", Q], ['hindi ko sinabing mag-open ka, ipaliwanag mo lang ang terminal', Q], ["don't open spotify, just tell me what it is", Q], ["don't open cursor, just explain what it does", Q],
  // bigger work (tasks)
  ['refactor the auth module and add tests', T], ['implement the login endpoint in the api', T], ['write a script that renames all my photos by date', T], ['review the open merge requests and summarize them', T], ['open safari and search for flights then email me the best price', T], ['buksan mo ang slack tapos i-check mo yung mga unread', T], ['create a jira ticket for the checkout bug and assign it to paolo', T], ['migrate the database to postgres', T],
  // other people talking, not to the assistant
  ['okay so the ticket is per endpoint', N], ['yeah i will send it later', N], ['we should move the deadline to friday', N], ['hi everyone thanks for joining', N], ['can you hear me', N], ['let me share my screen', N], ['next slide please', N], ['sige mamaya na lang natin pag-usapan', N],
];
const out = []; const seen = new Set();
for (const [text, ans] of ROWS) {
  const key = text.toLowerCase().replace(/[^a-z ]/g, '').trim(); if (blocked.has(key)) throw new Error('gate utterance used for training: ' + text); if (seen.has(key)) throw new Error('duplicate: ' + text); seen.add(key);
  const messages = [..._prompt(text, VOCAB, false, []), { role: 'assistant', content: JSON.stringify(ans) }]; out.push({ messages });
}
fs.writeFileSync(path.join(root, 'training-config/nlu-examples.json'), JSON.stringify({ origin: "The bot's real understanding prompt with checked answers (never the gate utterances)", count: out.length, examples: out }));
console.log('wrote', out.length, 'understanding examples');
