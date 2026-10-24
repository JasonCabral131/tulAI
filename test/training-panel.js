const fs=require('fs'),os=require('os'),path=require('path'),assert=require('assert');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'training-panel-'));process.env.GC_DATA_DIR=dir;
try{
 const root=path.join(dir,'training/runs/pilot-20261009-test');fs.mkdirSync(path.join(root,'data'),{recursive:true});
 fs.writeFileSync(path.join(root,'manifest.json'),JSON.stringify({status:'evaluated-awaiting-review',counts:{train:20,valid:3,test:4},iterations:50}));
 for(const split of ['train','valid','test'])fs.writeFileSync(path.join(root,'data',split+'.jsonl'),'12345');
 fs.writeFileSync(path.join(root,'training.log'),'    5    \x1b[1m5.269 ▼\x1b[0m    332\n   10    val 3.617   0.16s\n');
 const s=require('../bot-training').metrics();assert.equal(s.bytes,15);assert.equal(s.points.length,2);assert.equal(s.points[0].loss,5.269);assert.equal(s.points[1].kind,'validation');assert.equal(s.step,10);assert.equal(s.active,false);assert(!s.running);
 const html=fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8');assert(html.includes('id="trainNow"'));assert(html.includes('id="trainLoader"'));assert(html.includes('id="trainGraph"'));
 console.log('PASS dataset counts/bytes, real ANSI loss parsing, candidate status and desktop controls');
}finally{fs.rmSync(dir,{recursive:true,force:true})}
