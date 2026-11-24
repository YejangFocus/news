"""홈페이지 CSS 3개를 하나로 합친다 (요청 수 3 → 1, 주석·공백 제거).

focus-hub.css · home-plus.css · home.css 를 이 순서대로 이어 붙여 assets/css/home.bundle.css 를 만든다.
같은 폴더에 쓰므로 url(../images/...) 상대 경로가 그대로 유효하다.
원본 CSS 를 고쳤다면 `python3 scripts/bundle_css.py` 를 다시 실행한다 (Actions 가 매번 자동 실행).
--check 를 주면 파일을 쓰지 않고, 번들이 최신이 아닐 때 종료 코드 1 을 돌려준다.
"""
import re
import sys
from pathlib import Path

CSS_DIR = Path(__file__).resolve().parent.parent / "assets" / "css"
SOURCES = ["focus-hub.css", "home-plus.css", "home.css"]
OUT = CSS_DIR / "home.bundle.css"


def minify(css: str) -> str:
    css = re.sub(r"/\*.*?\*/", "", css, flags=re.S)
    css = re.sub(r"\s+", " ", css)
    css = re.sub(r"\s*([{};,>])\s*", r"\1", css)   # ':' 는 선택자(a :hover)를 깨뜨릴 수 있어 건드리지 않는다
    return css.replace(";}", "}").strip()


def build() -> str:
    return "\n".join(minify((CSS_DIR / n).read_text(encoding="utf-8")) for n in SOURCES) + "\n"


if __name__ == "__main__":
    text = build()
    if "--check" in sys.argv:
        ok = OUT.exists() and OUT.read_text(encoding="utf-8") == text
        print("home.bundle.css 최신" if ok else "home.bundle.css 가 오래됨 — scripts/bundle_css.py 실행 필요")
        sys.exit(0 if ok else 1)
    OUT.write_text(text, encoding="utf-8")
    print(f"{OUT.name}: {len(text.encode('utf-8')):,} bytes")
