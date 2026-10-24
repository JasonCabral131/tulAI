// Idempotent installation step; application launch also initializes/migrates lazily.
const path=require('path'),os=require('os');
process.env.GC_DATA_DIR=process.env.GC_DATA_DIR||path.join(os.homedir(),'Library/Application Support/gateway-chat');
const memory=require('../bot-memory'),vectors=require('../vector-memory'),embedding=require('../memory-embeddings');
(async()=>{try{vectors.sync(memory.read());if(!embedding.available())throw Error('Embedding model/runtime missing: run npm run setup.');const v=await embedding.embed('Tulai installation memory check',true);if(v.length!==768)throw Error('Unexpected embedding dimensions');console.log('  ✓ SQLite vector memory ready; local embeddings verified (768 dimensions).');}catch(e){console.error('  ✗ Memory setup: '+e.message);process.exitCode=1}finally{embedding.stop()}})();
