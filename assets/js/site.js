// 예장포커스 공통 스크립트 — 전체 기사 카테고리 오버레이 + 사이트 검색
// 기사 데이터는 더 이상 각 페이지에 하드코딩하지 않고 data/articles.json 하나에서 불러옵니다.
// 새 기사가 올라오면 articles.json 한 곳만 수정하면 모든 페이지(검색, 카테고리 보기)에 반영됩니다.
(function () {
  var root = typeof window.SITE_ROOT === 'string' ? window.SITE_ROOT : '';

  // 태그(카테고리)별 강조색과 이스케이프는 전체 기사 목록·홈페이지 썸네일에서
  // 공통으로 쓰므로 한 곳에서 관리한다.
  var TAG_COLOR = {
    '속보': 'var(--red)', '사설': 'var(--red)',
    '신학': 'var(--pine)', '오피니언': 'var(--pine)', '특집': 'var(--pine)', '칼럼': 'var(--pine)',
    '교단': 'var(--navy)', '교단소식': 'var(--navy)', '교계': 'var(--navy)', '정치': 'var(--navy)',
    '목회': 'var(--navy)', '교회': 'var(--navy)', '인물': 'var(--navy)'
  };

  function tagColor(tag) { return TAG_COLOR[tag] || 'var(--ink)'; }

  function esc(s) {
    return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // 카테고리 메뉴(상단 메뉴 클릭 시 뜨는 기사 목록)와 칼럼 섹션을 포함해
  // 홈페이지의 모든 목록이 항상 최신 날짜순으로 나오도록, 배열에 담긴 순서에만
  // 기대지 않고 각 기사의 uploaded(업로드 시각, 없으면 date)로 명시적으로 재정렬한다.
  function sortByLatestDate(articles) {
    return articles.slice().sort(function (a, b) {
      var ta = Date.parse(a.uploaded) || 0, tb = Date.parse(b.uploaded) || 0;
      if (ta !== tb) return tb - ta;
      return (b.date || '').localeCompare(a.date || '');
    });
  }

  // ───────── 조회수 ─────────
  // 정적 사이트라 서버가 없으므로 외부 카운터 서비스(CounterAPI)를 쓴다.
  // 기사 페이지를 열면 해당 페이지의 카운터를 +1(세션당 1회)하고, 상단 카테고리 메뉴의
  // 기사 목록에는 각 제목 옆에 현재 조회수를 읽어와 표시한다.
  // 서비스를 바꾸려면 VIEWS_API 한 곳만 고치면 된다. 호출이 실패하면 조회수만 조용히 숨긴다.
  var VIEWS_API = 'https://api.counterapi.dev/v1/yejangfocus-news/';
  var viewCache = {};

  // github.io/news/칼럼/x.html 과 yejangfocus.com/칼럼/x.html 이 같은 카운터를 쓰도록
  // 경로를 정규화하고, 한글 경로가 키로 쓰기 어려우므로 해시로 바꾼다.
  function viewKey(pathname) {
    var p;
    try { p = decodeURIComponent(pathname); } catch (e) { p = pathname; }
    p = p.normalize('NFC').replace(/^\/+/, '').replace(/^news\//, '').replace(/\.html$/, '');
    var h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (var i = 0; i < p.length; i++) {
      var ch = p.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return 'p' + (h1 >>> 0).toString(16) + (h2 >>> 0).toString(16);
  }

  function viewCall(key, up) {
    return fetch(VIEWS_API + key + (up ? '/up' : ''))
      .then(function (res) { return res.ok ? res.json() : { count: 0 }; })
      .then(function (d) { return typeof d.count === 'number' ? d.count : 0; });
  }

  function getViews(url) {
    var key;
    try { key = viewKey(new URL(url, location.href).pathname); } catch (e) { return Promise.reject(e); }
    if (!viewCache[key]) viewCache[key] = viewCall(key, false);
    return viewCache[key];
  }

  function countThisView() {
    if (document.getElementById('tickerBox')) return;            // 홈페이지는 집계하지 않음
    if (/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)) return;
    var key = viewKey(location.pathname), mark = 'yfv:' + key;
    try { if (sessionStorage.getItem(mark)) return; sessionStorage.setItem(mark, '1'); } catch (e) {}
    viewCache[key] = viewCall(key, true).catch(function () { return 0; });
  }

  (function injectViewStyle() {
    var st = document.createElement('style');
    st.textContent = '.aa-views{margin-left:8px;font-size:12px;font-weight:400;color:var(--ink-soft);white-space:nowrap;}' +
      '.aa-views::before{content:"조회 ";}';
    document.head.appendChild(st);
  })();
  countThisView();

  fetch(root + 'data/articles.json')
    .then(function (res) { return res.json(); })
    .then(function (articles) {
      articles = sortByLatestDate(articles);
      window.ARTICLE_INDEX = articles;
      initCategoryOverlay(articles);
      initSiteSearch(articles);
      renderHomepage(articles);
    })
    .catch(function (err) {
      console.error('기사 목록(articles.json)을 불러오지 못했습니다.', err);
    });

  initThemeToggle();
  initPlaceholderButtons();

  function initCategoryOverlay(ARTICLE_INDEX) {
    var buttons = document.querySelectorAll('#catNav button');
    var overlay = document.getElementById('allArticlesOverlay');
    var list = document.getElementById('allArticlesList');
    var title = document.getElementById('aaTitle');
    var closeBtn = overlay ? overlay.querySelector('.aa-close') : null;

    function renderCategory(cat) {
      if (!list) return;
      list.innerHTML = '';
      var items = cat === '전체' ? ARTICLE_INDEX : ARTICLE_INDEX.filter(function (item) {
        return item.tag === cat;
      });
      if (title) title.textContent = cat === '전체' ? '전체 기사' : cat + ' 기사';
      if (items.length === 0) {
        var empty = document.createElement('li');
        empty.className = 'aa-empty';
        empty.textContent = '아직 등록된 기사가 없습니다.';
        list.appendChild(empty);
        return;
      }
      items.forEach(function (item) {
        var li = document.createElement('li');
        var a = document.createElement('a');
        a.href = item.url;
        a.innerHTML = '<span class="aa-tag" style="color:' + tagColor(item.tag) + ';">[' + esc(item.tag) + ']</span> ' + esc(item.title);
        li.appendChild(a);
        var views = document.createElement('span');
        views.className = 'aa-views';
        views.hidden = true;
        li.appendChild(views);
        getViews(item.url).then(function (n) {
          views.textContent = n.toLocaleString('ko-KR');
          views.hidden = false;
        }).catch(function () {});
        list.appendChild(li);
      });
    }

    function closeAllArticles() {
      if (overlay) overlay.hidden = true;
    }

    buttons.forEach(function (b) {
      b.addEventListener('click', function () {
        buttons.forEach(function (x) { x.classList.remove('active'); });
        b.classList.add('active');
        if (overlay) {
          renderCategory(b.dataset.cat);
          overlay.hidden = false;
        }
      });
    });

    var totalNewsMore = document.getElementById('totalNewsMore');
    if (totalNewsMore) {
      totalNewsMore.addEventListener('click', function (e) {
        e.preventDefault();
        buttons.forEach(function (x) { x.classList.remove('active'); });
        var allBtn = document.querySelector('#catNav button[data-cat="전체"]');
        if (allBtn) allBtn.classList.add('active');
        if (overlay) {
          renderCategory('전체');
          overlay.hidden = false;
        }
      });
    }

    if (closeBtn) closeBtn.addEventListener('click', closeAllArticles);
    if (overlay) {
      overlay.addEventListener('click', function (e) {
        if (e.target === overlay) closeAllArticles();
      });
    }
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeAllArticles();
    });
  }

  // 메인화면(index.html)의 헤드라인·목록·썸네일을 ARTICLE_INDEX(=articles.json)로부터
  // 통째로 그려낸다. 기사 발행 → GitHub Actions가 articles.json 자동 갱신 → 다음
  // 방문 시 이 함수가 최신 내용으로 다시 그려주므로, index.html을 따로 손댈 필요가 없다.
  // 홈페이지가 아닌 페이지에는 아래 컨테이너 요소들이 없으므로 조용히 종료한다.
  function renderHomepage(ARTICLE_INDEX) {
    var tickerBox = document.getElementById('tickerBox');
    if (!tickerBox) return;

    // 기사에 쓸 만한 사진이 없을 때 대신 보여줄 예포 CI 로고.
    // 로고 자체의 여백을 미리 잘라낸 버전이라 박스를 꽉 채워 보인다.
    // 사진과 달리 cover로 잘라내면 로고·문구가 잘리므로, 아래 thumbImgHtml()에서
    // object-fit:contain으로 전체가 보이게 따로 처리한다.
    var DEFAULT_IMAGE = root + 'assets/images/yejang-focus-ci.webp';

    function thumbImgHtml(item, cls) {
      var isFallback = !item.image || item.image.indexOf('yejang-focus-ci') !== -1;
      var src = item.image || DEFAULT_IMAGE;
      var extra = isFallback ? ' is-fallback' : '';
      return '<img class="' + cls + extra + '" src="' + esc(src) + '" alt="' + esc(item.title) + '">';
    }
    if (!ARTICLE_INDEX.length) {
      tickerBox.innerHTML = '<span style="color:var(--ink-faint);">아직 등록된 기사가 없습니다.</span>';
      return;
    }

    // 좌측 컬럼은 카테고리 순서가 고정이다: 특집 → 교단 → (목록) 목회·사설·교회·인물·교계 → 신학.
    // 각 칸에는 그 카테고리에서 가장 최근에 업로드된 기사가 들어간다.
    // (ARTICLE_INDEX는 이미 최신 업로드순이므로 find가 곧 최신 기사다.)
    // 해당 카테고리에 기사가 없으면 다른 카테고리로 채우지 않고 칸 이름만 보여준다.
    function latestOf(tags) {
      return ARTICLE_INDEX.find(function (item) { return tags.indexOf(item.tag) !== -1; }) || null;
    }
    function pickMany(tags, count) {
      return ARTICLE_INDEX.filter(function (item) {
        return tags.indexOf(item.tag) !== -1;
      }).slice(0, count);
    }

    function featureItemHtml(item, extraStyle, emptyLabel) {
      if (!item) {
        return emptyLabel ? '<div class="feature-item"' + (extraStyle ? ' style="' + extraStyle + '"' : '') + '>' +
          '<div class="body"><span class="tag" style="color:' + tagColor(emptyLabel) + ';">' + esc(emptyLabel) + '</span></div></div>' : '';
      }
      return '' +
        '<a class="feature-item" href="' + item.url + '"' + (extraStyle ? ' style="' + extraStyle + '"' : '') + '>' +
          thumbImgHtml(item, 'thumb') +
          '<div class="body">' +
            '<span class="tag" style="color:' + tagColor(item.tag) + ';">' + esc(item.tag) + '</span>' +
            '<h3>' + esc(item.title) + '</h3>' +
            (item.desc ? '<p>' + esc(item.desc) + '</p>' : '') +
          '</div>' +
        '</a>';
    }

    var hero = latestOf(['특집']);
    var second = latestOf(['교단', '교단소식']);
    var third = latestOf(['신학']);

    var heroEl = document.getElementById('heroFeature');
    var secondEl = document.getElementById('secondFeature');
    var thirdEl = document.getElementById('thirdFeature');
    if (heroEl) heroEl.innerHTML = featureItemHtml(hero, '', '특집');
    if (secondEl) secondEl.innerHTML = featureItemHtml(second, '', '교단');
    if (thirdEl) thirdEl.innerHTML = featureItemHtml(third, 'border-bottom:none;', '신학');

    // 최신뉴스 티커: 항상 전체 최신 3건
    var tickerItems = ARTICLE_INDEX.slice(0, 3);
    tickerBox.innerHTML = tickerItems.map(function (item) {
      return '<a href="' + item.url + '">' + esc(item.title) + '</a>';
    }).join('<span class="sep">•</span>');

    // 좌측 하단 텍스트 목록: 정해진 카테고리 순서대로 각 카테고리 최신 기사 1건씩.
    // 해당 카테고리에 기사가 없으면 카테고리명만 넣고 비워둔다.
    var PLAIN_LIST_CATS = ['목회', '사설', '교회', '인물', '교계'];
    var plainList = document.getElementById('plainList');
    if (plainList) {
      plainList.innerHTML = PLAIN_LIST_CATS.map(function (cat) {
        var item = ARTICLE_INDEX.find(function (a) { return a.tag === cat; });
        if (!item) {
          return '<li><span class="tag" style="color:' + tagColor(cat) + ';">' + esc(cat) + '</span></li>';
        }
        return '<li><span class="tag" style="color:' + tagColor(item.tag) + ';">' + esc(item.tag) + '</span>' +
          '<a href="' + item.url + '">' + esc(item.title) + '</a></li>';
      }).join('');
    }

    // 중앙 컬럼: 최신 소식 — 카테고리와 무관하게 사이트 전체 최신 5건
    var topFive = ARTICLE_INDEX.slice(0, 5);
    var numList = document.getElementById('numList');
    if (numList) {
      var numerals = ['①', '②', '③', '④', '⑤'];
      numList.innerHTML = topFive.map(function (item, i) {
        return '<li><span class="num">' + numerals[i] + '</span><a href="' + item.url + '">' + esc(item.title) + '</a></li>';
      }).join('');
    }
    var modHero = document.getElementById('modHero');
    if (modHero && topFive[0]) {
      modHero.innerHTML =
        '<a class="mod-hero" href="' + topFive[0].url + '">' +
          thumbImgHtml(topFive[0], 'thumb') +
          (topFive[0].desc ? '<p class="cap">' + esc(topFive[0].desc) + '</p>' : '') +
        '</a>';
    }
    // 우측 컬럼: 칼럼 — 최신 2건
    var columns = pickMany(['칼럼'], 2);
    var sideList = document.getElementById('sideList');
    if (sideList) {
      sideList.innerHTML = columns.map(function (item) {
        return '' +
          '<li>' +
            '<a href="' + item.url + '">' + thumbImgHtml(item, 'thumb') + '</a>' +
            '<div class="body">' +
              '<a href="' + item.url + '"><h4>' + esc(item.title) + '</h4></a>' +
              (item.desc ? '<p>' + esc(item.desc) + '</p>' : '') +
            '</div>' +
          '</li>';
      }).join('');
    }
    var columnMore = document.getElementById('columnMore');
    if (columnMore && columns[0]) columnMore.href = columns[0].url;
  }

  function initSiteSearch(ARTICLE_INDEX) {
    var input = document.getElementById('siteSearchInput');
    var resultsBox = document.getElementById('searchResults');
    if (!input || !resultsBox) return;
    var wrap = input.closest('.wrap');

    function normalize(s) {
      // 자모 결합 형태 차이(NFC/NFD)까지 흡수해 한글 검색이 안정적으로 걸리게 함
      return (s || '').normalize('NFC').toLowerCase();
    }

    function render(list, query) {
      resultsBox.innerHTML = '';
      if (!query) { resultsBox.hidden = true; return; }
      if (list.length === 0) {
        var li = document.createElement('li');
        li.innerHTML = '<div class="empty">검색 결과가 없습니다.</div>';
        resultsBox.appendChild(li);
      } else {
        list.forEach(function (item) {
          var li2 = document.createElement('li');
          var a = document.createElement('a');
          a.href = item.url;
          a.innerHTML = '<span class="tag">' + item.tag + '</span>' + item.title;
          li2.appendChild(a);
          resultsBox.appendChild(li2);
        });
      }
      resultsBox.hidden = false;
    }

    function search(query) {
      var q = normalize(query);
      if (!q) return [];
      return ARTICLE_INDEX.filter(function (item) {
        return normalize(item.title).indexOf(q) !== -1 || normalize(item.tag).indexOf(q) !== -1;
      });
    }

    input.addEventListener('input', function () {
      render(search(input.value.trim()), input.value.trim());
    });

    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        var q = input.value.trim();
        var matched = search(q);
        if (matched.length > 0) {
          window.location.href = matched[0].url;
        } else if (q) {
          window.open('https://www.google.com/search?q=' + encodeURIComponent('site:yejangfocus.github.io/news ' + q), '_blank');
        }
      }
    });

    document.addEventListener('click', function (e) {
      if (wrap && !wrap.contains(e.target)) resultsBox.hidden = true;
    });
  }

  function initThemeToggle() {
    var STORAGE_KEY = 'yejangfocus-theme';
    var root = document.documentElement;

    function apply(theme) {
      if (theme === 'dark' || theme === 'light') {
        root.setAttribute('data-theme', theme);
      } else {
        root.removeAttribute('data-theme');
      }
      var btn = document.getElementById('themeToggleBtn');
      if (btn) {
        var isDark = theme === 'dark' ||
          (theme !== 'light' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
        btn.textContent = isDark ? '☀️' : '🌙';
        btn.setAttribute('aria-label', isDark ? '라이트 모드로 전환' : '다크 모드로 전환');
      }
    }

    var saved = null;
    try { saved = localStorage.getItem(STORAGE_KEY); } catch (e) { /* 접근 제한 브라우저는 시스템 설정을 따름 */ }
    apply(saved);

    var style = document.createElement('style');
    style.textContent =
      '#themeToggleBtn{position:fixed;right:18px;bottom:18px;z-index:500;' +
      'width:42px;height:42px;border-radius:50%;border:1px solid var(--hair-strong,rgba(128,128,128,.35));' +
      'background:var(--paper);color:var(--ink);font-size:18px;line-height:1;cursor:pointer;' +
      'box-shadow:0 4px 14px rgba(0,0,0,.18);display:flex;align-items:center;justify-content:center;}' +
      '#themeToggleBtn:hover{opacity:.85;}';
    document.head.appendChild(style);

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'themeToggleBtn';
    document.body.appendChild(btn);
    apply(saved);

    btn.addEventListener('click', function () {
      var current = root.getAttribute('data-theme');
      var isDarkNow = current === 'dark' ||
        (!current && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
      var next = isDarkNow ? 'light' : 'dark';
      apply(next);
      try { localStorage.setItem(STORAGE_KEY, next); } catch (e) { /* 무시 */ }
    });
  }

  function initPlaceholderButtons() {
    // 로그인/회원가입/후원하기는 아직 실제 기능이 연결되지 않은 버튼.
    // 아무 반응 없이 무시되지 않도록 준비 중임을 알리는 토스트를 띄운다.
    var buttons = document.querySelectorAll('.topbar button, .support-btn');
    if (!buttons.length) return;

    var toastStyle = document.createElement('style');
    toastStyle.textContent =
      '#siteToast{position:fixed;left:50%;bottom:74px;transform:translate(-50%,12px);' +
      'background:var(--ink);color:var(--paper);font-size:13px;padding:10px 18px;border-radius:4px;' +
      'z-index:600;opacity:0;pointer-events:none;transition:opacity .2s ease,transform .2s ease;' +
      'box-shadow:0 6px 18px rgba(0,0,0,.2);white-space:nowrap;}' +
      '#siteToast.show{opacity:1;transform:translate(-50%,0);}';
    document.head.appendChild(toastStyle);

    var toast = document.createElement('div');
    toast.id = 'siteToast';
    document.body.appendChild(toast);
    var hideTimer = null;

    function showToast(message) {
      toast.textContent = message;
      toast.classList.add('show');
      if (hideTimer) clearTimeout(hideTimer);
      hideTimer = setTimeout(function () { toast.classList.remove('show'); }, 2200);
    }

    buttons.forEach(function (b) {
      b.addEventListener('click', function () {
        showToast((b.textContent || '이 기능은').trim() + ' 기능은 준비 중입니다.');
      });
    });
  }
})();
