"""GitHub 이슈 양식('행사·일정 수정·삭제')의 내용대로 data/events.json 의 일정을 고치거나 지운다.

환경변수 ISSUE_BODY 에 이슈 본문이 들어온다. 대상 일정은 '현재 시작일' + '현재 행사명'으로 찾는다
(행사명은 정확히 같거나, 일부만 적어도 그 날짜에 하나로 좁혀지면 된다).
수정할 칸만 채우면 되고, 칸을 비우면 그대로 둔다. 값을 지우려면 칸에 '-' 한 글자를 적는다.
"""
import json
import os
import re
import sys
from datetime import datetime

import add_event as ae

LABELS = {"현재 시작일": "cur_date", "현재 행사명": "cur_title", "작업": "action",
          "새 행사명": "title", "새 시작일": "start", "새 종료일": "end", "새 장소": "place",
          "새 분류": "tag", "새 관련 기사 주소": "url"}


def parse(body):
    out = {}
    for m in re.finditer(r"^### (.+?)\s*\n(.*?)(?=^### |\Z)", body.replace("\r\n", "\n"), re.S | re.M):
        key = LABELS.get(m.group(1).strip())
        val = m.group(2).strip()
        if key and val and val != "_No response_":
            out[key] = val
    return out


def check_date(v, label, errors):
    try:
        datetime.strptime(v, "%Y-%m-%d")
        return True
    except ValueError:
        errors.append(f"{label} 형식이 틀렸습니다: `{v}` (예: 2026-12-10)")
        return False


def main():
    f = parse(os.environ.get("ISSUE_BODY", ""))
    errors = []
    if not f.get("cur_date"):
        errors.append("현재 시작일이 비어 있습니다.")
    elif not check_date(f["cur_date"], "현재 시작일", errors):
        pass
    if not f.get("cur_title"):
        errors.append("현재 행사명이 비어 있습니다.")
    if errors:
        print("\n".join(f"- {e}" for e in errors))
        return 1

    data = json.loads(ae.EVENTS.read_text(encoding="utf-8"))
    same_day = [e for e in data["events"] if e.get("date") == f["cur_date"]]
    hits = [e for e in same_day if e["title"] == f["cur_title"]] or \
           [e for e in same_day if f["cur_title"] in e["title"]]
    if not hits:
        print(f"- {f['cur_date']} 에 '{f['cur_title']}' 일정이 없습니다. 날짜와 행사명을 확인해 주세요.")
        return 1
    if len(hits) > 1:
        print(f"- {f['cur_date']} 에 '{f['cur_title']}' 와 겹치는 일정이 {len(hits)}건입니다. 행사명을 더 정확히 적어 주세요.")
        return 1
    ev = hits[0]

    if f.get("action", "").startswith("삭제"):
        data["events"].remove(ev)
        ae.save(data)
        print(f"삭제: {ev['date']} {ev['title']}")
        return 0

    new = dict(ev)
    for key in ("title", "place", "url"):
        if f.get(key):
            if f[key] == "-" and key != "title":
                new.pop(key, None)
            else:
                new[key] = re.sub(r"\s+", " ", f[key]).strip()
    if f.get("tag"):
        if f["tag"] in ("-", "기타", "(변경 안 함)"):
            if f["tag"] != "(변경 안 함)":
                new.pop("tag", None)
        else:
            new["tag"] = f["tag"]
    if f.get("start"):
        if check_date(f["start"], "새 시작일", errors):
            new["date"] = f["start"]
    if f.get("end"):
        if f["end"] == "-":
            new.pop("end", None)
        elif check_date(f["end"], "새 종료일", errors):
            new["end"] = f["end"]
    if new.get("url") and not re.match(r"^https?://", new["url"]):
        errors.append("기사 주소는 http:// 또는 https:// 로 시작해야 합니다.")
    if "end" in new and new["end"] < new["date"]:
        errors.append("종료일이 시작일보다 빠릅니다.")
    if "end" in new and new["end"] == new["date"]:
        new.pop("end")
    if errors:
        print("\n".join(f"- {e}" for e in errors))
        return 1
    if new == ev:
        print("- 바뀐 내용이 없습니다. 고칠 칸을 채워 주세요.")
        return 1

    data["events"][data["events"].index(ev)] = new
    ae.save(data)
    print(f"수정: {ev['date']} {ev['title']} → {new['date']} {new['title']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
