"""Mengambil data Instagram & TikTok dari Windsor.ai untuk halaman Social Media Performance.

Butuh secret WINDSOR_API_KEY (Windsor.ai → Settings → API key).
Menulis data/social_*.json yang dibaca oleh social.html.
"""
import datetime as dt
import json
import os
import sys
import time
import urllib.parse
import urllib.request

KEY = os.environ.get("WINDSOR_API_KEY", "").strip()
BASE = "https://connectors.windsor.ai/"
DAILY_DAYS = 200     # cukup untuk rentang 90 hari + periode pembanding
CONTENT_DAYS = 60    # konten ditampilkan maks. 14 hari, disimpan 60 hari terakhir
OUT = os.path.join(os.path.dirname(__file__), "..", "data")


def fetch(connector, fields, date_from=None, date_to=None):
    q = {"api_key": KEY, "fields": ",".join(fields)}
    if date_from:
        q["date_from"], q["date_to"] = date_from, date_to
    url = BASE + connector + "?" + urllib.parse.urlencode(q)
    last = None
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "lit-dashboard-bot"})
            with urllib.request.urlopen(req, timeout=600) as r:
                body = json.load(r)
            rows = body.get("data") if isinstance(body, dict) else body
            if not isinstance(rows, list):
                raise RuntimeError(f"{connector}: jawaban tanpa data: {str(body)[:300]}")
            return rows
        except Exception as e:  # noqa: BLE001
            last = e
            time.sleep(15 * (attempt + 1))
    raise RuntimeError(f"Gagal mengambil {connector}: {last}")


def save(name, rows):
    path = os.path.join(OUT, name + ".json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(rows, f, ensure_ascii=False, separators=(",", ":"))
    print(f"{name}: {len(rows) if isinstance(rows, list) else 1} baris")


def main():
    if not KEY:
        sys.exit("WINDSOR_API_KEY belum diisi di GitHub Secrets.")
    today = dt.date.today()
    d_from = (today - dt.timedelta(days=DAILY_DAYS)).isoformat()
    c_from = (today - dt.timedelta(days=CONTENT_DAYS)).isoformat()
    to = today.isoformat()

    save("social_ig_daily", fetch("instagram", ["date", "account_name", "views", "views_non_followers", "reach", "total_interactions",
                                                "saves", "shares", "follower_count", "profile_links_taps"], d_from, to))
    save("social_ig_profile", fetch("instagram", ["account_name", "account_id", "followers_count", "media_count"]))
    save("social_ig_media", fetch("instagram", ["date", "account_name", "media_id", "media_permalink", "media_type", "media_caption",
                                                "media_views", "media_reach", "media_engagement", "media_saved", "media_shares",
                                                "media_follows"], c_from, to))
    save("social_tt_daily", fetch("tiktok_organic", ["date", "account_name", "video_views", "likes", "comments", "shares",
                                                     "profile_views", "followers_count", "total_followers_count"], d_from, to))
    save("social_tt_videos", fetch("tiktok_organic", ["date", "account_name", "video_id", "video_caption", "video_share_url",
                                                      "video_views_count", "video_reach", "video_likes", "video_comments", "video_shares",
                                                      "video_favorites", "video_new_followers", "video_full_watched_rate"], c_from, to))
    save("social_meta", {"updated": dt.datetime.now(dt.timezone.utc).isoformat(timespec="minutes")})


if __name__ == "__main__":
    main()
