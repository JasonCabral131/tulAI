// Calls are noticed from macOS power assertions (no permission needed); Tulai only OFFERS meeting notes, once, and never while it is already recording.
const assert = require('assert'), C = require('../call-detect');
const idle = 'pid 471(Claude): [0x1] 03:04:07 NoIdleSleepAssertion named: "Electron"\npid 110(powerd): [0x2] 05:25:30 PreventUserIdleSystemSleep named: "Powerd - Prevent sleep while display is on"';
const teams = idle + '\npid 900(Microsoft Teams): [0x3] 00:01:02 PreventUserIdleDisplaySleep named: "Microsoft Teams Call in progress"';
const meet = idle + '\npid 800(Google Chrome): [0x4] 00:00:30 PreventUserIdleDisplaySleep named: "WebRTC has active PeerConnections"';
const zoom = idle + '\npid 700(CptHost): [0x5] 00:00:10 PreventUserIdleDisplaySleep named: "zoom.us is in a meeting"';
assert.deepStrictEqual(C.parse(idle), [], 'Electron apps and the system are not calls');
assert.deepStrictEqual(C.parse(teams), ['Teams']); assert.deepStrictEqual(C.parse(meet), ['a browser call (Meet)']); assert.deepStrictEqual(C.parse(zoom), ['Zoom']);
const offers = []; C._set([]); C.check((a) => offers.push(a), (cb) => cb(teams)); C.check((a) => offers.push(a), (cb) => cb(teams));
assert.deepStrictEqual(offers, ['Teams'], 'offered once when the call starts, not again while it goes on');
C._set([]); C.handle('stop detecting calls'); C.check((a) => offers.push(a), (cb) => cb(zoom)); assert.strictEqual(offers.length, 1, 'off means no offer');
assert(/Teams, Zoom or Meet/.test(C.handle('detect calls').reply));
console.log('PASS call detect: Teams, Zoom, Meet noticed from power assertions; offered once; never records by itself');
