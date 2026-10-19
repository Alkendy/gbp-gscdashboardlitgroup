/* Runtime pengganti untuk halaman Social Media Performance di GitHub Pages:
   membaca data/social_*.json (diperbarui GitHub Actions dari Windsor.ai),
   menyaring per tanggal sesuai filter, lalu menjalankan perhitungan (calc). */
(function () {
  const FILES = {
    ig_daily: 'social_ig_daily', ig_prev: 'social_ig_daily', ig_profile: 'social_ig_profile', ig_media: 'social_ig_media',
    tt_daily: 'social_tt_daily', tt_prev: 'social_tt_daily', tt_videos: 'social_tt_videos',
  };
  const RANGE = {
    ig_daily: ['start', 'end'], ig_prev: ['prev_start', 'prev_end'], ig_media: ['c_start', 'c_end'],
    tt_daily: ['start', 'end'], tt_prev: ['prev_start', 'prev_end'], tt_videos: ['c_start', 'c_end'],
  };
  const files = {}, calcs = {}, subs = [];
  let cache = {}, params = {}, scheduled = false;
  const redraw = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => { scheduled = false; for (const fn of subs) { try { fn(); } catch (e) { console.error(e); } } });
  };
  const load = (name) => {
    if (files[name]) return files[name];
    files[name] = { status: 'loading', data: [] };
    fetch('data/' + name + '.json', { cache: 'no-store' })
      .then((r) => { if (!r.ok) throw new Error('data/' + name + '.json: ' + r.status); return r.json(); })
      .then((j) => { files[name] = { status: 'ok', data: Array.isArray(j) ? j : (j.data || []) }; })
      .catch((e) => { console.warn(e); files[name] = { status: 'error', data: [], message: String(e) }; })
      .finally(() => { cache = {}; redraw(); });
    return files[name];
  };
  const data = (id) => {
    if (cache[id]) return cache[id];
    let out;
    if (calcs[id]) {
      const inputs = calcs[id].inputs.map(data);
      const bad = inputs.find((x) => x.status !== 'ok');
      if (bad) return { status: bad.status, data: [] };
      try { out = { status: 'ok', data: calcs[id].fn(...inputs.map((x) => x.data)) }; }
      catch (e) { console.error(id, e); out = { status: 'error', data: [], message: String(e) }; }
    } else if (FILES[id]) {
      const f = load(FILES[id]);
      if (f.status !== 'ok') return f;
      const rg = RANGE[id];
      const a = rg && params[rg[0]], b = rg && params[rg[1]];
      out = { status: 'ok', data: rg ? f.data.filter((r) => { const d = String(r.date).slice(0, 10); return (!a || d >= a) && (!b || d <= b); }) : f.data };
    } else return { status: 'missing', data: [] };
    cache[id] = out;
    return out;
  };
  window.dash = {
    data,
    loader() {},
    calc(id, def) { calcs[id] = def; },
    onData(fn) { subs.push(fn); fn(); },
    params: () => ({ ...params }),
    setParams(p) { params = { ...params, ...p }; cache = {}; redraw(); },
    resetParams() { params = {}; cache = {}; redraw(); },
    setLink(name) { history.replaceState(null, '', '#' + name); },
    refresh() { for (const k in files) delete files[k]; cache = {}; redraw(); },
    colors: ['#c4683f', '#3f7fb5', '#5b9e6c', '#b5913f', '#8a63b5', '#b54f74', '#4fa3a5', '#7a7a7a'],
  };
})();
