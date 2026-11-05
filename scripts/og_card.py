"""사진이 없는 기사(사설·칼럼·신학 등)의 링크 미리보기용 카드 이미지 생성.

카카오톡·페이스북에 링크를 올리면 기사마다 똑같은 CI 로고만 보이던 것을,
'분류 + 제목 + 매체명'이 들어간 1200x630 카드로 바꿔 기사마다 다르게 보이게 한다.
같은 (제목, 분류, 디자인 버전)이면 같은 파일명이 나오므로 제목이 바뀔 때만 다시 만든다.
한글 글꼴을 못 찾으면 None 을 돌려주고, 호출 쪽은 기존 기본 이미지를 그대로 쓴다.
"""
import hashlib
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

W, H = 1200, 630
DESIGN_VERSION = "v1"
FONT_CANDIDATES = [
    "/usr/share/fonts/truetype/nanum/NanumGothicBold.ttf",
    "/usr/share/fonts/truetype/nanum/NanumSquareB.ttf",
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc",
    "/usr/share/fonts/truetype/noto/NotoSansCJK-Bold.ttc",
]
NAVY, NAVY_DARK, ACCENT, WHITE, SOFT = (22, 41, 79), (15, 29, 58), (226, 112, 125), (255, 255, 255), (186, 198, 224)


def _font(size):
    for p in FONT_CANDIDATES:
        if Path(p).exists():
            return ImageFont.truetype(p, size)
    return None


def _wrap(draw, text, font, max_w, max_lines):
    """글자 단위로 줄바꿈(한글은 띄어쓰기 없이도 자연스럽다). 넘치면 마지막 줄을 …로 줄인다."""
    lines, cur = [], ""
    for ch in text.strip():
        if draw.textlength(cur + ch, font=font) <= max_w:
            cur += ch
            continue
        # 단어 중간에서 끊기지 않도록 마지막 공백에서 줄바꿈
        cut = cur.rfind(" ")
        if cut > len(cur) * 0.5:
            lines.append(cur[:cut])
            cur = cur[cut + 1:] + ch
        else:
            lines.append(cur)
            cur = ch.lstrip()
    if cur:
        lines.append(cur)
    if len(lines) > max_lines:
        lines = lines[:max_lines]
        last = lines[-1]
        while last and draw.textlength(last + "…", font=font) > max_w:
            last = last[:-1]
        lines[-1] = last.rstrip() + "…"
    return lines


def make_card(title: str, tag: str, out_dir: Path):
    """카드 JPG 를 만들고 경로를 돌려준다. 글꼴이 없으면 None."""
    title_font = _font(60)
    if title_font is None:
        return None
    key = hashlib.sha1(f"{DESIGN_VERSION}|{tag}|{title}".encode("utf-8")).hexdigest()[:16]
    out = out_dir / f"card-{key}.jpg"
    if out.exists():
        return out

    im = Image.new("RGB", (W, H), NAVY)
    d = ImageDraw.Draw(im)
    d.rectangle([0, 0, W, 14], fill=ACCENT)                    # 위쪽 띠
    d.rectangle([0, H - 110, W, H], fill=NAVY_DARK)            # 아래쪽 매체명 띠

    tag_font, brand_font, sub_font = _font(34), _font(40), _font(26)
    pad = 80
    tag_w = d.textlength(tag, font=tag_font)
    d.rounded_rectangle([pad, 64, pad + tag_w + 44, 64 + 62], radius=31, fill=ACCENT)
    d.text((pad + 22, 64 + 31), tag, font=tag_font, fill=WHITE, anchor="lm")

    lines = _wrap(d, title, title_font, W - pad * 2, 4)
    line_h = 82
    y = 170
    for ln in lines:
        d.text((pad, y), ln, font=title_font, fill=WHITE)
        y += line_h

    d.text((pad, H - 55), "예장포커스", font=brand_font, fill=WHITE, anchor="lm")
    d.text((W - pad, H - 55), "YEJANG FOCUS · 교회를 바라보는 새로운 시선", font=sub_font, fill=SOFT, anchor="rm")

    out_dir.mkdir(parents=True, exist_ok=True)
    im.save(out, "JPEG", quality=88, optimize=True)
    return out
