"""기사 HTML 에 base64(data:image)로 박혀 있는 이미지를 assets/images/<해시>.webp 로 빼낸다.

- 내용 해시로 파일명을 정하므로 여러 번 실행해도 같은 결과(멱등).
- <img> 는 src·srcset(640w/1600w)·width·height 를 채우고, 그 밖의 곳(video poster 등)은 src 만 바꾼다.
- ETC/ (비공개 초안) 은 건드리지 않는다.
"""
import base64, hashlib, io, re, sys
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
IMG = ROOT / "assets" / "images"
SKIP = {".git", "assets", "data", "scripts", "ETC", "원고"}
URI = re.compile(r'data:image/(?:jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=]+)')
IMGTAG = re.compile(r'<img\b[^>]*>', re.I)


def save(b64: str):
    raw = base64.b64decode(b64)
    name = "inl-" + hashlib.sha1(raw).hexdigest()[:12]
    im = Image.open(io.BytesIO(raw)); im.load()
    if im.mode not in ("RGB", "RGBA"):
        im = im.convert("RGB")
    full, small = IMG / f"{name}.webp", IMG / f"{name}-640.webp"
    for dst, w in ((full, 1600), (small, 640)):
        if dst.exists():
            continue
        c = im.copy()
        if c.width > w:
            c.thumbnail((w, 10**6), Image.LANCZOS)
        c.save(dst, "WEBP", quality=80, method=6)
    with Image.open(full) as f:
        return name, f.width, f.height


def fix(html: str, prefix: str):
    cache = {}
    def one(b64):
        k = b64[:200] + str(len(b64))
        if k not in cache:
            cache[k] = save(b64)
        return cache[k]

    def tag(m):
        t = m.group(0)
        u = URI.search(t)
        if not u:
            return t
        name, w, h = one(u.group(1))
        t = t.replace(u.group(0), f"{prefix}{name}.webp")
        if "srcset=" not in t:
            t = t.replace(f'src="{prefix}{name}.webp"',
                f'src="{prefix}{name}.webp" srcset="{prefix}{name}-640.webp 640w, {prefix}{name}.webp {w}w" sizes="(max-width: 720px) 100vw, 720px"', 1)
        if "width=" not in t:
            t = t[:-1].rstrip("/").rstrip() + f' width="{w}" height="{h}">'
        return t
    html = IMGTAG.sub(tag, html)
    return URI.sub(lambda m: f"{prefix}{one(m.group(1))[0]}.webp", html)


def main():
    IMG.mkdir(parents=True, exist_ok=True)
    for p in sorted(ROOT.rglob("*.html")):
        rel = p.relative_to(ROOT)
        if rel.parts[0] in SKIP:
            continue
        t = p.read_text(encoding="utf8")
        if "data:image" not in t:
            continue
        prefix = "../" * (len(rel.parts) - 1) + "assets/images/"
        new = fix(t, prefix)
        p.write_text(new, encoding="utf8")
        print(f"{rel}: {len(t)//1024}KB → {len(new)//1024}KB")


if __name__ == "__main__":
    main()
