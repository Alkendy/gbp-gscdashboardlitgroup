/* XlsxLite — pembuat file Excel (.xlsx) ringan tanpa library luar.
   XlsxLite.build(sheets) → Uint8Array
   sheet = { name, header: [..], types: ['text'|'int'|'num'|'pct'], rows: [[..]], widths?: [..] }
   Sel dapat berupa nilai biasa atau { v, t } untuk tipe per sel. */
window.XlsxLite = (function () {
  const enc = new TextEncoder();
  const T = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; T[n] = c >>> 0; }
  const crc32 = (b) => { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = T[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  const u16 = (v) => [v & 255, (v >>> 8) & 255];
  const u32 = (v) => [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255];
  function zip(files) {
    const d = new Date();
    const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    const parts = [], central = [];
    let off = 0;
    for (const f of files) {
      const name = enc.encode(f.name), data = f.data, crc = crc32(data);
      const head = new Uint8Array([...u32(0x04034b50), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(time), ...u16(date),
        ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), ...u16(0)]);
      parts.push(head, name, data);
      central.push(new Uint8Array([...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(time), ...u16(date),
        ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
        ...u32(0), ...u32(off)]), name);
      off += head.length + name.length + data.length;
    }
    const csize = central.reduce((s, p) => s + p.length, 0);
    const end = new Uint8Array([...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length),
      ...u32(csize), ...u32(off), ...u16(0)]);
    const all = [...parts, ...central, end];
    const out = new Uint8Array(all.reduce((s, p) => s + p.length, 0));
    let i = 0;
    for (const p of all) { out.set(p, i); i += p.length; }
    return out;
  }
  const esc = (s) => String(s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const col = (i) => { let s = ''; i += 1; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
  const STYLE = { head: 1, int: 2, num: 3, pct: 4, text: 0 };
  function cell(ref, value, type) {
    if (value && typeof value === 'object' && 'v' in value) { type = value.t || type; value = value.v; }
    if (value == null || value === '' || (typeof value === 'number' && !isFinite(value))) return '';
    if (typeof value === 'number' && type !== 'text') return `<c r="${ref}" s="${STYLE[type] || STYLE.num}"><v>${value}</v></c>`;
    return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${esc(value)}</t></is></c>`;
  }
  function sheetXml(s) {
    const types = s.types || [];
    const rows = [s.header, ...s.rows];
    const widths = s.widths || s.header.map((h, i) => {
      let w = String(h).length;
      for (const r of s.rows.slice(0, 300)) { const v = r[i] && typeof r[i] === 'object' ? r[i].v : r[i]; w = Math.max(w, String(v == null ? '' : v).length); }
      return Math.min(60, Math.max(10, w + 2));
    });
    const cols = widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('');
    const body = rows.map((r, ri) => `<row r="${ri + 1}">` + r.map((v, ci) => ri === 0
      ? `<c r="${col(ci)}1" t="inlineStr" s="1"><is><t xml:space="preserve">${esc(v)}</t></is></c>`
      : cell(col(ci) + (ri + 1), v, types[ci] || 'text')).join('') + '</row>').join('');
    const last = col(Math.max(0, s.header.length - 1));
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
      `<cols>${cols}</cols><sheetData>${body}</sheetData>` +
      (s.rows.length ? `<autoFilter ref="A1:${last}${s.rows.length + 1}"/>` : '') + '</worksheet>';
  }
  function cleanName(n, used) {
    let s = String(n || 'Sheet').replace(/[\[\]:*?\/\\]/g, ' ').trim().slice(0, 31) || 'Sheet';
    let k = s, i = 2;
    while (used.has(k.toLowerCase())) { const suf = ' (' + i++ + ')'; k = s.slice(0, 31 - suf.length) + suf; }
    used.add(k.toLowerCase());
    return k;
  }
  function build(sheets) {
    const used = new Set();
    const list = sheets.filter(Boolean).map((s) => ({ ...s, name: cleanName(s.name, used) }));
    if (!list.length) throw new Error('Tidak ada data untuk diekspor');
    const files = [];
    const add = (name, text) => files.push({ name, data: enc.encode(text) });
    add('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      list.map((s, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') + '</Types>');
    add('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
    add('xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
      list.map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') + '</sheets>' +
      list.map((s, i) => s.rows.length ? `<definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${esc(s.name).replace(/'/g, "''")}'!$A$1:$${col(Math.max(0, s.header.length - 1))}$${s.rows.length + 1}</definedName></definedNames>` : '').join('').replace(/<\/definedNames><definedNames>/g, '') + '</workbook>');
    add('xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      list.map((s, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') +
      `<Relationship Id="rId${list.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
    add('xl/styles.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
      '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEFEDE8"/><bgColor indexed="64"/></patternFill></fill></fills>' +
      '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      '<cellXfs count="5"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
      '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>' +
      '<xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
      '<xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
      '<xf numFmtId="10" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs>' +
      '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>');
    list.forEach((s, i) => add(`xl/worksheets/sheet${i + 1}.xml`, sheetXml(s)));
    return zip(files);
  }
  /* Simpan file: lewat fitur unduhan Claude bila tersedia, selain itu unduhan biasa di browser. */
  async function save(bytes, filename) {
    if (window.claude && typeof window.claude.use === 'function') {
      const dl = await window.claude.use('downloads');
      if (!dl) throw Object.assign(new Error('Unduhan tidak tersedia di tampilan ini'), { code: 'unavailable' });
      return dl.save({ filename, data: bytes });
    }
    const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return { status: 'saved' };
  }
  return { build, save };
})();
