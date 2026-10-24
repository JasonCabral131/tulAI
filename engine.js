// Model engine: decides how each request is handled, cheapest first.
//   1. local   — rules that run on this Mac (no tokens)
//   2. haiku   — short, simple chat
//   3. sonnet  — everyday work
//   4. opus    — big, risky or deep work, or when the person is already frustrated and the answer must be right
// An explicit choice in settings (botModel) always wins. Conversation is Sonnet or better unless the "saver" setting is on.
const HEAVY = /\b(architect\w*|refactor\w*|debug\w*|security|vulnerab\w*|design|analy[sz]e|implement\w*|migrate|optimi[sz]e|review|root cause|performance|pull request|algorithm|schema|test plan)\b/i;
const CODE = /(```|\bfunction\b|\bclass\b|\bimport\b|=>|\.(js|ts|tsx|py|java|kt|swift|json|yaml|yml)\b|\bstack ?trace\b|\berror:)/i;
const LIGHT = /^(hi|hello|hey|thanks|thank you|ok|okay|sige|salamat|what is|what's|who is|define|explain briefly|translate|convert|how many|how much)\b/i;
const order = ['haiku', 'sonnet', 'opus'];
function pick(text, { mood, repeated, configured, saver } = {}) {
  if (order.includes(configured)) return { tier: configured, why: 'set in settings' };
  const words = String(text).trim().split(/\s+/).length; let i = 1, why = 'everyday request';
  if (words <= 14 && !HEAVY.test(text) && !CODE.test(text)) { i = 0; why = 'short and simple'; }
  if (LIGHT.test(text) && words <= 25 && !HEAVY.test(text)) { i = 0; why = 'quick question'; }
  if (words > 80 || HEAVY.test(text) || CODE.test(text)) { i = Math.max(i, 1); }
  if (words > 120 || (HEAVY.test(text) && words > 30)) { i = 2; why = 'big or deep task'; }
  if ((mood && mood.level === 'high') || repeated) { i = Math.min(2, i + 1); why = repeated ? 'asked again, so aiming for a better answer' : 'sounded frustrated, so aiming for a better answer'; }
  // Interaction quality: conversation with a person is Sonnet or better by default (Opus for deep, long or frustrated moments). Haiku only when saving tokens is chosen (saver).
  if (!saver) { if (i === 0) { i = 1; why = 'conversation (Sonnet or better)'; } if (words > 60 && i < 2 && !LIGHT.test(text)) { i = 2; why = 'a long request deserves the strongest model'; } }
  return { tier: order[i], why };
}
const calmHint = (mood, repeated) => (mood.level !== 'calm' || repeated)
  ? 'The person sounds frustrated or is repeating a request that did not work. Start with one short, sincere acknowledgement in the language they use (English, Tagalog or Taglish), then fix the problem first. Do not lecture, do not over-apologise, and say plainly what you will do differently.'
  : (mood.polite ? 'The person is polite; keep a warm, friendly tone.' : '');
module.exports = { pick, calmHint };
