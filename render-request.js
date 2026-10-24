// Re-display actual attachments; model prose is never evidence that a file exists.
function handle(text,opts={}){
 const t=String(text).trim();
 const intent=/\b(?:render|display|show|where|nasa[a]?n|nasaan|nasan|ipakita|pakita)\b/i.test(t)&&/\b(?:images?|charts?|graphs?|pictures?|screenshots?)\b/i.test(t)&&/\b(?:here|chat|dito|that|those|it|where|nasa[a]?n|nasaan|nasan)\b/i.test(t);
 if(!intent)return null;
 if(/\bcommits?\b/i.test(t))return null;
 const V=require('./viewer');let views=(opts.recentViewPaths||[]).slice(-8).map(p=>V.register(p)).filter(v=>v&&v.kind==='image');
 if(!views.length){const last=V.getLast(),entry=last&&V.get(last.id);if(entry&&last.kind==='image'){const v=V.register(entry.path);if(v)views=[v];}}
 if(views.length)return {reply:'Here are the actual images in this chat.',views,via:'existing image rendering'};
 return {reply:'I cannot find an actual image attachment for this conversation. A previous message naming a file does not mean it was generated. Tell me which report or repository to chart so I can create and display the real images.',via:'missing image evidence'};
}
module.exports={handle};
