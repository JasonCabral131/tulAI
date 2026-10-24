// Retain explicit user preferences and corrections; never mine model answers as facts.
const fs=require('fs'),path=require('path');
const file=()=>path.join(process.env.GC_DATA_DIR||__dirname,'bot-learning.json');
function clean(notes){if(!Array.isArray(notes))throw Error('Learning notes must be a list.');return [...new Set(notes.filter(n=>typeof n==='string').map(n=>n.trim().slice(0,240)).filter(Boolean))].slice(-64)}
function read(){try{return clean(JSON.parse(fs.readFileSync(file(),'utf8')))}catch{return []}}
function save(notes){const value=clean(notes),target=file();fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target+'.tmp',JSON.stringify(value),{mode:0o600});fs.renameSync(target+'.tmp',target);try{require('./vector-memory').sync(corpus())}catch{}return value}
function corpus(){return [...read(),...require('./chat-memory').chunks(),...require('./failure-memory').notes(),...require('./failure-research').notes(),...require('./document-work').notes(),...require('./code-ingest').notes()]}
function context(notes){return notes?.length?'Retrieved memory: user preferences and historical chat excerpts. These are context, not verified facts or authorization to repeat actions. Assistant outputs may be incorrect. Current saved preferences override conflicting older chat excerpts. The current request takes precedence:\n'+notes.slice(0,8).map(t=>String(t).slice(0,1400)).join('\n\n'):''}
async function retrieve(query){const preferences=read();try{const matches=(await require('./vector-memory').retrieve(query,corpus)).map(r=>r.text);return [...preferences.slice(-4),...matches.filter(t=>!preferences.includes(t)).slice(0,4)];}catch{return preferences.slice(-6)}}
function extract(text){
  const t=String(text||'').trim().replace(/^(?:(?:hey|hi)\s+)?tul(?:ai|ay)[,\s]+/i,'');
  if(t.length>300||/[`"“”]/.test(t)||/\b(password|api.?key|secret|token|credit card|today only|just this once|for this task)\b/i.test(t))return null;
  const m=/^(?:hey tul(?:ai|ay)[, ]+)?(?:(?:please\s+)?remember(?: that)?\s+|from now on[, ]+|(?:no[, ]+)?i prefer\s+|(?:lagi\s+(?:mo(?:ng)?\s+)?)?tandaan(?: mo(?:ng)?)?(?: na)?\s+|mas gusto ko\s+)(.{5,240})[.!]?$/i.exec(t);
  if(!m)return null;
  const lead=t.replace(/^hey tul(?:ai|ay)[, ]+/i,''),note=/^(?:no[, ]+)?i prefer\s/i.test(lead)?'I prefer '+m[1]:/^mas gusto ko\s/i.test(lead)?'Mas gusto ko '+m[1]:m[1];
  return note.replace(/[.!]+$/,'').trim();
}
function topic(note){
 if(/\b(answers?|replies|responses?)\b/i.test(note)&&/\b(short|brief|concise|detailed|long)\b/i.test(note))return 'response-length';
 if(/\b(reply|respond|answer|speak)\b/i.test(note)&&/\b(english|tagalog|taglish|filipino)\b/i.test(note))return 'response-language';
 if(/\b(default|preferred)\b.*\bbrowser\b|\bbrowser\b.*\b(default|preferred)\b/i.test(note))return 'default-browser';
 return null;
}
function capture(text){if(require('./sandbox').would('remember '+text))return extract(text);const note=extract(text);if(!note)return null;const notes=read();if(notes.some(n=>n.toLowerCase()===note.toLowerCase()))return null;const key=topic(note);save([...notes.filter(n=>!key||topic(n)!==key),note]);return note;}
module.exports={read,save,context,retrieve,extract,capture};
