"""GoatCounter 조회수로 '많이 본 뉴스' 순위(data/popular.json)를 만든다.

환경변수 GOATCOUNTER_TOKEN(API 토큰, 'Read statistics' 권한)이 없으면 아무것도 하지 않는다.
기본은 최근 7일 조회수. 기사 주소(data/articles.json)에 있는 페이지만 담는다.
  python3 scripts/fetch_popular.py [일수]
"""
import json
import os
import sys
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parent.parent
CODE = json.loads((ROOT / "data/site-config.json").read_text(encoding="utf-8"))["analytics"]["id"]
SITE = "https://yejangfocus.com"
OUT = ROOT / "data/popular.json"


def main():
    token = os.environ.get("GOATCOUNTER_TOKEN", "").strip()
    if not token:
        print("GOATCOUNTER_TOKEN 없음 — 생략")
        return
    days = int(sys.argv[1]) if len(sys.argv) > 1 else 7
    end = datetime.now(timezone.utc)
    start = end - timedelta(days=days)
    url = (f"https://{CODE}.goatcounter.com/api/v0/stats/hits?limit=100&daily=false"
           f"&start={start:%Y-%m-%dT%H:%M:%SZ}&end={end:%Y-%m-%dT%H:%M:%SZ}")
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
    with urllib.request.urlopen(req, timeout=30) as r:
        hits = json.load(r).get("hits", [])
    articles = {a["url"] for a in json.loads((ROOT / "data/articles.json").read_text(encoding="utf-8"))}
    items = []
    for h in sorted(hits, key=lambda h: -h.get("count", 0)):
        u = SITE + unquote(h.get("path", ""))
        if u in articles and all(i["url"] != u for i in items):
            items.append({"url": u, "count": h["count"]})
    if not items:
        print("집계된 기사 없음 — 기존 파일 유지")
        return
    OUT.write_text(json.dumps({"days": days, "items": items[:20]}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{len(items[:20])}건 저장")


if __name__ == "__main__":
    main()
