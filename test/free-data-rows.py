# Free-data adapters: real file shapes in, capped clean chat rows out; filters work; nothing half-downloaded is used; never repeats a question.
import importlib.util, json, gzip, os, pathlib, tempfile
root = pathlib.Path(__file__).resolve().parents[1]
sp = importlib.util.spec_from_file_location('fd', root / 'scripts/free-data.py'); fd = importlib.util.module_from_spec(sp); sp.loader.exec_module(fd)
tmp = pathlib.Path(tempfile.mkdtemp()); os.environ['TULAI_FREE_DIR'] = str(tmp)
cat = {c['id']: c for c in fd.catalog()}
def put(id, rows, gz=False):
    d = tmp / 'raw' / id; d.mkdir(parents=True, exist_ok=True); p = d / cat[id]['files'][0]['name']
    data = ''.join(json.dumps(r) + '\n' for r in rows).encode()
    p.write_bytes(gzip.compress(data) if gz else data)
    cat[id]['files'][0]['bytes'] = p.stat().st_size; return p
good_d = {'instruction': 'What are three ways to stay focused at work?', 'context': '', 'response': 'Silence notifications, work in short timed blocks, and write down the one thing to finish first.', 'category': 'brainstorming'}
rows = [good_d, {**good_d, 'instruction': 'Write a poem about the sea for me please', 'category': 'creative_writing'},  # wrong category
        {**good_d, 'instruction': 'Where can I read more about focus techniques online?', 'response': 'See https://example.com for a long guide on focus techniques and habits.'},  # link
        {**good_d, 'instruction': 'Who are you really, as a chat assistant today?', 'response': 'As an AI language model I do not have personal feelings about this at all.'},  # boilerplate
        {**good_d, 'instruction': 'Cuales son tres maneras de mantener el foco en el trabajo?', 'response': 'Silenciar notificaciones, trabajar en bloques cortos y escribir lo mas importante primero.'},  # not English
        {**good_d, 'instruction': 'What is my password for the work laptop again please?', 'response': 'Your password is stored in the password manager under the work entry for you.'},  # secret word
        {**good_d, 'instruction': 'hi', 'response': 'hello there'}]  # too short
put('dolly-15k', rows)
put('gsm8k', [{'question': 'Ana has 12 apples and buys 8 more. How many apples does she have now in total?', 'answer': 'Ana has 12 + <<12+8=20>>20 apples.\n#### 20'}, {'question': 'No final marker in this answer, so it must be skipped completely.', 'answer': 'just words'}])
msgs = [{'message_id': 'p1', 'parent_id': None, 'role': 'prompter', 'lang': 'en', 'text': 'How do I make a good cup of tea at home?', 'deleted': False, 'review_result': True, 'labels': {'toxicity': {'value': 0.0}}},
        {'message_id': 'a1', 'parent_id': 'p1', 'role': 'assistant', 'lang': 'en', 'text': 'Boil fresh water, steep the tea for three minutes, then remove the leaves and add milk if you like it.', 'deleted': False, 'review_result': True, 'rank': 0, 'labels': {'toxicity': {'value': 0.0}}},
        {'message_id': 'a2', 'parent_id': 'p1', 'role': 'assistant', 'lang': 'en', 'text': 'Worse answer ranked lower that should never be used here.', 'deleted': False, 'review_result': True, 'rank': 1, 'labels': {}},
        {'message_id': 'p2', 'parent_id': None, 'role': 'prompter', 'lang': 'en', 'text': 'Tell me something about a sensitive topic please.', 'deleted': False, 'review_result': True, 'labels': {}},
        {'message_id': 'a3', 'parent_id': 'p2', 'role': 'assistant', 'lang': 'en', 'text': 'A reply that people flagged as toxic and so it must be dropped for sure.', 'deleted': False, 'review_result': True, 'rank': 0, 'labels': {'toxicity': {'value': 0.9}}}]
put('oasst1', msgs, gz=True)
# patch the (temporary) catalog the adapter reads
fd.catalog = lambda: list(cat.values())
out, counts = fd.rows(7, 'SYSTEM', set())
print(counts)
assert counts == {'dolly-15k': 1, 'gsm8k': 1, 'oasst1': 1}, counts
users = [r['messages'][1]['content'] for r in out]; ans = {r['messages'][1]['content']: r['messages'][2]['content'] for r in out}
assert 'What are three ways to stay focused at work?' in users and 'How do I make a good cup of tea at home?' in users
assert all(r['messages'][0] == {'role': 'system', 'content': 'SYSTEM'} and r['messages'][-1]['role'] == 'assistant' for r in out)
g = [a for q, a in ans.items() if 'apples' in q][0]; assert '<<' not in g and g.endswith('So the answer is 20.'), g
assert 'Boil fresh water' in ans['How do I make a good cup of tea at home?'], 'best-ranked answer only'
# never repeats a taken question; switched off or half-downloaded datasets are skipped
out2, c2 = fd.rows(7, 'SYSTEM', {'what are three ways to stay focused at work?'}); assert 'dolly-15k' in c2 and c2['dolly-15k'] == 0
(tmp / 'config.json').write_text(json.dumps({'enabled': {'gsm8k': False, 'oasst1': False}})); out3, c3 = fd.rows(7, 'SYSTEM', set()); assert set(c3) == {'dolly-15k'}, c3
(tmp / 'raw' / 'dolly-15k' / cat['dolly-15k']['files'][0]['name']).write_bytes(b'{"half":'); out4, c4 = fd.rows(7, 'SYSTEM', set()); assert c4 == {}, 'a file with the wrong size is never half-used'
# deterministic
(tmp / 'config.json').unlink(); assert [r['messages'][1]['content'] for r in fd.rows(3, 'S', set())[0]] == [r['messages'][1]['content'] for r in fd.rows(3, 'S', set())[0]]
print('PASS free data rows: filters, caps, best-ranked answer, no repeats, skips half-downloads, deterministic')
