# LIT Group · Digital Performance Dashboard

Dashboard **Google Business Profile (GBP)** dan **Google Search Console (GSC)** untuk Ever, Everbody, Ruhee, Lavere dan Ruheediary.
Developed by DDigital.

- Website statis (GitHub Pages), nyaman dibuka di HP Android & iPhone.
- Data diambil otomatis dari Google Drive oleh GitHub Actions **setiap 3 jam** (bisa juga manual).
- Sumber data:
  - Spreadsheet *Monitoring Peformance Local SEO* → sheet Monitoring GMB EVER / RUHEE / LAVERE
  - Spreadsheet *Dasdboard Performance Review Google Outlet* → sheet Review G-Business
  - Folder GSC berisi file export Search Console (`ever.co.id…`, `ruhee.id…`, `laverelash.com…`, `ruheediary.com…`)

ID file & folder ada di `config.json`.

## Isi repo

| File | Fungsi |
|---|---|
| `index.html`, `assets/` | Tampilan dashboard |
| `data/branches.json` | Daftar cabang, kota & link Google Maps (boleh diedit, mis. diganti link profil Google Business asli) |
| `data/*.json` lainnya | Dibuat otomatis oleh workflow — jangan diedit manual |
| `scripts/update_data.py` | Mengambil & mengolah data dari Google Drive |
| `.github/workflows/update-data.yml` | Jadwal update otomatis |

## Cara pasang (sekali saja)

### 1. Upload ke GitHub
1. Buat repository baru di GitHub (mis. `lit-dashboard`).
2. Klik **Add file → Upload files**, lalu seret **semua isi** folder hasil ekstrak zip ini (termasuk folder `.github`).
   Jika folder `.github` tidak ikut terupload lewat browser, buat file
   `.github/workflows/update-data.yml` lewat **Add file → Create new file** dan tempel isinya.
3. Klik **Commit changes**.

### 2. Buat akun robot (service account) Google
1. Buka https://console.cloud.google.com → buat project baru.
2. **APIs & Services → Library** → aktifkan **Google Drive API**.
3. **APIs & Services → Credentials → Create credentials → Service account** → beri nama, selesai.
4. Buka service account tsb → tab **Keys → Add key → Create new key → JSON** → file JSON terunduh.
5. Salin alamat email service account (mis. `dashboard@project-id.iam.gserviceaccount.com`).

### 3. Beri akses ke data
Di Google Drive, **Share** ketiga item berikut ke email service account sebagai **Viewer**:
- spreadsheet Monitoring Peformance Local SEO
- spreadsheet Dasdboard Performance Review Google Outlet
- folder GSC

### 4. Simpan kunci di GitHub
Repo → **Settings → Secrets and variables → Actions → New repository secret**
- Name: `GOOGLE_SERVICE_ACCOUNT_JSON`
- Secret: tempel **seluruh isi** file JSON dari langkah 2.

### 5. Jalankan update pertama
Repo → tab **Actions** → **Update data dashboard** → **Run workflow**. Tunggu sampai centang hijau (±1–2 menit).

### 6. Aktifkan website
Repo → **Settings → Pages** → Source: **Deploy from a branch** → Branch: `main` / `(root)` → Save.
Beberapa menit kemudian dashboard bisa dibuka di `https://<username>.github.io/<nama-repo>/`.

## Update data rutin
- GBP & review: cukup isi spreadsheet seperti biasa.
- GSC: taruh export bulanan baru ke folder GSC; nama file harus memuat domainnya
  (mis. `ever.co.id-Performance-on-Search-2026-11-01.xlsx`).
- Website ter-update otomatis setiap 3 jam, atau klik **Run workflow** untuk update saat itu juga.
  Jadwal bisa diubah di baris `cron` pada `.github/workflows/update-data.yml`.

## Penting: privasi
GitHub Pages dari repository **public** bisa dibuka siapa pun yang tahu alamatnya, dan file `data/*.json` ikut terlihat.
Jika data ini rahasia, gunakan repository **private** dengan paket GitHub yang mendukung Pages untuk repo private
(GitHub Pro/Team/Enterprise), atau jangan aktifkan Pages dan buka `index.html` secara lokal.

## Menjalankan di komputer (opsional)
```bash
pip install -r requirements.txt
export GOOGLE_SERVICE_ACCOUNT_JSON="$(cat service-account.json)"
python scripts/update_data.py
python -m http.server 8000   # lalu buka http://localhost:8000
```


## Social Media Performance (Instagram & TikTok)

Halaman `social.html` menampilkan performa akun Instagram dan TikTok semua brand (EVER, Ruhee, Lavere): ringkasan per akun, metrik dan rasio, tren harian, serta daftar konten 7/14 hari. Halaman ini bisa dibuka dari menu kiri **Social Media Performance**.

- Data diambil dari **Windsor.ai** oleh GitHub Actions (`scripts/update_social.py`) bersamaan dengan update GBP/GSC setiap 3 jam.
- Disimpan sebagai `data/social_*.json` (jangan diedit manual): data harian 200 hari terakhir dan konten 60 hari terakhir.

### Pemasangan (sekali saja)
1. Windsor.ai → menu akun → **API key** → salin API key.
2. Repo → **Settings → Secrets and variables → Actions → New repository secret**
   - Name: `WINDSOR_API_KEY`
   - Secret: tempel API key Windsor.ai.
3. Repo → tab **Actions** → **Update data dashboard** → **Run workflow**.
4. Buka `https://<username>.github.io/<nama-repo>/social.html` atau pilih menu **Social Media Performance**.

Akun Instagram/TikTok yang tampil mengikuti akun yang terhubung di Windsor.ai. Pengelompokan brand diatur di konstanta `BRAND` di dalam `social.html`.
