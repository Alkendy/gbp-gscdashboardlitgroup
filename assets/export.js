/* Export Excel untuk halaman Google Business Profile & Google Search Console.
   Mengambil isi halaman yang sedang tampil (sesuai filter aktif): filter, kartu KPI,
   ringkasan, dan setiap tabel, lalu menyimpannya sebagai file .xlsx. */
(function () {
  const clean = (el) => {
    if (!el) return '';
    const c = el.cloneNode(true);
    c.querySelectorAll('button.gb-info, .gb-info, script, style').forEach((x) => x.remove());
    return c.textContent.replace(/\s+/g, ' ').trim();
  };
  const NUM = /^[+\-−]?(\d{1,3}(\.\d{3})+|\d+)(,\d+)?$/;
  const parse = (t) => {
    const s = String(t || '').replace(/\u2212/g, '-').replace(/\s+/g, '').replace(/^Rp/i, '');
    if (!s || s === '—' || s === '-') return { v: t || '', t: 'text' };
    const pct = s.endsWith('%');
    const core = pct ? s.slice(0, -1) : s;
    if (NUM.test(core)) {
      const n = Number(core.replace(/\./g, '').replace(',', '.'));
      if (isFinite(n)) return pct ? { v: Math.round(n * 1e6) / 1e8, t: 'pct' } : { v: n, t: core.includes(',') ? 'num' : 'int' };
    }
    return { v: t, t: 'text' };
  };
  const visible = (el) => el && !el.closest('[hidden]') && el.getClientRects().length > 0;
  const titleOf = (el) => {
    const sec = el.closest('section, .gb-card');
    const h = sec && sec.querySelector('h2, h3');
    return clean(h) || 'Tabel';
  };
  function collect(page, pageName) {
    const sheets = [];
    const filters = [['Halaman', pageName]];
    page.querySelectorAll('.gb-seg').forEach((g) => {
      if (!visible(g)) return;
      const on = g.querySelector('button[aria-pressed="true"]');
      if (on) filters.push([g.getAttribute('aria-label') || 'Pilihan', clean(on)]);
    });
    page.querySelectorAll('select').forEach((s) => {
      if (!visible(s) || !s.options.length) return;
      const o = s.options[s.selectedIndex];
      if (o) filters.push([s.getAttribute('aria-label') || 'Pilihan', o.textContent.trim()]);
    });
    filters.push(['Diekspor', new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date())]);
    sheets.push({ name: 'Filter', header: ['Filter', 'Pilihan'], rows: filters });

    const kpis = [...page.querySelectorAll('.gb-kpi')].filter(visible);
    if (kpis.length) {
      sheets.push({ name: 'KPI', header: ['Metrik', 'Nilai', 'Perubahan', 'Pembanding'], rows: kpis.map((k) => {
        const lbl = k.querySelector('.gb-lbl'), val = k.querySelector('.gb-val'), d = k.querySelector('.gb-delta'), vs = k.querySelector('.gb-vs');
        return [clean(lbl), parse(clean(val)), parse(clean(d)), clean(vs)];
      }) });
    }
    const extra = [...page.querySelectorAll('.gb-val')].filter((v) => visible(v) && !v.closest('.gb-kpi') && !v.closest('table'));
    if (extra.length) {
      sheets.push({ name: 'Ringkasan', header: ['Bagian', 'Metrik', 'Nilai'], rows: extra.map((v) => {
        const box = v.parentElement;
        const lbl = [...box.querySelectorAll('.gb-lbl')].map(clean).filter(Boolean).join(' · ');
        return [titleOf(v), lbl, parse(clean(v))];
      }) });
    }
    page.querySelectorAll('table').forEach((t) => {
      if (!visible(t)) return;
      const head = [...(t.tHead ? t.tHead.rows[t.tHead.rows.length - 1].cells : [])].map(clean);
      const rows = [...t.tBodies].flatMap((b) => [...b.rows]).filter((r) => r.cells.length > 1 || (r.cells[0] && r.cells[0].colSpan === 1))
        .map((r) => [...r.cells].map((c) => {
          const a = c.querySelector('a[href]');
          const txt = clean(c);
          return a && /^(Buka|Lihat)/.test(txt) ? a.href : parse(txt);
        }));
      if (!head.length && !rows.length) return;
      sheets.push({ name: titleOf(t), header: head.length ? head : rows[0].map((_, i) => 'Kolom ' + (i + 1)), rows });
    });
    return sheets;
  }
  function addButton() {
    const row = document.querySelector('.gb-herorow');
    if (!row || row.querySelector('.gb-export')) return;
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'gb-export'; b.textContent = 'Export Excel';
    b.title = 'Unduh data halaman ini sesuai filter dalam format Excel (.xlsx)';
    const label = b.textContent;
    const flash = (t) => { b.textContent = t; setTimeout(() => { b.textContent = label; }, 3500); };
    b.addEventListener('click', async () => {
      const page = [...document.querySelectorAll('.gb-page')].find((p) => !p.hidden);
      if (!page) return flash('Halaman belum siap');
      const pageName = page.id === 'gsc' ? 'Google Search Console' : 'Google Business Profile';
      b.disabled = true;
      try {
        const sheets = collect(page, pageName);
        const stamp = new Date().toISOString().slice(0, 10);
        await window.XlsxLite.save(window.XlsxLite.build(sheets), `${pageName.replace(/\s+/g, '-')}_${stamp}.xlsx`);
        flash('File siap ✓');
      } catch (e) { console.error(e); flash('Export gagal'); } finally { b.disabled = false; }
    });
    row.append(b);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', addButton); else addButton();
})();
