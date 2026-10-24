const assert=require('assert');const {collect}=require('../task-dataset');
const u=content=>({role:'user',content}),a=content=>({role:'assistant',content});
const chats=[{id:'one',messages:[u('Fix the retry bug'),a('BAD'),u('Wrong. Correct answer: Back off before retrying.')]},{id:'two',messages:[u('Explain my report'),a('BAD2'),u('wrong totals'),a('Sum only completed tickets.'),u('works now')]},{id:'three',messages:[u('What does this mean?'),a('A useful explanation'),u('correct')]}];
let d=collect(chats);assert(d.ready);assert.equal(d.eligible,3);assert.equal(d.examples[0].messages[1].content,'Back off before retrying.');assert.equal(d.examples[0].rejectedAnswer,'BAD');assert.equal(d.examples[1].messages[1].content,'Sum only completed tickets.');
const targets=d.examples.filter(e=>e.state==='eligible');assert(targets.every(e=>!['BAD','BAD2'].includes(e.messages[1].content)));assert.equal(new Set(targets.map(e=>e.split)).size,3);
d=collect([{id:'x',messages:[u('Fix bug'),a('wrong implementation'),u('not working')]}]);assert.equal(d.eligible,0);assert.equal(d.examples[0].learningType,'unresolved failure');
d=collect([{id:'s',messages:[u('Fix password: supersecret123'),a('ok'),u('correct')]}]);assert.equal(d.eligible,0);assert.deepEqual(d.examples[0].messages,[]);
d=collect([...chats,{id:'four',messages:[u('Another task'),a('New answer'),u('correct')]}]);assert.equal(d.eligible,4);
d=collect([...chats,{id:'conflict',messages:[u('Fix the retry bug'),a('Different answer'),u('correct')]}]);assert.equal(d.examples.filter(e=>e.id===d.examples[0].id&&e.state==='eligible').length,0);
console.log('PASS correction targets, rejected-answer exclusion, general interactions, split isolation, secrets, growth, conflicts');

assert.equal(collect([{id:'desktop-1',messages:[u('Explain this'),{role:'assistant',parts:[{t:'text',text:'Company reply'}]},u('correct')]}]).examples[0].source.channel,'Tulai Desktop / company AI');
console.log('PASS company Desktop text-parts responses included with source');
for(const feedback of ['thanks','thanks but this is wrong','correct, but the counts are wrong'])assert.equal(collect([{id:'x',messages:[u('Report status'),a('Invented totals'),u(feedback)]}]).eligible,0);
assert(collect(chats).examples[1].messages[0].content.includes('wrong totals'));
console.log('PASS polite thanks is not correctness evidence; retry retains user correction');
