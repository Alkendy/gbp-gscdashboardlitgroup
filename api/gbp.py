"""
Endpoint live untuk dashboard: /api/gbp
Membaca langsung dua spreadsheet Google Drive (Monitoring GMB & Review G-Business)
memakai akun robot (service account) di environment variable Vercel
GOOGLE_SERVICE_ACCOUNT_JSON, lalu mengembalikan data GBP semua cabang sebagai JSON.

Hasil disimpan di cache Vercel selama 60 detik supaya Google tidak dipanggil
setiap kali halaman dibuka. Tambahkan ?fresh=1 untuk memaksa ambil ulang.
"""
import datetime as dt
import json
import os
import sys
import traceback
from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, urlparse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "scripts"))

import update_data as U  # noqa: E402  (parser yang sama dengan GitHub Actions)


def collect():
    svc = U.drive()
    ids = {"monitoring": U.CONFIG["monitoring_sheet_id"], "reviews": U.CONFIG["review_sheet_id"]}
    sources = {}
    for key, fid in ids.items():
        meta = svc.files().get(fileId=fid, fields="name,modifiedTime", supportsAllDrives=True).execute()
        sources[key] = {"name": meta.get("name"), "modified": meta.get("modifiedTime")}
    mon = U.parse_monitoring(U.export(svc, ids["monitoring"], U.XLSX))
    rev = U.parse_reviews(U.export(svc, ids["reviews"], "text/csv").decode("utf-8"))
    return {
        "fetched": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "sources": sources,
        "gmb_monitoring": mon,
        "reviews": rev,
    }


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        fresh = "fresh" in parse_qs(urlparse(self.path).query)
        try:
            if not os.environ.get("GOOGLE_SERVICE_ACCOUNT_JSON"):
                raise RuntimeError("Environment variable GOOGLE_SERVICE_ACCOUNT_JSON belum diisi di Vercel.")
            body, status = json.dumps(collect(), ensure_ascii=False, separators=(",", ":")), 200
            cache = "no-store" if fresh else "public, s-maxage=60, stale-while-revalidate=300"
        except Exception as e:  # dashboard otomatis memakai data cadangan
            traceback.print_exc()
            body, status, cache = json.dumps({"error": str(e)}), 500, "no-store"
        data = body.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", cache)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)
