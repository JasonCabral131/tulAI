// "create a folder on desktop name it X": made for real; no place = Desktop; no name = asked once and the reply is the name; extra lines go to the coding agent
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path');
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'tulai-home-')); os.homedir = () => home;
const F = require('../folder-rules');
let r = F.handle('on desktop create a folder name it  platform-skills and create a skills\n✅ 1. Create skills/platform-reports/README.md (spec)\n✅ 2. Create skills/platform-reports/schema.ts', { sid: 'a' });
assert(fs.statSync(path.join(home, 'Desktop', 'platform-skills')).isDirectory(), 'the folder exists');
assert(r.agent && r.agent.workspace === path.join(home, 'Desktop', 'platform-skills') && /README\.md/.test(r.agent.task), 'the file list goes to the coding agent inside the folder');
r = F.handle('i want you to create a folder on desktop', { sid: 'b' }); assert(/What should I name/.test(r.reply), r.reply);
r = F.handle('desktop', { sid: 'b' }); assert(/Created the folder \*\*desktop\*\*/.test(r.reply), 'the reply to the question is the name, never asked again: ' + r.reply);
r = F.handle('make a new folder called notes', { sid: 'c' }); assert(fs.existsSync(path.join(home, 'Desktop', 'notes')), 'no place = Desktop');
r = F.handle('gumawa ng folder sa documents na pangalan ay reports', { sid: 'd' }); assert(fs.existsSync(path.join(home, 'Documents', 'reports')), r.reply);
r = F.handle('create a folder on desktop named notes', { sid: 'e' }); assert(/already exists/.test(r.reply), r.reply);
assert.strictEqual(F.handle('open my desktop folder', { sid: 'f' }), null); assert.strictEqual(F.handle('create a ticket in jira', { sid: 'g' }), null);
assert(/What should I name/.test(F.handle('create a folder named ../../etc', { sid: 'h' }).reply), 'unsafe names are never used');
console.log('PASS create folder: real folder, Desktop by default, the name asked once, extra lines go to the coding agent');
