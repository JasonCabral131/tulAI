// Labeled transcript regression evaluation. Does not measure microphone/ASR accuracy or train weights.
const assert=require('assert'),fs=require('fs'),path=require('path'),voice=require('../voice');
const cases=require('./fixtures/voice-signals.json');voice.setAliases([]);
const results=cases.map(c=>{const actual=voice.afterWake(c.text);return {...c,actual,passed:actual===c.command}});
const report={at:new Date().toISOString(),scope:'Wake intent on labeled transcripts; not acoustic accuracy or model training',total:results.length,passed:results.filter(r=>r.passed).length,results};
if(process.argv[2]){const target=path.resolve(process.argv[2]);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,JSON.stringify(report,null,2));}
for(const result of results)assert(result.passed,JSON.stringify(result));
console.log(`PASS ${report.passed}/${report.total} labeled voice signal cases`);
