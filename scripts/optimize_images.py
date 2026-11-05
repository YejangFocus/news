"""이미지 최적화 (WebP 변환 + 크기별 srcset 변형 생성 + HTML 반영).

assets/images 의 모든 jpg/png 마다 아래 두 파일을 만든다(이미 있으면 원본이 더 새로울 때만 다시 만든다).
  foo.jpg  →  foo.webp      (가로 최대 1600px, 품질 80)
              foo-640.webp  (가로 최대 640px — 목록 썸네일·모바일용)
원본은 그대로 둔다(OG 미리보기·외부 링크 호환).

--rewrite 를 주면 기사/페이지 HTML 의 본문 <img src="…/assets/images/foo.jpg"> 를
  <img src="…/foo.webp" srcset="…/foo-640.webp 640w, …/foo.webp 1600w" sizes=… width= height=>
로 바꾼다. 여러 번 실행해도 결과가 같다(멱등).  site.js 는 같은 규칙으로 목록 썸네일을 그린다.
"""
import re
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
IMG_DIR = ROOT / "assets" / "images"
FULL_W, SMALL_W, QUALITY = 1600, 640, 80
SKIP_DIRS = {".git", "assets", "data", "scripts", "node_modules"}

IMG_RE = re.compile(r'<img\b[^>]*>', re.I)
SRC_RE = re.compile(r'\bsrc="([^"]*assets/images/[^"/]+?)\.(jpe?g|png)"', re.I)


def variants(src: Path):
    return src.with_suffix(".webp"), src.with_name(src.stem + "-640.webp")


def make_variants() -> int:
    made = 0
    for src in sorted(IMG_DIR.glob("*")):
        if src.suffix.lower() not in (".jpg", ".jpeg", ".png"):
            continue
        full, small = variants(src)
        if full.exists() and small.exists() and min(full.stat().st_mtime, small.stat().st_mtime) >= src.stat().st_mtime:
            continue
        im = Image.open(src)
        im.load()
        has_alpha = im.mode in ("RGBA", "LA", "P")
        im = im.convert("RGBA" if has_alpha else "RGB")
        for dest, width in ((full, FULL_W), (small, SMALL_W)):
            out = im
            if im.width > width:
                out = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
            out.save(dest, "WEBP", quality=QUALITY, method=6)
        made += 1
    return made


def rewrite_tag(tag: str, page: Path, first_in_page: bool) -> str:
    m = SRC_RE.search(tag)
    if not m or "srcset=" in tag:
        return tag
    base = m.group(1)                              # ../assets/images/foo (확장자 제외)
    name = base.rsplit("/", 1)[1]
    orig = next((IMG_DIR / (name + e) for e in (".jpg", ".jpeg", ".png", ".JPG", ".PNG") if (IMG_DIR / (name + e)).exists()), None)
    if orig is None or not (IMG_DIR / (name + ".webp")).exists():
        return tag
    with Image.open(orig) as im:
        w, h = im.size
    full_w = min(w, FULL_W)
    full_h = round(h * full_w / w)
    small_w = min(w, SMALL_W)
    new = tag.replace(m.group(0), f'src="{base}.webp"', 1)
    attrs = f' srcset="{base}-640.webp {small_w}w, {base}.webp {full_w}w" sizes="(max-width: 700px) 100vw, 720px"'
    if " width=" not in new:
        attrs += f' width="{full_w}" height="{full_h}"'
    new = new[:-1].rstrip("/ ").rstrip() + attrs + ">" if not new.endswith("/>") else new[:-2].rstrip() + attrs + " />"
    if " loading=" not in new:
        new = new[:-1] + ' loading="lazy" decoding="async">'
    return new


def rewrite_html() -> int:
    changed = 0
    for page in ROOT.rglob("*.html"):
        rel = page.relative_to(ROOT)
        if rel.parts[0] in SKIP_DIRS or rel.parts[0] == "메인화면" and False:
            continue
        text = page.read_text(encoding="utf-8")
        # 본문(figure 안) 이미지만 대상. 로고·배너(상단 메타 바 앞)는 건드리지 않는다.
        out = re.sub(r"<figure\b.*?</figure>",
                     lambda fm: IMG_RE.sub(lambda m: rewrite_tag(m.group(0), page, False), fm.group(0)),
                     text, flags=re.S)
        # width/height 속성을 넣으면 CSS 에 height:auto 가 없는 `figure img{width:100%}` 는 이미지가 세로로 늘어난다.
        def _auto_h(m):
            body = m.group(2)
            if re.search(r"(^|[;\s])height\s*:", body) or "aspect-ratio" in body:
                return m.group(0)
            return m.group(1) + body.rstrip().rstrip(";") + "; height:auto;}"
        out = re.sub(r"(figure\s+img[^{}]*\{)([^{}]*)\}", _auto_h, out)
        if out != text:
            page.write_text(out, encoding="utf-8")
            changed += 1
    return changed


def main():
    print(f"WebP 변형 생성: {make_variants()}장")
    if "--rewrite" in sys.argv:
        print(f"HTML 갱신: {rewrite_html()}개")


if __name__ == "__main__":
    main()
