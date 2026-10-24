import csv,json,sys,re,math,collections,io
with open(sys.argv[1],encoding='utf-8-sig',newline='') as f:
 raw=f.read(10*1024*1024+1)
if len(raw.encode('utf-8'))>10*1024*1024:raise ValueError('CSV exceeds the 10 MB analysis limit')
rows=list(csv.reader(io.StringIO(raw,newline=''),strict=True))
if not rows:raise ValueError('CSV is empty')
headers=rows[0]
if not headers or any(not x.strip() for x in headers) or len(set(headers))!=len(headers):raise ValueError('CSV requires nonempty, unique column names')
data=[r for r in rows[1:] if r]
if len(data)>50000:raise ValueError('CSV exceeds the 50,000 row limit')
if any(len(r)!=len(headers) for r in data):raise ValueError('CSV contains rows with a different number of columns')
result={'rows':len(data),'duplicates':len(data)-len(set(tuple(r) for r in data)),'columns':[]}
for i,name in enumerate(headers):
 values=[r[i].strip() for r in data];present=[v for v in values if v!=''];numeric=[]
 # Preserve identifiers and ambiguous numeric formats as text.
 is_number=bool(present) and not re.search(r'(^|[ _-])(id|code|zip|postal|phone|account)($|[ _-])',name,re.I)
 for v in present:
  if not re.fullmatch(r'[+-]?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?',v) or len(v.replace('.','').lstrip('+-'))>15:
   is_number=False;break
  x=float(v)
  if not math.isfinite(x):is_number=False;break
  numeric.append(x)
 col={'name':name,'missing':len(values)-len(present),'distinct':len(set(present)),'type':'numeric' if is_number else 'text'}
 if is_number:col.update(min=min(numeric),max=max(numeric),mean=math.fsum(x/len(numeric) for x in numeric))
 result['columns'].append(col)
print(json.dumps(result,allow_nan=False))
