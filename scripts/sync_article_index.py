#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
sync_article_index.py
──────────────────────────────────────────────────────────────────────────
예장포커스(YejangFocus/news) 저장소용 ARTICLE_INDEX(data/articles.json) 자동 동기화 스크립트.

동작 방식
  1. 저장소 안의 모든 기사 HTML 파일(예: 신학/예지예정.html)을 찾는다.
  2. 각 파일의 <meta property="og:title">(없으면 <title>)에서 제목을,
     '폴더명'에서 카테고리(tag)를 추출한다.
     예) 신학/예지예정.html → tag="신학"
  3. 기존 data/articles.json과 병합한다.
       - 새 파일 → 새 항목 추가
       - 이미 있던 파일 → 제목/URL 최신화, tag는 하위 폴더 파일이면 폴더명으로 갱신
       - 저장소에서 사라진 파일 → 목록에서 제거
  4. 결과를 최신순(파일의 git 최종 커밋 시각 기준, 없으면 mtime)으로 정렬해
     data/articles.json에 다시 쓴다.

이 스크립트 자체는 파일을 읽고/쓰기만 한다. 실제 "발행할 때마다 자동 동기화"는
함께 제공하는 GitHub Actions 워크플로(.github/workflows/sync-article-index.yml)가
push 이벤트마다 이 스크립트를 실행하고, 바뀐 내용이 있으면 커밋·푸시까지 자동으로 한다.
"""

import html
import json
import os
import re
import subprocess
import sys
from pathlib import Path

# ── 설정 ────────────────────────────────────────────────────────────────
REPO_ROOT = Path(__file__).resolve().parent.parent
ARTICLE_INDEX_PATH = REPO_ROOT / "data" / "articles.json"
SITE_BASE = "https://yejangfocus.github.io/news"

# 기사로 취급하지 않는 최상위 폴더 (사이트 정보성 페이지, 비공개 자료 등)
EXCLUDE_DIRS = {".git", ".github", "data", "assets", "images", "img", "css", "js", "메인화면", "ETC", "scripts"}

# 기사로 취급하지 않는 루트 파일
EXCLUDE_ROOT_FILES = {"index.html", "404.html", "공지.html"}

# 검색엔진 소유 확인용 파일(naver-site-verification 등)은 내용으로 판별해 제외한다.
SITE_VERIFICATION_RE = re.compile(r"^(?:naver|google)-site-verification:", re.I)

# 폴더가 없는(=루트에 있는) 기사 파일의 tag를 새로 만들 때 사용할 기본값
DEFAULT_TAG_FOR_ROOT_FILES = "교단소식"


def find_article_files():
    """저장소에서 기사 HTML 파일 목록을 (Path) 리스트로 반환."""
    files = []
    for dirpath, dirnames, filenames in os.walk(REPO_ROOT):
        rel_dir = Path(dirpath).relative_to(REPO_ROOT)
        # 제외 폴더는 내려가지 않음
        dirnames[:] = [
            d for d in dirnames
            if d not in EXCLUDE_DIRS and not d.startswith(".")
        ]
        for name in filenames:
            if not name.endswith(".html"):
                continue
            rel_path = (rel_dir / name) if str(rel_dir) != "." else Path(name)
            # 루트에 있는 제외 파일
            if str(rel_dir) == "." and name in EXCLUDE_ROOT_FILES:
                continue
            files.append(rel_path)
    return sorted(files)


def extract_title(html_text: str) -> str | None:
    """og:title 우선, 없으면 <title> 태그에서 제목을 추출."""
    # content 속성값의 실제 구분 따옴표(' 또는 ")를 역참조로 맞춰 잡아야,
    # 예) content='제목 "부제목"' 처럼 다른 종류의 따옴표가 값 안에 섞여 있어도
    # 잘리지 않고 온전한 제목을 추출할 수 있다.
    m = re.search(
        r'<meta[^>]+property=["\']og:title["\'][^>]+content=(["\'])(.*?)\1',
        html_text,
    )
    if m:
        return html.unescape(m.group(2).strip())

    m = re.search(
        r'<meta[^>]+content=(["\'])(.*?)\1[^>]+property=["\']og:title["\']',
        html_text,
    )
    if m:
        return html.unescape(m.group(2).strip())

    m = re.search(r"<title>(.*?)</title>", html_text, re.S)
    if m:
        title = html.unescape(m.group(1).strip())
        # "제목 | 예장포커스" 형태에서 매체명 제거
        title = re.split(r"\s*\|\s*예장포커스\s*$", title)[0].strip()
        return title

    return None


def git_last_commit_epoch(rel_path: Path) -> int:
    """파일의 마지막 git 커밋 시각(unix epoch). git 정보가 없으면 0."""
    try:
        out = subprocess.run(
            ["git", "log", "-1", "--format=%ct", "--", str(rel_path)],
            cwd=REPO_ROOT,
            capture_output=True,
            text=True,
            check=True,
        ).stdout.strip()
        return int(out) if out else 0
    except Exception:
        return 0


def build_url(rel_path: Path) -> str:
    # 저장소 내 실제 파일명(한글 포함)을 그대로 사용 (기존 articles.json 규칙과 동일)
    return f"{SITE_BASE}/{rel_path.as_posix()}"


def load_existing_index() -> list[dict]:
    if ARTICLE_INDEX_PATH.exists():
        with open(ARTICLE_INDEX_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    return []


def main():
    article_files = find_article_files()
    existing = load_existing_index()
    existing_by_url = {item["url"]: item for item in existing}

    new_index = []
    warnings = []

    for rel_path in article_files:
        full_path = REPO_ROOT / rel_path
        try:
            html_text = full_path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            html_text = full_path.read_text(encoding="utf-8", errors="ignore")

        if SITE_VERIFICATION_RE.match(html_text.strip()):
            continue

        title = extract_title(html_text)
        url = build_url(rel_path)

        parts = rel_path.parts
        if len(parts) > 1:
            # 하위 폴더 안에 있는 기사 → 폴더명이 곧 카테고리(tag)
            tag = parts[0]
        else:
            # 루트에 있는 기사 → 기존 tag를 최대한 보존
            tag = existing_by_url.get(url, {}).get("tag", DEFAULT_TAG_FOR_ROOT_FILES)
            if url not in existing_by_url:
                warnings.append(
                    f"[안내] 루트 파일 '{rel_path}'은(는) 폴더가 없어 tag를 자동으로 "
                    f"정할 수 없습니다. 우선 '{DEFAULT_TAG_FOR_ROOT_FILES}'로 넣었으니, "
                    f"data/articles.json에서 직접 확인해 주세요."
                )

        if title is None:
            warnings.append(f"[경고] '{rel_path}'에서 제목을 찾지 못했습니다. og:title 또는 <title>을 확인해 주세요.")
            title = existing_by_url.get(url, {}).get("title", rel_path.stem)

        new_index.append({
            "tag": tag,
            "title": title,
            "url": url,
            "_sort_key": git_last_commit_epoch(rel_path),
        })

    # 최신 글이 위로 오도록 정렬 (git 커밋 시각 기준, 동일하면 기존 순서 유지)
    new_index.sort(key=lambda x: x["_sort_key"], reverse=True)
    for item in new_index:
        del item["_sort_key"]

    changed = new_index != existing

    ARTICLE_INDEX_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(ARTICLE_INDEX_PATH, "w", encoding="utf-8") as f:
        json.dump(new_index, f, ensure_ascii=False, indent=2)
        f.write("\n")

    for w in warnings:
        print(w, file=sys.stderr)

    print(f"기사 {len(new_index)}건 확인 완료. "
          f"{'변경 사항 있음 → data/articles.json 갱신됨' if changed else '변경 사항 없음'}")

    # GitHub Actions에서 커밋 여부를 판단할 수 있도록 종료 코드로 신호를 준다.
    # (workflow 쪽에서 git diff로 실제 변경 여부를 다시 확인하므로 필수는 아님)
    return 0


if __name__ == "__main__":
    sys.exit(main())
