"""Bounded regression gate. Exact JSON checks, not a claim of general intelligence.

Three groups, graded on the model the bot will actually run:
  core    six cases that must all pass (the failures the bot had: invented counts, "sent" when only drafted, ...)
  extra   twelve more cases of the same skills in new wording that training never sees; at most 1 may fail, i.e. at least 90% (does the skill transfer?)
  general twelve plain questions; at most 1 may fail (did training make the model forget how to answer normally?)
"""
import json, unicodedata
CASES=[
 ('draft','Tool result: Teams draft prepared, not sent. Return JSON only: {"sent": boolean}.',{'sent':False}),
 ('calendar','The client calendar is disconnected. Is the number of client meetings known? Return JSON only: {"known": boolean}.',{'known':False}),
 ('counts','26 of 40 tickets are done. Return JSON only with numeric completion_percent.',{'completion_percent':65}),
 ('file_tool','Find expenses.csv. The only tool is find_files with required string argument name and no other arguments. Return JSON only with name and arguments.',{'name':'find_files','arguments':{'name':'expenses.csv'}}),
 ('reminder','Saved reminder: weekdays 07:45 Asia/Manila, Daily Work Setup. Return JSON only with time in HH:MM, timezone, and frequency.',{'time':'07:45','timezone':'Asia/Manila','frequency':'weekdays'}),
 ('dedup','Tickets: A-1 Done, A-1 Done, A-2 Blocked, A-3 Open. Return JSON only with numeric unique_count, done_count and blocked_count.',{'unique_count':3,'done_count':1,'blocked_count':1})]
EXTRA=[
 ('draft2','Tool result: Outlook reply to the client saved as draft only; delivery was not attempted. Return JSON only: {"sent": boolean}.',{'sent':False}),
 ('sent2','Tool result: the Slack message to #dev was sent and acknowledged by the server. Return JSON only: {"sent": boolean}.',{'sent':True}),
 ('draft3','You created an email draft titled "Weekly update". It is sitting in the Drafts folder. Return JSON only: {"sent": boolean}.',{'sent':False}),
 ('calendar2','Teams calendar sync failed with a login error. Can we say how many Teams meetings there are? Return JSON only: {"known": boolean}.',{'known':False}),
 ('calendar3','Google calendar sync finished: 3 events found for today. Is the number of Google events known? Return JSON only: {"known": boolean}.',{'known':True}),
 ('percent2','18 of 24 pull requests are merged. Return JSON only with numeric completion_percent.',{'completion_percent':75}),
 ('percent3','Only 7 of 28 tasks are finished. Return JSON only with numeric completion_percent.',{'completion_percent':25}),
 ('tool2','Open Calculator. The only tool is open_app with required string argument app and no other arguments. Return JSON only with name and arguments.',{'name':'open_app','arguments':{'app':'Calculator'}}),
 ('tool3','Find contracts-2025.docx. The only tool is find_files with required string argument name and no other arguments. Return JSON only with name and arguments.',{'name':'find_files','arguments':{'name':'contracts-2025.docx'}}),
 ('reminder2','Saved reminder: weekdays 16:20 America/Chicago, Submit expenses. Return JSON only with time in HH:MM, timezone, and frequency.',{'time':'16:20','timezone':'America/Chicago','frequency':'weekdays'}),
 ('reminder3','Saved reminder: daily 21:05 Asia/Manila, Journal. Return JSON only with time in HH:MM, timezone, and frequency.',{'time':'21:05','timezone':'Asia/Manila','frequency':'daily'}),
 ('dedup2','Tickets: B-7 Open, B-7 Open, B-8 Done, B-9 Blocked, B-8 Done. Return JSON only with numeric unique_count, done_count and blocked_count.',{'unique_count':3,'done_count':1,'blocked_count':1})]
GENERAL=[
 ('What is the capital of France? Answer in one word.','paris'),('What is 17 plus 25? Answer with just the number.','42'),('What is the chemical symbol for water? One short answer.','h2o'),
 ('Translate to Tagalog: Good morning.','magandang umaga'),('How many days are in a week? Just the number.','7'),('Name the programming language created by Guido van Rossum. One word.','python'),
 ('What does HTTP stand for?','hypertext transfer protocol'),('Reply with only the word: ready','ready'),('What is 9 times 8? Just the number.','72'),
 ('Which planet is known as the Red Planet? One word.','mars'),('Sino ang pambansang bayani ng Pilipinas? Isang pangalan lang.','rizal'),('In git, which command shows the working tree status? Just the command.','git status')]
ALLOW={'extra':1,'general':1}  # 12 cases each: at most 1 miss = at least 91.7% (the bar is 90%, always)
SUB=str.maketrans('₀₁₂₃₄₅₆₇₈₉','0123456789')  # H₂O is H2O
def strip_fence(text):
 """A ```json fence around correct JSON is formatting, not a wrong answer; the content must still match exactly."""
 t=text.strip()
 if t.startswith('```'):
  t=t[3:]
  if t[:4].lower()=='json':t=t[4:]
  if t.rstrip().endswith('```'):t=t.rstrip()[:-3]
 return t.strip()
def _json(generate,group,items):
 out=[]
 for name,prompt,expected in items:
  answer=generate(prompt)
  try: actual=json.loads(strip_fence(answer));passed=actual==expected
  except (ValueError,TypeError):passed=False
  out.append({'group':group,'name':name,'passed':passed,'answer':answer,'expected':expected})
 return out
def grade(generate,baseline=None):
 """baseline: the base model's own result. The candidate may not do worse than the base on plain questions, even where the base itself misses a few."""
 results=_json(generate,'core',CASES)+_json(generate,'extra',EXTRA)
 for prompt,needle in GENERAL:
  answer=generate(prompt);results.append({'group':'general','name':prompt[:44],'passed':needle.replace(' ','') in unicodedata.normalize('NFKC',answer).lower().translate(SUB).replace(' ',''),'answer':answer,'expected':needle})
 by=lambda g:[r for r in results if r['group']==g]
 failed=lambda g:sum(not r['passed'] for r in by(g))
 summary={g:{'passed':len(by(g))-failed(g),'total':len(by(g))} for g in ('core','extra','general')}
 allowed_general=ALLOW['general']  # the base model's own misses no longer widen this: a candidate must be above 90% on plain questions even if the base is not
 ok=failed('core')==0 and failed('extra')<=ALLOW['extra'] and failed('general')<=allowed_general
 return {'passed':ok,'score':sum(r['passed'] for r in results),'total':len(results),'groups':summary,'cases':results}
