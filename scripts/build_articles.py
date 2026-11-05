"""Markdown 원고 → 기사 HTML 생성기

원고 폴더 구조:   원고/<분류>/<파일이름>.md   →   <분류>/<파일이름>.html
  - 분류 폴더 이름이 곧 카테고리(목회, 사설, 노회 …)다. 새 분류 폴더를 만들면 메뉴에도 자동 반영된다.
  - 파일 이름이 _ 로 시작하면 건너뛴다(양식·임시 파일용).
  - 같은 이름의 손으로 만든 HTML 이 이미 있으면(생성 표시가 없으면) 덮어쓰지 않고 경고만 한다.
  - 생성된 HTML 은 이후 sync_article_index.py 가 링크 미리보기·구조화 데이터·목록을 채운다.

원고 형식은 원고/README.md 와 원고/_양식.md 를 보세요.
사용법:  python3 scripts/build_articles.py
"""
import html
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_pages  # noqa: E402  (머리말·메뉴·푸터 껍데기를 빌려 온다)

ROOT = Path(__file__).resolve().parent.parent
SRC_DIR = ROOT / "원고"
MARK = "<!-- yf-generated:"
esc = html.escape


def parse_front_matter(text: str):
    m = re.match(r"^﻿?---\s*\n(.*?)\n---\s*\n?", text, re.S)
    if not m:
        return {}, text
    meta = {}
    for line in m.group(1).splitlines():
        if ":" in line and not line.startswith("#"):
            k, v = line.split(":", 1)
            meta[k.strip()] = v.strip()
    return meta, text[m.end():]


def inline(s: str) -> str:
    """문단 안의 **굵게**, *기울임*, [글자](주소), `코드` 만 지원한다. 나머지는 모두 이스케이프."""
    s = esc(s, quote=False)
    s = re.sub(r"`([^`]+)`", r"<code>\1</code>", s)
    s = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", s)
    s = re.sub(r"(?<![*\w])\*(?!\s)(.+?)(?<!\s)\*(?![*\w])", r"<em>\1</em>", s)

    def link(m):
        url = m.group(2).replace('"', "%22")
        ext = ' target="_blank" rel="noopener"' if re.match(r"https?://", url) and "yejangfocus.com" not in url else ""
        return f'<a href="{url}"{ext}>{m.group(1)}</a>'
    return re.sub(r"\[([^\]]+)\]\(([^)\s]+)\)", link, s)


def img_src(path: str) -> str:
    path = path.strip()
    if re.match(r"^(https?:)?//", path) or path.startswith("/"):
        return path
    return "/" + path


def render_body(md: str) -> str:
    out, para, items, quote = [], [], [], []
    list_kind = None

    def flush_para():
        if para:
            out.append("<p>" + inline(" ".join(para)) + "</p>")
            para.clear()

    def flush_list():
        nonlocal list_kind
        if items:
            tag = "ol" if list_kind == "ol" else "ul"
            out.append(f"<{tag}>\n" + "\n".join(f"  <li>{inline(i)}</li>" for i in items) + f"\n</{tag}>")
            items.clear()
        list_kind = None

    def flush_quote():
        if quote:
            lines = [q for q in quote if q]
            cite = ""
            if lines and re.match(r"^[—–-]{1,2}\s*", lines[-1]) and len(lines) > 1:
                cite = '<cite>' + inline(lines[-1]) + '</cite>'
                lines = lines[:-1]
            out.append("<blockquote>\n  " + inline(" ".join(lines)) + ("\n  " + cite if cite else "") + "\n</blockquote>")
            quote.clear()

    def flush_all():
        flush_para(); flush_list(); flush_quote()

    in_raw = False
    for raw in md.splitlines():
        line = raw.rstrip()
        if in_raw:                                   # <div …> 같은 HTML 블록은 빈 줄이 나올 때까지 그대로 통과
            if not line.strip():
                in_raw = False
                out.append("")
            else:
                out.append(line)
            continue
        if not line.strip():
            flush_all()
            continue
        if line.lstrip().startswith("<") and not para:
            flush_all()
            in_raw = True
            out.append(line)
            continue
        m = re.match(r"^(#{2,3})\s+(.*)$", line)
        if m:
            flush_all()
            lvl = len(m.group(1))
            out.append(f"<h{lvl}>{inline(m.group(2))}</h{lvl}>")
            continue
        m = re.match(r'^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)\s*$', line)
        if m:
            flush_all()
            alt, src, cap = m.group(1), m.group(2), m.group(3)
            fig = f'<figure>\n  <img src="{esc(img_src(src))}" alt="{esc(alt)}" loading="lazy" decoding="async">'
            if cap:
                fig += f"\n  <figcaption>{inline(cap)}</figcaption>"
            out.append(fig + "\n</figure>")
            continue
        if line.startswith(">"):
            flush_para(); flush_list()
            quote.append(line.lstrip(">").strip())
            continue
        m = re.match(r"^\s*([-*]|\d+\.)\s+(.*)$", line)
        if m:
            flush_para(); flush_quote()
            kind = "ol" if m.group(1)[0].isdigit() else "ul"
            if list_kind and list_kind != kind:
                flush_list()
            list_kind = kind
            items.append(m.group(2))
            continue
        if re.match(r"^-{3,}$", line.strip()):
            flush_all()
            continue
        flush_list(); flush_quote()
        para.append(line.strip())
    flush_all()
    return "\n\n".join(x for x in out if x is not None)


def build_one(src: Path) -> str:
    rel = src.relative_to(SRC_DIR)
    if len(rel.parts) < 2:
        raise ValueError("원고는 원고/<분류>/<이름>.md 형태로 분류 폴더 안에 넣어 주세요.")
    category = rel.parts[0]
    meta, body_md = parse_front_matter(src.read_text(encoding="utf-8"))
    title = meta.get("제목")
    if not title:
        raise ValueError("머리말에 '제목:' 이 없습니다.")
    subhead = meta.get("부제", "")
    byline = meta.get("작성", "예장포커스 취재팀")
    date = meta.get("날짜", "")
    label = meta.get("분류표시", category)           # 맨 위 작은 태그(예: 40일 천국잔치)
    side = meta.get("구분", "")                      # 메타 바 오른쪽 문구
    lede = meta.get("리드", "")
    desc = meta.get("요약", subhead or lede)[:160]

    out_rel = f"{category}/{src.stem}.html"
    body_html = render_body(body_md)
    if lede:
        body_html = f'<p class="lede">{inline(lede)}</p>\n\n' + body_html
    meta_bar = f'<span>{esc(category)}{" · " + esc(date.replace("-", ".")) if date else ""}</span>'
    if side:
        meta_bar += f'\n    <span>{esc(side)}</span>'
    title_html = esc(title).replace("&lt;br&gt;", "<br>")
    page = (
        '<main id="main">\n'
        f'  <div class="meta-bar">\n    {meta_bar}\n  </div>\n\n'
        f'  <span class="tag">{esc(label)}</span>\n'
        f'  <h1>{title_html}</h1>\n'
        + (f'  <p class="subhead">{inline(subhead)}</p>\n' if subhead else "")
        + f'  <div class="byline">취재·정리 · <b>{esc(byline)}</b></div>\n\n'
        + "\n".join("  " + ln if ln else ln for ln in body_html.splitlines())
        + "\n</main>\n"
    )
    doc = build_pages.page_shell(re.sub(r"<[^>]+>", " ", title).replace("  ", " ").strip(), desc, out_rel, page)
    doc = doc.replace('<meta property="og:type" content="website">', '<meta property="og:type" content="article">')
    doc = doc.replace("<head>", f"<head>\n{MARK} 원고/{rel.as_posix()} -->", 1)
    return out_rel, doc


def main() -> int:
    if not SRC_DIR.exists():
        return 0
    built = skipped = 0
    code = 0
    for src in sorted(SRC_DIR.rglob("*.md")):
        if src.name.startswith("_") or src.name.lower() == "readme.md":
            continue
        try:
            out_rel, doc = build_one(src)
        except Exception as e:
            print(f"[오류] {src.relative_to(ROOT)}: {e}", file=sys.stderr)
            code = 1
            continue
        target = ROOT / out_rel
        if target.exists():
            old = target.read_text(encoding="utf-8", errors="ignore")
            if MARK not in old:
                print(f"[경고] {out_rel} 는 손으로 만든 파일이라 덮어쓰지 않았습니다(원고 이름을 바꾸거나 기존 파일을 지워 주세요).", file=sys.stderr)
                skipped += 1
                continue
            if old == doc:
                continue
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(doc, encoding="utf-8")
        built += 1
        print(f"생성: {out_rel}")
    print(f"원고 → 기사 {built}건 생성/갱신, {skipped}건 건너뜀")
    return code


if __name__ == "__main__":
    sys.exit(main())
