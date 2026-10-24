async function answer(text,opts={}){
 const t=String(text).trim();
 const partnerQuestion=/^(?:who (?:train(?:ed)?|teach(?:es)?|taught|created|made) (?:you|tulai)|who (?:is|was) your (?:trainer|creator)|who are you|what(?:'s| is) your name|sino (?:ka|(?:ang )?(?:nagtrain|nag-train|nagturo|gumawa)(?: sa)? (?:iyo|yo|sayo|sa iyo)))[.!?]*$/i.test(t);
 if(partnerQuestion)return {reply:/^sino/i.test(t)?'Ako si Tulai, ang partner mo. Ginagabayan mo ako sa pamamagitan ng mga instruction, preference, at correction mo.':"I'm Tulai, your partner. You guide how I help you through your preferences, instructions, and corrections.",via:'Tulai partner identity'};
 if(/\b(?:sales|revenue|forecast|regression|statistical|business|data)\s+model\b/i.test(t))return null;

 const identity=/\b(?:your|you|local|embedded|tulai|tulay|iyong|mo|mong)\b.*\b(?:model|llm|brain)\b|\b(?:model|llm)\b.*\b(?:using|gamit|mo|you)\b/i.test(t);
 const recent=(opts.history||[]).slice(-4).some(m=>/\b(local model|embedded model|Qwen|Claude 4\.5|local llm)\b/i.test(m.content||''));
 const cost=recent&&/\b(free|paid|subscription|cost|bayad|libre)\b/i.test(t);
 if(!identity&&!cost)return null;
 if(/^(?:please\s+)?(?:create|build|train|fine.tune|download|install|compare|explain|write|generate)\b/i.test(t))return null;
 const nlu=opts.nlu||require('./nlu'),brain=nlu.brain(),tl=/\b(?:ano|anong|sino|mo|mong|iyong|gamit|libre|bayad|ba)\b/i.test(t);
 // a wrong model name said earlier in this chat is corrected in one short line, never dragged into every answer
 const wrongBefore=(opts.history||[]).slice(-4).some(m=>m.role==='assistant'&&/\b(?:Claude|GPT|Gemini|Sonnet|Opus)\b/i.test(m.content||'')&&!/I(?:'m| am) not (?:Claude|a cloud)/i.test(m.content||''));
 const fix=wrongBefore?(tl?'Pagtatama: mali ang nasabi ko kanina tungkol sa model ko. ':'Correction: what I said earlier about my model was wrong. '):'';
 if(brain.kind==='online')return {reply:fix+(tl?`Sa ngayon, gumagamit ako ng ${brain.name} (model: ${brain.model}) sa pamamagitan ng API nito, hindi ng local model sa Mac mo. Nakadepende sa provider at account mo ang singil; hindi ko makikita kung magkano.`:`Right now I'm using ${brain.name} (model: ${brain.model}) through its API, not the local model on your Mac. Billing depends on that provider and your account; I can't see what you are charged.`),via:'verified model settings'};
 let file=nlu.health().model||'',verified=false;
 try{const res=await (opts.fetch||fetch)('http://127.0.0.1:'+nlu.port+'/v1/models',{signal:AbortSignal.timeout(1500)});if(res.ok){const data=await res.json();const id=data.data?.[0]?.id;if(id){file=require('path').basename(id);verified=true;}}}catch{}
 const name=prettyModel(file,opts.active),trained=/Tulai skills model/.test(name);
 const free=tl?'Offline ito at walang bayad kada request; ang kuryente at memory lang ng Mac mo ang gamit.':'It works offline and has no per-request fee: it only uses your Mac\'s power and memory.';
 const desktop=tl?'Para sa mas mabibigat na gawain, ang Tulai Desktop ang gumagamit ng company AI mo, pero nagpapasa lang ako sa kanya kapag sinabi mo.':'For bigger jobs, Tulai Desktop uses your company AI, but I only hand work to it when you ask.';
 const unsure=verified?'':(tl?' (hindi ko pa ma-check kung tumatakbo ang model server ngayon)':' (I could not check the running model server just now)');
 return {reply:fix+(tl?`Ako si Tulai. Ang ginagamit kong utak ngayon ay local model sa Mac mo: ${name}, na tumatakbo gamit ang llama.cpp${unsure}. Hindi ako Claude o cloud model. ${free} ${desktop}`:`I'm Tulai. My brain right now is a local model on your Mac: ${name}, running through llama.cpp${unsure}. I'm not Claude or a cloud model. ${free} ${desktop}`),via:'verified model settings'};
}
/** A readable name for the model file: Qwen2.5 3B Instruct (4-bit), or Tulai's own fine-tuned one. */
function prettyModel(file,active){
 const f=String(file||''),q=/q(\d)_k_[ms]/i.exec(f),bits=q?` (${q[1]}-bit, ${q[0].toUpperCase()})`:'';
 const qw=/qwen\s*-?\s*([\d.]+)\s*-?\s*(\d+(?:\.\d+)?)b/i.exec(f);
 if(qw&&!/^model-/i.test(f))return `Qwen${qw[1]} ${qw[2]}B Instruct${bits}`;
 let trained=false;try{const st=active||require('./active-model').state();trained=!!(st&&st.current);}catch{}
 if(trained||/^model-/i.test(f))return `Tulai skills model, fine-tuned on this Mac from Qwen2.5 3B Instruct${bits}`;
 return f?`${f}${bits&&!/\(/.test(f)?bits:''}`:'an embedded model (file not found)';
}
module.exports={answer,prettyModel};
