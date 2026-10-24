const assert=require('assert'),{answer}=require('../bot-identity');
(async()=>{
 const questions=['who train you','who trained you?','who is your trainer','who was your creator','who made you','who are you','what is your name','sino ka?','sino ang nag-train sa iyo','sino nagturo sa iyo'];
 for(const text of questions){const result=await answer(text,{history:[{role:'assistant',content:'I was trained by Alibaba Cloud.'}]});assert.equal(result.via,'Tulai partner identity',text);assert(!/Alibaba|Claude|trained by you/.test(result.reply));}
 for(const text of ['analyze your sales model','explain your regression model','compare your forecast model','who trained your sales model'])assert.equal(await answer(text),null,text);
 console.log('PASS 14 identity signals: English, Tagalog, incorrect history and business-model exclusions');
})().catch(e=>{console.error(e);process.exitCode=1});
