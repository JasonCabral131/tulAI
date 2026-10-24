import sys,zipfile,xml.etree.ElementTree as ET,json,csv,io,re
file=sys.argv[1];ext=file.rsplit('.',1)[-1].lower();out=[]
def add(label,text):
 for i in range(0,max(1,len(text)),7000):
  if len(out)>=500:raise ValueError('Document exceeds the 500 section limit')
  out.append({'label':label+(f' · part {i//7000+1}' if len(text)>7000 else ''),'text':text[i:i+7000]})
def xml(z,n):return ET.fromstring(z.read(n))
def texts(el):return ' '.join(n.text or '' for n in el.iter() if n.tag.split('}')[-1]=='t')
if ext in ['docx','pptx','xlsx']:
 with zipfile.ZipFile(file) as z:
  if sum(i.file_size for i in z.infolist())>64*1024*1024:raise ValueError('Expanded document exceeds 64 MB')
  if ext=='docx':
   paragraphs=[texts(p) for p in xml(z,'word/document.xml').iter() if p.tag.split('}')[-1]=='p'];add('Document text (not physical pages)','\n'.join(paragraphs))
  elif ext=='pptx':
   names=sorted([n for n in z.namelist() if re.fullmatch(r'ppt/slides/slide\d+\.xml',n)],key=lambda n:int(re.search(r'slide(\d+)',n).group(1)))
   for i,n in enumerate(names):add(f'Slide {i+1}',texts(xml(z,n)))
  else:
   ns={'m':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
   shared=[texts(e) for e in xml(z,'xl/sharedStrings.xml').findall('m:si',ns)] if 'xl/sharedStrings.xml' in z.namelist() else []
   rels={r.attrib['Id']:r.attrib['Target'] for r in xml(z,'xl/_rels/workbook.xml.rels')}
   import posixpath
   for sheet in xml(z,'xl/workbook.xml').findall('m:sheets/m:sheet',ns):
    target=rels[sheet.attrib['{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id']];target=target.lstrip('/') if target.startswith('/') else posixpath.normpath('xl/'+target)
    rows=xml(z,target).findall('m:sheetData/m:row',ns)
    for offset in range(0,max(1,len(rows)),30):
     lines=[]
     for row in rows[offset:offset+30]:
      vals=[]
      for c in row.findall('m:c',ns):
       v=c.findtext('m:v','',ns);typ=c.attrib.get('t');formula=c.find('m:f',ns)
       if typ=='s':v=shared[int(v)] if v else ''
       elif typ=='inlineStr':v=texts(c)
       if formula is not None:v+=' [cached formula result; not recalculated]'
       vals.append(c.attrib.get('r','')+'='+v)
      lines.append(' | '.join(vals))
     add('Sheet '+sheet.attrib['name']+f' · row block {offset//30+1}','\n'.join(lines))
elif ext=='svg':
 root=ET.parse(file).getroot();elements=[e for e in root.iter() if e.tag.split('}')[-1]=='text'];pairs=[]
 labels=[e for e in elements if e.attrib.get('y')=='440' and re.fullmatch(r'\d{4}-\d{2}',e.text or '')]
 for label in labels:
  values=[e.text for e in elements if e.attrib.get('x')==label.attrib.get('x') and e.attrib.get('y')!='440' and re.fullmatch(r'\d+',e.text or '')]
  if len(values)==1:pairs.append({'month':label.text,'commits':int(values[0])})
 if pairs and len(pairs)==len(labels) and any('Not a productivity score' in (e.text or '') for e in elements):add('Generated chart data',json.dumps(pairs))
 else:add('Chart labels and values','\n'.join(''.join(e.itertext()) for e in root.iter() if e.tag.split('}')[-1] in ['title','text']))
elif ext in ['csv','tsv']:
 with open(file,encoding='utf-8-sig',newline='') as f:rows=list(csv.reader(f,delimiter='\t' if ext=='tsv' else ',',strict=True))
 for i in range(0,max(1,len(rows)-1),30):add(f'Rows {i+1}–{min(i+30,len(rows)-1)}',json.dumps({'headers':rows[0] if rows else [],'rows':rows[i+1:i+31]},ensure_ascii=False))
else:
 with open(file,encoding='utf-8-sig') as f:add('Text section',f.read())
print(json.dumps(out,ensure_ascii=False))
