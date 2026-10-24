const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path');
const mod=require('../web-preview');
(async()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'web-preview-'));try{
 assert.equal(mod.target('show me latest technology in react native render the webpage here'),'https://reactnative.dev/blog');
 assert.equal(mod.target('what is your current model'),null);
 const shot=path.join(dir,'capture.png');fs.writeFileSync(shot,Buffer.from([137,80,78,71]));
 const deps={dir,read:async()=>({screenshot:shot,title:'Example',url:'https://example.com',text:'React Native 0.99 — test fixture\n<script>evil()</script>'}),register:p=>({id:path.basename(p),kind:'image'})};
 const r=await mod.handle('render webpage https://example.com here',{},deps);assert.equal(r.views.length,1);assert(r.reply.includes('0.99'));assert(r.reply.includes('screenshot'));
 assert(r.reply.includes('[Open original website](https://example.com/)'));assert(!fs.readdirSync(dir).some(f=>f.endsWith('.html')));assert.equal(r.views[0].kind,'image');
 const failed=await mod.handle('latest React Native',{}, {...deps,read:async()=>{throw Error('offline')}});assert(!failed.views);assert(failed.reply.includes('not verified'));
 const login=await mod.handle('latest React Native',{}, {...deps,read:async()=>({needsLogin:true})});assert(!login.views);
 assert.equal(await mod.handle('browse https://example.com using account client'),null);
 console.log('PASS live web routing, original source link and no generated HTML, failure and login handling');
}finally{fs.rmSync(dir,{recursive:true,force:true})}})();
