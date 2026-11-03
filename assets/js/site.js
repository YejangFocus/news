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
    '목회': 'var(--navy)', '노회': 'var(--navy)', '이슈': 'var(--navy)', '인물': 'var(--navy)'
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

  fetch(root + 'data/articles.json')
    .then(function (res) { return res.json(); })
    .then(function (articles) {
      articles = sortByLatestDate(articles);
      window.ARTICLE_INDEX = articles;
      initCategoryOverlay(articles);
      initSiteSearch(articles);
      renderHomepage(articles);
      renderFocusHub(articles);
    })
    .catch(function (err) {
      console.error('기사 목록(articles.json)을 불러오지 못했습니다.', err);
    });

  initThemeToggle();
  initPlaceholderButtons();
  initSupportModal();

  // 오늘의 포커스 / 이슈 페이지: data/issues.json(편집자가 직접 묶은 이슈)과 articles.json을 이어
  // "이슈 하나의 전체 흐름"을 타임라인으로 보여준다. 기사 제목·날짜·요약은 articles.json에서
  // 그대로 가져오므로 issues.json에는 기사 경로만 적으면 된다.
  //  - 홈(#focusHub): 가장 최근에 업데이트된 이슈를 기본으로, 탭으로 다른 이슈 전환
  //  - 이슈 페이지(#issueDetail + #issueGrid): 주소 끝의 #이슈id 로 이슈를 고르고, 카드 목록 제공
  function renderFocusHub(ARTICLE_INDEX) {
    var hub = document.getElementById('focusHub');
    var detail = document.getElementById('issueDetail');
    if (!hub && !detail) return;
    fetch(root + 'data/issues.json')
      .then(function (res) { return res.json(); })
      .then(function (issues) {
        var list = prepareIssues(issues, ARTICLE_INDEX);
        if (!list.length) return;
        if (hub) buildHub(hub, list);
        if (detail) buildIssuePage(detail, list);
      })
      .catch(function (err) { console.error('이슈 목록(issues.json)을 불러오지 못했습니다.', err); });
  }

  var DAY = 86400000;
  function dayNum(d) { var t = Date.parse(d); return isNaN(t) ? 0 : Math.floor(t / DAY); }

  function prepareIssues(issues, ARTICLE_INDEX) {
    function find(path) {
      for (var i = 0; i < ARTICLE_INDEX.length; i++) {
        if (ARTICLE_INDEX[i].url.slice(-(path.length + 1)) === '/' + path) return ARTICLE_INDEX[i];
      }
      return null;
    }
    var list = issues.map(function (is) {
      // 날짜순으로 정렬하되, 같은 날짜 기사는 issues.json에 적은 순서를 따른다(편집자가 사건 순서를 정함).
      var arts = (is.articles || []).map(function (p, i) {
        var a = find(p); return a ? { a: a, i: i } : null;
      }).filter(Boolean).sort(function (x, y) {
        return x.a.date.localeCompare(y.a.date) || x.i - y.i;
      }).map(function (x) { return x.a; });
      return { def: is, arts: arts, last: arts.length ? arts[arts.length - 1].date : '' };
    }).filter(function (x) { return x.arts.length; });
    list.sort(function (a, b) { return b.last.localeCompare(a.last); });
    return list;
  }

  function issueStats(it) {
    var first = it.arts[0].date, last = it.last;
    var ago = Math.max(Math.floor(Date.now() / DAY) - dayNum(last), 0);
    return {
      span: Math.max(dayNum(last) - dayNum(first), 0) + 1,
      ago: ago,
      agoText: ago === 0 ? '오늘' : ago + '일 전',
      recent: ago <= 7
    };
  }

  // 이슈 한 건을 카드(요약 + 타임라인)로 그린다. opts.tabs: 홈에서 이슈 전환 탭, opts.page: 이슈 페이지(공유 버튼)
  function hubHtml(list, current, opts) {
    var it = list[current], is = it.def, arts = it.arts, st = issueStats(it), first = arts[0].date;
    var link = root + '이슈.html#' + encodeURIComponent(is.id);

    var tabs = (opts.tabs && list.length > 1) ? '<div class="fh-tabs" role="tablist">' + list.map(function (x, i) {
      return '<button type="button" class="fh-tab" role="tab" data-i="' + i + '" aria-selected="' + (i === current) + '">' + esc(x.def.kicker.split(' · ').pop()) + '</button>';
    }).join('') + '</div>' : '';
    var right = opts.page
      ? '<div class="fh-tabs"><button type="button" class="fh-share" data-share="1">링크 복사</button></div>'
      : '<div class="fh-tabs" style="margin-left:' + (tabs ? '0' : 'auto') + '"><a class="fh-more" href="' + esc(link) + '">이슈 전체보기 〉</a></div>';

    var points = (is.points || []).map(function (p) { return '<li>' + esc(p) + '</li>'; }).join('');
    var tl = arts.map(function (a, i) {
      var isLast = i === arts.length - 1, d = dayNum(a.date) - dayNum(first);
      return '<li class="fh-item' + (isLast ? ' latest' : '') + '">' +
        '<div class="fh-meta"><span>' + esc(a.date.slice(5).replace('-', '.')) + (i === 0 ? ' · 시작' : ' · D+' + d) + '</span>' +
        '<span class="tag">' + esc(a.tag) + '</span>' + (isLast ? '<span class="new">최신</span>' : '') + '</div>' +
        '<a class="fh-link" href="' + esc(a.url) + '">' + esc(a.title) + '</a>' +
        (a.desc ? '<p class="fh-desc">' + esc(a.desc) + '</p>' : '') + '</li>';
    }).join('');

    return '<div class="fh-card">' +
      '<div class="fh-top"><span class="fh-badge">' + (opts.page ? '이슈 타임라인' : '오늘의 포커스') + '</span>' +
      (st.recent ? '<span class="fh-live">진행 중인 이슈</span>' : '') + tabs + right + '</div>' +
      '<div class="fh-body">' +
        '<div><div class="fh-kicker">' + esc(is.kicker) + '</div>' +
        '<h2 class="fh-title">' + (opts.page ? esc(is.title) : '<a href="' + esc(link) + '">' + esc(is.title) + '</a>') + '</h2>' +
        '<div class="fh-stats">' +
          '<div class="fh-stat"><b>' + arts.length + '건</b><span>관련 기사</span></div>' +
          '<div class="fh-stat"><b>' + st.span + '일</b><span>보도 기간</span></div>' +
          '<div class="fh-stat"><b>' + st.agoText + '</b><span>최근 업데이트</span></div>' +
        '</div>' +
        '<div class="fh-glance"><h3>한눈에 보기</h3><ul>' + points + '</ul></div></div>' +
        '<div><div class="fh-tl-head">사건의 흐름 · 오래된 순</div><ol class="fh-timeline">' + tl + '</ol></div>' +
      '</div></div>';
  }

  // 타임라인: 화면에 들어오는 순서대로 하나씩 나타나고, 진행선이 따라 내려온다.
  var hubObserver = null;
  function animateTimeline(hub) {
    var items = hub.querySelectorAll('.fh-item'), tl = hub.querySelector('.fh-timeline');
    if (hubObserver) hubObserver.disconnect();
    if (!('IntersectionObserver' in window)) {
      Array.prototype.forEach.call(items, function (n) { n.classList.add('in'); });
      tl.style.setProperty('--fh-fill', '100%');
      return;
    }
    var io = hubObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.classList.add('in');
        io.unobserve(e.target);
        var k = Array.prototype.indexOf.call(items, e.target);
        var pct = Math.round(((k + 1) / items.length) * 100);
        var cur = parseInt(tl.style.getPropertyValue('--fh-fill'), 10) || 0;
        if (pct > cur) tl.style.setProperty('--fh-fill', pct + '%');
      });
    }, { threshold: 0.25 });
    Array.prototype.forEach.call(items, function (n, i) {
      n.style.transitionDelay = Math.min(i * 70, 420) + 'ms';
      io.observe(n);
    });
  }

  function buildHub(hub, list) {
    var current = 0;
    function render() {
      hub.innerHTML = hubHtml(list, current, { tabs: true });
      hub.classList.add('ready');
      Array.prototype.forEach.call(hub.querySelectorAll('.fh-tab'), function (b) {
        b.addEventListener('click', function () { current = +b.dataset.i; render(); });
      });
      animateTimeline(hub);
    }
    render();
  }

  function buildIssuePage(detail, list) {
    var grid = document.getElementById('issueGrid');
    var count = document.getElementById('issueCount');
    var current = 0;

    function fromHash() {
      var id = decodeURIComponent((location.hash || '').replace(/^#/, ''));
      for (var i = 0; i < list.length; i++) if (list[i].def.id === id) return i;
      return 0;
    }

    function renderCards() {
      if (count) count.textContent = '총 ' + list.length + '개';
      grid.innerHTML = list.map(function (x, i) {
        var st = issueStats(x);
        return '<button type="button" class="is-card" data-i="' + i + '"' + (i === current ? ' aria-current="true"' : '') + '>' +
          '<div class="k">' + esc(x.def.kicker) + '</div><h3>' + esc(x.def.title) + '</h3>' +
          '<div class="m">' + (st.recent ? '<span class="live">진행 중</span>' : '') +
          '<span>기사 ' + x.arts.length + '건</span><span>' + st.agoText + ' 업데이트</span></div></button>';
      }).join('');
    }

    function render() {
      detail.innerHTML = hubHtml(list, current, { page: true });
      detail.classList.add('ready');
      var is = list[current].def;
      document.title = is.title + ' | 이슈 | 예장포커스';
      var share = detail.querySelector('.fh-share');
      share.addEventListener('click', function () {
        var url = location.href;
        if (navigator.share) { navigator.share({ title: is.title, url: url }).catch(function () {}); return; }
        var done = function () { share.textContent = '복사됨 ✓'; setTimeout(function () { share.textContent = '링크 복사'; }, 1800); };
        if (navigator.clipboard) navigator.clipboard.writeText(url).then(done, function () {});
      });
      renderCards();
      animateTimeline(detail);
    }

    grid.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('.is-card') : null;
      if (!b) return;
      current = +b.dataset.i;
      history.replaceState(null, '', '#' + encodeURIComponent(list[current].def.id));
      render();
      detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    window.addEventListener('hashchange', function () { current = fromHash(); render(); });

    current = fromHash();
    render();
  }

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
        list.appendChild(li);
      });
    }

    function closeAllArticles() {
      if (overlay) overlay.hidden = true;
    }

    // '이슈' 메뉴는 기사 목록 대신 이슈 타임라인 페이지로 이동한다.
    var onIssuePage = !!document.querySelector('[data-page="issues"]');
    if (onIssuePage) {
      buttons.forEach(function (x) { x.classList.toggle('active', x.dataset.cat === '이슈'); });
    }
    buttons.forEach(function (b) {
      b.addEventListener('click', function () {
        if (b.dataset.cat === '이슈') {
          if (!onIssuePage) location.href = root + '이슈.html';
          return;
        }
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

    // 좌측 컬럼은 카테고리 순서가 고정이다: 특집 → 교단 → (목록) 목회·사설·노회·이슈·인물·교계 → 신학.
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
    var PLAIN_LIST_CATS = ['목회', '사설', '노회', '이슈', '인물', '교계'];
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
    var buttons = document.querySelectorAll('.topbar button');
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

  // 후원문의 팝업: 후원계좌 안내 + 계좌번호 복사
  function initSupportModal() {
    var triggers = document.querySelectorAll('.support-btn');
    if (!triggers.length) return;

    var ACCOUNT_BANK = '농협';
    var ACCOUNT_NO = '352-2415-1903-53';
    var ACCOUNT_HOLDER = '윤기로';

    var css = document.createElement('style');
    css.textContent =
      '.sp-overlay{position:fixed;inset:0;z-index:1000;background:rgba(15,29,58,.55);display:flex;align-items:center;justify-content:center;padding:16px;opacity:0;visibility:hidden;transition:opacity .2s ease,visibility .2s ease;}' +
      '.sp-overlay.open{opacity:1;visibility:visible;}' +
      '.sp-modal{position:relative;width:100%;max-width:400px;max-height:calc(100vh - 32px);overflow-y:auto;background:var(--paper);color:var(--ink);border:2px solid var(--doodle);border-radius:10px;box-shadow:6px 6px 0 var(--doodle);padding:28px 24px 22px;transform:translateY(12px);transition:transform .2s ease;}' +
      '.sp-overlay.open .sp-modal{transform:translateY(0);}' +
      '.sp-close{position:absolute;top:8px;right:10px;background:none;border:none;font-size:20px;line-height:1;color:var(--ink-soft);cursor:pointer;padding:8px;}' +
      '.sp-close:hover{color:var(--ink);}' +
      '.sp-title{font-family:"Noto Serif KR",serif;font-size:20px;font-weight:700;margin:0 0 8px;color:var(--ink);}' +
      '.sp-desc{font-size:14px;line-height:1.6;color:var(--ink-soft);margin:0 0 18px;word-break:keep-all;}' +
      '.sp-box{background:var(--paper-alt);border:1px solid var(--hair-strong);border-radius:8px;padding:14px 16px;margin-bottom:14px;}' +
      '.sp-label{font-size:12px;color:var(--ink-faint);margin-bottom:4px;}' +
      '.sp-bank{font-size:14px;color:var(--ink);margin-bottom:6px;}' +
      '.sp-no{font-size:22px;font-weight:700;letter-spacing:.02em;color:var(--navy);word-break:break-all;}' +
      '.sp-copy{display:block;width:100%;padding:13px;font-size:15px;font-weight:700;font-family:inherit;color:#fff;background:var(--navy);border:none;border-radius:8px;cursor:pointer;}' +
      '.sp-copy:hover{filter:brightness(1.1);}' +
      '.sp-copy.done{background:var(--pine);}' +
      '.sp-note{font-size:12px;line-height:1.5;color:var(--ink-faint);text-align:center;margin:12px 0 0;}' +
      '@media (max-width:480px){.sp-modal{padding:26px 18px 18px;}.sp-no{font-size:20px;}}';
    document.head.appendChild(css);

    var overlay = document.createElement('div');
    overlay.className = 'sp-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'spTitle');
    overlay.innerHTML =
      '<div class="sp-modal">' +
        '<button type="button" class="sp-close" aria-label="닫기">✕</button>' +
        '<h2 class="sp-title" id="spTitle">✊ 문서선교 후원</h2>' +
        '<p class="sp-desc">예장포커스는 독자 여러분의 기도와 후원으로 문서선교를 이어갑니다. 아래 계좌로 후원해 주시면 큰 힘이 됩니다.</p>' +
        '<div class="sp-box">' +
          '<div class="sp-label">문서선교 후원계좌</div>' +
          '<div class="sp-bank">' + ACCOUNT_BANK + ' · 예금주 ' + ACCOUNT_HOLDER + '</div>' +
          '<div class="sp-no">' + ACCOUNT_NO + '</div>' +
        '</div>' +
        '<button type="button" class="sp-copy">계좌번호 복사</button>' +
        '<p class="sp-note">복사 후 사용하시는 은행 앱에서 붙여넣어 주세요.</p>' +
      '</div>';
    document.body.appendChild(overlay);

    var copyBtn = overlay.querySelector('.sp-copy');
    var lastFocus = null;
    var resetTimer = null;

    function open() {
      lastFocus = document.activeElement;
      overlay.classList.add('open');
      document.body.style.overflow = 'hidden';
      overlay.querySelector('.sp-close').focus();
    }
    function close() {
      overlay.classList.remove('open');
      document.body.style.overflow = '';
      if (lastFocus && lastFocus.focus) lastFocus.focus();
    }
    function markCopied(ok) {
      copyBtn.textContent = ok ? '✓ 복사되었습니다' : '길게 눌러 직접 복사해 주세요';
      copyBtn.classList.toggle('done', ok);
      if (resetTimer) clearTimeout(resetTimer);
      resetTimer = setTimeout(function () {
        copyBtn.textContent = '계좌번호 복사';
        copyBtn.classList.remove('done');
      }, 2000);
    }
    function fallbackCopy() {
      var ta = document.createElement('textarea');
      ta.value = ACCOUNT_NO;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;';
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, ta.value.length);
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { /* 무시 */ }
      document.body.removeChild(ta);
      markCopied(ok);
    }

    copyBtn.addEventListener('click', function () {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(ACCOUNT_NO).then(function () { markCopied(true); }, fallbackCopy);
      } else {
        fallbackCopy();
      }
    });
    triggers.forEach(function (t) { t.addEventListener('click', open); });
    overlay.querySelector('.sp-close').addEventListener('click', close);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && overlay.classList.contains('open')) close();
    });
  }
})();

// ── 기사 본문 사진 확대 보기(라이트박스) ─────────────────────────────────
// 기사 본문의 <figure> 사진을 클릭하면 화면 전체에 사진을 띄운다.
//  - 처음엔 화면에 맞춰 보여주고, 사진을 다시 클릭(탭)하면 원본 크기로 보여준다
//    (원본이 화면보다 크면 스크롤/드래그로 이동). 한 번 더 클릭하면 화면 맞춤으로 복귀.
//  - 닫기: 배경 클릭, 오른쪽 위 ✕ 버튼, ESC 키.
// 이벤트 위임으로 동작하므로 기사 HTML을 따로 고칠 필요 없이 새 기사에도 자동 적용된다.
(function () {
  var SELECTOR = 'figure img';
  var overlay, scroller, bigImg, caption, hint;
  var lastFocus = null;

  function injectStyle() {
    var css = [
      SELECTOR + '{cursor:zoom-in}',
      '.yf-lb{position:fixed;inset:0;z-index:99999;display:none;background:rgba(0,0,0,.92)}',
      '.yf-lb.open{display:block}',
      '.yf-lb-scroll{position:absolute;inset:0;overflow:auto;-webkit-overflow-scrolling:touch;display:flex;padding:48px 16px 64px;box-sizing:border-box}',
      '.yf-lb-scroll img{margin:auto;display:block;max-width:100%;max-height:100%;width:auto;height:auto;cursor:zoom-in;background:#fff}',
      '.yf-lb.orig .yf-lb-scroll img{max-width:none;max-height:none;cursor:zoom-out}',
      '.yf-lb-close{position:fixed;top:10px;right:14px;z-index:2;width:40px;height:40px;border:0;border-radius:50%;background:rgba(255,255,255,.18);color:#fff;font-size:24px;line-height:40px;cursor:pointer}',
      '.yf-lb-close:hover{background:rgba(255,255,255,.32)}',
      '.yf-lb-bar{position:fixed;left:0;right:0;bottom:0;z-index:2;padding:10px 16px;color:#eee;font-size:13px;line-height:1.5;text-align:center;background:linear-gradient(transparent,rgba(0,0,0,.75));pointer-events:none}',
      '.yf-lb-hint{display:block;margin-top:2px;color:#bbb;font-size:12px}'
    ].join('\n');
    var st = document.createElement('style');
    st.textContent = css;
    document.head.appendChild(st);
  }

  function build() {
    overlay = document.createElement('div');
    overlay.className = 'yf-lb';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', '사진 확대 보기');
    overlay.innerHTML =
      '<button type="button" class="yf-lb-close" aria-label="닫기">&times;</button>' +
      '<div class="yf-lb-scroll"><img alt=""></div>' +
      '<div class="yf-lb-bar"><span class="yf-lb-cap"></span><span class="yf-lb-hint"></span></div>';
    document.body.appendChild(overlay);
    scroller = overlay.querySelector('.yf-lb-scroll');
    bigImg = scroller.querySelector('img');
    caption = overlay.querySelector('.yf-lb-cap');
    hint = overlay.querySelector('.yf-lb-hint');

    overlay.querySelector('.yf-lb-close').addEventListener('click', close);
    // 사진 바깥(배경)을 누르면 닫고, 사진을 누르면 화면맞춤 ↔ 원본크기 전환
    scroller.addEventListener('click', function (e) {
      if (e.target === bigImg) toggleOriginal(); else close();
    });
  }

  function updateHint() {
    var orig = overlay.classList.contains('orig');
    hint.textContent = orig ? '사진을 누르면 화면 맞춤 · 배경을 누르거나 ESC로 닫기'
                            : '사진을 누르면 원본 크기 · 배경을 누르거나 ESC로 닫기';
  }

  function toggleOriginal() {
    overlay.classList.toggle('orig');
    scroller.scrollTop = 0;
    scroller.scrollLeft = 0;
    updateHint();
  }

  function open(img) {
    if (!overlay) build();
    lastFocus = document.activeElement;
    // 지연 로딩·축소본(data-full)이 있으면 원본 주소를 우선 사용
    bigImg.src = img.getAttribute('data-full') || img.currentSrc || img.src;
    bigImg.alt = img.alt || '';
    var fig = img.closest('figure');
    var cap = fig && fig.querySelector('figcaption');
    caption.textContent = cap ? cap.textContent.trim() : (img.alt || '');
    overlay.classList.remove('orig');
    updateHint();
    overlay.classList.add('open');
    document.documentElement.style.overflow = 'hidden';
    overlay.querySelector('.yf-lb-close').focus();
  }

  function close() {
    if (!overlay || !overlay.classList.contains('open')) return;
    overlay.classList.remove('open', 'orig');
    bigImg.removeAttribute('src');
    document.documentElement.style.overflow = '';
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  injectStyle();
  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || t.tagName !== 'IMG' || !t.matches(SELECTOR)) return;
    if (t.closest('a')) return; // 링크가 걸린 사진은 링크 동작을 우선
    e.preventDefault();
    open(t);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') close();
  });
})();
