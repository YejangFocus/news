"""정적 페이지 생성기 (sync_article_index.py 가 기사 목록을 만든 뒤 호출한다).

만드는 것
  1) 카테고리 목록 페이지  <카테고리>/index.html, <카테고리>/page/N/index.html
     전체 목록 페이지      전체/index.html, 전체/page/N/index.html
     → JS 없이도, 검색엔진 크롤러에게도 기사 목록이 그대로 보인다.
  2) 검색 결과 페이지      검색.html  (?q=검색어, 내용은 assets/js/search-page.js 가 채운다)
  3) 홈페이지 첫 화면의 정적 헤드라인
     index.html 안의 <!--yf:이름--> … <!--/yf:이름--> 사이를 서버(빌드) 쪽에서 미리 채운다.
     site.js 가 로드되면 같은 내용으로 다시 그리므로 화면은 달라지지 않는다.

같은 입력이면 항상 같은 결과가 나오게(타임스탬프 없음) 만들어서, 기사 변화가 없을 때는
불필요한 커밋이 생기지 않는다.
"""
import html
import json
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import quote

REPO_ROOT = Path(__file__).resolve().parent.parent
SITE_URL = "https://yejangfocus.com"
PER_PAGE = 20
ALL_DIR = "전체"
TEMPLATE_PAGE = REPO_ROOT / "메인화면" / "이용약관.html"   # 머리말·메뉴·푸터를 빌려 온다
DEFAULT_IMAGE = "/assets/images/yejang-focus-ci.webp"

# 색이 너무 많으면 산만하므로, 속보만 빨강이고 나머지 분류 표시는 모두 남색으로 통일한다(site.js 와 같은 규칙).
TAG_COLOR = {"속보": "var(--red)"}


def esc(s) -> str:
    return html.escape(s or "", quote=True)


def tag_color(tag: str) -> str:
    return TAG_COLOR.get(tag, "var(--navy)")


def abs_path(rel: str) -> str:
    """사이트 루트 기준 경로(/교단/)를 퍼센트 인코딩해 돌려준다."""
    return "/" + quote(rel, safe="/")


# ── 공통 껍데기 ─────────────────────────────────────────────────────────────
def _template_parts():
    src = TEMPLATE_PAGE.read_text(encoding="utf-8")
    head = src[: src.index('<div class="meta-bar">')]
    tail = src[re.search(r'  <div class="divider"', src).start():]
    # 템플릿 페이지의 <main> 여닫는 태그는 떼어 낸다(각 페이지 본문이 자기 <main>을 직접 넣는다).
    head = head.replace('<main id="main">', '')
    tail = tail.replace('</main>\n', '', 1)
    head = head.replace('"../assets/', '"/assets/')
    tail = tail.replace('"../assets/', '"/assets/').replace("window.SITE_ROOT = '../';", "window.SITE_ROOT = '/';")
    tail = tail.replace('<script src="../assets/', '<script src="/assets/')
    return head, tail


def page_shell(title, desc, rel_url, body, *, cat=None, noindex=False, prev_next=None, extra_script=""):
    head, tail = _template_parts()
    url = f"{SITE_URL}/{quote(rel_url, safe='/')}"
    head = re.sub(r"<title>.*?</title>", lambda m: f"<title>{esc(title)} | 예장포커스</title>", head, count=1)
    head = re.sub(r'(<meta name="description" content=")[^"]*', lambda m: m.group(1) + esc(desc), head)
    head = re.sub(r'(<meta property="og:title" content=")[^"]*', lambda m: m.group(1) + esc(title), head)
    head = re.sub(r'(<meta property="og:description" content=")[^"]*', lambda m: m.group(1) + esc(desc), head)
    head = head.replace("https://yejangfocus.com/메인화면/이용약관.html", url)
    extra = ""
    if noindex:
        extra += '<meta name="robots" content="noindex,follow">\n'
    if prev_next:
        prev_url, next_url = prev_next
        if prev_url:
            extra += f'<link rel="prev" href="{SITE_URL}{prev_url}">\n'
        if next_url:
            extra += f'<link rel="next" href="{SITE_URL}{next_url}">\n'
    if extra:
        head = head.replace("</head>", extra + "</head>", 1)
    scripts = ""
    if cat:
        scripts += f"<script>window.SITE_CAT = {html_js(cat)};</script>\n"
    scripts += extra_script
    tail = tail.replace("<script>window.SITE_ROOT", scripts + "<script>window.SITE_ROOT", 1)
    return head + body + "\n" + tail


def html_js(s: str) -> str:
    return "'" + s.replace("\\", "\\\\").replace("'", "\\'") + "'"


LIST_CSS = """<style>
  .yf-list{list-style:none;margin:18px 0 0;padding:0;}
  .yf-list li{display:flex;gap:16px;padding:18px 0;border-bottom:1px solid var(--rule-soft);}
  .yf-list .thumb{flex:none;width:168px;height:auto;aspect-ratio:4/3;object-fit:cover;border-radius:3px;background:var(--caption-bg);}
  .yf-list .thumb.is-fallback{object-fit:contain;padding:8px;}
  .yf-list .tg{font-size:12px;font-weight:700;letter-spacing:.04em;}
  .yf-list h2{font-family:'Noto Serif KR',serif;font-size:18px;line-height:1.45;margin:3px 0 6px;font-weight:700;word-break:keep-all;overflow-wrap:break-word;}
  .yf-list a{color:inherit;text-decoration:none;}
  .yf-list h2{border:0;padding:0;}
  .yf-list li h2{color:#0a0a0a;font-weight:800;letter-spacing:-.01em;}
  :root[data-theme="dark"] .yf-list li h2{color:#fff;}
  @media (prefers-color-scheme:dark){:root:not([data-theme="light"]) .yf-list li h2{color:#fff;}}
  .yf-list a:hover h2{text-decoration:underline;}
  .yf-list p{margin:0;font-size:13.5px;line-height:1.65;color:var(--muted);}
  .yf-list time{display:block;margin-top:6px;font-size:12px;color:var(--muted);}
  .yf-pager{display:flex;flex-wrap:wrap;gap:6px;justify-content:center;margin:28px 0 8px;}
  .yf-pager a,.yf-pager span{min-width:36px;padding:7px 12px;text-align:center;border:1px solid var(--rule-soft);border-radius:3px;font-size:13.5px;}
  .yf-pager .cur{background:var(--accent);color:#fff;border-color:var(--accent);font-weight:700;}
  .yf-pager a:hover{background:var(--accent-soft);}
  .yf-empty{padding:40px 0;text-align:center;color:var(--muted);}
  .yf-cats{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0 4px;font-size:13px;}
  .yf-cats a{padding:5px 12px;border:1px solid var(--rule-soft);border-radius:16px;}
  .yf-cats a.on{background:var(--accent);color:#fff;border-color:var(--accent);}
  @media (max-width:560px){.yf-list li{flex-direction:column;}.yf-list .thumb{width:100%;}}
</style>"""


def _thumb(item, cls="thumb"):
    tag = _home_thumb(item, cls, False, "(max-width: 560px) 100vw, 200px")
    return tag.replace(f'alt="{esc(item["title"])}"', 'alt=""')


def _list_item(item):
    return (f'<li><a href="{esc(item["url"])}" aria-hidden="true" tabindex="-1">{_thumb(item)}</a>'
            f'<div><span class="tg" style="color:{tag_color(item["tag"])};">{esc(item["tag"])}</span>'
            f'<a href="{esc(item["url"])}"><h2>{esc(item["title"])}</h2></a>'
            + (f'<p>{esc(item["desc"])}</p>' if item.get("desc") else "")
            + f'<time datetime="{esc(item["date"])}">{esc(item["date"].replace("-", "."))}</time></div></li>')


def _page_url(base: str, n: int) -> str:
    return f"{base}/" if n == 1 else f"{base}/page/{n}/"


def _pager(base: str, page: int, pages: int) -> str:
    if pages <= 1:
        return ""
    out = ['<nav class="yf-pager" aria-label="페이지 이동">']
    if page > 1:
        out.append(f'<a href="{abs_path(_page_url(base, page - 1))}" rel="prev">이전</a>')
    for n in range(1, pages + 1):
        if n == page:
            out.append(f'<span class="cur" aria-current="page">{n}</span>')
        else:
            out.append(f'<a href="{abs_path(_page_url(base, n))}">{n}</a>')
    if page < pages:
        out.append(f'<a href="{abs_path(_page_url(base, page + 1))}" rel="next">다음</a>')
    out.append("</nav>")
    return "".join(out)


def build_list_pages(index, categories):
    """카테고리·전체 목록 페이지를 쓰고, 만든 경로(사이트 루트 기준, 끝이 '/')를 돌려준다."""
    written = []
    groups = [(ALL_DIR, "전체 기사", index)]
    for cat in categories:
        items = [a for a in index if a["tag"] == cat]
        if items:
            groups.append((cat, f"{cat} 기사", items))

    for base, label, items in groups:
        pages = max(1, -(-len(items) // PER_PAGE))
        for page in range(1, pages + 1):
            chunk = items[(page - 1) * PER_PAGE: page * PER_PAGE]
            rel = _page_url(base, page)
            title = label + (f" ({page}쪽)" if page > 1 else "")
            desc = (f"예장포커스의 {label} 목록입니다. 총 {len(items)}건, 최신순." if base != ALL_DIR
                    else f"예장포커스가 전한 모든 기사 {len(items)}건을 최신순으로 모았습니다.")
            body = (LIST_CSS + '\n  <main id="main">\n'
                    f'  <span class="tag">{esc(base if base != ALL_DIR else "전체")}</span>\n'
                    f'  <h1>{esc(label)}</h1>\n'
                    f'  <p class="subhead">총 {len(items)}건 · 최신순</p>\n'
                    + ('  <ul class="yf-list">\n' + "\n".join("    " + _list_item(a) for a in chunk) + "\n  </ul>\n"
                       if chunk else '  <p class="yf-empty">아직 등록된 기사가 없습니다.</p>\n')
                    + "  " + _pager(base, page, pages) + "\n  </main>\n")
            prev_url = abs_path(_page_url(base, page - 1)) if page > 1 else None
            next_url = abs_path(_page_url(base, page + 1)) if page < pages else None
            doc = page_shell(title, desc, rel, body, cat=(None if base == ALL_DIR else base),
                             prev_next=(prev_url, next_url))
            out = REPO_ROOT / rel / "index.html"
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_text(doc, encoding="utf-8")
            written.append(rel)
    return written


def build_search_page():
    body = (LIST_CSS + """
  <main id="main">
  <span class="tag">검색</span>
  <h1>기사 검색</h1>
  <form class="yf-sform" action="/검색.html" method="get" role="search">
    <label for="yfq" class="yf-sr">검색어</label>
    <input id="yfq" name="q" type="search" placeholder="제목·내용 검색 (초성 검색 가능: ㅊㅇ)" autocomplete="off">
    <button type="submit">검색</button>
  </form>
  <div id="yffilters" class="yf-filters" hidden></div>
  <div id="yfextra"></div>
  <p class="subhead" id="yfsum" aria-live="polite"></p>
  <ul class="yf-list" id="yfres"></ul>
  <div id="yfpager"></div>
  <noscript><p class="yf-empty">검색 기능을 쓰려면 자바스크립트를 켜 주세요. <a href="/전체/">전체 기사 목록 보기</a></p></noscript>
  </main>
  <style>
    .yf-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);}
    .yf-sform{display:flex;gap:8px;margin:14px 0 6px;}
    .yf-sform input{flex:1;min-width:0;height:42px;padding:0 12px;border:1px solid var(--rule-soft);border-radius:3px;font:15px 'Noto Sans KR',sans-serif;background:var(--paper);color:var(--ink);}
    .yf-sform button{height:42px;padding:0 20px;border:0;border-radius:3px;background:var(--accent);color:#fff;font:700 14px 'Noto Sans KR',sans-serif;cursor:pointer;}
    .yf-list mark{background:#ffe38a;color:#1c1a16;border-radius:2px;padding:0 1px;}
    .yf-filters{display:flex;flex-wrap:wrap;align-items:center;gap:8px 14px;margin:12px 0 4px;font:13px 'Noto Sans KR',sans-serif;}
    .yf-filters[hidden]{display:none;}
    .yf-chips{display:flex;flex-wrap:wrap;gap:6px;}
    .yf-chip{padding:4px 11px;border:1px solid var(--rule-soft);border-radius:16px;background:var(--paper);color:var(--ink);font:inherit;cursor:pointer;}
    .yf-chip.on{background:var(--accent);border-color:var(--accent);color:#fff;}
    .yf-filters select{height:30px;padding:0 8px;border:1px solid var(--rule-soft);border-radius:3px;background:var(--paper);color:var(--ink);font:inherit;}
    .yf-box2{margin:14px 0;padding:12px 14px;border:1px solid var(--rule-soft);border-radius:6px;font:14px/1.6 'Noto Sans KR',sans-serif;}
    .yf-box2 h2{margin:0 0 8px;font-size:13px;font-weight:700;color:var(--muted);}
    .yf-box2 .row{display:flex;flex-wrap:wrap;gap:6px;align-items:center;}
    .yf-box2 .row a{padding:3px 10px;border:1px solid var(--rule-soft);border-radius:14px;color:var(--ink);}
    .yf-box2 button.clr{margin-left:auto;border:0;background:none;color:var(--muted);font:inherit;font-size:12px;cursor:pointer;text-decoration:underline;}
    .yf-gl{border-left:3px solid var(--accent);padding-left:12px;margin:0 0 10px;}
    .yf-gl b{font-size:15px;}.yf-gl small{color:var(--muted);margin-left:6px;}
    .yf-gl p{margin:4px 0;font-size:13.5px;}.yf-gl .src a{font-size:12.5px;text-decoration:underline;margin-right:8px;}
    .yf-new{display:inline-block;margin-right:5px;padding:0 5px;border-radius:3px;background:#cc2b24;color:#fff;font:700 10.5px/17px 'Noto Sans KR',sans-serif;vertical-align:2px;letter-spacing:0;}
    .yf-new.hot{background:#111;}
  </style>
""")
    doc = page_shell("기사 검색", "예장포커스 기사를 제목과 본문에서 검색합니다.", "검색.html", body, noindex=True,
                     extra_script='<script src="/assets/js/search-page.js" defer></script>\n')
    (REPO_ROOT / "검색.html").write_text(doc, encoding="utf-8")


# ── 홈페이지 정적 헤드라인 (site.js renderHomepage 와 같은 마크업) ─────────────────
IMG_RE = re.compile(r"^(.*/assets/images/[^/]+?)(-640)?\.(?:jpe?g|png|webp)$", re.I)


def _img_size(web_path):
    """/assets/images/foo.webp 의 실제 가로·세로(없으면 None). 읽는 건 파일 머리말뿐이라 빠르다."""
    p = REPO_ROOT / web_path.lstrip("/")
    if not p.is_file():
        return None
    try:
        from PIL import Image
        with Image.open(p) as im:
            return im.size
    except Exception:
        return None


def _home_thumb(item, cls, eager=False, sizes=None):
    """site.js 의 thumbImgHtml() 과 같은 마크업(WebP srcset + 지연 로딩)."""
    sizes = sizes or "(max-width: 700px) 45vw, 260px"
    image = item.get("image") or DEFAULT_IMAGE
    if image.startswith(SITE_URL + "/"):  # 같은 사이트 이미지는 상대 주소로(로컬·미리보기에서도 보이게)
        image = image[len(SITE_URL):]
    fallback = (not item.get("image")) or "yejang-focus-ci" in image
    attrs = ""
    m = None if fallback else IMG_RE.match(image)
    if m:
        base = m.group(1)
        attrs = (f' srcset="{esc(base)}-640.webp 640w, {esc(base)}.webp 1600w" sizes="{sizes}"'
                 f' onerror="this.onerror=null;this.removeAttribute(\'srcset\');this.src=\'{esc(image)}\'"')
        image = base + ".webp"
    size = _img_size(image)
    if size:
        attrs += f' width="{size[0]}" height="{size[1]}"'
    load = ' fetchpriority="high"' if eager else ' loading="lazy"'
    return (f'<img class="{cls}{" is-fallback" if fallback else ""}" src="{esc(image)}"{attrs} '
            f'alt="{esc(item["title"])}"{load} decoding="async">')


def _has_photo(item):
    """진짜 사진이 있는 기사인가(없으면 CI 로고가 대신 들어가므로 작은 칸에서는 사진 없이 글로만 보여 준다)."""
    return bool(item and item.get("image") and "yejang-focus-ci" not in item["image"])


HERO_SIZES = "(max-width: 700px) 100vw, 760px"   # 큰 대표 사진(칼럼 폭 약 760px)
CARD_SIZES = "(max-width: 700px) 100vw, 380px"   # 교단·신학 카드(절반 폭 약 380px)


def _date(item):
    """기사 날짜(2026-11-14 → 2026.11.14). site-home.js 의 dateHtml() 과 같은 마크업."""
    d = (item or {}).get("date") or ""
    if not re.match(r"\d{4}-\d{2}-\d{2}", d):
        return ""
    return f'<time class="date" datetime="{d[:10]}">{d[:4]}.{d[5:7]}.{d[8:10]}</time>'


def _feature(item, extra_style, empty_label, eager=False, always_img=False, sizes=None):
    st = f' style="{extra_style}"' if extra_style else ""
    if not item:
        return (f'<div class="feature-item"{st}><div class="body"><span class="tag" style="color:{tag_color(empty_label)};">'
                f'{esc(empty_label)}</span></div></div>') if empty_label else ""
    return (f'<a class="feature-item" href="{item["url"]}" aria-label="{esc(item["title"])}"{st}>{_home_thumb(item, "thumb", eager, sizes) if (eager or always_img or _has_photo(item)) else ""}<div class="body">'
            f'<span class="tag" style="color:{tag_color(item["tag"])};">{esc(item["tag"])}</span>'
            f'<h3>{esc(item["title"])}</h3>' + (f'<p>{esc(item["desc"])}</p>' if item.get("desc") else "") + _date(item) + "</div></a>")


CAT_TABS = ["교단", "목회", "신학", "사설", "특집", "노회", "인물"]  # 홈 '분류별 기사' 탭 순서(최신 다음; 칼럼은 오른쪽에 따로 있어 제외)


POPULAR_FILE = REPO_ROOT / "data" / "popular.json"   # scripts/fetch_popular.py 가 만든다(없으면 '많이 본' 탭은 그리지 않는다)


def popular_articles(index, limit=4):
    """data/popular.json 의 조회수 순서대로 기사 목록을 돌려준다(목록에 없는 주소는 건너뜀)."""
    try:
        data = json.loads(POPULAR_FILE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return []
    by_url = {a["url"]: a for a in index}
    out = []
    for item in data.get("items", []):
        a = by_url.get(item.get("url"))
        if a and a not in out:
            out.append(a)
        if len(out) >= limit:
            break
    return out


EVENTS_FILE = REPO_ROOT / "data" / "events.json"   # 손으로 관리하는 행사·일정 목록
KST = timezone(timedelta(hours=9))


def _load_events():
    try:
        data = json.loads(EVENTS_FILE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return []
    out = []
    for e in data.get("events", []):
        try:
            start = datetime.strptime(e["date"], "%Y-%m-%d").date()
            end = datetime.strptime(e.get("end") or e["date"], "%Y-%m-%d").date()
        except (KeyError, ValueError):
            continue
        out.append({**e, "_start": start, "_end": max(start, end)})
    return out


def render_events(today=None):
    """홈 아래쪽 '행사·일정' 칸. data/events.json 을 읽어 다가오는 일정(가까운 순)을 먼저, 지난 일정(최근 순)을 뒤에 그린다."""
    today = today or datetime.now(KST).date()
    events = _load_events()
    upcoming = sorted((e for e in events if e["_end"] >= today), key=lambda e: (e["_start"], e["_end"]))[:6]
    past = sorted((e for e in events if e["_end"] < today), key=lambda e: e["_end"], reverse=True)
    past = past[:max(0, 5 - len(upcoming))] if upcoming else past[:3]

    def row(e, is_past):
        s, en = e["_start"], e["_end"]
        wk = "월화수목금토일"[s.weekday()]
        if is_past:
            badge = "지남"
        elif s <= today <= en:
            badge = "진행 중" if s != en else "오늘"
        else:
            badge = f"D-{(s - today).days}"
        span = f"{s.month}.{s.day}({wk})" + (f" ~ {en.month}.{en.day}" if en != s else "")
        title = esc(e["title"])
        if e.get("url"):
            title = f'<a href="{esc(e["url"])}">{title}</a>'
        meta = " · ".join(x for x in (span, esc(e.get("place", ""))) if x)
        tag = f'<span class="tag" style="color:{tag_color(e["tag"])};">{esc(e["tag"])}</span>' if e.get("tag") else ""
        return (f'<li class="ev-row{" is-past" if is_past else ""}">'
                f'<div class="ev-date" aria-hidden="true"><b>{s.day}</b><span>{s.month}월</span></div>'
                f'<div class="ev-body">{tag}<span class="ev-title">{title}</span><span class="ev-meta">{meta}</span></div>'
                f'<span class="ev-badge">{badge}</span></li>')

    rows = "".join(row(e, False) for e in upcoming) + "".join(row(e, True) for e in past)
    if not rows:
        rows = '<li class="ev-empty">등록된 일정이 없습니다.</li>'
    elif not upcoming:
        rows = '<li class="ev-empty">예정된 일정이 없습니다. 최근 지난 일정입니다.</li>' + rows
    return ('<div class="panel events" id="eventCal"><div class="mod-head"><h3>행사·일정</h3>'
            '<a class="more" href="/메인화면/기사제보.html">일정 알리기〉</a></div>'
            f'<ul class="ev-list">{rows}</ul></div>')


def render_home_blocks(index):
    blocks = {}
    ticker_group = '<span class="ticker-group">' + '<span class="sep">•</span>'.join(
        f'<a href="{a["url"]}">{esc(a["title"])}</a>' for a in index[:5]) + '</span>'
    # 끊김 없는 무한 흐름: 같은 묶음을 한 번 더 이어붙이고 -50%까지 이동
    blocks["tickerBox"] = ticker_group + ticker_group.replace(
        '<span class="ticker-group">', '<span class="ticker-group" aria-hidden="true">', 1)
    # 최신순 우선 배치(site-home.js 와 같은 규칙): 카테고리 칸마다 오래된 기사가 올라오지 않도록
    #   대표(최신 3건) → 칼럼 칸(최신 칼럼 3건 예약) → 주요 카드 2칸 → 텍스트 목록 5칸 → 최신 소식 순으로,
    #   칼럼을 뺀 나머지 기사를 날짜순으로 채운다. 같은 기사는 한 번만 쓴다(티커는 새 기사 알림이라 예외).
    heroes = [a for a in index if a["tag"] != "칼럼"][:3]  # 맨 위 첫화면(대표)에는 칼럼을 올리지 않는다
    used = {a["url"] for a in heroes}

    def pick_unused(pred):
        it = next((a for a in index if pred(a) and a["url"] not in used), None)
        if it:
            used.add(it["url"])
        return it

    columns = [c for c in (pick_unused(lambda a: a["tag"] == "칼럼") for _ in range(3)) if c]
    # 주요 카드 2칸은 큰 사진이 들어가므로 사진 있는 최신 기사를 우선(부족하면 사진 없는 최신 기사로 채움)
    cards = [c for c in (pick_unused(lambda a: a["tag"] != "칼럼" and _has_photo(a)) for _ in range(2)) if c]
    while len(cards) < 2:
        extra = pick_unused(lambda a: a["tag"] != "칼럼")
        if not extra:
            break
        cards.append(extra)
    second = cards[0] if len(cards) > 0 else None
    third = cards[1] if len(cards) > 1 else None
    blocks["heroFeature"] = _feature(heroes[0] if heroes else None, "", "속보", True, sizes=HERO_SIZES)
    blocks["secondFeature"] = _feature(second, "", "", always_img=True, sizes=CARD_SIZES)
    blocks["thirdFeature"] = _feature(third, "border-bottom:none;", "", always_img=True, sizes=CARD_SIZES)

    rest = [a for a in index if a["url"] not in used]
    # 맨 위 큰 카드(①)에 CI 로고가 뜨지 않도록, 최신 4건 안에 사진 기사가 있으면 그것을 ①로 쓴다
    latest_hero = next((a for a in rest[:4] if _has_photo(a)), rest[0] if rest else None)
    latest_list = [a for a in rest if a is not latest_hero][:6]
    numerals = ["②", "③", "④", "⑤", "⑥", "⑦"]  # 맨 위 사진이 ①
    blocks["numList"] = "".join(
        f'<li><span class="num">{numerals[i]}</span><a href="{a["url"]}">{esc(a["title"])}</a>{_date(a)}</li>'
        for i, a in enumerate(latest_list))
    blocks["modHero"] = ("" if not latest_hero else
                         f'<a class="mod-hero" href="{latest_hero["url"]}">{_home_thumb(latest_hero, "thumb", False, "(max-width: 700px) 100vw, 420px")}'
                         + f'<span class="hero-title"><span class="num">①</span><span class="t">{esc(latest_hero["title"])}</span>{_date(latest_hero)}</span></a>')
    blocks["sideList"] = "".join(
        (f'<li><a href="{a["url"]}">{_home_thumb(a, "thumb")}</a>' if _has_photo(a) else '<li>')
        + f'<div class="body"><a href="{a["url"]}"><h4>{esc(a["title"])}</h4></a>'
        + (f'<p>{esc(a["desc"])}</p>' if a.get("desc") else "") + _date(a) + "</div></li>"
        for a in columns)
    blocks["events"] = render_events()
    return blocks


def inject_home(index):
    path = REPO_ROOT / "index.html"
    text = path.read_text(encoding="utf-8")
    original = text
    for name, content in render_home_blocks(index).items():
        pat = re.compile(rf"(<!--yf:{name}-->).*?(<!--/yf:{name}-->)", re.S)
        if not pat.search(text):
            continue
        text = pat.sub(lambda m: m.group(1) + content + m.group(2), text, count=1)
    # 상단 '최종편집': 가장 최근에 올린 기사의 업로드 시각(기사를 올릴 때마다 바뀜)
    if index:
        try:
            dt = datetime.fromisoformat(index[0]["uploaded"])
            wk = "월화수목금토일"[dt.weekday()]
            label = f"최종편집: {dt.year}년 {dt.month}월 {dt.day}일({wk}) {dt:%H:%M}"
            text = re.sub(
                r'<time class="mh-date" id="mhDate"[^>]*>.*?</time>',
                lambda m: f'<time class="mh-date" id="mhDate" datetime="{dt.isoformat()}">{label}</time>',
                text, count=1, flags=re.S)
        except (KeyError, ValueError):
            pass
    if text != original:
        path.write_text(text, encoding="utf-8")


def build_tip_page():
    """기사 제보 · 정정/반론/추후보도 청구 폼 (메인화면/기사제보.html)."""
    body = """
  <main id="main">
  <span class="tag">독자 참여</span>
  <h1>기사 제보 · 정정 요청</h1>
  <p class="subhead">제보와 잘못된 내용 신고를 받습니다. 정정·반론·추후보도 청구는 <a href="/메인화면/정정반론추후보도_안내.html" style="text-decoration:underline;">절차 안내</a>를 함께 확인해 주세요.</p>
  <form id="tipForm" class="yf-tip" novalidate>
    <label for="tip-type">종류</label>
    <select id="tip-type" name="type">
      <option>기사 제보</option><option>정정 요청</option><option>정정보도 청구</option>
      <option>반론보도 청구</option><option>추후보도 청구</option><option>기타 문의</option>
    </select>
    <label for="tip-url">관련 기사 주소 <small>(해당하는 경우)</small></label>
    <input id="tip-url" name="url" type="url" placeholder="https://yejangfocus.com/…" autocomplete="off">
    <label for="tip-message">내용</label>
    <textarea id="tip-message" name="message" rows="8" required placeholder="언제, 어디서, 어떤 일이 있었는지 구체적으로 적어 주세요. 정정 요청은 바로잡을 부분과 근거를 함께 적어 주세요."></textarea>
    <p id="tipClaimNote" class="note" hidden>청구는 청구인의 성명, 주소, 연락처가 있어야 접수됩니다. 대리인이 청구하는 경우 위임장을 이메일로 따로 보내 주세요.</p>
    <label for="tip-name">이름 <span class="req" hidden>(필수)</span> <small>(제보는 익명 가능)</small></label>
    <input id="tip-name" name="name" type="text" autocomplete="name">
    <label for="tip-contact">연락처(이메일 또는 전화) <span class="req" hidden>(필수)</span> <small>(회신이 필요할 때)</small></label>
    <input id="tip-contact" name="contact" type="text" autocomplete="email">
    <label for="tip-address">주소 <span class="req" hidden>(필수)</span> <small>(청구인만)</small></label>
    <input id="tip-address" name="address" type="text" autocomplete="street-address">
    <input type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px;">
    <p class="note">입력하신 이름·연락처·주소는 접수 확인과 회신, 청구 처리 목적으로만 쓰이며 처리가 끝난 뒤 지체 없이 파기합니다(법령에 따른 보관 의무가 있는 경우 제외). 제보자의 신원은 본인 동의 없이 공개하지 않습니다.</p>
    <label class="chk"><input type="checkbox" name="agree" required> 위 개인정보 수집·이용에 동의합니다.</label>
    <button type="submit">보내기</button>
    <p id="tipOut" class="out" aria-live="polite"></p>
  </form>
  <noscript><p class="yf-empty">폼을 쓰려면 자바스크립트를 켜 주세요. 이메일로 보내셔도 됩니다: contact@yejangfocus.com</p></noscript>
  </main>
  <style>
    .yf-tip{display:flex;flex-direction:column;gap:6px;margin:18px 0 28px;max-width:640px;font-family:'Noto Sans KR',sans-serif;position:relative;}
    .yf-tip label{font-size:13.5px;font-weight:700;margin-top:8px;}
    .yf-tip label small,.yf-tip label .req{font-weight:400;color:var(--muted);font-size:12px;}
    .yf-tip label .req{color:#b91c2b;font-weight:700;}
    .yf-tip input[type=text],.yf-tip input[type=url],.yf-tip select,.yf-tip textarea{padding:10px 12px;border:1px solid var(--rule-soft);border-radius:3px;font:15px 'Noto Sans KR',sans-serif;background:var(--paper);color:var(--ink);}
    .yf-tip textarea{resize:vertical;line-height:1.6;}
    .yf-tip .note{margin:6px 0 0;font-size:12.5px;line-height:1.6;color:var(--muted);}
    .yf-tip .chk{display:flex;align-items:center;gap:8px;font-weight:500;}
    .yf-tip button{align-self:flex-start;margin-top:10px;height:44px;padding:0 28px;border:0;border-radius:3px;background:var(--accent);color:#fff;font:700 15px 'Noto Sans KR',sans-serif;cursor:pointer;}
    .yf-tip button:disabled{opacity:.6;cursor:default;}
    .yf-tip .out{margin:10px 0 0;font-size:14px;line-height:1.6;}
    .yf-tip .out a{text-decoration:underline;}
  </style>
"""
    doc = page_shell("기사 제보 · 정정 요청", "예장포커스에 기사 제보와 정정·반론·추후보도 청구를 접수합니다.",
                     "메인화면/기사제보.html", body, extra_script='<script src="/assets/js/tip-form.js" defer></script>\n')
    (REPO_ROOT / "메인화면" / "기사제보.html").write_text(doc, encoding="utf-8")


def build_offline_page():
    """오프라인일 때 서비스워커가 보여 주는 안내 페이지."""
    body = """
  <main id="main" style="text-align:center;padding:60px 0;">
  <h1>인터넷에 연결되어 있지 않습니다</h1>
  <p class="subhead">연결이 돌아오면 최신 기사를 볼 수 있습니다. 이전에 열어 본 기사는 연결 없이도 다시 볼 수 있습니다.</p>
  <p><a href="/" style="text-decoration:underline;">첫 화면으로</a></p>
  </main>
"""
    doc = page_shell("오프라인", "인터넷 연결이 없습니다.", "메인화면/offline.html", body, noindex=True)
    (REPO_ROOT / "메인화면" / "offline.html").write_text(doc, encoding="utf-8")


def build_all(index, categories):
    """생성한 목록 페이지 경로들을 돌려준다(sitemap 에 넣기 위해)."""
    written = build_list_pages(index, categories)
    build_search_page()
    build_tip_page()
    build_offline_page()
    inject_home(index)
    return written
