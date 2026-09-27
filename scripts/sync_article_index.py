#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
sync_article_index.py
──────────────────────────────────────────────────────────────────────────
예장포커스(YejangFocus/news) 저장소용 ARTICLE_INDEX(data/articles.json) 자동 동기화 스크립트.

동작 방식
  1. 저장소 안의 모든 기사 HTML 파일(예: 신학/예지예정.html)을 찾는다.
  2. 각 파일에서 다음을 추출한다.
       - 제목: <meta property="og:title"> → <title> → 본문 <h1> 순으로 시도.
         (브라우저로 페이지를 통째 저장해 <head>가 통째로 빠진 파일도 파일명이
         아니라 실제 기사 제목이 나오도록 <h1>을 마지막 안전망으로 둔다.)
       - 요약: <meta property="og:description">(없으면 <meta name="description">)
       - 썸네일: <meta property="og:image"> → 본문 <figure><img> 중 첫 사진 순으로 시도.
         본문 사진도 없으면 홈페이지에서 예포 CI 기본 이미지로 대체한다.
         사진이 data: base64로 파일에 통째 박제된 경우(브라우저로 페이지를
         통째 저장해 올린 파일 특유의 현상)는 디코딩해 assets/images/에
         실제 파일로 저장하고, articles.json에는 다른 사진들처럼 짧은
         URL만 담는다 — 그래야 이 파일이 부풀지 않는다.
       - 카테고리(tag): '폴더명'. 예) 신학/예지예정.html → tag="신학"
  3. 기존 data/articles.json과 병합한다.
       - 새 파일 → 새 항목 추가
       - 이미 있던 파일 → 제목/요약/썸네일/URL 최신화, tag는 하위 폴더 파일이면 폴더명으로 갱신
       - 저장소에서 사라진 파일 → 목록에서 제거
  4. 결과를 최신순(파일의 git 최종 커밋 시각 기준, 없으면 mtime)으로 정렬해
     data/articles.json에 다시 쓴다.

이 스크립트 자체는 파일을 읽고/쓰기만 한다. 실제 "발행할 때마다 자동 동기화"는
함께 제공하는 GitHub Actions 워크플로(.github/workflows/sync-article-index.yml)가
push 이벤트마다 이 스크립트를 실행하고, 바뀐 내용이 있으면 커밋·푸시까지 자동으로 한다.

data/articles.json은 assets/js/site.js가 그대로 읽어 홈페이지(index.html)의 헤드라인·
목록·썸네일까지 전부 자동으로 그려내므로, index.html 자체는 더 이상 손댈 필요가 없다.
"""

import base64
import hashlib
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
IMAGES_DIR = REPO_ROOT / "assets" / "images"
SITE_BASE = "https://yejangfocus.com/news"

# data: URI로 파일에 통째 박제된 사진을 실제 파일로 뽑아낼 때 쓰는 확장자 매핑
DATA_URI_IMAGE_RE = re.compile(r"^data:image/([a-zA-Z0-9.+-]+);base64,(.+)$", re.S)
DATA_URI_EXT = {"jpeg": "jpg", "jpg": "jpg", "png": "png", "webp": "webp", "gif": "gif"}

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


def _meta_content(html_text: str, key: str, key_attr: str = "property") -> str | None:
    """<meta {key_attr}="{key}" content="..."> 형태에서 content 값을 추출.

    content 속성값의 여는/닫는 따옴표가 같은 종류인지 역참조로 확인해야,
    예) content='제목 "부제목"' 처럼 값 안에 다른 종류의 따옴표가 섞여 있어도
    잘리지 않는다. property/content 속성이 쓰인 순서도 둘 다 대응한다.
    """
    key_re = re.escape(key)
    patterns = (
        rf'<meta[^>]+{key_attr}=["\']{key_re}["\'][^>]+content=(["\'])(.*?)\1',
        rf'<meta[^>]+content=(["\'])(.*?)\1[^>]+{key_attr}=["\']{key_re}["\']',
    )
    for pat in patterns:
        m = re.search(pat, html_text)
        if m:
            return html.unescape(m.group(2).strip())
    return None


def extract_title(html_text: str) -> str | None:
    """og:title 우선, 없으면 <title> 태그, 그마저 없으면 본문 <h1>에서 제목을 추출.

    브라우저로 페이지를 통째 "저장"해서 올린 파일처럼 <head>/<title>/
    <meta>가 통째로 빠진 경우가 있는데, 그런 파일도 파일명이 아니라
    실제 기사 제목(= 본문 <h1>)이 나오도록 마지막 안전망을 둔다.
    """
    title = _meta_content(html_text, "og:title", "property")
    if title:
        return title

    m = re.search(r"<title>(.*?)</title>", html_text, re.S)
    if m:
        title = html.unescape(m.group(1).strip())
        # "제목 | 예장포커스" 형태에서 매체명 제거
        title = re.split(r"\s*\|\s*예장포커스\s*$", title)[0].strip()
        if title:
            return title

    m = re.search(r"<h1[^>]*>(.*?)</h1>", html_text, re.S)
    if m:
        inner = re.sub(r"<br\s*/?>", " ", m.group(1), flags=re.I)
        inner = re.sub(r"<[^>]+>", "", inner)
        title = re.sub(r"\s+", " ", html.unescape(inner)).strip()
        if title:
            return title

    return None


def extract_description(html_text: str) -> str | None:
    """홈페이지 카드 요약문에 쓸 설명. og:description 우선, 없으면 meta description."""
    return (
        _meta_content(html_text, "og:description", "property")
        or _meta_content(html_text, "description", "name")
    )


def extract_body_image(html_text: str) -> str | None:
    """og:image가 없을 때, 본문 <figure><img>에 실제로 쓰인 첫 사진의 src를 그대로 돌려준다.
    (상대경로 자산이든 data: base64든 그대로 반환 — 저장 방식은 extract_image가 정한다.)"""
    m = re.search(r"<figure[^>]*>.*?<img[^>]+src=([\"'])(.*?)\1", html_text, re.S)
    if m:
        src = html.unescape(m.group(2).strip())
        if src:
            return src
    return None


def resolve_image_url(src: str, rel_path: Path) -> str:
    """본문 <img src>(상대경로)를 articles.json에 쓸 절대 URL로 바꾼다."""
    if re.match(r"^[a-zA-Z][a-zA-Z0-9+.-]*:", src):
        # 이미 절대 URL(http, https, data 등)이면 그대로 사용
        return src

    parts: list[str] = []
    for part in (*rel_path.parent.parts, *Path(src).parts):
        if part in ("", "."):
            continue
        if part == "..":
            if parts:
                parts.pop()
            continue
        parts.append(part)
    return f"{SITE_BASE}/{'/'.join(parts)}"


def save_data_uri_image(data_uri: str) -> str | None:
    """<figure> 안에 data: base64로 통째 박제된 사진을 실제 파일로 뽑아
    assets/images/에 저장하고 사이트 URL을 돌려준다.

    브라우저로 페이지를 통째 "저장"해서 올린 파일은 본문 사진이 base64로
    파일 안에 그대로 들어있다. 이걸 그대로 articles.json 문자열로 옮기면
    파일 하나가 수백 KB~수 MB로 불어나고, 이 파일은 모든 페이지가 매번
    내려받으므로 사이트 전체가 느려진다. 그래서 디코딩해 실제 이미지
    파일로 뽑아두고, articles.json에는 다른 사진들처럼 짧은 경로만 담는다.
    내용이 같은 사진은 해시가 같아 다시 저장하지 않는다(중복 방지).
    """
    m = DATA_URI_IMAGE_RE.match(data_uri.strip())
    if not m:
        return None
    ext = DATA_URI_EXT.get(m.group(1).lower())
    if not ext:
        return None
    try:
        raw = base64.b64decode(m.group(2), validate=False)
    except Exception:
        return None
    if len(raw) < 2000:
        # 아이콘 등 너무 작은 이미지는 기사 사진으로 보지 않는다.
        return None

    digest = hashlib.sha256(raw).hexdigest()[:16]
    IMAGES_DIR.mkdir(parents=True, exist_ok=True)
    out_path = IMAGES_DIR / f"{digest}.{ext}"
    if not out_path.exists():
        out_path.write_bytes(raw)
    return f"{SITE_BASE}/assets/images/{digest}.{ext}"


def extract_image(html_text: str, rel_path: Path) -> str | None:
    """홈페이지 카드 썸네일 URL. og:image 우선, 없으면 본문 첫 사진, 그마저 없으면 None
    (→ 홈페이지에서 예포 CI 기본 이미지로 대체)."""
    image = _meta_content(html_text, "og:image", "property")
    if image:
        return image

    body_image = extract_body_image(html_text)
    if body_image:
        if body_image.startswith("data:"):
            return save_data_uri_image(body_image)
        return resolve_image_url(body_image, rel_path)

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
            warnings.append(f"[경고] '{rel_path}'에서 제목을 찾지 못했습니다. og:title·<title>·본문 <h1>을 모두 확인해 주세요.")
            title = existing_by_url.get(url, {}).get("title", rel_path.stem)

        desc = extract_description(html_text) or existing_by_url.get(url, {}).get("desc", "")
        image = extract_image(html_text, rel_path) or existing_by_url.get(url, {}).get("image", "")

        new_index.append({
            "tag": tag,
            "title": title,
            "url": url,
            "desc": desc,
            "image": image,
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
