// Turns what Tulai just told you (a report, a table, an answer) into files you can open: CSV, Excel (.xlsx), PowerPoint (.pptx),
// PDF and a web page (.html). Everything is built on this Mac from the text itself: no online service, no model call, no extra packages.
// .xlsx and .pptx are zip files of XML, written here with a tiny zip writer; the PDF is printed by Electron from the same HTML page.
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');

const dir = () => process.env.TULAI_REPORTS_DIR || path.join(os.homedir(), 'Documents', 'Tulai Reports');
const pad = (n) => String(n).padStart(2, '0'), stamp = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}.${pad(d.getMinutes())}`; };
const safe = (s) => String(s || 'Tulai').replace(/[\\/:*?"<>|\n\r]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60) || 'Tulai';
const x = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
const plain = (s) => String(s).replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[*_`]+/g, '').replace(/\s+/g, ' ').trim();

/* ---------- markdown -> blocks ---------- */
/** Blocks: { h, text } · { p } · { ul: [..] } · { table: { head: [..], rows: [[..]] } } */
function parse(md) {
  const L = String(md || '').replace(/\r/g, '').split('\n'), out = []; let i = 0;
  const cells = (r) => r.trim().replace(/^\||\|$/g, '').split('|').map((c) => plain(c));
  while (i < L.length) {
    const l = L[i], m = /^(#{1,4})\s+(.*)$/.exec(l);
    if (!l.trim() || /^\s*([-*_])\1\1+\s*$/.test(l)) { i++; continue; }
    if (m) { out.push({ h: m[1].length, text: plain(m[2]) }); i++; continue; }
    if (l.includes('|') && /^\s*\|?\s*:?-{2,}/.test(L[i + 1] || '')) { const head = cells(l); i += 2; const rows = []; while (i < L.length && L[i].includes('|') && L[i].trim()) rows.push(cells(L[i++])); out.push({ table: { head, rows } }); continue; }
    if (/^\s*(?:[-*+]|\d+\.)\s+/.test(l)) { const ul = []; while (i < L.length && /^\s*(?:[-*+]|\d+\.)\s+/.test(L[i])) ul.push(plain(L[i++].replace(/^\s*(?:[-*+]|\d+\.)\s+(?:\[[ x]\]\s+)?/, ''))); out.push({ ul }); continue; }
    const p = []; while (i < L.length && L[i].trim() && !/^(#{1,4}\s|\s*(?:[-*+]|\d+\.)\s)/.test(L[i]) && !(L[i].includes('|') && /^\s*\|?\s*:?-{2,}/.test(L[i + 1] || ''))) p.push(L[i++]); out.push({ p: plain(p.join(' ')) });
  }
  return out;
}
const titleOf = (blocks, fallback) => (blocks.find((b) => b.h === 1) || blocks.find((b) => b.h) || {}).text || fallback || 'Tulai report';

/* ---------- tiny zip writer (store method) ---------- */
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (buf) => { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function zip(files) { // files: [[name, string|Buffer]]
  const parts = [], central = []; let offset = 0;
  for (const [name, data] of files) {
    const nameB = Buffer.from(name), raw = Buffer.isBuffer(data) ? data : Buffer.from(data), def = zlib.deflateRawSync(raw), useDef = def.length < raw.length, body = useDef ? def : raw, crc = crc32(raw);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(useDef ? 8 : 0, 8); lh.writeUInt16LE(0, 10); lh.writeUInt16LE(0x21, 12); lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(body.length, 18); lh.writeUInt32LE(raw.length, 22); lh.writeUInt16LE(nameB.length, 26);
    parts.push(lh, nameB, body);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8); ch.writeUInt16LE(useDef ? 8 : 0, 10); ch.writeUInt16LE(0, 12); ch.writeUInt16LE(0x21, 14); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(body.length, 20); ch.writeUInt32LE(raw.length, 24); ch.writeUInt16LE(nameB.length, 28); ch.writeUInt32LE(offset, 42);
    central.push(ch, nameB); offset += 30 + nameB.length + body.length;
  }
  const cd = Buffer.concat(central), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, cd, end]);
}

/* ---------- CSV ---------- */
const csvCell = (v) => { let s = String(v); if (/^[=+\-@]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s; /* a formula typed by someone else must not run when opened */ return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
function toCsv(blocks) {
  const tables = blocks.filter((b) => b.table); if (!tables.length) { const lines = blocks.flatMap((b) => (b.ul ? b.ul : b.p ? [b.p] : b.text ? [b.text] : [])); return '﻿' + 'Text\r\n' + lines.map(csvCell).join('\r\n') + '\r\n'; }
  return '﻿' + tables.map((t) => [t.table.head, ...t.table.rows].map((r) => r.map(csvCell).join(',')).join('\r\n')).join('\r\n\r\n') + '\r\n';
}

/* ---------- Excel ---------- */
const colName = (n) => { let s = ''; for (n++; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };
function sheetXml(head, rows) {
  const all = [head, ...rows], width = head.map((_, c) => Math.min(60, Math.max(8, ...all.map((r) => String(r[c] || '').length)) + 2));
  const cell = (v, r, c, bold) => { const ref = colName(c) + (r + 1), s = String(v === undefined ? '' : v), num = /^-?\d{1,15}(\.\d+)?$/.test(s) && !/^0\d/.test(s); return num && !bold ? `<c r="${ref}"><v>${s}</v></c>` : `<c r="${ref}" t="inlineStr"${bold ? ' s="1"' : ''}><is><t xml:space="preserve">${x(s)}</t></is></c>`; };
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${width.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols><sheetData>${all.map((r, ri) => `<row r="${ri + 1}">${head.map((_, ci) => cell(r[ci], ri, ci, ri === 0)).join('')}</row>`).join('')}</sheetData></worksheet>`;
}
function toXlsx(blocks, title) {
  let sheets = [], last = 'Sheet';
  for (const b of blocks) { if (b.h) last = b.text; if (b.table) sheets.push({ name: last, head: b.table.head, rows: b.table.rows }); }
  if (!sheets.length) sheets = [{ name: title || 'Report', head: ['Text'], rows: blocks.flatMap((b) => (b.ul ? b.ul : b.p ? [b.p] : b.text ? [b.text] : [])).map((t) => [t]) }];
  const used = new Set(); sheets = sheets.slice(0, 20).map((s, i) => { let n = String(s.name).replace(/[\\/?*\[\]:]/g, ' ').trim().slice(0, 28) || 'Sheet ' + (i + 1); while (used.has(n.toLowerCase())) n = n.slice(0, 25) + ' ' + (i + 1); used.add(n.toLowerCase()); return { ...s, name: n }; });
  const files = [
    ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`],
    ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
    ['xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${x(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
    ['xl/styles.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF2F5597"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>'],
    ...sheets.map((s, i) => [`xl/worksheets/sheet${i + 1}.xml`, sheetXml(s.head, s.rows)]),
  ];
  return zip(files);
}

/* ---------- PowerPoint ---------- */
const NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
const EMU = 914400, W = 12192000, H = 6858000;
const para = (t, sz, o = {}) => `<a:p>${o.bullet ? '<a:pPr marL="285750" indent="-285750"><a:buFont typeface="Arial"/><a:buChar char="&#8226;"/></a:pPr>' : ''}<a:r><a:rPr lang="en-US" sz="${sz}"${o.b ? ' b="1"' : ''} dirty="0"><a:solidFill><a:srgbClr val="${o.color || '1F2937'}"/></a:solidFill></a:rPr><a:t>${x(t)}</a:t></a:r></a:p>`;
const textBox = (id, name, ex, ey, cx, cy, paras) => `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${x(name)}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${ex}" y="${ey}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr><p:txBody><a:bodyPr wrap="square" rtlCol="0"><a:normAutofit/></a:bodyPr><a:lstStyle/>${paras}</p:txBody></p:sp>`;
const rect = (id, ex, ey, cx, cy, fill) => `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Band ${id}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${ex}" y="${ey}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="${fill}"/></a:solidFill><a:ln><a:noFill/></a:ln></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang="en-US"/></a:p></p:txBody></p:sp>`;
function tableFrame(id, ex, ey, cx, head, rows) {
  const colW = Math.floor(cx / head.length), rowH = 420000, cell = (t, hdr) => `<a:tc><a:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" sz="1300"${hdr ? ' b="1"' : ''} dirty="0"><a:solidFill><a:srgbClr val="${hdr ? 'FFFFFF' : '1F2937'}"/></a:solidFill></a:rPr><a:t>${x(String(t).slice(0, 60))}</a:t></a:r></a:p></a:txBody><a:tcPr><a:solidFill><a:srgbClr val="${hdr ? '2F5597' : 'F3F5F8'}"/></a:solidFill></a:tcPr></a:tc>`;
  return `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="${id}" name="Table ${id}"/><p:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></p:cNvGraphicFramePr><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="${ex}" y="${ey}"/><a:ext cx="${colW * head.length}" cy="${rowH * (rows.length + 1)}"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblPr firstRow="1" bandRow="1"/><a:tblGrid>${head.map(() => `<a:gridCol w="${colW}"/>`).join('')}</a:tblGrid><a:tr h="${rowH}">${head.map((h) => cell(h, true)).join('')}</a:tr>${rows.map((r) => `<a:tr h="${rowH}">${head.map((_, c) => cell(r[c] === undefined ? '' : r[c], false)).join('')}</a:tr>`).join('')}</a:tbl></a:graphicData></a:graphic></p:graphicFrame>`;
}
const slideXml = (shapes) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld ${NS}><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>${shapes}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
/** Slides: a title slide, then one slide per section (bullets), and a table slide for every table (long tables continue on the next slide). */
function slidesOf(blocks, title) {
  const slides = [{ kind: 'title', title, sub: new Date().toLocaleDateString([], { dateStyle: 'long' }) }]; let cur = null;
  const flush = () => { if (cur && (cur.bullets.length)) slides.push(cur); cur = null; };
  for (const b of blocks) {
    if (b.h === 1 && b.text === title) continue;
    if (b.h) { flush(); cur = { kind: 'bullets', title: b.text, bullets: [] }; continue; }
    if (!cur) cur = { kind: 'bullets', title: slides.length === 1 ? 'Summary' : 'Notes', bullets: [] };
    if (b.p) cur.bullets.push(b.p); if (b.ul) cur.bullets.push(...b.ul);
    if (b.table) { const t = cur.title; flush(); for (let i = 0; i < Math.max(1, b.table.rows.length); i += 8) slides.push({ kind: 'table', title: i ? t + ' (continued)' : (t === 'Summary' || t === 'Notes' ? 'Details' : t), head: b.table.head.slice(0, 7), rows: b.table.rows.slice(i, i + 8).map((r) => r.slice(0, 7)) }); cur = { kind: 'bullets', title: t, bullets: [] }; cur.skipIfEmpty = true; }
  }
  flush(); const out = []; for (const s of slides) { if (s.kind === 'bullets') for (let i = 0; i < s.bullets.length; i += 6) out.push({ ...s, title: i ? s.title + ' (continued)' : s.title, bullets: s.bullets.slice(i, i + 6) }); else out.push(s); }
  return out;
}
function toPptx(blocks, title) {
  const S = slidesOf(blocks, title || 'Report'), n = S.length;
  const shapes = (s) => {
    if (s.kind === 'title') return rect(2, 0, 0, W, H, '1F3A66') + rect(3, 640000, 3300000, 1400000, 60000, 'F5B301') + textBox(4, 'Title', 640000, 1700000, W - 1280000, 1500000, para(s.title, 4400, { b: 1, color: 'FFFFFF' })) + textBox(5, 'Subtitle', 640000, 3500000, W - 1280000, 600000, para(s.sub, 2000, { color: 'C9D6EE' }));
    const head = rect(2, 0, 0, W, 1000000, '1F3A66') + textBox(3, 'Title', 500000, 150000, W - 1000000, 750000, para(s.title, 3000, { b: 1, color: 'FFFFFF' }));
    if (s.kind === 'table') return head + tableFrame(4, 500000, 1300000, W - 1000000, s.head, s.rows);
    return head + textBox(4, 'Content', 600000, 1300000, W - 1200000, H - 1700000, s.bullets.map((t) => para(t, t.length > 140 ? 1800 : 2200, { bullet: 1 })).join(''));
  };
  const ct = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>' + S.map((_, i) => `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join('') + '</Types>';
  const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships', rels = (items) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${items.map(([id, t, tg]) => `<Relationship Id="${id}" Type="${REL}/${t}" Target="${tg}"/>`).join('')}</Relationships>`;
  const theme = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Tulai"><a:themeElements><a:clrScheme name="Tulai"><a:dk1><a:srgbClr val="1F2937"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="1F3A66"/></a:dk2><a:lt2><a:srgbClr val="F3F5F8"/></a:lt2><a:accent1><a:srgbClr val="2F5597"/></a:accent1><a:accent2><a:srgbClr val="F5B301"/></a:accent2><a:accent3><a:srgbClr val="3DDC97"/></a:accent3><a:accent4><a:srgbClr val="8B5CF6"/></a:accent4><a:accent5><a:srgbClr val="EC4899"/></a:accent5><a:accent6><a:srgbClr val="EF4444"/></a:accent6><a:hlink><a:srgbClr val="2F5597"/></a:hlink><a:folHlink><a:srgbClr val="6B7280"/></a:folHlink></a:clrScheme><a:fontScheme name="Tulai"><a:majorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="Tulai"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="12700"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="19050"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`;
  const master = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldMaster ${NS}><p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:effectLst/></p:bgPr></p:bg><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle><a:lvl1pPr><a:defRPr sz="3200"/></a:lvl1pPr></p:titleStyle><p:bodyStyle><a:lvl1pPr><a:defRPr sz="2000"/></a:lvl1pPr></p:bodyStyle><p:otherStyle><a:lvl1pPr><a:defRPr sz="1800"/></a:lvl1pPr></p:otherStyle></p:txStyles></p:sldMaster>`;
  const layout = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldLayout ${NS} type="blank" preserve="1"><p:cSld name="Blank"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`;
  const pres = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:presentation ${NS}><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>${S.map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 3}"/>`).join('')}</p:sldIdLst><p:sldSz cx="${W}" cy="${H}"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`;
  return zip([
    ['[Content_Types].xml', ct], ['_rels/.rels', rels([['rId1', 'officeDocument', 'ppt/presentation.xml']])],
    ['ppt/presentation.xml', pres], ['ppt/_rels/presentation.xml.rels', rels([['rId1', 'slideMaster', 'slideMasters/slideMaster1.xml'], ['rId2', 'theme', 'theme/theme1.xml'], ...S.map((_, i) => [`rId${i + 3}`, 'slide', `slides/slide${i + 1}.xml`])])],
    ['ppt/slideMasters/slideMaster1.xml', master], ['ppt/slideMasters/_rels/slideMaster1.xml.rels', rels([['rId1', 'slideLayout', '../slideLayouts/slideLayout1.xml'], ['rId2', 'theme', '../theme/theme1.xml']])],
    ['ppt/slideLayouts/slideLayout1.xml', layout], ['ppt/slideLayouts/_rels/slideLayout1.xml.rels', rels([['rId1', 'slideMaster', '../slideMasters/slideMaster1.xml']])],
    ['ppt/theme/theme1.xml', theme],
    ...S.flatMap((s, i) => [[`ppt/slides/slide${i + 1}.xml`, slideXml(shapes(s))], [`ppt/slides/_rels/slide${i + 1}.xml.rels`, rels([['rId1', 'slideLayout', '../slideLayouts/slideLayout1.xml']])]]),
  ]);
}

/* ---------- HTML and PDF ---------- */
const toHtml = (md, title) => require('./report-html').render(title, md);
async function toPdf(md, title, out) {
  let E; try { E = require('electron'); } catch {} if (!E || !E.BrowserWindow) throw new Error('PDF files can only be made inside the Tulai Bot app.');
  const win = new E.BrowserWindow({ show: false, width: 1000, height: 1400, webPreferences: { offscreen: false, sandbox: true, javascript: false } });
  try {
    await win.loadURL('data:text/html;charset=utf-8;base64,' + Buffer.from(toHtml(md, title)).toString('base64'));
    const pdf = await win.webContents.printToPDF({ printBackground: true, pageSize: 'A4', margins: { marginType: 'default' } }); fs.writeFileSync(out, pdf);
  } finally { try { win.destroy(); } catch {} }
}

/* ---------- the one entry point ---------- */
const KINDS = { csv: ['csv', 'CSV'], excel: ['xlsx', 'Excel'], xlsx: ['xlsx', 'Excel'], pdf: ['pdf', 'PDF'], powerpoint: ['pptx', 'PowerPoint'], pptx: ['pptx', 'PowerPoint'], slides: ['pptx', 'PowerPoint'], html: ['html', 'web page'], webpage: ['html', 'web page'] };
/** md: the text to turn into a file. kind: csv | excel | pdf | powerpoint | html. Returns { file, name, ext, label, preview }. */
async function exportAs(md, kind, name) {
  const k = KINDS[String(kind).toLowerCase()]; if (!k) throw new Error('I can make CSV, Excel, PDF, PowerPoint and web page files.');
  const blocks = parse(md); if (!blocks.length) throw new Error('There is nothing to put in a file yet.');
  const title = titleOf(blocks, name), [ext, label] = k; fs.mkdirSync(dir(), { recursive: true });
  const file = path.join(dir(), `${stamp()} ${safe(name || title)}.${ext}`);
  if (ext === 'csv') fs.writeFileSync(file, toCsv(blocks)); else if (ext === 'xlsx') fs.writeFileSync(file, toXlsx(blocks, title)); else if (ext === 'pptx') fs.writeFileSync(file, toPptx(blocks, title)); else if (ext === 'html') fs.writeFileSync(file, toHtml(md, title)); else await toPdf(md, title, file);
  const t = blocks.find((b) => b.table);
  const preview = ext === 'pptx' ? { type: 'slides', titles: slidesOf(blocks, title).map((s) => s.title) } : t && (ext === 'csv' || ext === 'xlsx') ? { type: 'table', head: t.table.head, rows: t.table.rows.slice(0, 8), more: Math.max(0, t.table.rows.length - 8) } : { type: ext };
  return { file, name: path.basename(file), ext, label, preview };
}
/* the last thing Tulai showed you, so "export that as Excel" knows what "that" is */
let lastContent = null;
const setLast = (md, name) => { if (String(md || '').trim().length > 20) lastContent = { md: String(md), name: name || '', at: Date.now() }; };
const getLast = () => lastContent;
module.exports = { setLast, getLast, parse, toCsv, toXlsx, toPptx, toHtml, toPdf, exportAs, zip, crc32, dir, KINDS, slidesOf };
