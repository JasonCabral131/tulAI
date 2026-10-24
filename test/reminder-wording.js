const assert=require('assert'),r=require('../reminders');
const broken='mo always ha pag amag dws at mag godmorning sa microsoft teams "metrobank x ascendion"';
assert.equal(r.subjectFrom(broken),'Complete DWS and send a good-morning greeting in Microsoft Teams: “metrobank x ascendion”.');
assert.equal(r.subjectFrom('remind me to send the report to the team'),'send the report to the team');
assert.equal(r.subjectFrom('remind me about meeting with Anna every weekday'),'meeting with Anna');
assert(!r.spoken({text:broken}).includes('mo always'));
assert(r.subjectFrom('review the proposal for the client').includes('for the client'));
console.log('PASS reminder titles retain grammar and normalize DWS/Teams routine');
