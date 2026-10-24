// Dry runs for Tulai's own self-tests: inside sandbox.dry(fn) nothing touches your Mac (no apps or folders opened, no Mac control,
// no clipboard, no reminders, memories, folders or settings written). Only that test's work is dry: your real requests at the same moment run normally.
const { AsyncLocalStorage } = require('async_hooks');
const als = new AsyncLocalStorage();
const dry = (fn) => als.run({ dry: true, would: [] }, fn);
const isDry = () => !!(als.getStore() && als.getStore().dry);
/** Records what a dry run would have done (for the test report). */
const would = (what) => { const s = als.getStore(); if (s && s.dry) s.would.push(String(what).slice(0, 200)); return isDry(); };
const wouldList = () => (als.getStore() ? als.getStore().would.slice() : []);
module.exports = { dry, isDry, would, wouldList };
