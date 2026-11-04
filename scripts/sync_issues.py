#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
sync_issues.py
──────────────────────────────────────────────────────────────────────────
기사들을 '이슈'로 자동으로 엮어 data/issues.json 을 갱신한다.
(sync_article_index.py 가 articles.json / search-index.json 을 갱신한 '뒤에' 실행한다.)

이슈에 기사가 묶이는 세 가지 경로
  1) 편집자가 직접 지정 — 기사 <head>에 <meta name="issue" content="이슈id"> 를 넣는다.
       · issues.json 에 그 id 의 이슈가 있으면 그 이슈에 붙고,
       · 없으면 같은 id 를 단 기사들로 새 이슈를 만든다.
  2) 자동 합류 — 어느 이슈에도 속하지 않은 새 기사가 기존 이슈의 기사와 내용이 충분히
     비슷하고(제목·요약·본문 TF-IDF 코사인 유사도) 날짜도 가까우면 그 이슈에 붙는다.
  3) 자동 신설 — 어느 이슈에도 속하지 않은 기사들끼리 서로 충분히 비슷하면(2건 이상)
     새 이슈를 만든다. 제목·요약은 기사에서 자동 생성한다.

편집자 보호 규칙
  · issues.json 의 이슈는 기본적으로 '편집자 소유'다. 이 스크립트는 편집자가 적은
    제목·요약·articles 를 절대 지우거나 바꾸지 않는다(자동 합류한 기사는 "auto_added" 에
    따로 기록해, 다음 실행 때 다시 계산할 수 있게 한다).
  · "auto": true 인 이슈는 자동 신설된 것으로, 실행할 때마다 다시 계산한다.
    제목·요약을 직접 다듬고 싶으면 "auto": true 줄을 지우면 그 순간부터 편집자 소유가 된다.
  · 이슈에서 자동 합류된 기사를 빼고 싶으면 그 이슈의 "exclude" 배열에 기사 경로를 적는다.
  · 기사가 저장소에서 사라지면 자동으로 이슈에서도 빠지고, 기사가 2건 미만이 된 자동 이슈는 사라진다.

사용법
  python3 scripts/sync_issues.py             # issues.json 갱신
  python3 scripts/sync_issues.py --dry-run   # 파일은 건드리지 않고 결과만 출력
  python3 scripts/sync_issues.py --explain   # 기사 쌍별 유사도 상위 목록까지 출력(임계값 조정용)
"""

import hashlib
import json
import math
import re
import sys
from collections import Counter
from datetime import date
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
ARTICLES_PATH = REPO_ROOT / "data" / "articles.json"
SEARCH_INDEX_PATH = REPO_ROOT / "data" / "search-index.json"
ISSUES_PATH = REPO_ROOT / "data" / "issues.json"

# ── 조정 가능한 값 ──────────────────────────────────────────────────────
JOIN_THRESHOLD = 0.26     # 기존 이슈에 합류시키는 최소 유사도
NEW_THRESHOLD = 0.30      # 새 이슈를 만들 때 기사끼리 묶는 최소 유사도
MAX_GAP_DAYS = 45         # 이 일수보다 멀리 떨어진 기사끼리는 묶지 않는다
MIN_NEW_ISSUE_SIZE = 2    # 자동 신설 이슈의 최소 기사 수
BODY_CHARS = 2000         # 본문에서 앞쪽 몇 글자까지 비교에 쓸지
TITLE_WEIGHT = 3          # 제목을 본문보다 몇 배 중요하게 볼지
MAX_POINTS = 3            # 자동 이슈 요약 포인트 최대 개수
POINT_CHARS = 110         # 포인트 한 줄 최대 글자 수

META_ISSUE_RE = re.compile(
    r"""<meta\s+[^>]*name\s*=\s*["']issue["'][^>]*content\s*=\s*["']([^"']+)["']""", re.I)
META_ISSUE_RE2 = re.compile(
    r"""<meta\s+[^>]*content\s*=\s*["']([^"']+)["'][^>]*name\s*=\s*["']issue["']""", re.I)


# ── 유틸 ───────────────────────────────────────────────────────────────
def url_to_path(url):
    """https://yejangfocus.com//목회/a.html → 목회/a.html"""
    return re.sub(r"^https?://[^/]+/+", "", url)


def parse_date(s):
    try:
        return date.fromisoformat(s[:10])
    except Exception:
        return None


def day_gap(a, b):
    da, db = parse_date(a), parse_date(b)
    if not da or not db:
        return 0
    return abs((da - db).days)


def tokens(text):
    """한글·영숫자 덩어리를 글자 2-gram 으로 쪼갠다(조사·어미에 둔감하게)."""
    out = []
    for chunk in re.findall(r"[0-9A-Za-z가-힣]+", text):
        if len(chunk) == 1:
            if chunk.isdigit():
                out.append(chunk)
            continue
        out.extend(chunk[i:i + 2] for i in range(len(chunk) - 1))
    return out


def build_vectors(docs):
    """docs: {key: text} → {key: {token: tf-idf weight(L2 정규화)}}"""
    tfs = {k: Counter(tokens(t)) for k, t in docs.items()}
    df = Counter()
    for tf in tfs.values():
        df.update(tf.keys())
    n = max(len(docs), 1)
    vecs = {}
    for k, tf in tfs.items():
        v = {t: (1 + math.log(c)) * (math.log((1 + n) / (1 + df[t])) + 1) for t, c in tf.items()}
        norm = math.sqrt(sum(x * x for x in v.values())) or 1.0
        vecs[k] = {t: x / norm for t, x in v.items()}
    return vecs


def cosine(a, b):
    if len(a) > len(b):
        a, b = b, a
    return sum(w * b.get(t, 0.0) for t, w in a.items())


def first_sentence(text, limit=POINT_CHARS):
    text = re.sub(r"\s+", " ", text or "").strip()
    m = re.search(r"^(.+?[.!?。]|.+?다\.)(?:\s|$)", text)
    s = m.group(1) if m else text
    if len(s) > limit:
        s = s[: limit - 1].rstrip() + "…"
    return s


def read_meta_issue(rel_path):
    f = REPO_ROOT / rel_path
    if not f.is_file():
        return None
    try:
        head = f.read_text(encoding="utf-8", errors="ignore")[:20000]
    except Exception:
        return None
    m = META_ISSUE_RE.search(head) or META_ISSUE_RE2.search(head)
    return m.group(1).strip() if m else None


# ── 본체 ───────────────────────────────────────────────────────────────
def main(argv):
    dry = "--dry-run" in argv
    explain = "--explain" in argv

    articles = json.loads(ARTICLES_PATH.read_text(encoding="utf-8"))
    try:
        search_index = json.loads(SEARCH_INDEX_PATH.read_text(encoding="utf-8"))
    except Exception:
        search_index = {}
    try:
        issues = json.loads(ISSUES_PATH.read_text(encoding="utf-8"))
    except Exception:
        issues = []

    arts = {}  # path → article dict
    for a in articles:
        arts[url_to_path(a["url"])] = a
    paths = list(arts)

    docs = {}
    for p, a in arts.items():
        body = search_index.get(a["url"], "")[:BODY_CHARS]
        docs[p] = ((a["title"] + " ") * TITLE_WEIGHT) + a.get("desc", "") + " " + body
    vecs = build_vectors(docs)

    if explain:
        pairs = sorted(((cosine(vecs[x], vecs[y]), x, y)
                        for i, x in enumerate(paths) for y in paths[i + 1:]), reverse=True)
        print("── 유사도 상위 쌍 ──")
        for s, x, y in pairs[:25]:
            print(f"{s:.3f}  {arts[x]['title'][:28]}  <->  {arts[y]['title'][:28]}")
        print()

    # 1) 자동 신설 이슈는 매번 다시 계산하므로 일단 떼어 둔다. 편집자 이슈는 그대로 둔다.
    manual = [dict(i) for i in issues if not i.get("auto")]
    old_auto = {i["id"]: i for i in issues if i.get("auto")}

    # 편집자 이슈: 사라진 기사 경로는 auto_added 에서만 정리한다(편집자가 적은 목록은 건드리지 않음).
    for i in manual:
        if "auto_added" in i:
            i["auto_added"] = [p for p in i["auto_added"] if p in arts]
            if not i["auto_added"]:
                del i["auto_added"]

    def members(issue):
        return [p for p in issue.get("articles", []) if p in arts]

    # 편집자 이슈에서 auto_added 로 들어온 기사는 이번에 다시 계산하므로 일단 뺀다.
    for i in manual:
        added = set(i.get("auto_added", []))
        if added:
            i["articles"] = [p for p in i.get("articles", []) if p not in added]
            del i["auto_added"]

    assigned = {}  # path → issue id
    for i in manual:
        for p in i.get("articles", []):
            assigned.setdefault(p, i["id"])

    # 2) <meta name="issue"> 로 지정된 기사
    meta_groups = {}
    for p in paths:
        iid = read_meta_issue(p)
        if iid:
            meta_groups.setdefault(iid, []).append(p)
    by_id = {i["id"]: i for i in manual}
    new_auto = []  # 자동 신설 이슈
    for iid, ps in meta_groups.items():
        if iid in by_id:
            target = by_id[iid]
            for p in ps:
                if p not in target.get("articles", []):
                    target.setdefault("articles", []).append(p)
                    target.setdefault("auto_added", []).append(p)
                assigned[p] = iid
        else:
            issue = {"id": iid, "auto": True, "articles": ps, "_meta": True}
            new_auto.append(issue)
            for p in ps:
                assigned[p] = iid

    def exclusions(issue):
        return set(issue.get("exclude", []))

    # 3) 어디에도 속하지 않은 기사를 기존(편집자) 이슈에 자동 합류
    free = [p for p in paths if p not in assigned]
    # 날짜 오름차순으로 처리해, 먼저 합류한 기사가 뒤 기사의 이웃이 될 수 있게 한다.
    free.sort(key=lambda p: arts[p]["date"])
    still_free = []
    for p in free:
        best, best_s = None, 0.0
        for i in manual:
            if p in exclusions(i):
                continue
            for q in members(i):
                if day_gap(arts[p]["date"], arts[q]["date"]) > MAX_GAP_DAYS:
                    continue
                s = cosine(vecs[p], vecs[q])
                if s > best_s:
                    best, best_s = i, s
        if best is not None and best_s >= JOIN_THRESHOLD:
            best.setdefault("articles", []).append(p)
            best.setdefault("auto_added", []).append(p)
            assigned[p] = best["id"]
            print(f"합류: {arts[p]['title'][:30]} → [{best['id']}] (유사도 {best_s:.2f})")
        else:
            still_free.append(p)

    # 4) 남은 기사끼리 단일 연결 군집화 → 새 이슈
    parent = {p: p for p in still_free}

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    for ix, x in enumerate(still_free):
        for y in still_free[ix + 1:]:
            if day_gap(arts[x]["date"], arts[y]["date"]) > MAX_GAP_DAYS:
                continue
            if cosine(vecs[x], vecs[y]) >= NEW_THRESHOLD:
                parent[find(x)] = find(y)
    clusters = {}
    for p in still_free:
        clusters.setdefault(find(p), []).append(p)
    for ps in clusters.values():
        if len(ps) >= MIN_NEW_ISSUE_SIZE:
            new_auto.append({"id": None, "auto": True, "articles": ps})

    # 5) 자동 이슈의 id·제목·요약 채우기
    result_auto = []
    for iss in new_auto:
        ps = sorted(iss["articles"], key=lambda p: (arts[p]["date"], arts[p].get("uploaded", "")))
        if len(ps) < MIN_NEW_ISSUE_SIZE:
            continue
        newest = ps[-1]
        if not iss.get("id"):
            iss["id"] = "auto-" + hashlib.sha1(ps[0].encode("utf-8")).hexdigest()[:8]
        prev = old_auto.get(iss["id"], {})
        tags = []
        for p in reversed(ps):  # 최신 기사 카테고리를 앞에
            if arts[p]["tag"] not in tags:
                tags.append(arts[p]["tag"])
        points = []
        for p in ps:
            sent = first_sentence(arts[p].get("desc", "")) or arts[p]["title"]
            if sent not in points:
                points.append(sent)
        points = points[-MAX_POINTS:]
        out = {
            "id": iss["id"],
            "auto": True,
            "kicker": prev.get("kicker") if prev.get("kicker_locked") else " · ".join(tags[:2]),
            "title": arts[newest]["title"],
            "points": points,
            "articles": ps,
        }
        result_auto.append(out)
        print(f"신설: [{out['id']}] {out['title'][:40]} ({len(ps)}건)")

    # 편집자 이슈의 임시 키 정리 후 합치기. 편집자 이슈가 앞, 자동 이슈가 뒤.
    final = []
    for i in manual:
        i.pop("_meta", None)
        final.append(i)
    final.extend(result_auto)

    text = json.dumps(final, ensure_ascii=False, indent=2) + "\n"
    if dry:
        print("\n(--dry-run: 파일은 수정하지 않았습니다)")
        return 0
    old = ISSUES_PATH.read_text(encoding="utf-8") if ISSUES_PATH.exists() else ""
    if text != old:
        ISSUES_PATH.write_text(text, encoding="utf-8")
        print("data/issues.json 갱신")
    else:
        print("data/issues.json 변경 없음")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
