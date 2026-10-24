// The bot owns its requests. Desktop handoff requires an explicit user request.
function route(text,opts={}){
 const t=String(text).trim();
 if(/^(?:please\s+)?(?:don't|do not|never|huwag)\b/i.test(t))return null;
 if(/\b(dws|daily work setup)\b/i.test(t)&&/\b(mag|gawin|complete|submit|login|log in|fill|start)\b/i.test(t)){
  return {reply:'DWS means Daily Work Setup. I’m keeping this in the bot. My background browser can read a signed-in page, but I do not yet have a form-filling and submission tool connected to this bot. I have not completed DWS or sent a Teams greeting. To inspect the setup here, use “inspect <DWS URL> using account <account name>”.',via:'bot capability boundary'};
 }
 if(/\b(capabilit\w*|can you|kaya mo|skills?)\b/i.test(t)&&/\b(chrome|browser|website|selenium)\b/i.test(t))return {reply:'I have a background Selenium browser tool for reading pages with a connected account, plus original-source webpage previews here. Form filling and submission are not yet connected to my local tool loop. I use my configured bot model; Desktop handoff needs your explicit request.',via:'bot capability'};
 // Let the local tool loop and configured bot model handle analysis and other work.
 return null;
}
module.exports={route};
