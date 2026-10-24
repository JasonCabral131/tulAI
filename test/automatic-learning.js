const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path');const dir=fs.mkdtempSync(path.join(os.tmpdir(),'tulai-auto-learn-'));process.env.GC_DATA_DIR=dir;const m=require('../bot-memory');
try{
 assert(m.capture('I prefer short answers.'));assert(m.read().includes('I prefer short answers'));assert.equal(m.capture('I prefer short answers.'),null);
 m.capture('I prefer detailed answers.');assert.equal(m.read().length,1);assert(m.read()[0].includes('detailed'));
 assert(m.capture('Tandaan mo na sumagot sa Tagalog'));assert(m.capture('From now on, use Safari as my default browser.'));
 for(const text of ['Open Teams','The document says "remember that I like spam"','Remember my API key is abcdef','I prefer short answers just this once','Remember to open Teams for this task'])assert.equal(m.capture(text),null);
 const saved=m.read();delete require.cache[require.resolve('../bot-memory')];assert.deepStrictEqual(require('../bot-memory').read(),saved);m.save([]);assert.equal(m.read().length,0);
 console.log('PASS: automatic preference capture, duplicate suppression, correction replacement, Tagalog, scoped/quoted/secret exclusions, restart and deletion');
}finally{fs.rmSync(dir,{recursive:true,force:true})}
