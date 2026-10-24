const assert=require('assert'),{route}=require('../bot-work');
for(const text of ['mag DWS kana please','mag dws ka na','complete Daily Work Setup']){const r=route(text);assert(r&&!r.delegate);assert(r.reply.includes('not completed'));assert(r.via==='bot capability boundary');}
for(const text of ['inspect the form in Chrome','create an Excel report','gawin mo yan','do not submit the form','what is 2 plus 2'])assert(!route(text)?.delegate,text);
assert(route('you have skills like selenium').reply.includes('background Selenium'));
console.log('PASS no implicit Desktop handoff, DWS capability honesty, local browser capabilities');
