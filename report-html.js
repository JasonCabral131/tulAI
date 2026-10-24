const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function render(title,md){
 const lines=String(md).split('\n');let body='',table=false;
 for(const line of lines){
  if(/^\s*\|/.test(line)){
   if(/^\s*\|[\s:|-]+\|\s*$/.test(line))continue;
   const cells=line.trim().replace(/^\||\|$/g,'').split('|');const tag=table?'td':'th';
   if(!table){body+='<div class="table"><table>';table=true;}
   body+='<tr>'+cells.map(c=>`<${tag}>${escape(c.trim())}</${tag}>`).join('')+'</tr>';continue;
  }
  if(table){body+='</table></div>';table=false;}
  const h=/^(#{1,4})\s+(.+)$/.exec(line);
  body+=h?`<h${h[1].length}>${escape(h[2])}</h${h[1].length}>`:line.trim()?`<p>${escape(line)}</p>`:'';
 }
 if(table)body+='</table></div>';
 return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escape(title)}</title><style>body{font:15px/1.65 system-ui;color:#1d2939;background:#f3f5f8;margin:0;padding:40px}main{max-width:1100px;margin:auto;background:white;padding:40px;border-radius:16px}header{border-bottom:3px solid #c57856;margin-bottom:28px}h1{font-size:30px}h2{margin-top:32px}.table{overflow:auto}table{border-collapse:collapse;width:100%;font-size:14px}th,td{text-align:left;padding:12px;border-bottom:1px solid #dee4eb}th{background:#edf2f7}tr:nth-child(even){background:#fafbfd}small{color:#667085}@media print{body,main{background:white;padding:0}th{print-color-adjust:exact}tr{break-inside:avoid}}</style><main><header><small>TULAI · MANAGEMENT REPORT</small><h1>${escape(title)}</h1><p>Generated ${escape(new Date().toISOString())}</p></header>${body}</main></html>`;
}
module.exports={render};
