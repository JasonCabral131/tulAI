// Tulai is two separate programs sharing one app bundle:
//   Tulai Desktop (default): the chat window that uses the company AI.        -> main-desktop.js
//   Tulai Bot (--bot):       the floating robot, voice, local models, missions -> main-bot.js
// They are separate operating-system processes. Quitting or crashing one never closes the other.
const BOT = process.argv.includes('--bot') || process.env.TULAI_ROLE === 'bot';
require(BOT ? './main-bot.js' : './main-desktop.js');
