// All bot routes pass this boundary before a Desktop job can be dispatched.
function explicit(text){
 const t=String(text).trim();
 if(/\b(don't|do not|never|huwag|wag)\b/i.test(t))return false;
 return /^(?:(?:please|pls)\s+)?(?:open|launch|start|show|go to|tell|ask|use|send (?:this|it) to|delegate to|ipasa (?:mo )?sa|buksan)\s+(?:(?:the|my)\s+)?(?:(?:tulai|tulay)\s+)?desktop\b/i.test(t);
}
function guard(result,text){
 if(!result?.delegate||result.handoffConfirmed===true||explicit(text))return result;
 return {reply:'This request reached a Desktop-only workflow. I have not opened Desktop or switched AI providers. The bot does not yet have the tools for that workflow. If you want to use it, explicitly ask “use Tulai Desktop” and include the task.',via:'desktop handoff blocked'};
}
module.exports={explicit,guard};
