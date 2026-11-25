"""GitHub 이슈 양식('행사·일정 등록')의 내용을 data/events.json 에 추가하고 홈을 다시 그린다.

환경변수 ISSUE_BODY 에 이슈 본문이 들어온다(양식이 만든 '### 라벨 \\n\\n 값' 형식).
성공하면 종료코드 0, 입력이 잘못되면 사유를 stdout 에 한 줄씩 적고 1 을 돌려준다.
"""
import json
import os
import re
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
EVENTS = ROOT / "data" / "events.json"
LABELS = {"행사명": "title", "시작일": "start", "종료일 (여러 날 행사만)": "end", "장소": "place",
          "분류": "tag", "관련 기사 주소 (선택)": "url"}


def parse(body):
    out = {}
    for m in re.finditer(r"^### (.+?)\s*\n(.*?)(?=^### |\Z)", body.replace("\r\n", "\n"), re.S | re.M):
        key = LABELS.get(m.group(1).strip())
        val = m.group(2).strip()
        if key and val and val != "_No response_":
            out[key] = val
    return out


def main():
    f = parse(os.environ.get("ISSUE_BODY", ""))
    errors = []
    title = re.sub(r"\s+", " ", f.get("title", "")).strip()
    if not title:
        errors.append("행사명이 비어 있습니다.")
    dates = {}
    for k, label in (("start", "시작일"), ("end", "종료일")):
        if f.get(k):
            try:
                dates[k] = datetime.strptime(f[k], "%Y-%m-%d").date()
            except ValueError:
                errors.append(f"{label} 형식이 틀렸습니다: `{f[k]}` (예: 2026-12-10)")
    if "start" not in dates and not any("시작일" in e for e in errors):
        errors.append("시작일이 비어 있습니다.")
    if "start" in dates and "end" in dates and dates["end"] < dates["start"]:
        errors.append("종료일이 시작일보다 빠릅니다.")
    url = f.get("url", "")
    if url and not re.match(r"^https?://", url):
        errors.append("기사 주소는 http:// 또는 https:// 로 시작해야 합니다.")
    if errors:
        print("\n".join(f"- {e}" for e in errors))
        return 1

    ev = {"date": f["start"], "title": title}
    if "end" in dates and dates["end"] != dates["start"]:
        ev["end"] = f["end"]
    if f.get("place"):
        ev["place"] = f["place"]
    if f.get("tag") and f["tag"] != "기타":
        ev["tag"] = f["tag"]
    if url:
        ev["url"] = url

    data = json.loads(EVENTS.read_text(encoding="utf-8"))
    if any(e.get("date") == ev["date"] and e.get("title") == ev["title"] for e in data["events"]):
        print("- 같은 날짜·행사명의 일정이 이미 있습니다.")
        return 1
    data["events"].append(ev)
    data["events"].sort(key=lambda e: e["date"], reverse=True)
    lines = ",\n".join("    " + json.dumps(e, ensure_ascii=False) for e in data["events"])
    EVENTS.write_text('{\n  "_설명": ' + json.dumps(data.get("_설명", ""), ensure_ascii=False)
                      + ',\n  "events": [\n' + lines + "\n  ]\n}\n", encoding="utf-8")

    import build_pages
    build_pages.inject_home(json.loads((ROOT / "data" / "articles.json").read_text(encoding="utf-8")))
    print(f"추가: {ev['date']} {title}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
