"""Mengambil data Instagram & TikTok dari Windsor.ai untuk halaman Social Media Performance.

Butuh secret WINDSOR_API_KEY (Windsor.ai → Settings → API Access).
Menulis data/social_*.json yang dibaca oleh social.html.
Data harian diambil per 30 hari agar permintaan ke Windsor.ai tidak terlalu besar.
"""
import datetime as dt
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

KEY = os.environ.get("WINDSOR_API_KEY", "").strip()
BASE = "https://connectors.windsor.ai/"
DAILY_DAYS = 200     # cukup untuk rentang 90 hari + periode pembanding
CONTENT_DAYS = 60    # konten ditampilkan maks. 14 hari, disimpan 60 hari terakhir
CHUNK_DAYS = 30
OUT = os.path.join(os.path.dirname(__file__), "..", "data")


def call(connector, fields, date_from=None, date_to=None):
    q = {"api_key": KEY, "fields": ",".join(fields)}
    if date_from:
        q["date_from"], q["date_to"] = date_from, date_to
    url = BASE + connector + "?" + urllib.parse.urlencode(q)
    label = f"{connector} {date_from or ''}..{date_to or ''}"
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "lit-dashboard-bot", "Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=600) as r:
                body = json.load(r)
            rows = body.get("data") if isinstance(body, dict) else body
            if not isinstance(rows, list):
                raise RuntimeError(f"{label}: jawaban tanpa data: {str(body)[:500]}")
            return rows
        except urllib.error.HTTPError as e:
            detail = e.read().decode("utf-8", "replace")[:800].replace(KEY, "***")
            print(f"  {label}: HTTP {e.code} – {detail}")
            if e.code < 500 and e.code != 429:
                raise RuntimeError(f"{label}: ditolak Windsor.ai (HTTP {e.code})") from None
        except Exception as e:  # noqa: BLE001
            print(f"  {label}: {str(e).replace(KEY, '***')}")
        time.sleep(15 * (attempt + 1))
    raise RuntimeError(f"{label}: gagal setelah 4 percobaan")


def fetch_range(connector, fields, start, end):
    rows, cur = [], start
    while cur <= end:
        stop = min(cur + dt.timedelta(days=CHUNK_DAYS - 1), end)
        rows += call(connector, fields, cur.isoformat(), stop.isoformat())
        cur = stop + dt.timedelta(days=1)
    lo, hi = start.isoformat(), end.isoformat()
    return [r for r in rows if lo <= str(r.get("date", ""))[:10] <= hi]


def save(name, rows):
    with open(os.path.join(OUT, name + ".json"), "w", encoding="utf-8") as f:
        json.dump(rows, f, ensure_ascii=False, separators=(",", ":"))
    print(f"{name}: {len(rows) if isinstance(rows, list) else 1} baris")


def main():
    if not KEY:
        sys.exit("WINDSOR_API_KEY belum diisi di GitHub Secrets.")
    today = dt.date.today()
    d_from = today - dt.timedelta(days=DAILY_DAYS)
    c_from = today - dt.timedelta(days=CONTENT_DAYS)
    jobs = [
        ("social_ig_daily", lambda: fetch_range("instagram", ["date", "account_name", "views", "views_non_followers", "reach",
                                                              "total_interactions", "saves", "shares", "follower_count",
                                                              "profile_links_taps"], d_from, today)),
        ("social_ig_profile", lambda: call("instagram", ["account_name", "account_id", "followers_count", "media_count"])),
        ("social_ig_media", lambda: fetch_range("instagram", ["date", "account_name", "media_id", "media_permalink", "media_type",
                                                              "media_caption", "media_views", "media_reach", "media_engagement",
                                                              "media_saved", "media_shares", "media_follows"], c_from, today)),
        ("social_tt_daily", lambda: fetch_range("tiktok_organic", ["date", "account_name", "video_views", "likes", "comments",
                                                                   "shares", "profile_views", "followers_count",
                                                                   "total_followers_count"], d_from, today)),
        ("social_tt_videos", lambda: fetch_range("tiktok_organic", ["date", "account_name", "video_id", "video_caption",
                                                                    "video_share_url", "video_views_count", "video_reach",
                                                                    "video_likes", "video_comments", "video_shares",
                                                                    "video_favorites", "video_new_followers",
                                                                    "video_full_watched_rate"], c_from, today)),
    ]
    failed = []
    for name, job in jobs:
        print(f"Mengambil {name} …")
        try:
            save(name, job())
        except Exception as e:  # noqa: BLE001
            print(f"GAGAL {name}: {e}")
            failed.append(name)
    if len(failed) < len(jobs):
        save("social_meta", {"updated": dt.datetime.now(dt.timezone.utc).isoformat(timespec="minutes"), "failed": failed})
    if failed:
        sys.exit("Sebagian data gagal diambil: " + ", ".join(failed))


if __name__ == "__main__":
    main()
