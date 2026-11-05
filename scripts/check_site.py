"""사이트 점검 스크립트 (GitHub Actions 에서도 돈다: .github/workflows/check.yml)

오류(error)가 하나라도 있으면 종료 코드 1, 경고(warn)는 출력만 한다.
  오류: 깨진 내부 링크·이미지, 없는 sitemap/아이콘 파일, 잘못된 JSON, 중복 id, alt 속성 없는 이미지, 주소의 '//' 중복
  경고: alt 가 빈 본문 이미지, 설명(description)·canonical 이 없는 색인 대상 페이지
사용법:  python3 scripts/check_site.py            (전체)
         python3 scripts/check_site.py --quiet    (경고 숨김)
"""
import json
import re
import sys
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlparse

ROOT = Path(__file__).resolve().parent.parent
SITE_HOSTS = {"yejangfocus.com", "www.yejangfocus.com"}
SKIP_TOP = {".git", ".github", "node_modules", "ETC", "scripts"}
errors, warns = [], []


class Page(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.refs, self.imgs, self.ids = [], [], []
        self.has_desc = self.has_canon = self.has_noindex = False
        self.lang = None
        self.in_figure = 0

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "html":
            self.lang = a.get("lang")
        if tag == "figure":
            self.in_figure += 1
        if "id" in a:
            self.ids.append(a["id"])
        if tag == "a" and a.get("href"):
            self.refs.append(("href", a["href"]))
        if tag == "link" and a.get("href") and a.get("rel") in ("stylesheet", "icon", "manifest", "apple-touch-icon"):
            self.refs.append(("href", a["href"]))
        if tag == "script" and a.get("src"):
            self.refs.append(("src", a["src"]))
        if tag == "img":
            if a.get("src"):
                self.refs.append(("src", a["src"]))
            if a.get("srcset"):
                for part in a["srcset"].split(","):
                    u = part.strip().split(" ")[0]
                    if u:
                        self.refs.append(("src", u))
            self.imgs.append((a.get("alt"), bool(self.in_figure), a.get("src", "")))
        if tag == "meta":
            n = (a.get("name") or "").lower()
            if n == "description" and a.get("content"):
                self.has_desc = True
            if n == "robots" and "noindex" in (a.get("content") or ""):
                self.has_noindex = True
        if tag == "link" and a.get("rel") == "canonical":
            self.has_canon = True

    def handle_endtag(self, tag):
        if tag == "figure" and self.in_figure:
            self.in_figure -= 1


def resolve(page_path: Path, ref: str):
    """내부 참조를 저장소 안 파일 경로로 바꾼다. 외부·특수 링크면 None."""
    ref = ref.strip()
    if not ref or ref.startswith(("#", "mailto:", "tel:", "javascript:", "data:", "sms:")):
        return None
    u = urlparse(ref)
    if u.scheme in ("http", "https"):
        if u.hostname not in SITE_HOSTS:
            return None
        path = u.path
    elif u.scheme or ref.startswith("//"):
        return None
    else:
        path = u.path
    path = unquote(path)
    if not path:
        return None
    base = ROOT if path.startswith("/") or u.scheme else page_path.parent
    target = (base / path.lstrip("/")).resolve() if (path.startswith("/") or u.scheme) else (base / path).resolve()
    return target


def exists(target: Path) -> bool:
    if target.is_dir():
        return (target / "index.html").exists()
    return target.exists()


def check_pages():
    n = 0
    for page in sorted(ROOT.rglob("*.html")):
        rel = page.relative_to(ROOT)
        if rel.parts[0] in SKIP_TOP:
            continue
        n += 1
        text = page.read_text(encoding="utf-8", errors="ignore")
        if text.strip().startswith(("naver-site-verification", "google-site-verification")):
            continue
        p = Page()
        p.feed(text)
        for kind, ref in p.refs:
            t = resolve(page, ref)
            if t is not None and not exists(t):
                errors.append(f"{rel}: 깨진 {kind} → {ref}")
        if len(re.findall(r"<main[\s>]", text)) > 1:
            errors.append(f"{rel}: <main> 이 2개 이상")
        dup = {i for i in p.ids if p.ids.count(i) > 1}
        for i in sorted(dup):
            errors.append(f"{rel}: 중복 id '{i}'")
        for alt, in_fig, src in p.imgs:
            if alt is None:
                errors.append(f"{rel}: alt 속성이 없는 이미지 → {src[:70]}")
            elif alt.strip() == "" and in_fig:
                warns.append(f"{rel}: 본문 이미지의 alt 가 비어 있음 → {src[:70]}")
        if not p.lang:
            warns.append(f"{rel}: <html lang> 없음")
        if not p.has_noindex and rel.name != "404.html":
            if not p.has_desc:
                warns.append(f"{rel}: meta description 없음")
            if not p.has_canon:
                warns.append(f"{rel}: canonical 없음")
    return n


def check_data():
    for f in sorted((ROOT / "data").glob("*.json")) + [ROOT / "manifest.webmanifest"]:
        try:
            json.loads(f.read_text(encoding="utf-8"))
        except Exception as e:
            errors.append(f"{f.relative_to(ROOT)}: JSON 오류 — {e}")
    try:
        arts = json.loads((ROOT / "data" / "articles.json").read_text(encoding="utf-8"))
    except Exception:
        arts = []
    for a in arts:
        u = a.get("url", "")
        if re.search(r"(?<!:)//", u):
            errors.append(f"articles.json: 주소에 '//' 중복 → {u}")
        t = resolve(ROOT / "index.html", u)
        if t is not None and not exists(t):
            errors.append(f"articles.json: 없는 기사 파일 → {u}")
        img = a.get("image", "")
        t = resolve(ROOT / "index.html", img)
        if t is not None and not exists(t):
            errors.append(f"articles.json: 없는 이미지 → {img}")
    try:
        mf = json.loads((ROOT / "manifest.webmanifest").read_text(encoding="utf-8"))
        for ic in mf.get("icons", []):
            if not (ROOT / ic["src"].lstrip("/")).exists():
                errors.append(f"manifest: 없는 아이콘 → {ic['src']}")
    except Exception:
        pass


def check_sitemap():
    for name in ("sitemap.xml", "news-sitemap.xml"):
        f = ROOT / name
        if not f.exists():
            continue
        for loc in re.findall(r"<loc>(.*?)</loc>", f.read_text(encoding="utf-8")):
            t = resolve(ROOT / "index.html", loc.replace("&amp;", "&"))
            if t is not None and not exists(t):
                errors.append(f"{name}: 없는 페이지 → {loc}")


def main():
    quiet = "--quiet" in sys.argv
    n = check_pages()
    check_data()
    check_sitemap()
    if not quiet:
        for w in warns:
            print("경고:", w)
    for e in errors:
        print("오류:", e)
    print(f"\n페이지 {n}개 점검 — 오류 {len(errors)}건, 경고 {len(warns)}건")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
