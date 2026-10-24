const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path'),analyst=require('../bot-analyst');
(async()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'tulai-analyst-test-'));try{
const file=path.join(dir,'sample.csv');fs.writeFileSync(file,'id,amount,note\n001,10,"hello, world"\n002,,"two\nlines"\n001,10,"hello, world"\n003,-5,<script>\n');
const r=await analyst.handle('analyze "'+file+'"',{outputDir:dir});assert.equal(r.analysis.rows,4);assert.equal(r.analysis.duplicates,1);assert.equal(r.analysis.columns[0].type,'text');assert.equal(r.analysis.columns[1].missing,1);assert.equal(r.analysis.columns[1].mean,5);assert(fs.existsSync(r.files[0].path));assert(fs.readFileSync(r.files[0].path,'utf8').includes('<table>'));
fs.writeFileSync(file,'a,b\n1,2,3\n');assert((await analyst.handle('analyze "'+file+'"',{outputDir:dir})).reply.includes('different number of columns'));
fs.writeFileSync(file,'a,a\n1,2\n');assert((await analyst.handle('analyze "'+file+'"',{outputDir:dir})).reply.includes('unique column names'));
assert.equal(await analyst.handle('open Teams'),null);
assert.equal(require('../bot-work').route('analyze my sales spreadsheet'),null,'analysis stays in the bot; Desktop handoff needs an explicit request');
let system='';await require('../bot-team').discuss({role:'analyst',text:'Review metric definitions'},{chat:async a=>{system=a.messages[0].content;return {content:'Draft review'}} ,send(){}});assert(system.includes('denominators'));
console.log('PASS CSV numeric accuracy, missing/duplicate checks, quoted multiline cells, identifiers, saved HTML, malformed data, routing and Analyst role');
}finally{fs.rmSync(dir,{recursive:true,force:true})}})().catch(e=>{console.error(e);process.exitCode=1});
