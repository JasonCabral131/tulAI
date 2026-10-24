const assert=require('assert'),voice=require('../voice');
for(const text of ['Bob open Chrome','music open YouTube','John open Safari','Then close the window','Please open Safari'])assert.equal(voice.garbledWake(text),null,text);
assert(voice.garbledWake('HLA open Chrome browser'));
assert.equal(voice.llmWakeGuard('Hey Bob open Chrome','open Chrome'),null);
assert(voice.llmWakeGuard('Hey Tulai open Chrome','open Chrome'));
let events=[];voice.setAliases([]);voice._learn(['open youtube','open youtube','frosty lay','frosty lay'],e=>events.push(e));assert.equal(events.length,0);
voice.setAliases(['open youtube','frosty lay','hey tulai']);assert.equal(voice.afterWake('open youtube'),null);assert.equal(voice.afterWake('frosty lay open Chrome'),null);assert.equal(voice.afterWake('hey tulai open Chrome'),'open Chrome');
console.log('PASS: unrelated names, model guesses, repeated background phrases and unsafe saved aliases cannot become wake commands');
