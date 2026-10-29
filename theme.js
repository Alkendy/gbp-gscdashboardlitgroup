/* Tema Terang / Gelap untuk seluruh dashboard LIT Group.
   Dimuat di <head> agar tema langsung diterapkan sebelum halaman tampil (tanpa kedipan).
   Pilihan disimpan di browser dan berlaku di semua halaman (GBP, GSC, Social Media).
   Bila belum pernah dipilih, tema mengikuti pengaturan perangkat. */
(function () {
  var KEY = 'lit-theme';
  var root = document.documentElement;
  var saved = null;
  try { saved = localStorage.getItem(KEY); } catch (e) {}
  var mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  var current = function () { return root.getAttribute('data-theme') || (mq && mq.matches ? 'dark' : 'light'); };
  var paintMeta = function () {
    var m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute('content', current() === 'dark' ? '#1b1a18' : '#faf9f6');
  };
  if (saved === 'dark' || saved === 'light') root.setAttribute('data-theme', saved);
  root.style.colorScheme = current();

  function apply(theme) {
    root.setAttribute('data-theme', theme);
    root.style.colorScheme = theme;
    try { localStorage.setItem(KEY, theme); } catch (e) {}
    paintMeta();
    sync();
    // gambar ulang grafik agar warnanya mengikuti tema baru
    setTimeout(function () { window.dispatchEvent(new Event('resize')); }, 30);
  }
  var btn;
  function sync() {
    if (!btn) return;
    var dark = current() === 'dark';
    btn.setAttribute('aria-pressed', String(dark));
    btn.setAttribute('aria-label', dark ? 'Switch to Light Mode' : 'Switch to Dark Mode');
    btn.title = btn.getAttribute('aria-label');
    btn.querySelector('.lit-theme-ic').textContent = dark ? '☾' : '☀';
    btn.querySelector('.lit-theme-tx').textContent = dark ? 'Dark Mode' : 'Light Mode';
  }
  function mount() {
    btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'lit-theme';
    btn.innerHTML = '<span class="lit-theme-ic" aria-hidden="true"></span><span class="lit-theme-tx"></span>';
    btn.addEventListener('click', function () { apply(current() === 'dark' ? 'light' : 'dark'); });
    var row = document.querySelector('.gb-herorow');
    if (row) { row.appendChild(btn); }
    else {
      var title = document.querySelector('#header .sm-title');
      if (title) {
        var wrap = document.createElement('div');
        wrap.className = 'lit-titlerow';
        title.parentNode.insertBefore(wrap, title);
        wrap.appendChild(title);
        wrap.appendChild(btn);
      } else { btn.classList.add('lit-theme-float'); document.body.appendChild(btn); }
    }
    paintMeta();
    sync();
    if (mq && mq.addEventListener) mq.addEventListener('change', function () { if (!root.getAttribute('data-theme')) { paintMeta(); sync(); } });
  }
  // dipasang setelah tombol lain (mis. Export Excel) supaya tombol tema berada paling kanan
  var later = function () { setTimeout(mount, 0); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', later); else later();
})();
