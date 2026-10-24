// Multi-turn conversation rehearsal: the bot's real answer prompt (nlu.js) with the UNMODIFIED base model's own replies as targets.
// Fine-tuning on narrow tasks makes models repeat themselves and lose the thread; replaying real conversations keeps chat natural.
// Needs the base model running on port 39656 (the live bot is enough). Held-out rule: no dialogue line equals one in nlu-gate-cases.json.
const fs = require('fs'), path = require('path'), { _answerMessages } = require('../nlu');
const root = path.join(__dirname, '..'), port = process.env.TULAY_LLM_PORT || 39656;
const gate = JSON.parse(fs.readFileSync(path.join(root, 'training-config/nlu-gate-cases.json'), 'utf8')).cases.map((c) => c.text.toLowerCase());
const D = [
  ['i have a lot of work today', 'where should i start', 'ok thanks'], ['i feel stressed about the deadline', 'what can i do about it', 'that helps'], ['good morning', 'how should i plan my day', 'sounds good'],
  ['tell me a fun fact', 'another one please', 'cool'], ['what is a variable', 'and a constant', 'what is the difference'], ['what is an api', 'give me an example', 'thanks'],
  ['what is the difference between sql and nosql', 'which one should i use for a small app', 'ok'], ['explain what a pull request is', 'who reviews it', 'got it'],
  ['i made a mistake in my code', 'how do i find the bug', 'thank you'], ['can you recommend a good habit for developers', 'how do i start it', 'nice'],
  ['kumusta ka na', 'pagod ako ngayon', 'salamat'], ['ano ang gagawin ko kapag nai-stress ako', 'sige subukan ko', 'salamat po'], ['magandang umaga', 'ano ang maganda gawin ngayon', 'ok na'],
  ['i did not understand your answer', 'can you say it more simply', 'ok that makes sense'], ['that was wrong', 'please try again', 'better thanks'], ['you are so helpful', 'how do you work', 'interesting'],
  ['what is git', 'and what is github', 'are they the same'], ['how do i learn python', 'what should i build first', 'thanks a lot'], ['i am bored', 'suggest something to do', 'maybe later'],
  ['what is recursion', 'give me a simple example', 'why would i use it'], ['what is a unit test', 'why are they important', 'ok'], ['i am happy today', 'my code finally works', 'thanks'],
  ['i am confused', 'about what to learn next', 'ok i will try that'], ['hello there', 'what can you do for me', 'nice one'], ['i need motivation', 'i keep procrastinating', 'thank you'],
  ['what is the cloud', 'is it safe', 'ok'], ['what is a bug', 'how do developers prevent them', 'makes sense'], ['salamat sa tulong', 'may tanong pa ako', 'ano ang api'], ['sorry i did not mean that', 'let us start again', 'thanks'],
  ['how do i write a good email to my manager', 'make it shorter', 'perfect'], ['what makes a good code review', 'and how long should it take', 'ok'], ['i am tired', 'i need a break', 'thanks for listening'],
  ['what is docker', 'why do people use it', 'sounds useful'], ['tell me about yourself', 'what are you good at', 'what are you not good at'], ['what do you think about remote work', 'and meetings', 'ok'],
];
(async () => {
  const rows = []; let dropped = 0;
  for (const turns of D) {
    const history = [];
    for (const user of turns) {
      if (gate.includes(user.toLowerCase())) throw new Error('gate line in rehearsal: ' + user);
      const messages = _answerMessages(user, { history }); const r = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages, temperature: 0, max_tokens: 170 }) }); const j = await r.json();
      const reply = String((j.choices[0].message.content) || '').trim(), prev = history.length ? history[history.length - 1].content : '';
      const bad = !reply || /[一-鿿]|Qwen|Alibaba|\*\*|volume|calendar/i.test(reply) || reply === prev || reply.length > 420;
      if (bad) { dropped++; history.push({ role: 'user', content: user }, { role: 'assistant', content: reply || '...' }); continue; }
      rows.push({ messages: [...messages, { role: 'assistant', content: reply }] }); history.push({ role: 'user', content: user }, { role: 'assistant', content: reply });
    }
  }
  fs.writeFileSync(path.join(root, 'training-config/chat-rehearsal.json'), JSON.stringify({ origin: "Multi-turn dialogues in the bot's real answer prompt; targets are the unmodified base model's own replies (self-replay).", count: rows.length, examples: rows }));
  console.log('wrote', rows.length, 'conversation rows; dropped', dropped);
})().catch((e) => { console.error(e.message); process.exit(1); });
