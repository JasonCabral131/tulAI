const fs=require('fs'),path=require('path'),os=require('os'),crypto=require('crypto'),{execFile}=require('child_process');
const instruction='Define the business question, source, date range and row grain before analysis. Inspect missing values, duplicate rows, types and join cardinality. Calculate metrics using code or a query, with explicit denominators, units and filters. Distinguish zero from missing data and percentage change from percentage points. Do not sum identifiers, average averages, imply causation from correlation, or invent data. Return an executive summary, metric table, findings, limitations and recommended actions with source references. Save and validate requested report files. If data is missing, ask for the specific file or connected source; never fabricate results.';
function profile(file){return new Promise((resolve,reject)=>execFile('python3',['-c',fs.readFileSync(path.join(__dirname,'scripts/profile-csv.py'),'utf8'),file],{timeout:20000,maxBuffer:2e6},(err,out,stderr)=>{if(err)return reject(new Error(stderr.trim().split('\n').at(-1)||err.message));try{resolve(JSON.parse(out))}catch(e){reject(e)}}));}
async function handle(text,opts={}){
 const m=/^(?:please\s+)?(?:analy[sz]e|profile|check data quality of)\s+(?:csv\s+)?(?:"([^"]+\.csv)"|'([^']+\.csv)'|((?:\/|~\/).+\.csv))\s*(?:as\s+(html|pdf|excel|xlsx|powerpoint|pptx))?\s*[.!]?$/i.exec(String(text).trim());if(!m)return null;
 const file=(m[1]||m[2]||m[3]).replace(/^~\//,os.homedir()+'/');
 try{
 if(!path.isAbsolute(file))return {reply:'Please provide the absolute path to the CSV file.'};
 if(!fs.statSync(file).isFile()||fs.statSync(file).size>10*1024*1024)throw Error('Choose a CSV file under 10 MB.');
 const data=await profile(file);if(opts.signal?.aborted)return {reply:'Analysis stopped.'};
 const cell=x=>String(x).replace(/[|\r\n]/g,' '),fmt=x=>x===undefined?'—':Number(x.toPrecision(8));
 const md=['# Data quality summary',`Source: ${cell(file)}`,`Rows: ${data.rows}. Columns: ${data.columns.length}. Exact duplicate rows: ${data.duplicates}.`, 'Blank cells are missing; no rows or values were changed. Duplicate rows are observations, not automatically errors.','# Column profile','| Column | Type | Missing | Distinct nonblank | Min | Max | Mean |','|---|---|---|---|---|---|---|',...data.columns.map(c=>`| ${cell(c.name)} | ${c.type} | ${c.missing} | ${c.distinct} | ${fmt(c.min)} | ${fmt(c.max)} | ${fmt(c.mean)} |`),'','# Interpretation limits','Numeric summaries exclude blanks. Identifiers, leading-zero values, dates, currencies and percentages are kept as text when ambiguous. Mean is per nonblank row; no weighting is assumed. Business targets, units and causal conclusions cannot be inferred from this profile.','# Next steps','Confirm the row grain, metric definitions and date range before comparing groups or trends. Review missing values and duplicate rows before making decisions.'].join('\n');
 const dir=opts.outputDir||path.join(os.homedir(),'Documents','Tulai Reports');fs.mkdirSync(dir,{recursive:true});const name='Data profile '+crypto.randomUUID()+'.html',target=path.join(dir,name);fs.writeFileSync(target,require('./analyst-report').render(data,md),{mode:0o600});
 const files=[{name,ext:'html',label:'HTML report',path:target}];let exportNote='';
 const exporter=require('./export');exporter.setLast(md,'Data analysis report');
 if(m[4]&&m[4].toLowerCase()!=='html'){try{const f=await exporter.exportAs(md,m[4].toLowerCase(),'Data analysis report');files.push({name:f.name,ext:f.ext,label:f.label,path:f.file,preview:f.preview});}catch(e){exportNote='\nRequested export failed: '+e.message+'; the HTML report is available.';}}
 return {reply:md+'\n\nSaved report: '+target+exportNote,via:'computed CSV analysis',files,analysis:data};
 }catch(e){return {reply:'CSV analysis could not finish: '+e.message,via:'CSV analysis error'};}
}
module.exports={handle,profile,instruction};
