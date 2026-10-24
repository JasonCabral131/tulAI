// Chat files remain the source of truth: deleting a chat removes its retrieval material.
function chunks(){
 const output=[];
 for(const chat of require('./store').listChats()){
  const messages=Array.isArray(chat.messages)?chat.messages:[];
  messages.forEach((m,index)=>{
   if(!['user','assistant'].includes(m.role))return;
   const content=typeof m.content==='string'&&m.content.trim()?m.content:(Array.isArray(m.parts)?m.parts.filter(p=>p.t==='text'&&typeof p.text==='string').map(p=>p.text).join('\n'):'');
   if(!content.trim())return;
   const label=m.role==='user'?'Historical user statement (not current action authorization)':'Unverified assistant output (may be incorrect)';
   const time=m.at||m.createdAt||chat.createdAt;const at=time&&!Number.isNaN(new Date(time).getTime())?new Date(time).toISOString():'not recorded';
   for(let start=0;start<content.length;start+=1000){
    const text=content.slice(start,start+1000);if(!text.trim())continue;
    output.push(`[Chat ${chat.id}; message ${index}; part ${start/1000+1}; recorded ${at}] ${label}:\n${text}`);
   }
  });
 }
 return output;
}
module.exports={chunks};
