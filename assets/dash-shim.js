/* Pengganti kecil untuk runtime dashboard Claude: memuat data/*.json,
   menjalankan perhitungan (calc), filter (params) dan menggambar ulang. */
(function () {
  const DATASETS = ['gmb_monitoring', 'reviews', 'branches', 'gsc'];
  const DEFAULTS = { page: 'gbp', brand: 'Semua', branch: null, gran: 'month', period: null, metric: 'traffic', rgran: 'week', rperiod: null, gbrand: 'Semua', ggran: 'month', gperiod: null, gmetric: 'clicks', kperiod: null };
  const state = {};
  const calcs = {};
  const cache = {};
  const subs = [];
  let params = { ...DEFAULTS };
  let scheduled = false;

  const redraw = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      for (const fn of subs) {
        try { fn(); } catch (e) { console.error(e); }
      }
    });
  };

  // ---- data GBP live dari Google Drive (lewat /api/gbp di Vercel) ----
  const LIVE = ['gmb_monitoring', 'reviews'];
  let live = null;            // promise hasil /api/gbp
  let liveInfo = null;        // { fetched, sources } atau { error }
  let snapshot = null;        // isi data/meta.json (cadangan)
  const getLive = (fresh) => {
    if (!live || fresh) {
      live = fetch('api/gbp' + (fresh ? '?fresh=' + Date.now() : ''), { cache: 'no-store' })
        .then((r) => r.json().then((j) => { if (!r.ok || j.error) throw new Error(j.error || 'HTTP ' + r.status); return j; }))
        .then((j) => { liveInfo = { fetched: j.fetched, sources: j.sources || {} }; return j; })
        .catch((e) => { liveInfo = { error: String(e.message || e) }; throw e; })
        .finally(renderStatus);
    }
    return live;
  };
  const loadFile = (id) => fetch('data/' + id + '.json', { cache: 'no-store' })
    .then((r) => { if (!r.ok) throw new Error('data/' + id + '.json: ' + r.status); return r.json(); })
    .then((j) => (Array.isArray(j) ? j : j.rows || []));

  const load = (id) => {
    if (state[id]) return;
    state[id] = { status: 'loading', data: [] };
    if (LIVE.includes(id)) {
      getLive()
        .then((j) => { state[id] = { status: 'ok', data: j[id] || [], live: true }; })
        .catch(() => loadFile(id).then((rows) => { state[id] = { status: 'ok', data: rows, live: false }; }))
        .catch((e) => { console.warn(e); state[id] = { status: 'error', data: [], message: String(e) }; })
        .finally(() => { for (const k in cache) delete cache[k]; redraw(); });
      return;
    }
    fetch('data/' + id + '.json', { cache: 'no-store' })
      .then((r) => { if (!r.ok) throw new Error('data/' + id + '.json: ' + r.status); return r.json(); })
      .then((j) => { state[id] = { status: 'ok', data: Array.isArray(j) ? j : j.rows || [] }; })
      .catch((e) => { console.warn(e); state[id] = { status: 'error', data: [], message: String(e) }; })
      .finally(() => { for (const k in cache) delete cache[k]; redraw(); });
  };

  const data = (id) => {
    if (calcs[id]) {
      if (cache[id]) return cache[id];
      const inputs = calcs[id].inputs.map(data);
      const bad = inputs.find((x) => x.status !== 'ok');
      if (bad) return { status: bad.status, data: [] };
      try { cache[id] = { status: 'ok', data: calcs[id].fn(...inputs.map((x) => x.data)) }; }
      catch (e) { console.error(id, e); cache[id] = { status: 'error', data: [], message: String(e) }; }
      return cache[id];
    }
    if (!DATASETS.includes(id)) return { status: 'missing', data: [] };
    load(id);
    return state[id];
  };

  window.dash = {
    data,
    loader() {},
    calc(id, def) { calcs[id] = def; },
    onData(fn) { subs.push(fn); fn(); },
    params: () => ({ ...params }),
    setParams(p) { params = { ...params, ...p }; redraw(); },
    resetParams() { params = { ...DEFAULTS }; redraw(); },
    setLink(name) { history.replaceState(null, '', '#' + name); },
    refresh() { for (const k in state) delete state[k]; for (const k in cache) delete cache[k]; redraw(); },
    colors: ['#c4683f', '#3f7fb5', '#5b9e6c', '#b5913f', '#8a63b5', '#b54f74', '#4fa3a5', '#7a7a7a'],
  };

  let t;
  window.addEventListener('resize', () => { clearTimeout(t); t = setTimeout(redraw, 150); });

  // ---- status sinkronisasi + tombol "Sync sekarang" ----
  const fmt = (iso) => (iso ? new Date(iso).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
  let syncing = false;
  function renderStatus() {
    const el = document.getElementById('data-updated');
    const btn = document.getElementById('sync-now');
    if (btn) { btn.disabled = syncing; btn.textContent = syncing ? 'Menyinkronkan…' : '↻ Sync sekarang'; }
    if (!el) return;
    if (syncing && !liveInfo) { el.textContent = 'Mengambil data dari Google Drive…'; return; }
    if (liveInfo && !liveInfo.error) {
      const s = liveInfo.sources || {};
      const edited = [s.monitoring && s.monitoring.modified, s.reviews && s.reviews.modified].filter(Boolean).sort().pop();
      el.dataset.state = 'live';
      el.textContent = '● Live dari Google Drive · diambil ' + fmt(liveInfo.fetched) + (edited ? ' · sheet terakhir diedit ' + fmt(edited) : '');
      el.title = 'Data Google Business Profile dibaca langsung dari spreadsheet Monitoring GMB dan Review G-Business.';
    } else if (liveInfo && liveInfo.error) {
      el.dataset.state = 'backup';
      el.textContent = '● Koneksi live gagal, memakai data cadangan' + (snapshot && snapshot.updated ? ' per ' + fmt(snapshot.updated) : '') + '.';
      el.title = liveInfo.error;
    } else if (snapshot && snapshot.updated) {
      el.textContent = 'Data terakhir diperbarui: ' + fmt(snapshot.updated);
    }
  }
  function syncNow() {
    if (syncing) return;
    syncing = true; liveInfo = null; renderStatus();
    getLive(true).catch(() => {}).finally(() => {
      syncing = false;
      for (const id of LIVE) delete state[id];
      for (const k in cache) delete cache[k];
      renderStatus(); redraw();
    });
  }
  window.dash.syncNow = syncNow;
  document.addEventListener('click', (e) => { if (e.target.closest('#sync-now')) syncNow(); });
  // ambil ulang otomatis bila tab dibuka lagi setelah 10 menit
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && liveInfo && liveInfo.fetched && Date.now() - new Date(liveInfo.fetched) > 10 * 60 * 1000) syncNow();
  });

  fetch('data/meta.json', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((m) => { snapshot = m; renderStatus(); }).catch(() => {});
})();
