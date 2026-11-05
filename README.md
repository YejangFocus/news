# 예장포커스 (yejangfocus.com)

GitHub Pages 로 배포하는 정적 인터넷 신문입니다. 서버·빌드 도구 없이 HTML/CSS/JS 와 파이썬 스크립트만 씁니다.

## 기사 올리는 법
- **손으로 만든 HTML** 을 `<분류>/<이름>.html` 로 올리거나,
- **Markdown 원고** 를 `원고/<분류>/<이름>.md` 로 올립니다 (양식·서식은 `원고/README.md`).

main 에 올리면 GitHub Actions(`sync-article-index.yml`)가 자동으로 원고 → HTML 변환, 이미지 WebP 변환, 기사 목록(`data/articles.json`),
검색 색인, 카테고리·검색·홈 정적 페이지, 링크 미리보기·구조화 데이터, `sitemap.xml`/`feed.xml`/`news-sitemap.xml` 을 갱신합니다.

## 폴더
| 경로 | 내용 |
|---|---|
| `<분류>/` | 기사 HTML (폴더 이름 = 카테고리). `index.html`·`page/N/` 은 자동 생성 |
| `원고/` | Markdown 원고 |
| `메인화면/` | 매체소개·약관·정정반론 안내·기사 제보 폼 등 고정 페이지 |
| `data/` | `articles.json`(자동), `search-index.json`(자동), `issues.json`·`glossary.json`(편집), `site-config.json`(운영 설정) |
| `assets/js/` | `site.js`(공통 코어), `site-home/-article/-briefing/-hub.js`(페이지별 기능, 필요한 페이지에서만 로드), `lightbox.js`, `search-page.js`, `reader.js`(PWA·통계·구독), `tip-form.js`, `verse.js` |
| `scripts/` | `sync_article_index.py`(동기화), `build_pages.py`(목록·검색·홈), `build_articles.py`(원고→HTML), `optimize_images.py`, `og_card.py`, `check_site.py`(점검) |
| `sw.js`, `manifest.webmanifest` | PWA |

## 운영 설정
`data/site-config.json` 에 방문 통계 ID, 뉴스레터·카카오 채널 주소, 제보 폼 전송 주소, 의견란(giscus) 값을 넣으면 해당 기능이 켜집니다. 비워 두면 꺼진 상태입니다.

## 로컬에서 확인
```bash
python3 scripts/check_site.py          # 깨진 링크·이미지·JSON·alt·중복 id 점검 (PR 에서도 자동 실행)
python3 scripts/sync_article_index.py  # 목록·색인 다시 만들기 (git 이력 전체가 필요: git fetch --unshallow)
python3 -m http.server 8000            # http://localhost:8000
```
기사 속보·단독 배지: 기사 `<head>` 에 `<meta name="yf-badge" content="속보">`.

## JS 구조
`site.js` 가 `window.YF`(공통 도구)를 만들고, 페이지에 `#tickerBox`(홈) / `#focusHub`·`#issueDetail`(이슈) / `.page`(기사) / `#briefing`(브리핑)가 있을 때
해당 `site-*.js` 를 불러와 `YF.mods[이름](articles)` 로 실행합니다. 새 기능을 나누려면 같은 방식으로 파일을 만들고 `site.js` 의 `wants` 에 조건을 추가하세요.
