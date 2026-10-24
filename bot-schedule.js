// Deterministic entry point: persist before acknowledging a scheduled task.
function handle(text){
 const t=String(text).trim();
 if(/^(?:show|list|what are)(?: me)?(?: my| the)? (?:scheduled tasks|schedules)[?!.]?$/i.test(t)){
  const items=require('./missions').view().filter(m=>m.schedule?.type!=='none');
  return {reply:items.length?items.map(m=>`${m.title}: ${m.schedText}; ${m.enabled?'next '+new Date(m.nextRun).toLocaleString():'paused'}${m.lastRun?'; last run '+m.lastRun.status:''}`).join('\n'):'You have no scheduled tasks.'};
 }
 if(!/^(?:please\s+)?(?:schedule|iskedyul|i-schedule)\b/i.test(t)||/\b(remind|reminder)\b/i.test(t))return null;
 const timing=/\b(every weekday|weekdays|every day|daily)\s+at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i.exec(t);
 if(!timing)return {reply:'Say “schedule every weekday at 7:55 AM to [task]” or “schedule every day at 9 AM to [task]”. I have not saved a schedule yet.'};
 let hour=Number(timing[2]),minute=Number(timing[3]||0);const ampm=timing[4]?.toLowerCase();
 if(minute>59||hour>23||(ampm&&(hour<1||hour>12)))return {reply:'That time is invalid. No schedule was saved.'};
 if(ampm)hour=hour%12+(ampm==='pm'?12:0);
 const goal=t.slice(timing.index+timing[0].length).replace(/^\s*(?:to|for|:|-)\s*/i,'').trim();
 if(!goal)return {reply:'What task should run at that time? No schedule was saved yet.'};
 const missions=require('./missions'),schedule={type:/weekday/i.test(timing[1])?'weekdays':'daily',at:String(hour).padStart(2,'0')+':'+String(minute).padStart(2,'0')};
 const existing=missions.view().find(m=>m.goal===goal&&m.schedule?.type===schedule.type&&m.schedule?.at===schedule.at);
 const m=existing||missions.save({title:goal.slice(0,80),goal,schedule,mode:'ask',notify:true});
 return {reply:`${existing?'Already saved':'Scheduled'}: ${m.title}. ${missions.describe(schedule)} (${Intl.DateTimeFormat().resolvedOptions().timeZone}). Next run: ${new Date(m.nextRun).toLocaleString()}. Tulai must be running and the Mac awake. Task execution requires its configured AI connection; approvals or sign-in may pause it. Manage it in Missions.`,via:'persisted scheduler'};
}
module.exports={handle};
