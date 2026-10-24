// The bot's chats (its conversation and its self-tests) belong to Tulai Bot: Tulai Desktop never lists or overwrites them.
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), http = require('http');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tulai-chats-')); process.env.GC_DATA_DIR = dir;
const store = require('../store');
store.saveChat({ id: 'bot-main', title: '🎙 Tulai bot', owner: 'bot', messages: [], history: [], updated: 1 });
store.saveChat({ id: 'qa-greeting', title: 'qa', messages: [], history: [], updated: 2 });
store.saveChat({ id: '1791', title: 'my desktop chat', messages: [], history: [], updated: 3 });
const C = require('../converse'); assert.strictEqual(C.load({}).owner, 'bot', 'the bot marks its chat as its own');
const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const isBotChat = eval(/const isBotChat = (\([^\n]+);/.exec(src)[1]);
assert.deepStrictEqual(store.listChats().filter((c) => !isBotChat(c)).map((c) => c.title), ['my desktop chat'], 'Desktop lists only its own chats');
assert(/ROLE === 'bot' \? store\.listChats\(\) : store\.listChats\(\)\.filter\(\(c\) => !isBotChat\(c\)\)/.test(src), 'the Desktop chat list filters bot chats');
assert(/ROLE !== 'bot' && isBotChat\(/.test(src), 'Desktop never overwrites a bot chat');
console.log('PASS bot chats stay in Tulai Bot: Desktop does not list or overwrite them');
