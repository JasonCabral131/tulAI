const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'desktop-memory-'));process.env.GC_DATA_DIR=dir;
const store=require('../store'),memory=require('../chat-memory');
try{
 store.saveChat({id:'desktop-fixture',messages:[{role:'user',content:'Explain the work setup'},{role:'assistant',content:'',parts:[{t:'text',text:'Use the verified setup guide.'},{t:'think',text:'PRIVATE REASONING'},{t:'tool',output:'RAW TOOL OUTPUT'}]}]});
 let chunks=memory.chunks();assert(chunks.some(x=>x.includes('Use the verified setup guide.')));assert(chunks.some(x=>x.includes('Unverified assistant output')));assert(!chunks.join('').includes('PRIVATE REASONING'));assert(!chunks.join('').includes('RAW TOOL OUTPUT'));
 const c=store.listChats()[0];c.messages[1].content='Completed answer';store.saveChat(c);chunks=memory.chunks();assert(chunks.some(x=>x.includes('Completed answer')));assert(!chunks.join('').includes('Use the verified setup guide.'));
 store.deleteChat(c.id);assert.equal(memory.chunks().length,0);
 console.log('PASS Desktop text parts, completed answer precedence, provenance, exclusion of reasoning/tool internals and deletion');
}finally{fs.rmSync(dir,{recursive:true,force:true})}
