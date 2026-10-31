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
       - 요약: <meta property="og:description"> → <meta name="description"> →
         그마저 없으면 본문 첫 문단(<p class="lede">, 기사 첫부분)에서 뽑아 채운다.
         홈페이지 카드의 빈 요약 공간이 비어 보이지 않도록 하기 위함.
       - 썸네일: <meta property="og:image"> → 본문 <figure><img> 중 첫 사진 순으로 시도.
         본문 사진도 없으면 articles.json에 예포 CI 기본 이미지(DEFAULT_IMAGE_URL)를
         그대로 채워 넣는다(홈페이지 자바스크립트가 별도로 대체하지 않아도 된다).
         사진이 data: base64로 파일에 통째 박제된 경우(브라우저로 페이지를
         통째 저장해 올린 파일 특유의 현상)는 디코딩해 assets/images/에
         실제 파일로 저장하고, articles.json에는 다른 사진들처럼 짧은
         URL만 담는다 — 그래야 이 파일이 부풀지 않는다.
       - 카테고리(tag): '폴더명'. 예) 신학/예지예정.html → tag="신학"
  3. 기존 data/articles.json과 병합한다.
       - 새 파일 → 새 항목 추가
       - 이미 있던 파일 → 제목/요약/썸네일/URL 최신화, tag는 하위 폴더 파일이면 폴더명으로 갱신
       - 저장소에서 사라진 파일 → 목록에서 제거
  4. 결과를 "최신에 업로드된 순"으로 정렬해 data/articles.json에 다시 쓴다.
     각 기사의 업로드 시각(uploaded)은 그 파일이 git에 (마지막으로) 추가된 커밋
     시각이다. 홈페이지 헤드라인과 모든
     페이지의 상단 카테고리 메뉴가 이 순서를 그대로 따른다. 아래 설명은
     과거 방식(발행 시각 우선)으로, 지금은 같은 업로드 시각끼리의 보조 정렬에만
     쓰인다. 기존 설명: 기사 <head>에 명시된 발행 시각(<meta property="article:published_time">
     또는 "og:published_time", ISO 8601 형식)을 최우선으로 쓰고, 그 태그가
     없는(예: 브라우저로 페이지를 통째 저장해 <head>가 통째로 빠진) 기사만
     그 파일이 저장소에 처음 추가된 git 커밋 시각으로 대체한다. 최종 수정
     시각이 아니라 최초 추가 시각을 쓰는 이유는, 카테고리 메뉴나 광고 배너
     교체처럼 전체 기사 파일을 한꺼번에 고치는 커밋이 지나가도 예전 기사들이
     그 커밋 시각으로 갱신되어 최신 소식 맨 위로 몰리지 않게 하기 위함이다.
     같은 커밋에 여러 기사가 한꺼번에 올라와도 각 기사에 발행 시각을 명시해두면
     그 안에서의 순서까지 정확히 구분된다.

  5. 링크 미리보기 정리(normalize_share_meta): 카카오톡·네이버 등에 기사 링크를
     올렸을 때 제목 위에 기사 사진이 뜨도록 각 기사 <head>의 og:image /
     twitter:image / og:url / canonical 등을 고친다. 기사 사진(og:image → 본문 첫
     사진)을 쓰고, 사진이 없으면 예장포커스 CI(assets/images/og-default.jpg)를 쓴다.
     data: base64 사진은 파일로 뽑아 URL로 바꾸고, webp·대용량 사진은 1200px JPG
     사본(assets/og/)을 만들어 쓴다. (이미지 변환에 Pillow 필요: pip install pillow)

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
from urllib.parse import quote, unquote
from datetime import datetime, timedelta, timezone
from pathlib import Path

# ── 설정 ────────────────────────────────────────────────────────────────
REPO_ROOT = Path(__file__).resolve().parent.parent
ARTICLE_INDEX_PATH = REPO_ROOT / "data" / "articles.json"
IMAGES_DIR = REPO_ROOT / "assets" / "images"
SITE_BASE = "https://yejangfocus.github.io/news"
# 카카오톡·네이버·페이스북 등이 링크 미리보기(og:*)를 만들 때 쓰는 실제 도메인(CNAME)
SITE_URL = "https://yejangfocus.com"

# 링크 미리보기(카카오톡 등)용 이미지 설정
#  - 사진이 없는 기사는 예장포커스 CI(1200x630 JPG)를 대신 보여준다.
#  - 크롤러는 data: URI·webp·너무 큰 파일을 못 읽는 경우가 있어, 그런 사진은
#    1200px JPG로 줄인 사본(assets/og/)을 만들어 og:image로 쓴다.
OG_DEFAULT_REL = "assets/images/og-default.jpg"
OG_DIR = REPO_ROOT / "assets" / "og"
OG_MAX_WIDTH = 1200
OG_MAX_BYTES = 1_500_000
OG_MIN_WIDTH = 200
# 이 이름이 들어간 이미지는 '기사 사진'이 아니라 CI/로고로 보고 사진 없음으로 취급한다.
CI_IMAGE_MARKERS = ("yejang-focus-ci", "38701da0735806f0", "og-default")

# 기사 목록에 남기는 날짜는 한국 독자 기준(KST)으로 표기한다.
KST = timezone(timedelta(hours=9))

# 기사 안에 쓸 만한 사진이 하나도 없을 때 썸네일로 대신 올릴 예포 CI 로고.
# assets/images/yejang-focus-ci.webp는 원본 예포CI.png의 여백을 미리 잘라낸
# 버전이라, 홈페이지 썸네일 박스를 꽉 채워 보기 좋게 채운다.
DEFAULT_IMAGE_URL = f"{SITE_BASE}/assets/images/yejang-focus-ci.webp"

# data: URI로 파일에 통째 박제된 사진을 실제 파일로 뽑아낼 때 쓰는 확장자 매핑
DATA_URI_IMAGE_RE = re.compile(r"^data:image/([a-zA-Z0-9.+-]+);base64,(.+)$", re.S)
DATA_URI_EXT = {"jpeg": "jpg", "jpg": "jpg", "png": "png", "webp": "webp", "gif": "gif"}

# 기사로 취급하지 않는 최상위 폴더 (사이트 정보성 페이지, 비공개 자료 등)
EXCLUDE_DIRS = {".git", ".github", "data", "assets", "images", "img", "css", "js", "메인화면", "ETC", "scripts"}

# 기사로 취급하지 않는 루트 파일
EXCLUDE_ROOT_FILES = {"index.html", "404.html", "공지.html", "대시보드.html"}

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


def _truncate_desc(text: str, limit: int = 110) -> str:
    """카드 요약문 길이를 다른 기사들과 비슷하게 다듬는다.
    가능하면 문장 부호(. ! ?)에서 끊고, 마땅한 문장 경계가 없으면 단어
    단위로 잘라 말줄임표를 붙인다."""
    text = text.strip()
    if len(text) <= limit:
        return text
    cut = text[:limit]
    m = re.search(r"^(.*[.!?])", cut, re.S)
    if m and len(m.group(1)) >= limit * 0.4:
        return m.group(1)
    if " " in cut:
        cut = cut.rsplit(" ", 1)[0]
    return cut.rstrip() + "…"


def extract_lede(html_text: str) -> str | None:
    """og:description·meta description이 모두 없을 때, 본문 첫 문단
    (<p class="lede">, 기사 첫부분)에서 요약문을 대신 뽑아 카드 빈 공간을
    채운다."""
    m = re.search(r'<p class="lede">(.*?)</p>', html_text, re.S)
    if not m:
        return None
    text = re.sub(r"<[^>]+>", "", m.group(1))
    text = re.sub(r"\s+", " ", html.unescape(text)).strip()
    if not text:
        return None
    return _truncate_desc(text)


def extract_description(html_text: str) -> str | None:
    """홈페이지 카드 요약문에 쓸 설명. og:description → meta description →
    본문 첫 문단(기사 첫부분) 순으로 시도한다."""
    return (
        _meta_content(html_text, "og:description", "property")
        or _meta_content(html_text, "description", "name")
        or extract_lede(html_text)
    )


def _body_images(html_text: str) -> list[str]:
    """본문 <figure> 안 <img>의 src를 문서 순서대로 돌려준다(상대경로든 data: base64든
    그대로 — 저장 방식은 find_article_photo가 정한다)."""
    out = []
    for fig in re.finditer(r"<figure[^>]*>(.*?)</figure>", html_text, re.S | re.I):
        for m in re.finditer(r"<img[^>]+src=([\"'])(.*?)\1", fig.group(1), re.S | re.I):
            src = html.unescape(m.group(2).strip())
            if src:
                out.append(src)
    return out


def save_data_uri_image(data_uri: str) -> Path | None:
    """<figure>·og:image 안에 data: base64로 통째 박제된 사진을 실제 파일로 뽑아
    assets/images/에 저장하고 그 파일 경로를 돌려준다.

    브라우저로 페이지를 통째 "저장"해서 올린 파일은 사진이 base64로 파일
    안에 그대로 들어있다. 이걸 <head>의 og:image에 그대로 두면 카카오톡 등
    크롤러가 링크 미리보기 사진을 읽지 못하고, articles.json으로 옮기면 모든
    페이지가 내려받는 파일이 수 MB로 불어난다. 그래서 디코딩해 실제 이미지
    파일로 뽑아두고 짧은 URL만 쓴다. 내용이 같은 사진은 해시가 같아 다시
    저장하지 않는다(중복 방지).
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
    return out_path


def _site_relpath(src: str, rel_path: Path) -> str | None:
    """src(절대 URL·상대경로)가 이 사이트 안의 파일이면 저장소 기준 상대경로를,
    외부 URL이면 None을 돌려준다."""
    for base in (SITE_URL, SITE_BASE):
        if src.startswith(base + "/"):
            return unquote(src[len(base) + 1:].split("#")[0].split("?")[0])
    if re.match(r"^[a-zA-Z][a-zA-Z0-9+.-]*:|^//", src):
        return None
    if src.startswith("/"):
        return unquote(src.lstrip("/").split("#")[0].split("?")[0])
    parts: list[str] = []
    for part in (*rel_path.parent.parts, *Path(unquote(src.split("#")[0].split("?")[0])).parts):
        if part in ("", "."):
            continue
        if part == "..":
            if parts:
                parts.pop()
            continue
        parts.append(part)
    return "/".join(parts)


def _is_ci_image(src: str) -> bool:
    return any(marker in src for marker in CI_IMAGE_MARKERS)


def _image_width(path: Path) -> int | None:
    try:
        from PIL import Image
        with Image.open(path) as im:
            return im.width
    except Exception:
        return None


def make_og_copy(local: Path) -> Path:
    """webp이거나 너무 크거나 넓은 사진은 카카오톡 등이 못 읽을 수 있어 1200px JPG
    사본(assets/og/)을 만들어 돌려준다. 이미 괜찮은 사진이거나 Pillow가 없으면
    원본을 그대로 돌려준다."""
    try:
        from PIL import Image
    except ImportError:
        return local
    too_big = local.stat().st_size > OG_MAX_BYTES
    width = _image_width(local) or 0
    if local.suffix.lower() in (".jpg", ".jpeg", ".png") and not too_big and width <= OG_MAX_WIDTH:
        return local

    key = hashlib.sha1(local.relative_to(REPO_ROOT).as_posix().encode("utf-8")).hexdigest()[:16]
    out = OG_DIR / f"{key}.jpg"
    if out.exists() and out.stat().st_mtime >= local.stat().st_mtime:
        return out
    try:
        with Image.open(local) as im:
            if im.mode in ("RGBA", "LA", "P"):
                im = im.convert("RGBA")
                bg = Image.new("RGB", im.size, (255, 255, 255))
                bg.paste(im, mask=im.split()[-1])
                im = bg
            else:
                im = im.convert("RGB")
            if im.width > OG_MAX_WIDTH:
                im = im.resize((OG_MAX_WIDTH, round(im.height * OG_MAX_WIDTH / im.width)), Image.LANCZOS)
            OG_DIR.mkdir(parents=True, exist_ok=True)
            im.save(out, "JPEG", quality=85, optimize=True)
        return out
    except Exception as e:
        print(f"[경고] {local.name} 미리보기 사본 생성 실패: {e}", file=sys.stderr)
        return local


def _public_url(local: Path) -> str:
    rel = local.relative_to(REPO_ROOT).as_posix()
    return f"{SITE_URL}/{quote(rel, safe='/')}"


def find_article_photo(html_text: str, rel_path: Path) -> tuple[str, Path | None] | None:
    """기사의 대표 사진 = 기사 본문 안의 첫 번째 사진(<figure><img>).
    본문에 사진이 없을 때만 None을 돌려주고, 호출 쪽에서 예장포커스 CI를 쓴다.
    (og:image는 보지 않는다 — 예전에 박아 둔 값이 본문 첫 사진과 달라도 본문
    첫 사진이 우선이다. 이 스크립트가 쓴 og:image는 본문 첫 사진에서 나온 값이다.)
    CI/로고이거나, 저장소에 실제 파일이 없거나, 너무 작은 이미지는 건너뛴다.
    돌려주는 값: (원본 URL, 저장소 안 파일 경로 또는 None[외부 URL])."""
    for src in _body_images(html_text):
        if not src:
            continue
        if src.startswith("data:"):
            local = save_data_uri_image(src)
            if local is None:
                continue
        else:
            if _is_ci_image(src):
                continue
            site_rel = _site_relpath(src, rel_path)
            if site_rel is None:
                return src, None  # 외부 이미지: 확인할 수 없으니 그대로 사용
            local = REPO_ROOT / site_rel
            if not local.is_file():
                continue
        width = _image_width(local)
        if width is not None and width < OG_MIN_WIDTH:
            continue
        return f"{SITE_BASE}/{local.relative_to(REPO_ROOT).as_posix()}", local
    return None


def _set_meta(head_html: str, attr: str, key: str, value: str, overwrite: bool = True) -> str:
    """<meta {attr}="{key}" content="...">를 value로 맞춘다. 있으면 제자리에서 교체
    (overwrite=False면 건드리지 않음), 없으면 </head> 앞에 추가한다."""
    tag_re = re.compile(rf'<meta\s[^>]*{attr}=["\']{re.escape(key)}["\'][^>]*>', re.I)
    new_tag = f'<meta {attr}="{key}" content="{html.escape(value, quote=True)}">'
    m = tag_re.search(head_html)
    if m:
        if not overwrite or _meta_content(m.group(0), key, attr) == value:
            return head_html
        return head_html[:m.start()] + new_tag + head_html[m.end():]
    return _insert_in_head(head_html, new_tag)


def _insert_in_head(text: str, tag: str) -> str:
    m = re.search(r"</head\s*>", text, re.I)
    if m:
        return text[:m.start()] + tag + "\n" + text[m.start():]
    m = re.search(r"<head[^>]*>", text, re.I)
    if m:
        return text[:m.end()] + "\n" + tag + text[m.end():]
    m = re.search(r"<html[^>]*>", text, re.I)
    if m:
        return text[:m.end()] + "\n<head>\n" + tag + "\n</head>" + text[m.end():]
    return text


def normalize_share_meta(full_path: Path, rel_path: Path, title: str | None, desc: str | None):
    """기사 <head>의 링크 미리보기(og:*, twitter:*, canonical) 태그를 정리한다.

    카카오톡·네이버 등에 기사 링크를 올렸을 때 제목 위에 기사 사진이 나오도록
      - og:image: 기사 사진(없으면 예장포커스 CI)의 짧은 https URL로 맞춘다.
        data: base64 사진은 파일로 뽑아 URL로 바꾼다.
      - og:url / canonical / og:title / og:description / og:type / og:site_name /
        twitter:card / twitter:image 가 없으면 채운다(이미 있는 값은 유지).
    바뀐 게 있을 때만 파일을 다시 쓴다(줄바꿈 형식 보존).

    돌려주는 값: (갱신된 html 문자열, 홈페이지 카드 썸네일 URL)
    """
    with open(full_path, "r", encoding="utf-8", errors="ignore", newline="") as f:
        original = f.read()

    photo = find_article_photo(original, rel_path)
    if photo:
        src_url, local = photo
        og_local = make_og_copy(local) if local else None
        og_url = _public_url(og_local) if og_local else src_url
        index_image = src_url
    else:
        og_url = f"{SITE_URL}/{OG_DEFAULT_REL}"
        index_image = DEFAULT_IMAGE_URL

    page_url = f"{SITE_URL}/{quote(rel_path.as_posix(), safe='/')}"
    text = original
    text = _set_meta(text, "property", "og:image", og_url)
    text = _set_meta(text, "name", "twitter:image", og_url)
    text = _set_meta(text, "name", "twitter:card", "summary_large_image", overwrite=False)
    text = _set_meta(text, "property", "og:type", "article", overwrite=False)
    text = _set_meta(text, "property", "og:site_name", "예장포커스", overwrite=False)
    text = _set_meta(text, "property", "og:url", page_url, overwrite=False)
    if title:
        text = _set_meta(text, "property", "og:title", title, overwrite=False)
    if desc:
        text = _set_meta(text, "property", "og:description", desc, overwrite=False)
    if not re.search(r'<link[^>]+rel=["\']canonical["\']', text, re.I):
        text = _insert_in_head(text, f'<link rel="canonical" href="{html.escape(page_url, quote=True)}">')

    if text != original:
        with open(full_path, "w", encoding="utf-8", newline="") as f:
            f.write(text)
    return text, index_image


def extract_published_time(html_text: str) -> int | None:
    """정렬에 쓸 명시적 발행 시각(article:published_time 또는 og:published_time
    메타태그, ISO 8601 + 타임존 형식)을 epoch 초로 돌려준다.

    태그가 없거나, 형식이 잘못됐거나, 타임존이 빠져 있으면 None을 돌려줘
    호출 쪽에서 git 커밋 시각으로 대체하게 한다. 같은 커밋에 여러 기사가
    한꺼번에 올라와 커밋 시각만으로는 순서를 구분할 수 없는 경우, 이 태그를
    기사마다 다르게 적어두면 그 안에서도 정확한 순서를 유지할 수 있다.
    """
    raw = (
        _meta_content(html_text, "article:published_time", "property")
        or _meta_content(html_text, "og:published_time", "property")
    )
    if not raw:
        return None
    try:
        dt = datetime.fromisoformat(raw.strip().replace("Z", "+00:00"))
    except ValueError:
        return None
    if dt.tzinfo is None:
        # 타임존이 없는 값은 어느 지역 기준인지 알 수 없어 신뢰할 수 없다.
        return None
    return int(dt.timestamp())


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


def git_created_epoch(rel_path: Path) -> int:
    """이 경로의 파일이 저장소에 (가장 최근에) 올라온 git 커밋 시각(unix epoch).

    --follow(이름 변경 추적)는 쓰지 않는다. 같은 템플릿으로 만든 기사들은
    내용이 거의 같아서 git이 서로를 "이름만 바뀐 같은 파일"로 잘못 엮어,
    나중에 올린 기사가 옛 기사의 업로드 시각을 물려받기 때문이다. 또
    "가장 최근 추가 커밋"을 쓰므로 파일을 삭제했다가 다시 올리거나 다른
    폴더로 옮겨 올린 기사는 다시 올린 시각이 업로드 시각이 된다. 반면 기사
    내용만 수정하는 커밋(메뉴·배너·템플릿 교체)은 추가가 아니므로 순서에
    영향을 주지 않는다.
    """
    try:
        out = subprocess.run(
            ["git", "log", "--no-renames", "--diff-filter=A", "--format=%ct", "--", str(rel_path)],
            cwd=REPO_ROOT,
            capture_output=True,
            text=True,
            check=True,
        ).stdout.strip().splitlines()
        if out:
            return max(int(x) for x in out)
    except Exception:
        pass
    # 추가 커밋을 못 찾으면(얕은 클론 등) 마지막 커밋 시각으로 대체
    return git_last_commit_epoch(rel_path)


def parse_iso_epoch(raw) -> int | None:
    """articles.json에 저장해 둔 ISO 8601(타임존 포함) 문자열을 epoch 초로."""
    if not raw:
        return None
    try:
        dt = datetime.fromisoformat(str(raw).strip())
    except ValueError:
        return None
    return int(dt.timestamp()) if dt.tzinfo else None


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
        # 링크 미리보기(og:image 등) 정리 + 홈페이지 썸네일 결정. 기사 사진이 없으면
        # 예장포커스 CI가 쓰인다.
        _, image = normalize_share_meta(full_path, rel_path, title, desc)

        # 정렬 기준 = "업로드된 시각"(git에 파일이 추가된 커밋 시각). 매번 git
        # 기록에서 다시 계산하므로 별도 보관이 필요 없다.
        # 발행 시각 메타태그는 같은 커밋에 올라온 기사끼리의 순서를 가르는
        # 보조 키로만 쓴다.
        uploaded = git_created_epoch(rel_path) or int(datetime.now(timezone.utc).timestamp())
        published = extract_published_time(html_text) or 0

        new_index.append({
            "tag": tag,
            "title": title,
            "url": url,
            "desc": desc,
            "image": image,
            "date": datetime.fromtimestamp(uploaded, tz=timezone.utc).astimezone(KST).strftime("%Y-%m-%d"),
            "uploaded": datetime.fromtimestamp(uploaded, tz=timezone.utc).astimezone(KST).isoformat(),
            "_sort_key": (uploaded, published),
        })

    # 최신에 업로드된 기사가 맨 위로 오도록 정렬
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
