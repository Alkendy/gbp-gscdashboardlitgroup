/* Perhitungan & tampilan dashboard (sama dengan versi Claude). */
(function () {

dash.loader('gmb_monitoring', { description: 'Membaca file xlsx dari Google Drive dan mengubah sheet Monitoring GMB EVER, RUHEE, LAVERE menjadi baris: sheet, cabang, metrik, bulan, nilai.', fn: async ({ answer }) => {
  let a = answer;
  if (typeof a === 'string') { try { a = JSON.parse(a); } catch (e) { throw new Error(String(answer).slice(0, 300)); } }
  if (Array.isArray(a) && a[0] && typeof a[0].text === 'string') a = JSON.parse(a[0].text);
  if (!a || typeof a.content !== 'string') throw new Error('Google Drive answer had no file content: ' + Object.keys(a || {}).join(', '));
  const bin = atob(a.content);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const dv = new DataView(bytes.buffer);
  // read zip central directory
  let eocd = -1;
  for (let i = bytes.length - 22; i >= 0; i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('The spreadsheet export was not a valid xlsx file.');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const entries = {};
  for (let n = 0; n < count; n++) {
    const method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true);
    const nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
    const off = dv.getUint32(p + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nlen));
    entries[name] = { method, csize, off };
    p += 46 + nlen + xlen + clen;
  }
  const readEntry = async (name) => {
    const e = entries[name];
    if (!e) return null;
    const lnl = dv.getUint16(e.off + 26, true), lxl = dv.getUint16(e.off + 28, true);
    const data = bytes.subarray(e.off + 30 + lnl + lxl, e.off + 30 + lnl + lxl + e.csize);
    if (e.method === 0) return new TextDecoder().decode(data);
    const ds = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return await new Response(ds).text();
  };
  const unesc = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (m, d) => String.fromCharCode(+d)).replace(/&amp;/g, '&');
  const ssXml = (await readEntry('xl/sharedStrings.xml')) || '';
  const shared = [...ssXml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => unesc([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join('')));
  const wb = await readEntry('xl/workbook.xml');
  const rels = await readEntry('xl/_rels/workbook.xml.rels');
  const relMap = {};
  for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = /Id="([^"]+)"/.exec(m[0])[1], target = /Target="([^"]+)"/.exec(m[0])[1];
    relMap[id] = target.replace(/^\/?xl\//, '').replace(/^\//, '');
  }
  const sheetFiles = {};
  for (const m of wb.matchAll(/<sheet\b[^>]*>/g)) {
    const nm = unesc(/name="([^"]+)"/.exec(m[0])[1]);
    const rid = /r:id="([^"]+)"/.exec(m[0])[1];
    sheetFiles[nm.trim()] = 'xl/' + relMap[rid];
  }
  const colIdx = (ref) => { const L = /^[A-Z]+/.exec(ref)[0]; let n = 0; for (const c of L) n = n * 26 + c.charCodeAt(0) - 64; return n - 1; };
  const readSheet = async (file) => {
    const xml = await readEntry(file);
    const grid = [];
    for (const rm of xml.matchAll(/<row\b[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g)) {
      const r = +/r="(\d+)"/.exec(rm[0])[1] - 1;
      const row = [];
      for (const cm of (rm[1] || '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const attrs = cm[1], body = cm[2] || '';
        const ref = /r="([A-Z]+\d+)"/.exec(attrs)[1];
        const t = (/t="(\w+)"/.exec(attrs) || [])[1];
        const vm = /<v>([\s\S]*?)<\/v>/.exec(body);
        let v = null;
        if (t === 's') v = vm ? shared[+vm[1]] : null;
        else if (t === 'inlineStr') v = unesc([...body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1]).join(''));
        else if (t === 'str') v = vm ? unesc(vm[1]) : null;
        else if (t === 'e') v = null;
        else if (t === 'b') v = vm ? vm[1] === '1' : null;
        else v = vm ? Number(vm[1]) : null;
        row[colIdx(ref)] = v;
      }
      grid[r] = row;
    }
    return grid;
  };
  const MONTHS = { jan: 1, januari: 1, january: 1, feb: 2, februari: 2, february: 2, mar: 3, maret: 3, march: 3, apr: 4, april: 4, mei: 5, may: 5, jun: 6, juni: 6, june: 6, jul: 7, juli: 7, july: 7, agu: 8, agus: 8, agustus: 8, aug: 8, august: 8, sep: 9, sept: 9, september: 9, okt: 10, oktober: 10, oct: 10, october: 10, nov: 11, november: 11, des: 12, desember: 12, dec: 12, december: 12 };
  const monthKey = (s) => {
    const m = /^\s*([A-Za-z]+)\s+(\d{4})\s*$/.exec(String(s || ''));
    if (!m || !MONTHS[m[1].toLowerCase()]) return null;
    return m[2] + '-' + String(MONTHS[m[1].toLowerCase()]).padStart(2, '0');
  };
  const METRICS = { '# review': 'reviews', 'campaign redeem': 'redeem', rating: 'rating', traffic: 'traffic', directions: 'directions', call: 'calls', 'chat whatsapp': 'chats', 'webiste click': 'web', 'website click': 'web' };
  const num = (v) => {
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    if (typeof v === 'string') { const s = v.trim().replace(',', '.'); if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s); }
    return null;
  };
  const rows = [];
  for (const sheet of ['EVER', 'RUHEE', 'LAVERE']) {
    const file = sheetFiles['Monitoring GMB ' + sheet];
    if (!file) throw new Error('Sheet "Monitoring GMB ' + sheet + '" not found in the spreadsheet.');
    const grid = await readSheet(file);
    const hi = grid.findIndex((r) => r && r[0] === 'Column 1');
    if (hi < 0) throw new Error('Header row ("Column 1") not found in Monitoring GMB ' + sheet + '.');
    const branches = [];
    for (let c = 2; c < grid[hi].length; c++) {
      const h = String(grid[hi][c] ?? '').trim();
      if (/^kpi/i.test(h)) break;
      if (h) branches.push([c, h]);
    }
    let metric = null;
    for (let r = hi + 1; r < grid.length; r++) {
      const row = grid[r];
      if (!row) continue;
      const label = String(row[0] ?? '').trim().toLowerCase();
      if (label && METRICS[label]) metric = METRICS[label];
      const month = monthKey(row[1]);
      if (!metric || !month) continue;
      for (const [c, branch] of branches) {
        const v = num(row[c]);
        if (v !== null) rows.push({ sheet, branch, metric, month, value: v });
      }
    }
  }
  return { columns: ['sheet', 'branch', 'metric', 'month', 'value'], rows };
} });
dash.loader('reviews', { description: 'Membaca CSV sheet Review G-Business dan mengubahnya menjadi baris per outlet, bulan dan minggu (positif, negatif).', fn: ({ answer }) => {
  let a = answer;
  if (typeof a === 'string') { try { a = JSON.parse(a); } catch (e) { throw new Error(String(answer).slice(0, 300)); } }
  if (Array.isArray(a) && a[0] && typeof a[0].text === 'string') a = JSON.parse(a[0].text);
  if (!a || typeof a.content !== 'string') throw new Error('Google Drive answer had no file content: ' + Object.keys(a || {}).join(', '));
  const bin = atob(a.content);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const text = new TextDecoder().decode(bytes);
  const grid = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n') { row.push(cell); grid.push(row); row = []; cell = ''; }
    else if (ch !== '\r') cell += ch;
  }
  if (cell || row.length) { row.push(cell); grid.push(row); }
  const MONTHS = { januari: 1, january: 1, februari: 2, february: 2, maret: 3, march: 3, april: 4, mei: 5, may: 5, juni: 6, june: 6, juli: 7, july: 7, agustus: 8, august: 8, september: 9, oktober: 10, october: 10, november: 11, desember: 12, december: 12 };
  const monthKey = (s) => {
    const m = /^\s*([A-Za-z]+)\s+(\d{4})\s*$/.exec(String(s || ''));
    if (!m || !MONTHS[m[1].toLowerCase()]) return null;
    return m[2] + '-' + String(MONTHS[m[1].toLowerCase()]).padStart(2, '0');
  };
  const top = grid[0] || [], sub = grid[1] || [];
  // find month blocks: each starts at a "WEEK 1 (P)" column and ends at its "Positif" column
  const blocks = [];
  for (let c = 0; c < sub.length; c++) {
    if (/^WEEK 1 \(P\)$/i.test(sub[c].trim())) {
      let end = c;
      while (end < sub.length && !/^positif$/i.test(sub[end].trim())) end++;
      let month = null;
      for (let k = c; k <= end && !month; k++) month = monthKey(top[k]);
      const weeks = [];
      for (let k = c; k < end; k++) {
        const m = /^WEEK (\d) \(([PN])\)$/i.exec(sub[k].trim());
        if (m) weeks.push([k, +m[1], m[2].toUpperCase()]);
      }
      if (month) blocks.push({ month, weeks });
      c = end;
    }
  }
  if (!blocks.length) throw new Error('No monthly WEEK columns found in the Review G-Business sheet.');
  const out = [];
  for (let r = 2; r < grid.length; r++) {
    const outlet = String(grid[r][0] ?? '').trim();
    if (!outlet) continue;
    for (const b of blocks) {
      const byWeek = {};
      for (const [k, w, pn] of b.weeks) {
        const s = String(grid[r][k] ?? '').trim();
        if (s === '' || !/^-?\d+(\.\d+)?$/.test(s)) continue;
        byWeek[w] = byWeek[w] || { positive: 0, negative: 0 };
        byWeek[w][pn === 'P' ? 'positive' : 'negative'] = Number(s);
      }
      for (const w of Object.keys(byWeek)) out.push({ outlet, month: b.month, week: Number(w), positive: byWeek[w].positive, negative: byWeek[w].negative });
    }
  }
  return { columns: ['outlet', 'month', 'week', 'positive', 'negative'], rows: out };
} });
dash.loader('gsc', { description: 'Mencari semua export Search Console di folder, mengunduh tiap file xlsx, lalu membaca sheet Chart/Dates (harian), Queries, Pages, Devices dan Countries menjadi satu tabel.', fn: async ({ answer, call, args }) => {
  const parse = (a) => {
    if (typeof a === 'string') { try { a = JSON.parse(a); } catch (e) { throw new Error(String(a).slice(0, 300)); } }
    if (Array.isArray(a) && a[0] && typeof a[0].text === 'string') a = JSON.parse(a[0].text);
    return a;
  };
  const DOMAINS = [['ruheediary.com', 'Ruheediary'], ['ruhee.id', 'Ruhee'], ['laverelash.com', 'Lavere'], ['ever.co.id', 'Ever']];
  // 1. list every export in the folder (all pages)
  let page = parse(answer);
  const files = [...(page.files || [])];
  let guard = 0;
  while (page.nextPageToken && guard++ < 20) {
    page = parse(await call('search_files', { ...args, pageToken: page.nextPageToken }));
    files.push(...(page.files || []));
  }
  const unesc = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (m, d) => String.fromCharCode(+d)).replace(/&amp;/g, '&');
  const colIdx = (ref) => { let n = 0; for (const c of /^[A-Z]+/.exec(ref)[0]) n = n * 26 + c.charCodeAt(0) - 64; return n - 1; };
  const readXlsx = async (b64) => {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const dv = new DataView(bytes.buffer);
    let eocd = -1;
    for (let i = bytes.length - 22; i >= 0; i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error('not an xlsx file');
    const entries = {};
    let p = dv.getUint32(eocd + 16, true);
    for (let n = 0, count = dv.getUint16(eocd + 10, true); n < count; n++) {
      const nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
      entries[new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nlen))] = { method: dv.getUint16(p + 10, true), csize: dv.getUint32(p + 20, true), off: dv.getUint32(p + 42, true) };
      p += 46 + nlen + xlen + clen;
    }
    const entry = async (name) => {
      const e = entries[name];
      if (!e) return null;
      const start = e.off + 30 + dv.getUint16(e.off + 26, true) + dv.getUint16(e.off + 28, true);
      const data = bytes.subarray(start, start + e.csize);
      if (e.method === 0) return new TextDecoder().decode(data);
      return await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text();
    };
    const shared = [...((await entry('xl/sharedStrings.xml')) || '').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => unesc([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join('')));
    const rels = {};
    for (const m of ((await entry('xl/_rels/workbook.xml.rels')) || '').matchAll(/<Relationship\b[^>]*>/g)) rels[/Id="([^"]+)"/.exec(m[0])[1]] = /Target="([^"]+)"/.exec(m[0])[1].replace(/^\/?xl\//, '');
    const sheets = {};
    for (const m of ((await entry('xl/workbook.xml')) || '').matchAll(/<sheet\b[^>]*>/g)) {
      const xml = await entry('xl/' + rels[/r:id="([^"]+)"/.exec(m[0])[1]]);
      const grid = [];
      for (const rm of (xml || '').matchAll(/<row\b[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g)) {
        const row = [];
        for (const cm of (rm[1] || '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
          const t = (/t="(\w+)"/.exec(cm[1]) || [])[1], body = cm[2] || '', vm = /<v>([\s\S]*?)<\/v>/.exec(body);
          let v = null;
          if (t === 's') v = vm ? shared[+vm[1]] : null;
          else if (t === 'inlineStr') v = unesc([...body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1]).join(''));
          else if (t === 'str') v = vm ? unesc(vm[1]) : null;
          else if (t !== 'e' && vm) v = Number(vm[1]);
          row[colIdx(/r="([A-Z]+)\d+"/.exec(cm[1])[1])] = v;
        }
        grid.push(row);
      }
      sheets[unesc(/name="([^"]+)"/.exec(m[0])[1]).trim().toLowerCase()] = grid;
    }
    return sheets;
  };
  const num = (v) => (typeof v === 'number' ? v : v == null ? null : Number(String(v).replace('%', '').replace(',', '.')) / (String(v).includes('%') ? 100 : 1));
  const day = (v) => {
    if (typeof v === 'number') return new Date(Date.UTC(1899, 11, 30) + v * 86400000).toISOString().slice(0, 10);
    const s = String(v || '').trim();
    return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
  };
  const LIMIT = 200;
  const rows = [];
  const skipped = [];
  let cut = false;
  for (const f of files.sort((a, b) => String(a.modifiedTime).localeCompare(String(b.modifiedTime)))) {
    const name = String(f.title || '').toLowerCase();
    const hit = DOMAINS.find(([d]) => name.includes(d));
    if (!hit) { skipped.push(f.title); continue; }
    const isSheet = f.mimeType === 'application/vnd.google-apps.spreadsheet';
    const dl = parse(await call('download_file_content', isSheet ? { fileId: f.id, exportMimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' } : { fileId: f.id }));
    if (!dl || typeof dl.content !== 'string') { skipped.push(f.title); continue; }
    let sh;
    try { sh = await readXlsx(dl.content); } catch (e) { skipped.push(f.title); continue; }
    const base = { brand: hit[1], domain: hit[0], file: f.title };
    const daily = (sh['chart'] || sh['dates'] || []).slice(1).map((r) => ({ d: day(r[0]), c: num(r[1]), i: num(r[2]), ctr: num(r[3]), p: num(r[4]) })).filter((r) => r.d);
    if (!daily.length) { skipped.push(f.title); continue; }
    const start = daily.map((r) => r.d).sort()[0], end = daily.map((r) => r.d).sort().pop();
    for (const r of daily) rows.push({ ...base, start, end, type: 'day', key: r.d, clicks: r.c, impressions: r.i, ctr: r.ctr, position: r.p });
    for (const [sheet, type, limit] of [['queries', 'query', LIMIT], ['pages', 'page', LIMIT], ['devices', 'device', 10], ['countries', 'country', 15]]) {
      const g = (sh[sheet] || []).slice(1).filter((r) => r && r[0] != null);
      if (g.length > limit) cut = true;
      for (const r of g.slice(0, limit)) rows.push({ ...base, start, end, type, key: String(r[0]), clicks: num(r[1]), impressions: num(r[2]), ctr: num(r[3]), position: num(r[4]) });
    }
  }
  if (!rows.length) throw new Error('No Search Console exports could be read from the folder. Files found: ' + files.length);
  return {
    columns: ['brand', 'domain', 'file', 'start', 'end', 'type', 'key', 'clicks', 'impressions', 'ctr', 'position'],
    rows,
    cut,
    meta: [{ label: 'Files read', value: String(files.length - skipped.length) }, { label: 'Files skipped', value: skipped.join(', ') || '—' }, { label: 'Rows per file', value: 'Queries and pages: top ' + LIMIT + ' by clicks (export order); devices; top 15 countries; every day' }],
  };
} });

dash.calc('perf', { inputs: ['gmb_monitoring', 'branches'], title: 'Performa GBP per periode', description: 'Per cabang, brand dan semua cabang: jumlah traffic, directions, call, chat, website, redeem dan review baru per bulan/kuartal/tahun/semua; total review dan rating terakhir; perubahan dari periode sebelumnya.', fn: (gmb_monitoring, branches) => {
  const info = new Map(branches.map((b) => [b.key, b]));
  const SUMS = ['traffic', 'directions', 'calls', 'chats', 'web', 'redeem', 'reviews_new'];
  const periodOf = (m, g) => (g === 'month' ? m : g === 'quarter' ? m.slice(0, 4) + '-Q' + Math.ceil(+m.slice(5) / 3) : g === 'year' ? m.slice(0, 4) : 'all');
  const prevMonth = (m) => new Date(Date.UTC(+m.slice(0, 4), +m.slice(5) - 2, 1)).toISOString().slice(0, 7);
  const series = {};
  for (const r of gmb_monitoring) ((series[r.sheet + '|' + r.branch] ??= {})[r.metric] ??= {})[r.month] = Number(r.value);
  const months = [...new Set(gmb_monitoring.map((r) => r.month))].sort();
  const rows = [];
  for (const [key, s] of Object.entries(series)) {
    const b = info.get(key) || { brand: 'Lainnya', label: key };
    for (const gran of ['month', 'quarter', 'year', 'all']) {
      const periods = [...new Set(months.map((m) => periodOf(m, gran)))];
      for (const period of periods) {
        const ms = months.filter((m) => periodOf(m, gran) === period);
        const row = { scope: key, level: 'cabang', brand: b.brand, label: b.label, maps_url: b.maps_url ?? null, gran, period };
        for (const f of ['traffic', 'directions', 'calls', 'chats', 'web', 'redeem']) {
          const vals = ms.map((m) => s[f]?.[m]).filter((v) => v != null);
          row[f] = vals.length ? vals.reduce((a, v) => a + v, 0) : null;
        }
        const diffs = ms.filter((m) => s.reviews?.[m] != null && s.reviews?.[prevMonth(m)] != null).map((m) => s.reviews[m] - s.reviews[prevMonth(m)]);
        row.reviews_new = diffs.length ? diffs.reduce((a, v) => a + v, 0) : null;
        const last = (f) => { const v = ms.map((m) => s[f]?.[m]).filter((v) => v != null); return v.length ? v[v.length - 1] : null; };
        row.reviews_total = last('reviews');
        row.rating = last('rating');
        row.months = ms.filter((m) => s.traffic?.[m] != null).length;
        rows.push(row);
      }
    }
  }
  const groups = new Map();
  for (const r of rows) for (const scope of ['Semua', r.brand]) {
    const id = scope + '\u0000' + r.gran + '\u0000' + r.period;
    if (!groups.has(id)) groups.set(id, { scope, level: scope === 'Semua' ? 'grup' : 'brand', brand: scope, label: scope === 'Semua' ? 'Semua cabang' : 'Semua ' + scope, maps_url: null, gran: r.gran, period: r.period, list: [] });
    groups.get(id).list.push(r);
  }
  for (const g of groups.values()) {
    const row = { ...g };
    delete row.list;
    for (const f of [...SUMS, 'reviews_total']) {
      const v = g.list.map((r) => r[f]).filter((v) => v != null);
      row[f] = v.length ? v.reduce((a, x) => a + x, 0) : null;
    }
    const ratings = g.list.map((r) => r.rating).filter((v) => v != null);
    row.rating = ratings.length ? Math.round((ratings.reduce((a, x) => a + x, 0) / ratings.length) * 100) / 100 : null;
    row.months = Math.max(...g.list.map((r) => r.months));
    rows.push(row);
  }
  const order = {};
  for (const gran of ['month', 'quarter', 'year', 'all']) order[gran] = [...new Set(rows.filter((r) => r.gran === gran).map((r) => r.period))].sort();
  const byId = new Map(rows.map((r) => [r.scope + '\u0000' + r.gran + '\u0000' + r.period, r]));
  for (const r of rows) {
    const i = order[r.gran].indexOf(r.period);
    const prev = i > 0 ? byId.get(r.scope + '\u0000' + r.gran + '\u0000' + order[r.gran][i - 1]) : null;
    r.prev_period = i > 0 ? order[r.gran][i - 1] : null;
    for (const f of [...SUMS, 'reviews_total']) r[f + '_chg'] = prev && prev[f] && r[f] != null ? Math.round(((r[f] - prev[f]) / Math.abs(prev[f])) * 1000) / 1000 : null;
    r.rating_chg = prev && prev.rating != null && r.rating != null ? Math.round((r.rating - prev.rating) * 100) / 100 : null;
  }
  return rows;
} });
dash.calc('rev', { inputs: ['reviews', 'branches'], title: 'Review positif/negatif per periode', description: 'Jumlah review positif dan negatif per cabang, brand dan semua cabang, per minggu, bulan, kuartal dan tahun, dengan persentase positif.', fn: (reviews, branches) => {
  const matchers = branches.filter((b) => b.review_match).map((b) => ({ b, parts: b.review_match.split(' + ') }));
  const find = (outlet) => { const o = outlet.toLowerCase(); return matchers.find((x) => x.parts.every((p) => o.includes(p)))?.b; };
  const acc = new Map();
  for (const r of reviews) {
    const b = find(r.outlet);
    const m = r.month;
    const periods = { week: m + '-W' + r.week, month: m, quarter: m.slice(0, 4) + '-Q' + Math.ceil(+m.slice(5) / 3), year: m.slice(0, 4) };
    const scopes = ['Semua'].concat(b ? [b.brand, b.key] : []);
    for (const scope of scopes) for (const [gran, period] of Object.entries(periods)) {
      const id = scope + '\u0000' + gran + '\u0000' + period;
      if (!acc.has(id)) acc.set(id, { scope, gran, period, positive: 0, negative: 0 });
      const a = acc.get(id);
      a.positive += Number(r.positive) || 0;
      a.negative += Number(r.negative) || 0;
    }
  }
  return [...acc.values()].map((a) => ({ ...a, total: a.positive + a.negative, positive_share: a.positive + a.negative ? Math.round((a.positive / (a.positive + a.negative)) * 1000) / 1000 : null }));
} });
dash.calc('gsc_perf', { inputs: ['gsc'], title: 'Performa website per periode', description: 'Klik dan impresi dijumlahkan dari data harian per brand dan gabungan; CTR = klik ÷ impresi; posisi rata-rata tertimbang impresi; perubahan dari periode sebelumnya.', fn: (gsc) => {
  const days = new Map();
  for (const r of gsc) if (r.type === 'day') days.set(r.brand + '|' + r.key, r);
  const periodOf = (d, g) => (g === 'month' ? d.slice(0, 7) : g === 'quarter' ? d.slice(0, 4) + '-Q' + Math.ceil(+d.slice(5, 7) / 3) : g === 'year' ? d.slice(0, 4) : 'all');
  const acc = new Map();
  for (const r of days.values()) for (const scope of ['Semua', r.brand]) for (const gran of ['month', 'quarter', 'year', 'all']) {
    const period = periodOf(r.key, gran), id = scope + '|' + gran + '|' + period;
    if (!acc.has(id)) acc.set(id, { scope, gran, period, clicks: 0, impressions: 0, posw: 0, days: new Set(), first: r.key, last: r.key });
    const a = acc.get(id);
    a.clicks += r.clicks || 0; a.impressions += r.impressions || 0; a.posw += (r.position || 0) * (r.impressions || 0); a.days.add(r.key);
    if (r.key < a.first) a.first = r.key; if (r.key > a.last) a.last = r.key;
  }
  const rows = [...acc.values()].map((a) => ({ scope: a.scope, gran: a.gran, period: a.period, clicks: a.clicks, impressions: a.impressions, ctr: a.impressions ? Math.round((a.clicks / a.impressions) * 10000) / 10000 : null, position: a.impressions ? Math.round((a.posw / a.impressions) * 100) / 100 : null, days: a.days.size, first_day: a.first, last_day: a.last }));
  const order = {};
  for (const r of rows) (order[r.gran + '|' + r.scope] ??= []).push(r);
  for (const list of Object.values(order)) {
    list.sort((a, b) => a.period.localeCompare(b.period));
    list.forEach((r, i) => {
      const p = list[i - 1];
      r.prev_period = p ? p.period : null;
      for (const f of ['clicks', 'impressions', 'ctr']) r[f + '_chg'] = p && p[f] ? Math.round(((r[f] - p[f]) / p[f]) * 1000) / 1000 : null;
      r.position_chg = p && p.position != null && r.position != null ? Math.round((r.position - p.position) * 100) / 100 : null;
    });
  }
  return rows;
} });
dash.calc('gsc_kw', { inputs: ['gsc'], title: 'Top keyword per periode export', description: 'Klik, impresi, CTR dan posisi tiap keyword per brand untuk setiap periode export, plus gabungan semua periode.', fn: (gsc) => {
  const type = 'query';
  const acc = new Map();
  for (const r of gsc) {
    if (r.type !== type) continue;
    for (const period of [r.start + '_' + r.end, 'all']) {
      const id = r.brand + '|' + period + '|' + r.key;
      if (!acc.has(id)) acc.set(id, { brand: r.brand, period, key: r.key, clicks: 0, impressions: 0, posw: 0 });
      const a = acc.get(id);
      a.clicks += r.clicks || 0; a.impressions += r.impressions || 0; a.posw += (r.position || 0) * (r.impressions || 0);
    }
  }
  return [...acc.values()].map((a) => ({ brand: a.brand, period: a.period, key: a.key, clicks: a.clicks, impressions: a.impressions, ctr: a.impressions ? Math.round((a.clicks / a.impressions) * 10000) / 10000 : null, position: a.impressions ? Math.round((a.posw / a.impressions) * 100) / 100 : null }));
} });
dash.calc('gsc_pages', { inputs: ['gsc'], title: 'Top halaman per periode export', description: 'Klik, impresi, CTR dan posisi tiap halaman per brand untuk setiap periode export, plus gabungan semua periode.', fn: (gsc) => {
  const type = 'page';
  const acc = new Map();
  for (const r of gsc) {
    if (r.type !== type) continue;
    for (const period of [r.start + '_' + r.end, 'all']) {
      const id = r.brand + '|' + period + '|' + r.key;
      if (!acc.has(id)) acc.set(id, { brand: r.brand, period, key: r.key, clicks: 0, impressions: 0, posw: 0 });
      const a = acc.get(id);
      a.clicks += r.clicks || 0; a.impressions += r.impressions || 0; a.posw += (r.position || 0) * (r.impressions || 0);
    }
  }
  return [...acc.values()].map((a) => ({ brand: a.brand, period: a.period, key: a.key, clicks: a.clicks, impressions: a.impressions, ctr: a.impressions ? Math.round((a.clicks / a.impressions) * 10000) / 10000 : null, position: a.impressions ? Math.round((a.posw / a.impressions) * 100) / 100 : null }));
} });
dash.calc('gsc_audit', { inputs: ['gsc', 'gsc_perf'], title: 'Audit SEO otomatis', description: 'Pemeriksaan per brand dari export terbaru: tren klik & posisi, CTR, ketergantungan brand, peluang CTR, keyword posisi 8–20, halaman CTR rendah, variasi URL, porsi mobile.', fn: (gsc, gsc_perf) => {
  const BRAND_TERMS = { Ever: ['ever', 'everlash', 'everbody', 'everhouse', 'evernails'], Ruhee: ['ruhee'], Lavere: ['lavere', 'laverelash'], Ruheediary: ['ruhee', 'ruheediary'] };
  const pct = (v) => (v * 100).toFixed(1).replace('.', ',') + '%';
  const n = (v) => Math.round(v).toLocaleString('id-ID');
  const BL = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const fm = (p) => BL[+p.slice(5, 7) - 1] + ' ' + p.slice(0, 4);
  const out = [];
  for (const brand of Object.keys(BRAND_TERMS)) {
    const mine = gsc.filter((r) => r.brand === brand);
    if (!mine.length) continue;
    const lastEnd = mine.map((r) => r.end).sort().pop();
    const latest = mine.filter((r) => r.end === lastEnd);
    const label = latest[0].start + '_' + latest[0].end;
    const LABEL = { ok: 'Baik', warn: 'Perlu perhatian', bad: 'Kritis' };
    const add = (check, level, finding, examples) => out.push({ brand, check, level, status: LABEL[level], finding, examples: examples || '—', period: label });
    const months = gsc_perf.filter((r) => r.scope === brand && r.gran === 'month' && r.days >= 25).sort((a, b) => a.period.localeCompare(b.period));
    const cur = months[months.length - 1], prev = months[months.length - 2];
    if (cur && prev) {
      const ch = (cur.clicks - prev.clicks) / (prev.clicks || 1);
      add('Tren klik', ch < -0.1 ? 'bad' : ch < 0 ? 'warn' : 'ok', 'Klik ' + fm(cur.period) + ': ' + n(cur.clicks) + ' (' + (ch >= 0 ? '+' : '') + pct(ch) + ' vs ' + fm(prev.period) + ').');
      const dp = cur.position - prev.position;
      add('Posisi rata-rata', dp > 0.5 ? 'bad' : dp > 0 ? 'warn' : 'ok', 'Posisi ' + cur.position.toFixed(1).replace('.', ',') + ' (' + (dp > 0 ? 'turun ' : 'naik ') + Math.abs(dp).toFixed(1).replace('.', ',') + ' peringkat vs bulan sebelumnya; angka lebih kecil lebih baik).');
      add('CTR keseluruhan', cur.ctr < 0.01 ? 'bad' : cur.ctr < 0.02 ? 'warn' : 'ok', 'CTR ' + pct(cur.ctr) + ' dari ' + n(cur.impressions) + ' impresi. Di bawah 2% biasanya berarti judul & meta description kurang menarik atau trafik didominasi kata kunci informasional.');
    }
    const q = latest.filter((r) => r.type === 'query');
    const qClicks = q.reduce((a, r) => a + r.clicks, 0) || 1;
    const branded = q.filter((r) => BRAND_TERMS[brand].some((t) => r.key.toLowerCase().split(/\s+/).some((w) => w.startsWith(t))));
    const bShare = branded.reduce((a, r) => a + r.clicks, 0) / qClicks;
    add('Brand vs non-brand', bShare > 0.7 ? 'warn' : 'ok', pct(bShare) + ' klik (dari top keyword) berasal dari pencarian nama brand. ' + (bShare > 0.7 ? 'Trafik masih bergantung pada orang yang sudah kenal brand; perlu konten untuk kata kunci layanan & lokasi.' : 'Kata kunci non-brand sudah ikut mendatangkan pengunjung baru.'));
    const ctrGap = q.filter((r) => r.position <= 5 && r.impressions >= 100 && r.ctr < 0.02).sort((a, b) => b.impressions - a.impressions);
    add('Peluang CTR (sudah top 5, jarang diklik)', ctrGap.length > 5 ? 'warn' : 'ok', ctrGap.length + ' kata kunci sudah di posisi 1–5 dengan ≥100 impresi tetapi CTR di bawah 2%. Perbaiki judul/meta description halamannya.', ctrGap.slice(0, 4).map((r) => r.key + ' (' + n(r.impressions) + ' impr, ' + pct(r.ctr) + ')').join(' · '));
    const strike = q.filter((r) => r.position > 7 && r.position <= 20 && r.impressions >= 100).sort((a, b) => b.impressions - a.impressions);
    add('Hampir halaman 1 (posisi 8–20)', strike.length ? 'warn' : 'ok', strike.length + ' kata kunci punya ≥100 impresi di posisi 8–20. Sedikit optimasi (internal link, konten lebih lengkap) bisa membawanya ke halaman 1.', strike.slice(0, 4).map((r) => r.key + ' (pos ' + r.position.toFixed(1).replace('.', ',') + ')').join(' · '));
    const pages = latest.filter((r) => r.type === 'page');
    const lowPages = pages.filter((r) => r.impressions >= 1000 && r.ctr < 0.005).sort((a, b) => b.impressions - a.impressions);
    add('Halaman banyak tampil, jarang diklik', lowPages.length > 3 ? 'warn' : 'ok', lowPages.length + ' halaman punya ≥1.000 impresi dengan CTR di bawah 0,5%.', lowPages.slice(0, 3).map((r) => r.key.replace(/^https?:\/\/(www\.)?/, '')).join(' · '));
    const variants = pages.filter((r) => /^http:\/\//.test(r.key) || /[A-Z]/.test(r.key.replace(/^https?:\/\/[^/]+/, '')) || /\/$/.test(r.key.replace(/^https?:\/\/[^/]+\/?$/, '')) || /[\\?]/.test(r.key) || (!/\/\/www\./.test(r.key) && pages.some((x) => /\/\/www\./.test(x.key))));
    add('Variasi URL / duplikat', variants.length ? 'warn' : 'ok', variants.length ? variants.length + ' URL di top halaman berupa versi http, non-www, huruf besar, garis miring di akhir atau parameter. Pastikan redirect 301 & tag canonical ke satu versi.' : 'Tidak ada variasi URL di top halaman.', variants.slice(0, 3).map((r) => r.key).join(' · '));
    const dev = latest.filter((r) => r.type === 'device');
    const devC = dev.reduce((a, r) => a + r.clicks, 0) || 1;
    const mob = dev.find((r) => r.key.toLowerCase() === 'mobile');
    if (mob) add('Pengunjung mobile', 'ok', pct(mob.clicks / devC) + ' klik dari HP (posisi rata-rata mobile ' + mob.position.toFixed(1).replace('.', ',') + '). Prioritaskan kecepatan & tampilan mobile.');
  }
  return out;
} });

})();

(function () {

const BL = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const nf = new Intl.NumberFormat('id-ID');
const compact = new Intl.NumberFormat('id-ID', { notation: 'compact', maximumFractionDigits: 1 });
const dec = (v, a, b) => v.toLocaleString('id-ID', { minimumFractionDigits: a, maximumFractionDigits: b });
const fmtNum = (v) => (v == null ? '—' : nf.format(v));
const fmtRating = (v) => (v == null ? '—' : dec(v, 1, 2));
const fmtPct = (v) => (v == null ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '') + dec(Math.abs(v * 100), 0, 1) + '%');
const fmtShare = (v) => (v == null ? '—' : dec(v * 100, 0, 1) + '%');
const fmtCtr = (v) => (v == null ? '—' : dec(v * 100, 2, 2) + '%');
const fmtPos = (v) => (v == null ? '—' : dec(v, 1, 1));
const fmtDiff = (v, d) => (v == null ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '±') + dec(Math.abs(v), d, 2));
const fmtPeriod = (p) => {
  let m;
  if (!p) return '';
  if (p === 'all') return 'Semua periode';
  if ((m = /^(\d{4})-(\d{2})-(\d{2})_(\d{4})-(\d{2})-(\d{2})$/.exec(p))) return m[1] === m[4] && m[2] === m[5] ? BL[+m[2] - 1] + ' ' + m[1] : BL[+m[2] - 1] + ' ' + m[1] + ' – ' + BL[+m[5] - 1] + ' ' + m[4];
  if ((m = /^(\d{4})-(\d{2})-W(\d)$/.exec(p))) return 'M' + m[3] + ' ' + BL[+m[2] - 1] + ' ' + m[1];
  if ((m = /^(\d{4})-(\d{2})$/.exec(p))) return BL[+m[2] - 1] + ' ' + m[1];
  if ((m = /^(\d{4})-Q(\d)$/.exec(p))) return 'Q' + m[2] + ' ' + m[1];
  return p;
};
const fmtShort = (p) => {
  let m;
  if ((m = /^(\d{4})-(\d{2})-W(\d)$/.exec(p))) return 'M' + m[3] + ' ' + BL[+m[2] - 1];
  if ((m = /^(\d{4})-(\d{2})$/.exec(p))) return BL[+m[2] - 1] + " '" + m[1].slice(2);
  return fmtPeriod(p);
};
const GBP_FIELDS = { rating: fmtRating, rating_chg: (v) => fmtDiff(v, 1), positive_share: fmtShare };
const GSC_FIELDS = { ctr: fmtCtr, position: fmtPos, position_chg: (v) => fmtDiff(v, 1) };
const fmtField = (f, v, map) => (map && map[f] ? map[f](v) : /_chg$/.test(f) ? fmtPct(v) : typeof v === 'number' ? fmtNum(v) : v == null ? '—' : String(v));
const enc = (s) => String(s).replace(/%/g, '%25').replace(/&/g, '%26').replace(/=/g, '%3D').replace(/,/g, '%2C');
const where = (o) => Object.entries(o).map(([k, v]) => k + '=' + enc(v)).join('&');
const $ = (s) => document.querySelector(s);
const css = (name) => getComputedStyle(document.querySelector('.gb')).getPropertyValue(name).trim();
const setSeg = (el, value) => el && el.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === value)));
const onSeg = (sel, fn) => $(sel).addEventListener('click', (e) => { const b = e.target.closest('button[data-v]'); if (b) fn(b.dataset.v); });
const periodsFor = (gran, list) => list;

// ---------- page switching ----------
let gscMounted = false;
const page = () => dash.params().page || 'gbp';
function mountGsc() {
  if (gscMounted) return;
  gscMounted = true;
  $('#gsc').appendChild($('#tpl-gsc').content.cloneNode(true));
  onSeg('#g-brand', (v) => dash.setParams({ gbrand: v }));
  onSeg('#g-gran', (v) => dash.setParams({ ggran: v, gperiod: null }));
  onSeg('#gt-tabs', (v) => dash.setParams({ gmetric: v }));
  $('#g-period').addEventListener('change', (e) => dash.setParams({ gperiod: e.target.value || null }));
  $('#kw-period').addEventListener('change', (e) => dash.setParams({ kperiod: e.target.value || null }));
  $('#kw-search').addEventListener('input', (e) => { kwState.q = e.target.value.toLowerCase(); draw(); });
  $('#pg-search').addEventListener('input', (e) => { pgState.q = e.target.value.toLowerCase(); draw(); });
  sortable('#kw-tbl', kwState);
  sortable('#pg-tbl', pgState);
}
$('#entry').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-page]');
  if (!b) return;
  dash.setParams({ page: b.dataset.page });
  dash.setLink(b.dataset.page);
});
const startHash = location.hash.slice(1);
if (startHash === 'gsc' || startHash === 'gbp') dash.setParams({ page: startHash });

function sortable(tbl, state) {
  $(tbl + ' thead').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-sort]');
    if (!b) return;
    if (state.key === b.dataset.sort) state.dir = -state.dir; else { state.key = b.dataset.sort; state.dir = ['label', 'brand', 'key'].includes(b.dataset.sort) || b.dataset.sort === 'position' ? 1 : -1; }
    draw();
  });
}
const sorter = (state) => (a, b) => { const x = a[state.key], y = b[state.key]; if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1; return (typeof x === 'string' ? x.localeCompare(y) : x - y) * state.dir; };
const ariaSort = (tbl, state) => document.querySelectorAll(tbl + ' th[data-field]').forEach((th) => th.setAttribute('aria-sort', th.dataset.field === state.key ? (state.dir > 0 ? 'ascending' : 'descending') : 'none'));

// ---------- GBP controls ----------
const gbpTbl = { key: 'traffic', dir: -1, q: '' };
const kwState = { key: 'clicks', dir: -1, q: '' };
const pgState = { key: 'clicks', dir: -1, q: '' };
onSeg('#f-brand', (v) => dash.setParams({ brand: v, branch: null }));
onSeg('#f-gran', (v) => dash.setParams({ gran: v, period: null }));
onSeg('#f-rgran', (v) => dash.setParams({ rgran: v, rperiod: null }));
onSeg('#trend-tabs', (v) => dash.setParams({ metric: v }));
$('#f-branch').addEventListener('change', (e) => {
  const v = e.target.value || null;
  const br = (dash.data('branches').data || []).find((b) => b.key === v);
  dash.setParams(br ? { branch: v, brand: br.brand } : { branch: null });
});
$('#f-period').addEventListener('change', (e) => dash.setParams({ period: e.target.value || null }));
$('#bi-clear').addEventListener('click', () => dash.setParams({ branch: null }));
$('#tbl-search').addEventListener('input', (e) => { gbpTbl.q = e.target.value.toLowerCase(); draw(); });
sortable('#tbl', gbpTbl);
$('#tbl tbody').addEventListener('click', (e) => { if (e.target.closest('a')) return; const tr = e.target.closest('tr[data-scope]'); if (tr) { dash.setParams({ branch: tr.dataset.scope }); $('#gbp').scrollIntoView({ behavior: 'smooth' }); } });

// ---------- chart helpers ----------
function tooltip(box) {
  let tip = box.querySelector('.gb-tip');
  if (!tip) { tip = document.createElement('div'); tip.className = 'gb-tip'; tip.hidden = true; box.appendChild(tip); }
  return {
    show(ev, title, lines) {
      tip.replaceChildren();
      const d = document.createElement('div'); d.className = 'gb-tipd'; d.textContent = title; tip.appendChild(d);
      for (const [color, name, val] of lines) {
        const l = document.createElement('div');
        if (color) { const s = document.createElement('span'); s.className = 'gb-sw'; s.style.background = color; l.appendChild(s); }
        l.appendChild(document.createTextNode((name ? name + ': ' : '') + val));
        tip.appendChild(l);
      }
      tip.hidden = false;
      const r = box.getBoundingClientRect();
      const x = ev.clientX - r.left, y = ev.clientY - r.top;
      tip.style.left = Math.max(0, Math.min(r.width - tip.offsetWidth, x + 12)) + 'px';
      tip.style.top = Math.max(0, y - tip.offsetHeight - 10) + 'px';
    },
    hide() { tip.hidden = true; },
  };
}
function measure(svg, texts) {
  const t = svg.append('text').style('font-size', 'var(--cds-font-size-caption)').style('font-family', 'var(--font-anthropic-sans)');
  let max = 0;
  for (const s of texts) { t.text(s); max = Math.max(max, t.node().getComputedTextLength()); }
  t.remove();
  return max;
}
function failOrEmpty(box, status, emptyText) {
  box.replaceChildren();
  if (status === 'error' || status === 'connect' || status === 'declined') { box.classList.remove('dash-skeleton'); const d = document.createElement('div'); d.className = 'gb-fail'; d.textContent = 'Failed to load'; box.appendChild(d); return true; }
  if (status !== 'ok') { box.classList.add('dash-skeleton'); return true; }
  box.classList.remove('dash-skeleton');
  if (emptyText) { const d = document.createElement('div'); d.className = 'gb-empty'; d.textContent = emptyText; box.appendChild(d); return true; }
  return false;
}
const tickFmt = (v) => (Math.abs(v) >= 10000 ? compact.format(v) : nf.format(v));
function drawSeries(box, items, opt) {
  const W = Math.max(260, box.clientWidth), H = 240;
  const svg = d3.select(box).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`);
  const vals = items.map((d) => d.value);
  let lo = d3.min(vals), hi = d3.max(vals);
  let domain = opt.domain ? opt.domain(lo, hi) : opt.line ? [lo - ((hi - lo) * 0.15 || Math.abs(hi) * 0.05 || 1), hi + ((hi - lo) * 0.15 || Math.abs(hi) * 0.05 || 1)] : [0, hi || 1];
  const y = d3.scaleLinear(domain, opt.invert ? [8, H - 24] : [H - 24, 8]).nice();
  const ticks = y.ticks(4);
  const tf = opt.tick || tickFmt;
  const left = measure(svg, ticks.map(tf)) + 10;
  const x = d3.scaleBand(items.map((d) => d.period), [left, W - 4]).padding(0.25);
  const g = svg.append('g');
  g.selectAll('line.grid').data(ticks).join('line').attr('x1', left).attr('x2', W - 4).attr('y1', (t) => y(t)).attr('y2', (t) => y(t)).style('stroke', 'var(--cds-chart-grid)');
  g.selectAll('text.yt').data(ticks).join('text').attr('x', left - 8).attr('y', (t) => y(t)).attr('dy', '0.32em').attr('text-anchor', 'end').style('fill', 'var(--color-fg-muted)').style('font-size', 'var(--cds-font-size-caption)').text(tf);
  const lw = measure(svg, items.map((d) => fmtShort(d.period))) + 8;
  const every = Math.max(1, Math.ceil((lw * items.length) / (W - left)));
  g.selectAll('text.xt').data(items).join('text').attr('x', (d) => x(d.period) + x.bandwidth() / 2).attr('y', H - 6).attr('text-anchor', 'middle').style('fill', 'var(--color-fg-muted)').style('font-size', 'var(--cds-font-size-caption)').text((d, i) => ((items.length - 1 - i) % every === 0 ? fmtShort(d.period) : ''));
  const tip = tooltip(box);
  const color = dash.colors[0];
  if (opt.line) {
    g.append('path').datum(items).attr('d', d3.line().x((d) => x(d.period) + x.bandwidth() / 2).y((d) => y(d.value))).style('fill', 'none').style('stroke', color).attr('stroke-width', 2).attr('stroke-linecap', 'round').attr('stroke-linejoin', 'round');
    g.selectAll('circle').data(items).join('circle').attr('cx', (d) => x(d.period) + x.bandwidth() / 2).attr('cy', (d) => y(d.value)).attr('r', (d) => (d.period === opt.sel ? 5 : 3)).style('fill', (d) => (d.period === opt.sel ? color : 'var(--color-panel)')).style('stroke', color).attr('stroke-width', 2);
  } else {
    g.selectAll('rect.bar').data(items).join('rect').attr('x', (d) => x(d.period) + Math.max(0, (x.bandwidth() - 32) / 2)).attr('width', Math.min(32, x.bandwidth())).attr('y', (d) => y(Math.max(0, d.value))).attr('height', (d) => Math.abs(y(Math.max(0, d.value)) - y(0))).attr('rx', 4).style('fill', (d) => (!opt.sel || d.period === opt.sel ? color : 'var(--cds-chart-muted)'));
  }
  g.selectAll('rect.hit').data(items).join('rect').attr('x', (d) => x(d.period) - (x.step() - x.bandwidth()) / 2).attr('width', x.step()).attr('y', 0).attr('height', H - 20).style('fill', 'transparent').style('cursor', 'pointer')
    .on('mousemove', (ev, d) => tip.show(ev, fmtPeriod(d.period), [[null, opt.label, opt.fmt(d.value)]])).on('mouseleave', () => tip.hide()).on('click', (ev, d) => opt.onClick && opt.onClick(d.period));
}
function drawRank(box, items, opt) {
  const W = Math.max(260, box.clientWidth), rowH = 28, H = items.length * rowH + 8;
  const svg = d3.select(box).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`);
  const left = Math.min(W * 0.42, measure(svg, items.map((d) => d.label)) + 12);
  const valW = measure(svg, items.map((d) => opt.fmt(d.value))) + 10;
  const lo = opt.rate ? Math.max(0, d3.min(items, (d) => d.value) - 0.3) : 0;
  const x = d3.scaleLinear([lo, opt.rate ? Math.max(5, d3.max(items, (d) => d.value)) : d3.max(items, (d) => d.value) || 1], [left, W - valW]);
  const tip = tooltip(box);
  const g = svg.selectAll('g.r').data(items).join('g').attr('class', 'r').attr('transform', (d, i) => `translate(0,${i * rowH + 4})`).style('cursor', 'pointer')
    .on('click', (ev, d) => opt.onClick(d.scope)).on('mousemove', (ev, d) => tip.show(ev, d.label, [[null, opt.label, opt.fmt(d.value)]])).on('mouseleave', () => tip.hide());
  g.append('rect').attr('width', W).attr('height', rowH - 4).style('fill', 'transparent');
  const maxLabel = left - 12;
  g.append('text').attr('x', left - 8).attr('y', (rowH - 4) / 2).attr('dy', '0.32em').attr('text-anchor', 'end').style('font-size', 'var(--cds-font-size-caption)')
    .style('fill', (d) => (d.scope === opt.sel ? 'var(--color-fg)' : 'var(--color-fg-muted)')).style('font-weight', (d) => (d.scope === opt.sel ? 600 : null))
    .text((d) => d.label).each(function (d) { let s = d.label; while (s.length > 4 && this.getComputedTextLength() > maxLabel) { s = s.slice(0, -2); this.textContent = s + '…'; } });
  g.append('rect').attr('x', left).attr('y', 3).attr('height', rowH - 10).attr('rx', 4).attr('width', (d) => Math.max(1, x(Math.max(lo, d.value)) - left)).style('fill', (d) => (!opt.sel || d.scope === opt.sel ? dash.colors[0] : 'var(--cds-chart-muted)'));
  g.append('text').attr('x', (d) => x(Math.max(lo, d.value)) + 6).attr('y', (rowH - 4) / 2).attr('dy', '0.32em').style('font-size', 'var(--cds-font-size-caption)').style('fill', 'var(--color-fg-muted)').style('font-variant-numeric', 'tabular-nums').text((d) => opt.fmt(d.value));
}
function drawReviews(box, items, opt) {
  const W = Math.max(260, box.clientWidth), H = 220;
  const svg = d3.select(box).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`);
  const y = d3.scaleLinear([0, d3.max(items, (d) => d.total) || 1], [H - 24, 8]).nice();
  const ticks = y.ticks(4).filter((t) => Number.isInteger(t));
  const left = measure(svg, ticks.map((t) => nf.format(t))) + 10;
  const x = d3.scaleBand(items.map((d) => d.period), [left, W - 4]).padding(0.25);
  svg.selectAll('line').data(ticks).join('line').attr('x1', left).attr('x2', W - 4).attr('y1', (t) => y(t)).attr('y2', (t) => y(t)).style('stroke', 'var(--cds-chart-grid)');
  svg.selectAll('text.yt').data(ticks).join('text').attr('x', left - 8).attr('y', (t) => y(t)).attr('dy', '0.32em').attr('text-anchor', 'end').style('fill', 'var(--color-fg-muted)').style('font-size', 'var(--cds-font-size-caption)').text((t) => nf.format(t));
  const lw = measure(svg, items.map((d) => fmtShort(d.period))) + 8;
  const every = Math.max(1, Math.ceil((lw * items.length) / (W - left)));
  svg.selectAll('text.xt').data(items).join('text').attr('x', (d) => x(d.period) + x.bandwidth() / 2).attr('y', H - 6).attr('text-anchor', 'middle').style('fill', 'var(--color-fg-muted)').style('font-size', 'var(--cds-font-size-caption)').text((d, i) => ((items.length - 1 - i) % every === 0 ? fmtShort(d.period) : ''));
  const bw = Math.min(32, x.bandwidth()), off = (x.bandwidth() - bw) / 2;
  const fade = (d) => (opt.sel && d.period !== opt.sel ? 0.35 : 1);
  svg.selectAll('rect.p').data(items).join('rect').attr('x', (d) => x(d.period) + off).attr('width', bw).attr('y', (d) => y(d.positive)).attr('height', (d) => y(0) - y(d.positive)).style('fill', dash.colors[0]).attr('opacity', fade);
  svg.selectAll('rect.n').data(items).join('rect').attr('x', (d) => x(d.period) + off).attr('width', bw).attr('y', (d) => y(d.total)).attr('height', (d) => y(d.positive) - y(d.total)).style('fill', 'var(--cds-chart-status-critical)').attr('opacity', fade);
  const tip = tooltip(box);
  svg.selectAll('rect.hit').data(items).join('rect').attr('x', (d) => x(d.period) - (x.step() - x.bandwidth()) / 2).attr('width', x.step()).attr('y', 0).attr('height', H - 20).style('fill', 'transparent').style('cursor', 'pointer')
    .on('mousemove', (ev, d) => tip.show(ev, fmtPeriod(d.period), [[dash.colors[0], 'Positif', nf.format(d.positive)], ['var(--cds-chart-status-critical)', 'Negatif', nf.format(d.negative)]])).on('mouseleave', () => tip.hide())
    .on('click', (ev, d) => dash.setParams({ rperiod: d.period }));
}
function setMark(el, source, w, value, field, map) {
  if (!el) return;
  el.setAttribute('data-source', source);
  if (w) el.setAttribute('data-where', w); else el.removeAttribute('data-where');
  el.textContent = value == null ? '—' : fmtField(field || el.dataset.field, value, map);
  el.classList.remove('dash-skeleton');
}
function fillTable(tbody, rows, cols, keyCols, extra) {
  tbody.replaceChildren(...rows.map((r) => {
    const tr = document.createElement('tr');
    tr.dataset.key = keyCols.map((k) => enc(r[k])).join(',');
    for (const c of cols) {
      const td = document.createElement('td');
      td.textContent = c.fmt ? c.fmt(r[c.f], r) : r[c.f] == null ? '—' : String(r[c.f]);
      if (c.cls) td.className = c.cls;
      tr.appendChild(td);
    }
    if (extra) extra(tr, r);
    return tr;
  }));
}

// ---------- GBP ----------
function drawGbp() {
  const p = dash.params();
  const brand = p.brand || 'Semua', gran = p.gran || 'month', metric = p.metric || 'traffic', rgran = p.rgran || 'week';
  const B = dash.data('branches'), P = dash.data('perf'), R = dash.data('rev');
  const branches = B.status === 'ok' ? B.data : [];
  const branch = p.branch && branches.some((b) => b.key === p.branch) ? p.branch : null;
  const scope = branch || brand;
  const binfo = branches.find((b) => b.key === branch);
  setSeg($('#f-brand'), brand); setSeg($('#f-gran'), gran); setSeg($('#f-rgran'), rgran); setSeg($('#trend-tabs'), metric);
  $('#sw-pos').style.background = dash.colors[0];
  $('#sw-neg').style.background = 'var(--cds-chart-status-critical)';
  const sel = $('#f-branch');
  const list = branches.filter((b) => brand === 'Semua' || b.brand === brand);
  sel.replaceChildren(new Option(brand === 'Semua' ? 'Semua cabang' : 'Semua cabang ' + brand, ''), ...list.map((b) => new Option(b.label, b.key)));
  sel.value = branch || '';
  $('#branch-info').hidden = !binfo;
  if (binfo) {
    const w = where({ key: binfo.key });
    setMark($('#bi-name'), 'branches', w, binfo.label, 'label');
    setMark($('#bi-city'), 'branches', w, binfo.city, 'city');
    setMark($('#bi-brand'), 'branches', w, binfo.brand, 'brand');
    $('#bi-link').href = binfo.maps_url;
  }
  const rows = P.status === 'ok' ? P.data : [];
  const scopeRows = rows.filter((r) => r.scope === scope && r.gran === gran).sort((a, b) => a.period.localeCompare(b.period));
  const periods = scopeRows.filter((r) => r.traffic != null || r.rating != null).map((r) => r.period).reverse();
  const period = p.period && periods.includes(p.period) ? p.period : periods[0];
  const ps = $('#f-period');
  ps.replaceChildren(...periods.map((x) => new Option(fmtPeriod(x), x)));
  ps.value = period || '';
  ps.hidden = gran === 'all';
  const cur = scopeRows.find((r) => r.period === period);
  const w = cur ? where({ scope, gran, period }) : null;
  const vsText = cur && cur.prev_period ? ' vs ' + fmtPeriod(cur.prev_period) : '';
  const partial = cur && ((gran === 'quarter' && cur.months < 3) || (gran === 'year' && cur.months < 12) || gran === 'all') ? ' (' + cur.months + ' bln)' : '';
  document.querySelectorAll('#kpis [data-field]').forEach((el) => {
    if (P.status !== 'ok' || !cur) { el.textContent = '—'; if (P.status !== 'ok') el.classList.add('dash-skeleton'); return; }
    setMark(el, 'perf', w, cur[el.dataset.field], null, GBP_FIELDS);
    if (el.classList.contains('gb-delta')) { const v = cur[el.dataset.field]; el.classList.toggle('gb-up', v > 0); el.classList.toggle('gb-down', v < 0); }
  });
  document.querySelectorAll('#kpis .gb-vs').forEach((el) => { el.textContent = vsText; });
  const scopeName = binfo ? binfo.label : brand === 'Semua' ? 'semua cabang' : 'semua cabang ' + brand;
  $('#takeaway .tk-period').textContent = cur ? fmtPeriod(period) + partial + ' · ' : '';
  $('#takeaway .tk-scope').textContent = cur ? scopeName + ': ' : '';
  $('#takeaway .tk-prev').textContent = vsText;
  if (cur) { setMark($('#tk-traffic'), 'perf', w, cur.traffic, 'traffic'); setMark($('#tk-chg'), 'perf', w, cur.traffic_chg, 'traffic_chg'); setMark($('#tk-rating'), 'perf', w, cur.rating, 'rating', GBP_FIELDS); }
  const peers = rows.filter((r) => r.level === 'cabang' && r.gran === gran && r.period === period && (brand === 'Semua' || r.brand === brand));
  const top = peers.filter((r) => r.traffic != null).sort((a, b) => b.traffic - a.traffic)[0];
  $('#takeaway .tk-topwrap').hidden = !!binfo || !top;
  if (top && !binfo) setMark($('#tk-top'), 'perf', where({ scope: top.scope, gran, period }), top.label, 'label');
  const METRICS = { traffic: 'Traffic profil', directions: 'Directions', calls: 'Call', chats: 'Chat WhatsApp', web: 'Klik website', reviews_new: 'Review baru', rating: 'Rating', redeem: 'Campaign redeem' };
  const mLabel = METRICS[metric], isRate = metric === 'rating';
  const fmtM = (v) => fmtField(metric, v, GBP_FIELDS);
  const tbox = $('#trend-chart');
  const trendRows = rows.filter((r) => r.scope === scope && r.gran === (gran === 'all' ? 'month' : gran)).sort((a, b) => a.period.localeCompare(b.period));
  const series = trendRows.filter((r) => r[metric] != null).map((r) => ({ period: r.period, value: r[metric] }));
  $('#trend-sub').textContent = mLabel + ' · ' + scopeName + (gran === 'all' ? ' · per bulan' : '') + ' · klik batang untuk memilih periode.';
  if (!failOrEmpty(tbox, P.status, series.length ? null : 'Belum ada data ' + mLabel.toLowerCase() + ' untuk pilihan ini.')) {
    drawSeries(tbox, series, { sel: gran === 'all' ? null : period, line: isRate, domain: isRate ? (lo, hi) => [Math.max(0, lo - 0.2), Math.min(5, hi + 0.05)] : null, tick: isRate ? (v) => dec(v, 1, 2) : null, label: mLabel, fmt: fmtM, onClick: (per) => dash.setParams(gran === 'all' ? { gran: 'month', period: per } : { period: per }) });
  }
  const rbox = $('#rank-chart');
  const ranked = peers.filter((r) => r[metric] != null).map((r) => ({ scope: r.scope, label: r.label, value: r[metric] })).sort((a, b) => b.value - a.value);
  $('#rank-title').textContent = 'Peringkat cabang: ' + mLabel.toLowerCase();
  $('#rank-sub').textContent = (period ? fmtPeriod(period) + ' · ' : '') + (brand === 'Semua' ? 'semua brand' : brand) + ' · klik cabang untuk melihat performanya.';
  if (!failOrEmpty(rbox, P.status, ranked.length ? null : 'Belum ada data untuk periode ini.')) drawRank(rbox, ranked, { sel: branch, rate: isRate, label: mLabel, fmt: fmtM, onClick: (s) => dash.setParams({ branch: s }) });
  const rrows = R.status === 'ok' ? R.data.filter((r) => r.scope === scope && r.gran === rgran).sort((a, b) => a.period.localeCompare(b.period)) : [];
  const shown = rgran === 'week' ? rrows.slice(-16) : rrows;
  const rperiod = p.rperiod && rrows.some((r) => r.period === p.rperiod) ? p.rperiod : rrows.length ? rrows[rrows.length - 1].period : null;
  const rcur = rrows.find((r) => r.period === rperiod);
  $('#rv-period').textContent = rcur ? fmtPeriod(rperiod) : 'Periode';
  const rw = rcur ? where({ scope, gran: rgran, period: rperiod }) : null;
  for (const [id, f] of [['#rv-total', 'total'], ['#rv-pos', 'positive'], ['#rv-neg', 'negative'], ['#rv-share', 'positive_share']]) { if (rcur) setMark($(id), 'rev', rw, rcur[f], f, GBP_FIELDS); else $(id).textContent = '—'; }
  const vbox = $('#rev-chart');
  if (!failOrEmpty(vbox, R.status, shown.length ? null : 'Belum ada data review untuk pilihan ini.')) drawReviews(vbox, shown, { sel: rperiod });
  const trows = peers.filter((r) => !gbpTbl.q || r.label.toLowerCase().includes(gbpTbl.q) || r.brand.toLowerCase().includes(gbpTbl.q)).sort(sorter(gbpTbl));
  ariaSort('#tbl', gbpTbl);
  $('#tbl-sub').textContent = (period ? fmtPeriod(period) + partial + ' · ' : '') + 'klik baris untuk melihat cabang; "Google ↗" membuka profil cabang.';
  const g = (f) => (v) => fmtField(f, v, GBP_FIELDS);
  fillTable($('#tbl tbody'), trows, [
    { f: 'label', cls: 'gb-l' }, { f: 'brand', cls: 'gb-l gb-hide-narrow' }, { f: 'rating', fmt: g('rating') }, { f: 'reviews_total', fmt: g('reviews_total'), cls: 'gb-hide-narrow' }, { f: 'reviews_new', fmt: g('reviews_new') },
    { f: 'traffic', fmt: g('traffic') }, { f: 'directions', fmt: g('directions') }, { f: 'calls', fmt: g('calls'), cls: 'gb-hide-narrow' }, { f: 'chats', fmt: g('chats'), cls: 'gb-hide-narrow' }, { f: 'web', fmt: g('web'), cls: 'gb-hide-narrow' },
  ], ['scope', 'gran', 'period'], (tr, r) => {
    tr.dataset.scope = r.scope; tr.classList.add('gb-click'); if (r.scope === branch) tr.classList.add('gb-sel');
    const td = document.createElement('td');
    if (r.maps_url) { const a = document.createElement('a'); a.href = r.maps_url; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.textContent = 'Google ↗'; td.appendChild(a); }
    tr.appendChild(td);
  });
  const mrows = rows.filter((r) => r.scope === scope && r.gran === 'month').sort((a, b) => b.period.localeCompare(a.period));
  $('#gm-sub').textContent = 'Semua bulan · ' + scopeName + ' · terbaru di atas.';
  fillTable($('#gm-tbl tbody'), mrows, [
    { f: 'period', cls: 'gb-l', fmt: fmtPeriod }, { f: 'traffic', fmt: g('traffic') }, { f: 'directions', fmt: g('directions') }, { f: 'calls', fmt: g('calls') }, { f: 'chats', fmt: g('chats') },
    { f: 'web', fmt: g('web'), cls: 'gb-hide-narrow' }, { f: 'reviews_new', fmt: g('reviews_new') }, { f: 'reviews_total', fmt: g('reviews_total'), cls: 'gb-hide-narrow' }, { f: 'rating', fmt: g('rating') },
  ], ['scope', 'gran', 'period']);
}

// ---------- GSC ----------
function drawGsc() {
  const p = dash.params();
  const brand = p.gbrand || 'Semua', gran = p.ggran || 'month', metric = p.gmetric || 'clicks';
  setSeg($('#g-brand'), brand); setSeg($('#g-gran'), gran); setSeg($('#gt-tabs'), metric);
  const G = dash.data('gsc_perf'), K = dash.data('gsc_kw'), PG = dash.data('gsc_pages'), A = dash.data('gsc_audit');
  const rows = G.status === 'ok' ? G.data : [];
  const scopeRows = rows.filter((r) => r.scope === brand && r.gran === gran).sort((a, b) => a.period.localeCompare(b.period));
  const periods = scopeRows.map((r) => r.period).reverse();
  const period = p.gperiod && periods.includes(p.gperiod) ? p.gperiod : periods[0];
  const ps = $('#g-period');
  ps.replaceChildren(...periods.map((x) => new Option(fmtPeriod(x), x)));
  ps.value = period || '';
  ps.hidden = gran === 'all';
  const cur = scopeRows.find((r) => r.period === period);
  const w = cur ? where({ scope: brand, gran, period }) : null;
  const vsText = cur && cur.prev_period ? ' vs ' + fmtPeriod(cur.prev_period) : '';
  const daysNote = cur && gran !== 'month' ? ' (' + cur.days + ' hari data)' : cur && cur.days < 28 ? ' (' + cur.days + ' hari)' : '';
  document.querySelectorAll('#gsc-kpis [data-field]').forEach((el) => {
    if (G.status !== 'ok' || !cur) { el.textContent = '—'; if (G.status !== 'ok') el.classList.add('dash-skeleton'); return; }
    const v = cur[el.dataset.field];
    setMark(el, 'gsc_perf', w, v, null, GSC_FIELDS);
    if (el.classList.contains('gb-delta')) { const good = el.classList.contains('gb-inv') ? v < 0 : v > 0, bad = el.classList.contains('gb-inv') ? v > 0 : v < 0; el.classList.toggle('gb-up', good); el.classList.toggle('gb-down', bad); }
  });
  document.querySelectorAll('#gsc-kpis .gb-vs').forEach((el) => { el.textContent = vsText; });
  const scopeName = brand === 'Semua' ? 'semua website' : brand;
  $('#gsc-takeaway .gk-period').textContent = cur ? fmtPeriod(period) + daysNote + ' · ' : '';
  $('#gsc-takeaway .gk-scope').textContent = cur ? scopeName + ': ' : '';
  $('#gsc-takeaway .gk-prev').textContent = vsText;
  if (cur) { setMark($('#gk-clicks'), 'gsc_perf', w, cur.clicks, 'clicks'); setMark($('#gk-chg'), 'gsc_perf', w, cur.clicks_chg, 'clicks_chg'); setMark($('#gk-pos'), 'gsc_perf', w, cur.position, 'position', GSC_FIELDS); }
  const ML = { clicks: 'Klik', impressions: 'Impresi', ctr: 'CTR', position: 'Posisi rata-rata' };
  const fmtM = (v) => fmtField(metric, v, GSC_FIELDS);
  const tbox = $('#gt-chart');
  const series = rows.filter((r) => r.scope === brand && r.gran === (gran === 'all' ? 'month' : gran) && r[metric] != null).sort((a, b) => a.period.localeCompare(b.period)).map((r) => ({ period: r.period, value: r[metric] }));
  $('#gt-sub').textContent = ML[metric] + ' · ' + scopeName + (metric === 'position' ? ' · makin tinggi garis makin baik' : '') + ' · klik untuk memilih periode.';
  if (!failOrEmpty(tbox, G.status, series.length ? null : 'Belum ada data.')) {
    drawSeries(tbox, series, { sel: gran === 'all' ? null : period, line: metric === 'ctr' || metric === 'position', invert: metric === 'position', tick: metric === 'ctr' ? (v) => dec(v * 100, 1, 2) + '%' : metric === 'position' ? (v) => dec(v, 0, 1) : null, label: ML[metric], fmt: fmtM, onClick: (per) => dash.setParams(gran === 'all' ? { ggran: 'month', gperiod: per } : { gperiod: per }) });
  }
  const bbox = $('#gb-chart');
  const brandRows = rows.filter((r) => r.scope !== 'Semua' && r.gran === gran && r.period === period && r[metric] != null).map((r) => ({ scope: r.scope, label: r.scope, value: r[metric] })).sort((a, b) => (metric === 'position' ? a.value - b.value : b.value - a.value));
  $('#gb-title').textContent = 'Perbandingan brand: ' + ML[metric].toLowerCase();
  $('#gb-sub').textContent = (period ? fmtPeriod(period) + ' · ' : '') + (metric === 'position' ? 'urut dari posisi terbaik · ' : '') + 'klik brand untuk melihat detailnya.';
  if (!failOrEmpty(bbox, G.status, brandRows.length ? null : 'Belum ada data untuk periode ini.')) drawRank(bbox, brandRows, { sel: brand === 'Semua' ? null : brand, label: ML[metric], fmt: fmtM, onClick: (s) => dash.setParams({ gbrand: s }) });

  // keyword period: export periods available for this brand
  const krows = K.status === 'ok' ? K.data : [];
  const kPeriods = [...new Set(krows.filter((r) => brand === 'Semua' || r.brand === brand).map((r) => r.period))].sort((a, b) => (a === 'all' ? 1 : b === 'all' ? -1 : b.localeCompare(a)));
  const monthOf = period && /^\d{4}-\d{2}$/.test(period) ? period : null;
  const auto = (monthOf && kPeriods.find((k) => k !== 'all' && k.slice(0, 7) <= monthOf && k.slice(11, 18) >= monthOf)) || (gran === 'month' ? kPeriods[0] : 'all');
  const kperiod = p.kperiod && kPeriods.includes(p.kperiod) ? p.kperiod : auto;
  const ks = $('#kw-period');
  ks.replaceChildren(...kPeriods.map((x) => new Option('Keyword: ' + fmtPeriod(x), x)));
  ks.value = kperiod || '';
  const kwN = brand === 'Semua' ? 20 : 10;
  const kw = krows.filter((r) => r.period === kperiod && (brand === 'Semua' || r.brand === brand) && (!kwState.q || r.key.toLowerCase().includes(kwState.q))).sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions).slice(0, kwN).sort(sorter(kwState));
  ariaSort('#kw-tbl', kwState);
  $('#kw-sub').textContent = 'Kata kunci pencarian yang mendatangkan klik · ' + fmtPeriod(kperiod) + ' · ' + scopeName + '. ' + kwN + ' keyword dengan klik terbanyak.';
  if (K.status === 'ok') fillTable($('#kw-tbl tbody'), kw, [{ f: 'key', cls: 'gb-l gb-wrap' }, { f: 'brand', cls: 'gb-l gb-hide-narrow' }, { f: 'clicks', fmt: fmtNum }, { f: 'impressions', fmt: fmtNum }, { f: 'ctr', fmt: fmtCtr }, { f: 'position', fmt: fmtPos }], ['brand', 'period', 'key']);
  else $('#kw-tbl tbody').replaceChildren();
  const prows = (PG.status === 'ok' ? PG.data : []).filter((r) => r.period === kperiod && (brand === 'Semua' || r.brand === brand) && (!pgState.q || r.key.toLowerCase().includes(pgState.q))).sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions).slice(0, 5).sort(sorter(pgState));
  ariaSort('#pg-tbl', pgState);
  if (PG.status === 'ok') fillTable($('#pg-tbl tbody'), prows, [{ f: 'key', cls: 'gb-l gb-wrap' }, { f: 'clicks', fmt: fmtNum }, { f: 'impressions', fmt: fmtNum }, { f: 'ctr', fmt: fmtCtr }, { f: 'position', fmt: fmtPos }], ['brand', 'period', 'key'], (tr, r) => {
    const td = tr.firstChild; td.textContent = '';
    const a = document.createElement('a'); a.href = r.key; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.textContent = r.key.replace(/^https?:\/\/(www\.)?/, ''); td.appendChild(a);
  });
  else $('#pg-tbl tbody').replaceChildren();
  const arows = (A.status === 'ok' ? A.data : []).filter((r) => brand === 'Semua' || r.brand === brand);
  $('#au-sub').textContent = 'Dihitung otomatis dari export terbaru tiap brand' + (arows[0] ? ' (' + [...new Set(arows.map((r) => r.brand + ': ' + fmtPeriod(r.period)))].join(', ') + ')' : '') + '.';
  fillTable($('#au-tbl tbody'), arows, [{ f: 'brand', cls: 'gb-l' }, { f: 'check', cls: 'gb-l gb-wrap' }, { f: 'status', cls: 'gb-l' }, { f: 'finding', cls: 'gb-l gb-wrap' }, { f: 'examples', cls: 'gb-l gb-wrap gb-muted gb-hide-narrow' }], ['brand', 'check'], (tr, r) => {
    const st = tr.children[2]; st.textContent = ''; const s = document.createElement('span'); s.className = 'gb-status ' + r.level; s.textContent = r.status; st.appendChild(s);
  });
  const mrows = rows.filter((r) => r.scope === brand && r.gran === 'month').sort((a, b) => b.period.localeCompare(a.period));
  $('#gsm-sub').textContent = 'Setiap bulan · ' + scopeName + ' · terbaru di atas.';
  fillTable($('#gsm-tbl tbody'), mrows, [{ f: 'period', cls: 'gb-l', fmt: (v, r) => fmtPeriod(v) + (r.days < 28 ? ' (' + r.days + ' hari)' : '') }, { f: 'clicks', fmt: fmtNum }, { f: 'impressions', fmt: fmtNum }, { f: 'ctr', fmt: fmtCtr }, { f: 'position', fmt: fmtPos }, { f: 'clicks_chg', fmt: fmtPct }], ['scope', 'gran', 'period'], (tr, r) => {
    const td = tr.lastChild; td.className = r.clicks_chg > 0 ? 'gb-up' : r.clicks_chg < 0 ? 'gb-down' : '';
  });
}

function draw() {
  const pg = page();
  $('#entry').querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.page === pg)));
  $('#gbp').hidden = pg !== 'gbp';
  $('#gsc').hidden = pg !== 'gsc';
  if (pg === 'gsc') { mountGsc(); drawGsc(); } else drawGbp();
}
// ---------- (!) metric explanations ----------
const pop = document.createElement('div');
pop.className = 'gb-pop'; pop.hidden = true; pop.setAttribute('role', 'tooltip');
$('.gb').appendChild(pop);
let popFor = null;
const hidePop = () => { pop.hidden = true; if (popFor) popFor.setAttribute('aria-expanded', 'false'); popFor = null; };
document.addEventListener('click', (e) => {
  const b = e.target.closest('.gb-info');
  if (!b) { if (!e.target.closest('.gb-pop')) hidePop(); return; }
  e.preventDefault(); e.stopPropagation();
  if (popFor === b) { hidePop(); return; }
  hidePop();
  pop.textContent = b.dataset.info;
  pop.hidden = false;
  popFor = b; b.setAttribute('aria-expanded', 'true');
  const root = $('.gb').getBoundingClientRect(), r = b.getBoundingClientRect();
  const w = pop.offsetWidth;
  pop.style.left = Math.max(8, Math.min(root.width - w - 8, r.left - root.left - w / 2 + r.width / 2)) + 'px';
  pop.style.top = (r.bottom - root.top + 6) + 'px';
}, true);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hidePop(); });

dash.onData(draw);


})();
