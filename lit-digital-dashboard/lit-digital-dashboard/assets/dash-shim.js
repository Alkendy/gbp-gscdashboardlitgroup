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

  const load = (id) => {
    if (state[id]) return;
    state[id] = { status: 'loading', data: [] };
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

  fetch('data/meta.json', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((m) => {
    const el = document.getElementById('data-updated');
    if (el && m && m.updated) el.textContent = 'Data terakhir diperbarui: ' + new Date(m.updated).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
  }).catch(() => {});
})();
