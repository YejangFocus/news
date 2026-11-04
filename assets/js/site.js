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
      var counts = { '전체': articles.length };
      articles.forEach(function (a) { counts[a.tag] = (counts[a.tag] || 0) + 1; });
      if (window.__yfNavSetCounts) window.__yfNavSetCounts(counts);
      initCategoryOverlay(articles);
      initSiteSearch(articles);
      renderHomepage(articles);
      renderFocusHub(articles);
      initArticleExtras(articles);
      renderBriefing(articles);
    })
    .catch(function (err) {
      console.error('기사 목록(articles.json)을 불러오지 못했습니다.', err);
    });

  initSkipLink();
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
      : '<div class="fh-tabs" style="margin-left:' + (tabs ? '0' : 'auto') + '"><a class="fh-more" href="' + esc(link) + '">이슈 전체보기 〉</a> <a class="fh-more" style="margin-left:10px" href="' + root + '주간브리핑.html">주간 브리핑 〉</a></div>';

    var points = (is.points || []).map(function (p) { return '<li>' + esc(p) + '</li>'; }).join('');
    // 사건의 흐름은 최신 기사가 맨 위에 오도록 뒤집어 그린다(D+n·'시작' 표기는 원래 순서 기준).
    var rows = arts.map(function (a, i) {
      var isLast = i === arts.length - 1, d = dayNum(a.date) - dayNum(first);
      return '<li class="fh-item' + (isLast ? ' latest' : '') + '">' +
        '<div class="fh-meta"><span>' + esc(a.date.slice(5).replace('-', '.')) + (i === 0 ? ' · 시작' : ' · D+' + d) + '</span>' +
        '<span class="tag">' + esc(a.tag) + '</span>' + (isLast ? '<span class="new">최신</span>' : '') + '</div>' +
        '<a class="fh-link" href="' + esc(a.url) + '">' + esc(a.title) + '</a>' +
        (a.desc ? '<p class="fh-desc">' + esc(a.desc) + '</p>' : '') + '</li>';
    }).reverse();
    // 홈에서는 최신 기사 opts.limit건만 보여주고, 나머지는 이슈 페이지에서 이어 읽게 한다.
    var hidden = 0;
    if (opts.limit && rows.length > opts.limit) { hidden = rows.length - opts.limit; rows = rows.slice(0, opts.limit); }
    var tl = rows.join('') + (hidden ? '<li class="fh-rest"><a href="' + esc(link) + '">이전 보도 ' + hidden + '건 더 보기 〉</a></li>' : '');

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
        '<div><div class="fh-tl-head">사건의 흐름 · 최신순' + (hidden ? ' · 최근 ' + opts.limit + '건' : '') + '</div><ol class="fh-timeline">' + tl + '</ol></div>' +
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
      hub.innerHTML = hubHtml(list, current, { tabs: true, limit: 3 });
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

  // 기사 페이지 공통 기능(페이지마다 손대지 않고 이 스크립트가 붙인다):
  //  1) 상단 읽기 진행률 바  2) 글 끝의 "같은 이슈의 기사 / 이어서 읽기"  3) 공유·링크 복사
  // articles.json에 있는 기사 페이지에서만 동작하므로 홈·이슈 페이지·공지에는 영향이 없다.
  function initArticleExtras(ARTICLE_INDEX) {
    var page = document.querySelector('.page');
    if (!page || document.getElementById('focusHub') || document.getElementById('issueDetail')) return;
    function tail(u) {
      var seg = u.split('?')[0].split('#')[0].split('/').filter(Boolean).slice(-2).join('/');
      try { return decodeURIComponent(seg); } catch (e) { return seg; }
    }
    var here = tail(location.pathname), cur = null;
    for (var i = 0; i < ARTICLE_INDEX.length; i++) if (tail(ARTICLE_INDEX[i].url) === here) { cur = ARTICLE_INDEX[i]; break; }
    if (!cur) return;

    var css = document.createElement('style');
    css.textContent =
      '.yf-progress{position:fixed;left:0;top:0;height:4px;width:100%;z-index:1000;background:transparent;pointer-events:none}' +
      '.yf-progress i{display:block;height:100%;width:100%;transform:scaleX(0);transform-origin:left;background:linear-gradient(90deg,#ffb020,#e8322a)}' +
      '.yf-end{margin:44px 0 0;font-family:"Noto Sans KR",sans-serif;color:var(--ink,#111)}' +
      '.yf-end a{text-decoration:none;color:inherit}' +
      '.yf-share{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:14px 0;border-top:2px solid var(--ink,#111);border-bottom:1px solid var(--rule-soft,#ddd)}' +
      '.yf-share b{font:400 15px "Do Hyeon","Noto Sans KR",sans-serif;margin-right:auto}' +
      '.yf-share button{font:700 13px "Noto Sans KR",sans-serif;cursor:pointer;color:var(--ink,#111);background:var(--paper,#fff);border:2px solid #111;border-radius:14px 3px 14px 3px;padding:7px 14px;box-shadow:2px 2px 0 #111}' +
      '.yf-share button:hover{background:#ffe38a;color:#1c1a16}' +
      '.yf-box{margin-top:22px;padding:18px 20px;border:2px solid #111;border-radius:4px 16px 4px 16px;box-shadow:4px 4px 0 #111;background:var(--paper,#fff)}' +
      '.yf-box h3{margin:0 0 4px;font:400 17px "Do Hyeon","Noto Sans KR",sans-serif;color:var(--ink,#111)}' +
      '.yf-box .k{font-size:12px;font-weight:700;color:#e8322a}' +
      '.yf-box .t{display:block;margin:4px 0 10px;font:700 16px/1.5 "Noto Serif KR",serif;word-break:keep-all}' +
      '.yf-box .t:hover{text-decoration:underline}' +
      '.yf-steps{display:flex;gap:5px;margin:10px 0 4px}' +
      '.yf-steps a{flex:1;height:8px;border-radius:4px;background:var(--rule-soft,#ddd)}' +
      '.yf-steps a:hover{background:#ffb020}' +
      '.yf-steps a.on{background:#e8322a}' +
      '.yf-pos{font-size:12px;color:var(--muted,#777)}' +
      '.yf-nav{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:14px}' +
      '.yf-nav a{display:block;padding:10px 12px;border:1px solid var(--rule-soft,#ddd);border-radius:8px;font-size:13.5px;line-height:1.5}' +
      '.yf-nav a:hover{border-color:#e8322a}' +
      '.yf-nav small{display:block;font-size:11.5px;font-weight:700;color:var(--muted,#777);margin-bottom:2px}' +
      '.yf-nav .pv{text-align:right;grid-column:2}' +
      '.yf-more{display:inline-block;margin-top:12px;font-size:12.5px;font-weight:700;color:#e8322a !important}' +
      '.yf-more:hover{text-decoration:underline}' +
      '.yf-rel{list-style:none;margin:10px 0 0;padding:0}' +
      '.yf-rel li{padding:9px 0;border-bottom:1px dashed var(--rule-soft,#ddd);font-size:14.5px;line-height:1.5}' +
      '.yf-rel li:last-child{border-bottom:none}' +
      '.yf-rel .g{font-weight:700;font-size:12px;margin-right:6px;color:#e8322a}' +
      '.yf-rel a:hover{text-decoration:underline}' +
      '@media (max-width:520px){.yf-nav{grid-template-columns:1fr}.yf-nav .pv{grid-column:1;text-align:left}}' +
      '@media print{.yf-progress,.yf-end{display:none}}';
    document.head.appendChild(css);
    var fl = document.createElement('link');
    fl.rel = 'stylesheet';
    fl.href = 'https://fonts.googleapis.com/css2?family=Do+Hyeon&display=swap';
    document.head.appendChild(fl);

    // 1) 읽기 진행률 바
    var bar = document.createElement('div');
    bar.className = 'yf-progress';
    bar.setAttribute('aria-hidden', 'true');
    bar.innerHTML = '<i></i>';
    document.body.appendChild(bar);
    var fill = bar.firstChild, ticking = false;
    function update() {
      ticking = false;
      var r = page.getBoundingClientRect();
      var total = r.height - window.innerHeight;
      var p = total > 0 ? Math.min(Math.max(-r.top / total, 0), 1) : 0;
      fill.style.transform = 'scaleX(' + p + ')';
    }
    function onScroll() { if (!ticking) { ticking = true; requestAnimationFrame(update); } }
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    update();

    // 3) 공유·링크 복사 (모바일에서는 기기 공유창에 카카오톡 등이 뜬다)
    var canon = document.querySelector('link[rel="canonical"]');
    var shareUrl = (canon && canon.href) || location.href.split('#')[0];
    var end = document.createElement('div');
    end.className = 'yf-end';
    end.innerHTML = '<div class="yf-share"><b>이 기사 공유하기</b>' +
      '<button type="button" data-a="share">공유</button><button type="button" data-a="copy">링크 복사</button></div><div class="yf-slot"></div>';
    page.appendChild(end);
    end.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('button[data-a]') : null;
      if (!b) return;
      function copy() {
        var done = function () { var o = b.textContent; b.textContent = '복사됨 ✓'; setTimeout(function () { b.textContent = o; }, 1800); };
        if (navigator.clipboard) navigator.clipboard.writeText(shareUrl).then(done, function () { window.prompt('링크를 복사하세요', shareUrl); });
        else window.prompt('링크를 복사하세요', shareUrl);
      }
      if (b.dataset.a === 'share' && navigator.share) navigator.share({ title: cur.title, url: shareUrl }).catch(function () {});
      else copy();
    });

    initGlossary(page, cur, ARTICLE_INDEX, css);

    // 2) 같은 이슈 / 이어서 읽기
    var slot = end.querySelector('.yf-slot');
    function renderRelated() {
      var same = ARTICLE_INDEX.filter(function (a) { return a.tag === cur.tag && a.url !== cur.url; });
      var rest = ARTICLE_INDEX.filter(function (a) { return a.url !== cur.url && same.indexOf(a) < 0; });
      var picks = same.concat(rest).slice(0, 3);
      if (!picks.length) return;
      slot.innerHTML = '<div class="yf-box"><h3>이어서 읽기</h3><ul class="yf-rel">' + picks.map(function (a) {
        return '<li><a href="' + esc(a.url) + '"><span class="g">' + esc(a.tag) + '</span>' + esc(a.title) + '</a></li>';
      }).join('') + '</ul></div>';
    }
    fetch(root + 'data/issues.json')
      .then(function (res) { return res.json(); })
      .then(function (issues) {
        var list = prepareIssues(issues, ARTICLE_INDEX), it = null, idx = -1;
        for (var i = 0; i < list.length && idx < 0; i++) {
          var k = list[i].arts.indexOf(cur);
          if (k >= 0) { it = list[i]; idx = k; }
        }
        if (!it) { renderRelated(); return; }
        var arts = it.arts, prev = arts[idx - 1], next = arts[idx + 1];
        var link = root + '이슈.html#' + encodeURIComponent(it.def.id);
        slot.innerHTML = '<div class="yf-box"><div class="k">이 기사가 속한 이슈</div>' +
          '<a class="t" href="' + esc(link) + '">' + esc(it.def.title) + '</a>' +
          '<div class="yf-steps">' + arts.map(function (a, j) {
            return '<a href="' + esc(a.url) + '" class="' + (j === idx ? 'on' : '') + '" title="' + esc(a.title) + '" aria-label="최신순 ' + (arts.length - j) + '번째 기사"></a>';
          }).reverse().join('') + '</div>' +
          '<div class="yf-pos">관련 기사 ' + arts.length + '건 · 최신순 ' + (arts.length - idx) + '번째</div>' +
          ((prev || next) ? '<div class="yf-nav">' +
            (next ? '<a class="nx" href="' + esc(next.url) + '"><small>← 이어진 보도(더 최신)</small>' + esc(next.title) + '</a>' : '') +
            (prev ? '<a class="pv" href="' + esc(prev.url) + '"><small>앞선 보도(더 이전) →</small>' + esc(prev.title) + '</a>' : '') + '</div>' : '') +
          '<a class="yf-more" href="' + esc(link) + '">이슈 타임라인 전체 보기 〉</a></div>';
      })
      .catch(renderRelated);
  }

  // 인물·규정 팝업 카드: data/glossary.json에 적힌 용어가 기사 본문에 나오면 "처음 나온 한 곳"만
  // 점선 밑줄로 바꾸고, 누르면 설명 카드를 띄운다. 설명은 본지 기사에서 확인된 내용만 적고
  // 근거 기사 링크를 함께 보여준다. 새 용어는 glossary.json에 항목만 추가하면 된다.
  function initGlossary(page, cur, ARTICLE_INDEX, css) {
    fetch(root + 'data/glossary.json')
      .then(function (res) { return res.json(); })
      .then(function (entries) { annotate(entries); })
      .catch(function (err) { console.error('용어 사전(glossary.json)을 불러오지 못했습니다.', err); });

    css.textContent +=
      '.yf-term{font:inherit;color:inherit;background:linear-gradient(transparent 62%,rgba(255,200,60,.55) 62%);border:none;border-bottom:1px dotted currentColor;padding:0;cursor:pointer;text-align:inherit}' +
      '.yf-term:hover,.yf-term[aria-expanded="true"]{background:linear-gradient(transparent 40%,rgba(255,200,60,.8) 40%)}' +
      '.yf-card{position:absolute;z-index:1100;width:320px;max-width:calc(100vw - 24px);padding:14px 16px 12px;background:var(--paper,#fff);color:var(--ink,#111);' +
      'border:2px solid #111;border-radius:4px 16px 4px 16px;box-shadow:4px 4px 0 #111;font:14px/1.65 "Noto Sans KR",sans-serif;text-align:left;letter-spacing:0}' +
      '.yf-card .ty{display:inline-block;font:400 12px "Do Hyeon","Noto Sans KR",sans-serif;color:#fff;background:#e8322a;border-radius:8px 2px 8px 2px;padding:1px 9px}' +
      '.yf-card h4{margin:6px 0 6px;font:700 16px/1.4 "Noto Serif KR",serif;color:var(--ink,#111);padding:0;border:0}' +
      '.yf-card p{margin:0;font-size:13.5px;line-height:1.7;color:var(--ink,#111)}' +
      '.yf-card .nt{margin-top:6px;font-size:11.5px;color:var(--muted,#777)}' +
      '.yf-card .src{margin-top:10px;padding-top:8px;border-top:1px dashed var(--rule-soft,#ccc);font-size:12.5px}' +
      '.yf-card .src b{display:block;font-size:11.5px;color:var(--muted,#777);margin-bottom:2px}' +
      '.yf-card .src a{display:block;padding:2px 0;color:#e8322a;text-decoration:none}' +
      '.yf-card .src a:hover{text-decoration:underline}' +
      '.yf-card .x{position:absolute;top:6px;right:8px;background:none;border:none;font-size:16px;line-height:1;cursor:pointer;color:var(--muted,#777)}' +
      '@media (max-width:560px){.yf-card{position:fixed;left:10px !important;right:10px;bottom:10px;top:auto !important;width:auto;max-width:none}}';

    function annotate(entries) {
      var map = {}, aliases = [];
      entries.forEach(function (e) {
        map[e.id] = e;
        (e.aliases || [e.term]).forEach(function (a) { aliases.push({ a: a, id: e.id }); });
      });
      aliases.sort(function (x, y) { return y.a.length - x.a.length; });   // 긴 표현 우선
      var done = {};
      var SKIP = 'A,BUTTON,H1,H2,H3,H4,SCRIPT,STYLE,FIGCAPTION,CITE,.yf-end,.yf-card,.meta-bar,.catnav,.yf-term';
      var walker = document.createTreeWalker(page, NodeFilter.SHOW_TEXT, {
        acceptNode: function (n) {
          if (!n.nodeValue || n.nodeValue.length < 3) return NodeFilter.FILTER_REJECT;
          var el = n.parentElement;
          return (el && !el.closest(SKIP)) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
        }
      });
      var nodes = [], n;
      while ((n = walker.nextNode())) nodes.push(n);
      nodes.forEach(function (node) {
        var text = node.nodeValue, best = null;
        aliases.forEach(function (al) {
          if (done[al.id]) return;
          var i = text.indexOf(al.a);
          if (i >= 0 && (!best || i < best.i || (i === best.i && al.a.length > best.a.length))) best = { i: i, a: al.a, id: al.id };
        });
        if (!best) return;
        done[best.id] = true;
        var btn = document.createElement('button');
        btn.type = 'button'; btn.className = 'yf-term'; btn.dataset.id = best.id;
        btn.setAttribute('aria-haspopup', 'dialog'); btn.setAttribute('aria-expanded', 'false');
        btn.textContent = best.a;
        var after = node.splitText(best.i);
        after.nodeValue = after.nodeValue.slice(best.a.length);
        node.parentNode.insertBefore(btn, after);
      });

      var card = null, opener = null;
      function close() {
        if (card) { card.remove(); card = null; }
        if (opener) { opener.setAttribute('aria-expanded', 'false'); opener.focus({ preventScroll: true }); opener = null; }
      }
      function open(btn) {
        var wasSame = opener === btn;
        close();
        if (wasSame) return;
        var e = map[btn.dataset.id];
        var srcs = (e.sources || []).map(function (path) {
          for (var i = 0; i < ARTICLE_INDEX.length; i++) {
            if (ARTICLE_INDEX[i].url.slice(-(path.length + 1)) === '/' + path && ARTICLE_INDEX[i] !== cur) return ARTICLE_INDEX[i];
          }
          return null;
        }).filter(Boolean);
        card = document.createElement('div');
        card.className = 'yf-card'; card.setAttribute('role', 'dialog'); card.setAttribute('aria-label', e.term + ' 설명');
        card.innerHTML = '<button type="button" class="x" aria-label="닫기">✕</button><span class="ty">' + esc(e.type) + '</span><h4>' + esc(e.term) + '</h4>' +
          '<p>' + esc(e.summary) + '</p>' + (e.note ? '<div class="nt">※ ' + esc(e.note) + '</div>' : '') +
          (srcs.length ? '<div class="src"><b>근거·관련 기사</b>' + srcs.map(function (a) { return '<a href="' + esc(a.url) + '">' + esc(a.title) + '</a>'; }).join('') + '</div>' : '');
        document.body.appendChild(card);
        btn.setAttribute('aria-expanded', 'true'); opener = btn;
        var r = btn.getBoundingClientRect(), w = card.offsetWidth;
        var left = Math.min(Math.max(r.left + window.scrollX, 12 + window.scrollX), window.scrollX + document.documentElement.clientWidth - w - 12);
        card.style.left = left + 'px';
        card.style.top = (r.bottom + window.scrollY + 8) + 'px';
        card.querySelector('.x').addEventListener('click', close);
      }
      page.addEventListener('click', function (ev) {
        var b = ev.target.closest ? ev.target.closest('.yf-term') : null;
        if (b) { ev.stopPropagation(); open(b); }
      });
      document.addEventListener('click', function (ev) {
        if (card && !(ev.target.closest && ev.target.closest('.yf-card'))) close();
      });
      document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape' && card) close(); });
    }
  }

  // 주간 브리핑: articles.json을 월~일 주 단위로 묶어 "이번 주 이슈 · 주요 기사 · 읽어볼 글 · 하루씩 보기"를
  // 자동 편집한다. #briefing 이 있는 페이지(주간브리핑.html)에서만 동작한다.
  //  - 주소 끝에 #2026-10-26 처럼 날짜를 붙이면 그 날짜가 속한 주를 연다.
  //  - 데이터가 있는 주만 오가며, 카카오톡 등에 붙여넣을 요약 글을 복사하는 버튼이 있다.
  function renderBriefing(ARTICLE_INDEX) {
    var host = document.getElementById('briefing');
    if (!host) return;
    var DAYMS = 86400000;
    var NEWS = ['특집', '사설', '교단', '노회', '교계', '목회', '속보', '정치'];
    var READ = ['칼럼', '신학', '인물'];
    function ymd(ms) { return new Date(ms).toISOString().slice(0, 10); }
    function toMs(d) { var p = d.split('-'); return Date.UTC(+p[0], +p[1] - 1, +p[2]); }
    function weekStart(d) { var ms = toMs(d); return ms - ((new Date(ms).getUTCDay() + 6) % 7) * DAYMS; }
    function md(ms) { var d = new Date(ms); return (d.getUTCMonth() + 1) + '.' + d.getUTCDate(); }
    var DOW = ['월', '화', '수', '목', '금', '토', '일'];

    var weeks = {};
    ARTICLE_INDEX.forEach(function (a) {
      if (!a.date) return;
      var k = ymd(weekStart(a.date));
      (weeks[k] = weeks[k] || []).push(a);
    });
    var keys = Object.keys(weeks).sort();   // 오래된 주 → 최신 주
    if (!keys.length) return;

    var issuesList = [];
    fetch(root + 'data/issues.json').then(function (r) { return r.json(); })
      .then(function (iss) { issuesList = prepareIssues(iss, ARTICLE_INDEX); render(); })
      .catch(function () {});

    var cur = keys.length - 1;
    function fromHash() {
      var h = (location.hash || '').replace(/^#/, '');
      if (/^\d{4}-\d{2}-\d{2}$/.test(h)) {
        var k = ymd(weekStart(h)), i = keys.indexOf(k);
        if (i >= 0) return i;
      }
      return keys.length - 1;
    }

    function byNew(a, b) { return (b.date || '').localeCompare(a.date || '') || (Date.parse(b.uploaded) || 0) - (Date.parse(a.uploaded) || 0); }

    function render() {
      var key = keys[cur], start = toMs(key), end = start + 6 * DAYMS;
      var items = weeks[key].slice().sort(byNew);
      var range = ymd(start).replace(/-/g, '.') + ' – ' + md(end);

      // 분류별 건수
      var counts = {}, order = [];
      items.forEach(function (a) { if (!counts[a.tag]) { counts[a.tag] = 0; order.push(a.tag); } counts[a.tag]++; });
      order.sort(function (x, y) { return counts[y] - counts[x]; });

      var leads = items.filter(function (a) { return NEWS.indexOf(a.tag) >= 0; }).slice(0, 3);
      if (!leads.length) leads = items.slice(0, 1);
      var reads = items.filter(function (a) { return READ.indexOf(a.tag) >= 0 && leads.indexOf(a) < 0; }).slice(0, 3);

      var weekIssues = issuesList.map(function (it) {
        var inWeek = it.arts.filter(function (a) { return a.date >= ymd(start) && a.date <= ymd(end); });
        return inWeek.length ? { it: it, n: inWeek.length } : null;
      }).filter(Boolean);

      // 하루씩 보기
      var days = {};
      items.forEach(function (a) { (days[a.date] = days[a.date] || []).push(a); });
      var dayKeys = Object.keys(days).sort().reverse();

      function li(a) {
        return '<li><a href="' + esc(a.url) + '"><span class="g" style="color:' + tagColor(a.tag) + '">' + esc(a.tag) + '</span>' + esc(a.title) + '</a></li>';
      }

      var html = '';
      html += '<div class="br-nav"><button type="button" data-d="-1"' + (cur === 0 ? ' disabled' : '') + '>〈 이전 주</button>' +
        '<div class="br-week"><small>주간 브리핑</small><b>' + esc(range) + '</b></div>' +
        '<button type="button" data-d="1"' + (cur === keys.length - 1 ? ' disabled' : '') + '>다음 주 〉</button></div>';

      html += '<div class="br-sum"><div class="br-count"><b>' + items.length + '</b><span>건 보도</span></div><div class="br-chips">' +
        order.map(function (t) { return '<span class="br-chip" style="border-color:' + tagColor(t) + ';color:' + tagColor(t) + '">' + esc(t) + ' ' + counts[t] + '</span>'; }).join('') +
        '</div><button type="button" class="br-copy" data-copy="1">카톡용 요약 복사</button></div>';

      if (weekIssues.length) {
        html += '<div class="is-sec"><h2>이번 주 이슈</h2><span>타임라인으로 이어 읽기</span></div><div class="is-grid">' +
          weekIssues.map(function (w) {
            var is = w.it.def, link = root + '이슈.html#' + encodeURIComponent(is.id);
            return '<a class="is-card" href="' + esc(link) + '"><div class="k">' + esc(is.kicker) + '</div><h3>' + esc(is.title) + '</h3>' +
              '<div class="m"><span>이번 주 ' + w.n + '건</span><span>누적 ' + w.it.arts.length + '건</span></div></a>';
          }).join('') + '</div>';
      }

      html += '<div class="is-sec"><h2>이번 주 주요 기사</h2><span>' + leads.length + '건</span></div><div class="br-leads">' +
        leads.map(function (a, i) {
          return '<a class="br-lead' + (i === 0 ? ' first' : '') + '" href="' + esc(a.url) + '"><span class="g" style="color:' + tagColor(a.tag) + '">' + esc(a.tag) + ' · ' + esc(a.date.slice(5).replace('-', '.')) + '</span>' +
            '<h3>' + esc(a.title) + '</h3>' + (a.desc ? '<p>' + esc(a.desc) + '</p>' : '') + '</a>';
        }).join('') + '</div>';

      if (reads.length) {
        html += '<div class="is-sec"><h2>읽어볼 만한 글</h2><span>칼럼 · 신학 · 인물</span></div><ul class="br-list">' + reads.map(li).join('') + '</ul>';
      }

      html += '<div class="is-sec"><h2>하루씩 보기</h2><span>전체 ' + items.length + '건</span></div>' +
        dayKeys.map(function (d) {
          var ms = toMs(d);
          return '<div class="br-day"><div class="br-dh">' + md(ms) + ' <small>(' + DOW[(new Date(ms).getUTCDay() + 6) % 7] + ')</small></div><ul class="br-list">' + days[d].map(li).join('') + '</ul></div>';
        }).join('');

      host.innerHTML = html;
      document.title = '주간 브리핑 ' + range + ' | 예장포커스';

      Array.prototype.forEach.call(host.querySelectorAll('.br-nav button'), function (b) {
        b.addEventListener('click', function () {
          cur = Math.min(Math.max(cur + (+b.dataset.d), 0), keys.length - 1);
          history.replaceState(null, '', '#' + keys[cur]);
          render();
          window.scrollTo({ top: Math.max(host.getBoundingClientRect().top + window.scrollY - 70, 0), behavior: 'smooth' });
        });
      });
      host.querySelector('.br-copy').addEventListener('click', function () {
        var canon = document.querySelector('link[rel="canonical"]');
        var base = ((canon && canon.href) || location.href).split('#')[0];
        var lines = ['[예장포커스 주간 브리핑] ' + range, ''];
        leads.forEach(function (a) { lines.push('▶ [' + a.tag + '] ' + a.title); lines.push(a.url); lines.push(''); });
        if (weekIssues.length) { lines.push('■ 이번 주 이슈: ' + weekIssues.map(function (w) { return w.it.def.title; }).join(' / ')); lines.push(''); }
        lines.push('전체 브리핑 보기 ' + base + '#' + key);
        var text = lines.join('\n'), btn = host.querySelector('.br-copy');
        var done = function () { btn.textContent = '복사됨 ✓'; setTimeout(function () { btn.textContent = '카톡용 요약 복사'; }, 1800); };
        if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, function () { window.prompt('복사하세요', text); });
        else window.prompt('복사하세요', text);
      });
    }

    cur = fromHash();
    render();
    window.addEventListener('hashchange', function () { cur = fromHash(); render(); });
  }

  // 모든 페이지 하단 링크에 '주간 브리핑'을 덧붙인다(페이지마다 고치지 않기 위해 여기서 처리).
  function addFooterLinks() {
    var fl = document.querySelector('.flinks');
    if (!fl || fl.querySelector('[data-yf="briefing"]')) return;
    var a = document.createElement('a');
    a.href = root + '주간브리핑.html'; a.textContent = '주간 브리핑'; a.dataset.yf = 'briefing';
    fl.insertBefore(a, fl.firstChild);
  }
  addFooterLinks();

  // ---------- 상단 메뉴 ----------
  // 모든 페이지가 같은 메뉴 마크업을 복사해 쓰고 있으므로, 페이지를 하나씩 고치지 않고
  // 여기서 한 번에 바꾼다.
  //  1) 자주 쓰는 메뉴(전체·교단·목회·이슈·브리핑)만 앞에 두고 나머지는 '더보기'로 묶는다.
  //  2) 메뉴는 <button>이 아니라 실제 링크: 카테고리는 주소(#/교단)를 가져 공유·뒤로가기·새 탭이 된다.
  //  3) 검색창과 후원 버튼을 고정 메뉴줄로 올려, 스크롤해도 항상 쓸 수 있게 하고 세로 공간을 줄인다.
  var NAV_PRIMARY = ['전체', '교단', '목회'];
  var NAV_MORE = ['신학', '사설', '특집', '노회', '인물', '교계', '칼럼'];

  var NAV_IS_HOME = root === '' && /(^|\/)(index\.html)?$/.test(location.pathname);
  var NAV_IS_ISSUES = !!document.querySelector('[data-page="issues"]');
  var NAV_IS_BRIEFING = !!document.querySelector('[data-page="briefing"]');

  function navHref(cat) {
    if (cat === '이슈') return root + '이슈.html';
    if (cat === '브리핑') return root + '주간브리핑.html';
    // 카테고리마다 실제 목록 페이지(<카테고리>/, 전체/)가 있다. 검색엔진과 공유 링크에도 그대로 통한다.
    return root + encodeURIComponent(cat) + '/';
  }

  // 주소 해시(#/교단)에서 카테고리를 읽는다. 해당 없으면 ''.
  function navCatFromHash() {
    var h = location.hash || '';
    if (h.indexOf('#/') !== 0) return '';
    var c;
    try { c = decodeURIComponent(h.slice(2)); } catch (e) { return ''; }
    return (c === '전체' || NAV_PRIMARY.indexOf(c) !== -1 || NAV_MORE.indexOf(c) !== -1 || (window.ARTICLE_INDEX || []).some(function (a) { return a.tag === c; })) ? c : '';
  }

  function navDefaultCat() {
    return NAV_IS_ISSUES ? '이슈' : NAV_IS_BRIEFING ? '브리핑' : (window.SITE_CAT || '전체');
  }

  var NAV_CSS =
    'nav.catnav .cat-tools{display:flex;align-items:center;gap:8px;flex:none;margin-left:auto;padding-left:10px;}' +
    'nav.catnav .cat-ico{display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;padding:0;border:0;border-radius:50%;background:rgba(128,128,128,.14);color:inherit;font-size:16px;line-height:1;cursor:pointer;}' +
    'nav.catnav .cat-ico:hover,nav.catnav .cat-ico[aria-expanded="true"]{background:rgba(128,128,128,.3);}' +
    'nav.catnav .cat-tools .support-btn{display:inline-flex;align-items:center;background:linear-gradient(90deg,#ff9f1c,#e8322a);color:#fff;border:0;height:34px;padding:0 14px;font-size:13.5px;border-radius:17px;box-shadow:none;animation:none;white-space:nowrap;gap:4px;}' +
    'nav.catnav .cat-tools .support-btn:hover{transform:none;}' +
    '.catlist .cat-more-btn .car{font-size:10px;margin-left:5px;opacity:.8;}' +
    '.catlist .cat-brief .sh{display:none;}' +
    '.cat-panel{position:fixed;z-index:35;background:var(--paper,#fff);color:var(--ink,#111);border:1px solid var(--hair-strong,#ccc);border-radius:10px;box-shadow:0 14px 30px -12px rgba(15,29,58,.4);padding:6px;min-width:150px;}' +
    '.cat-panel[hidden]{display:none;}' +
    '.cat-panel a{display:block;padding:10px 14px;border-radius:6px;font:700 14px/1.2 "Noto Sans KR",sans-serif;color:inherit;text-decoration:none;white-space:nowrap;}' +
    '.cat-panel a:hover{background:var(--paper-alt,#f1f2f7);}' +
    '.cat-panel a.active{color:var(--red,#e8322a);}' +
    '.searchrow.cat-search{position:fixed;left:0;right:0;z-index:35;background:var(--paper,#fff);border-bottom:1px solid var(--hair-strong,#ccc);box-shadow:0 14px 24px -14px rgba(15,29,58,.4);}' +
    '.searchrow.cat-search[hidden]{display:none;}' +
    '.searchrow.cat-search .search-results{left:18px;right:18px;}' +
    'nav.catnav .cnt,.cat-panel .cnt,.cat-sheet .cnt{margin-left:5px;font-size:10.5px;font-weight:700;opacity:.7;}' +
    '.cat-panel a.zero,.cat-sheet a.zero{opacity:.45;}' +
    '.yf-tabbar,.cat-sheet{display:none;}' +
    '.cat-sheet{position:fixed;inset:0;z-index:550;background:rgba(15,29,58,.5);align-items:flex-end;}' +
    '.cat-sheet .box{width:100%;box-sizing:border-box;background:var(--paper,#fff);color:var(--ink,#111);border-radius:16px 16px 0 0;padding:16px 14px calc(16px + env(safe-area-inset-bottom,0px));max-height:80vh;overflow:auto;}' +
    '.cat-sheet h3{margin:0 0 12px;font:700 15px "Noto Sans KR",sans-serif;color:inherit;}' +
    '.cat-sheet .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;}' +
    '.cat-sheet a{display:flex;align-items:center;justify-content:center;padding:12px 6px;border:1px solid var(--hair-strong,#ccc);border-radius:10px;font:700 14px "Noto Sans KR",sans-serif;color:inherit;text-decoration:none;}' +
    '.cat-sheet a.active{color:var(--red,#e8322a);border-color:var(--red,#e8322a);}' +
    '@media (max-width:640px){' +
      '.yf-tabbar{display:flex;position:fixed;left:0;right:0;bottom:0;z-index:40;background:var(--paper,#fff);border-top:1px solid var(--hair-strong,#ccc);padding-bottom:env(safe-area-inset-bottom,0px);}' +
      '.cat-sheet:not([hidden]){display:flex;}' +
      '.yf-tabbar > *{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;height:54px;padding:0;border:0;background:none;color:var(--ink-soft,#666);font:600 11px "Noto Sans KR",sans-serif;text-decoration:none;cursor:pointer;}' +
      '.yf-tabbar i{font-style:normal;font-size:19px;line-height:1;}' +
      '.yf-tabbar .on{color:var(--red,#e8322a);}' +
      'body{padding-bottom:calc(54px + env(safe-area-inset-bottom,0px));}' +
      '#themeToggleBtn{bottom:calc(68px + env(safe-area-inset-bottom,0px)) !important;}' +
      'nav.catnav .cat-tools,nav.catnav .cnt{display:none;}' +
      'nav.catnav .brandmark{display:none;}' +
      'nav.catnav .wrap{padding-left:8px;padding-right:8px;}' +
      'nav.catnav .catlist > a,nav.catnav .catlist > button{padding:0 7px;font-size:13px;}' +
      '.catlist .cat-brief .lg{display:none;}.catlist .cat-brief .sh{display:inline;}' +
      'nav.catnav .cat-tools{gap:2px;padding-left:4px;}' +
      'nav.catnav .cat-ico{width:32px;height:32px;}' +
      'nav.catnav .cat-tools .support-btn{width:32px;height:32px;padding:0;justify-content:center;border-radius:50%;}' +
      'nav.catnav .cat-tools .support-btn .sb-tx{display:none;}' +
      '.searchrow.cat-search .search-results{left:14px;right:14px;}' +
    '}';

  function upgradeNav() {
    var nav = document.querySelector('nav.catnav');
    var list = document.getElementById('catNav');
    if (!nav || !list || nav.getAttribute('data-yf-nav')) return;
    nav.setAttribute('data-yf-nav', '1');
    var wrap = list.parentNode;

    var st = document.createElement('style');
    st.textContent = NAV_CSS;
    document.head.appendChild(st);

    // 1) 메뉴 항목 만들기. 기사 수(counts)를 알게 되면 배지를 달고, 기사가 0건인 분류는 '더보기'로 내린다.
    var moreList = NAV_MORE.slice();
    var navCounts = null;
    function link(cat, label, extra) {
      var a = document.createElement('a');
      a.setAttribute('data-cat', cat);
      a.href = navHref(cat);
      a.innerHTML = label || esc(cat);
      if (extra) a.className = extra;
      return a;
    }
    function counted(cat) {
      var n = navCounts && navCounts[cat];
      return esc(cat) + (n ? '<span class="cnt">' + n + '</span>' : '');
    }

    var moreBtn = document.createElement('button');
    moreBtn.type = 'button';
    moreBtn.className = 'cat-more-btn';
    moreBtn.setAttribute('aria-haspopup', 'true');
    moreBtn.setAttribute('aria-expanded', 'false');

    var panel = document.createElement('div');
    panel.className = 'cat-panel';
    panel.hidden = true;
    document.body.appendChild(panel);

    var sheet = document.createElement('div');
    sheet.className = 'cat-sheet';
    sheet.hidden = true;
    document.body.appendChild(sheet);

    function layout() {
      var primary = [], more = NAV_MORE.slice();
      NAV_PRIMARY.forEach(function (c) {
        if (navCounts && c !== '전체' && !navCounts[c]) more.push(c); else primary.push(c);
      });
      // 새 폴더(=새 카테고리)에 기사를 올리면 기사 목록(counts)에 그 이름이 나타난다.
      // 위 목록에 없는 카테고리는 자동으로 메뉴 끝에 붙인다(코드 수정 불필요).
      if (navCounts) {
        Object.keys(navCounts).forEach(function (c) {
          if (navCounts[c] && c !== '전체' && c !== '이슈' && c !== '브리핑' &&
              primary.indexOf(c) === -1 && more.indexOf(c) === -1) more.push(c);
        });
      }
      // '더보기'는 접지 않고 모든 메뉴를 메뉴줄에 펼쳐 둔다(좁은 화면에서는 가로 스크롤).
      moreList = [];
      list.innerHTML = '';
      primary.forEach(function (c) { list.appendChild(link(c, counted(c))); });
      more.forEach(function (c) {
        list.appendChild(link(c, counted(c), navCounts && !navCounts[c] ? 'zero' : ''));
      });
      list.appendChild(link('이슈'));
      list.appendChild(link('브리핑', '<span class="lg">주간브리핑</span><span class="sh">브리핑</span>', 'cat-brief'));
      panel.innerHTML = '';
      // 모바일 '카테고리' 시트: 모든 분류를 한눈에
      sheet.innerHTML = '<div class="box"><h3>카테고리</h3><div class="grid"></div></div>';
      var grid = sheet.querySelector('.grid');
      primary.concat(more).forEach(function (c) {
        grid.appendChild(link(c, counted(c), navCounts && c !== '전체' && !navCounts[c] ? 'zero' : ''));
      });
      grid.appendChild(link('이슈'));
      grid.appendChild(link('브리핑', '주간브리핑'));
    }
    layout();

    // 2) 검색창·후원 버튼을 메뉴줄로 올린다
    var tools = document.createElement('div');
    tools.className = 'cat-tools';
    var row = document.querySelector('.searchrow');
    var searchBtn = null;
    if (row) {
      searchBtn = document.createElement('button');
      searchBtn.type = 'button';
      searchBtn.className = 'cat-ico';
      searchBtn.setAttribute('aria-label', '기사 검색');
      searchBtn.setAttribute('aria-expanded', 'false');
      searchBtn.textContent = '🔍';
      tools.appendChild(searchBtn);
      var sup = row.querySelector('.support-btn');
      if (sup) {
        var txt = (sup.textContent || '').replace('✊', '').trim() || '후원';
        sup.setAttribute('aria-label', txt);
        sup.innerHTML = '<span class="sb-ic" aria-hidden="true">✊</span><span class="sb-tx">' + esc(txt) + '</span>';
        tools.appendChild(sup);
      }
      row.classList.add('cat-search');
      row.hidden = true;
      nav.parentNode.insertBefore(row, nav.nextSibling);
    }
    wrap.appendChild(tools);

    function below() { return Math.max(0, Math.round(nav.getBoundingClientRect().bottom)) + 'px'; }

    var moreOpen = false, searchOpen = false;
    function placeMore() {
      var r = moreBtn.getBoundingClientRect();
      panel.style.top = below();
      var w = panel.offsetWidth || 160;
      panel.style.left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8)) + 'px';
    }
    function setMore(open) {
      moreOpen = open;
      panel.hidden = !open;
      moreBtn.setAttribute('aria-expanded', String(open));
      if (open) { setSearch(false); placeMore(); }
    }
    function setSearch(open) {
      if (!row) return;
      searchOpen = open;
      row.hidden = !open;
      searchBtn.setAttribute('aria-expanded', String(open));
      if (open) {
        setMore(false);
        row.style.top = below();
        var inp = row.querySelector('input');
        if (inp) inp.focus();
      }
    }
    moreBtn.addEventListener('click', function () { setMore(!moreOpen); });
    if (searchBtn) searchBtn.addEventListener('click', function () { setSearch(!searchOpen); });
    panel.addEventListener('click', function (e) { if (e.target.closest('a')) setMore(false); });
    document.addEventListener('click', function (e) {
      if (moreOpen && !panel.contains(e.target) && !moreBtn.contains(e.target)) setMore(false);
      if (searchOpen && !row.contains(e.target) && !searchBtn.contains(e.target) && !e.target.closest('[data-tab="search"]')) setSearch(false);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if (moreOpen) setMore(false);
      if (searchOpen) setSearch(false);
      setSheet(false);
    });
    function reflow() {
      if (moreOpen) placeMore();
      if (searchOpen) row.style.top = below();
    }
    window.addEventListener('resize', reflow);
    window.addEventListener('scroll', reflow, { passive: true });

    // 3) 모바일 하단 탭바: 홈 · 카테고리 · 검색 · 이슈 · 후원
    function setSheet(open) {
      sheet.hidden = !open;
      if (open) { setMore(false); setSearch(false); }
    }
    sheet.addEventListener('click', function (e) {
      if (e.target === sheet || e.target.closest('a')) setSheet(false);
    });

    var tabbar = document.createElement('div');
    tabbar.className = 'yf-tabbar';
    tabbar.setAttribute('role', 'navigation');
    tabbar.setAttribute('aria-label', '하단 메뉴');
    var homeHref = NAV_IS_HOME ? '#' : root + 'index.html';
    tabbar.innerHTML =
      '<a data-tab="home" href="' + homeHref + '"><i>🏠</i><span>홈</span></a>' +
      '<button type="button" data-tab="cats"><i>☰</i><span>카테고리</span></button>' +
      (row ? '<button type="button" data-tab="search"><i>🔍</i><span>검색</span></button>' : '') +
      '<a data-tab="issues" href="' + navHref('이슈') + '"><i>📌</i><span>이슈</span></a>' +
      (sup ? '<button type="button" data-tab="support"><i>✊</i><span>후원</span></button>' : '');
    document.body.appendChild(tabbar);
    tabbar.addEventListener('click', function (e) {
      var t = e.target.closest('[data-tab]');
      if (!t) return;
      var k = t.getAttribute('data-tab');
      if (k === 'home' && NAV_IS_HOME) { e.preventDefault(); window.scrollTo(0, 0); }
      if (k === 'cats') setSheet(sheet.hidden);
      if (k === 'search') { setSheet(false); setSearch(!searchOpen); }
      if (k === 'support') { setSheet(false); sup.click(); }
    });

    // 현재 위치 표시. '더보기' 안의 카테고리를 보고 있으면 그 이름을 버튼에 보여 준다.
    var currentCat = '';
    function setActive(cat) {
      currentCat = cat;
      var inMore = moreList.indexOf(cat) !== -1;
      Array.prototype.forEach.call(document.querySelectorAll('nav.catnav [data-cat], .cat-panel [data-cat], .cat-sheet [data-cat]'), function (a) {
        var on = a.getAttribute('data-cat') === cat;
        a.classList.toggle('active', on);
        if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
      });
      moreBtn.classList.toggle('active', inMore);
      moreBtn.innerHTML = esc(inMore ? cat : '더보기') + '<span class="car" aria-hidden="true">▾</span>';
      var home = tabbar.querySelector('[data-tab="home"]'), iss = tabbar.querySelector('[data-tab="issues"]');
      home.classList.toggle('on', NAV_IS_HOME && !navCatFromHash());
      iss.classList.toggle('on', NAV_IS_ISSUES);
    }
    window.__yfNavSetActive = setActive;
    // 기사 목록을 불러온 뒤 호출: 분류별 기사 수 배지 + 0건 분류 정리
    window.__yfNavSetCounts = function (counts) {
      navCounts = counts;
      layout();
      setActive(currentCat);
    };
    setActive(navCatFromHash() || navDefaultCat());
  }

  upgradeNav(); // NAV_* 상수가 모두 정의된 뒤, 기사 목록을 기다리지 않고 바로 실행

  function initCategoryOverlay(ARTICLE_INDEX) {
    var overlay = document.getElementById('allArticlesOverlay');
    var list = document.getElementById('allArticlesList');
    var title = document.getElementById('aaTitle');
    var closeBtn = overlay ? overlay.querySelector('.aa-close') : null;
    var viaNav = false; // 이 페이지 안에서 메뉴를 눌러 해시가 생겼는지(닫을 때 뒤로 가기로 되돌리기 위함)

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

    // 주소(#/카테고리)가 곧 상태: 해시에 따라 목록을 열고 닫는다.
    function route() {
      var cat = navCatFromHash();
      if (cat) {
        renderCategory(cat);
        if (overlay) overlay.hidden = false;
      } else if (overlay) {
        overlay.hidden = true;
      }
      if (window.__yfNavSetActive) window.__yfNavSetActive(cat || navDefaultCat());
    }

    function closeAllArticles() {
      if (navCatFromHash()) {
        if (viaNav && history.length > 1) { history.back(); return; }
        history.replaceState(null, '', location.pathname + location.search);
      }
      route();
    }

    window.addEventListener('hashchange', function () {
      if (navCatFromHash()) viaNav = true;
      route();
    });

    if (closeBtn) closeBtn.addEventListener('click', closeAllArticles);
    if (overlay) {
      overlay.addEventListener('click', function (e) {
        if (e.target === overlay) closeAllArticles();
      });
    }
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && overlay && !overlay.hidden) closeAllArticles();
    });

    route();
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

    // 좌측 컬럼은 카테고리 순서가 고정이다: 특집 → 교단 → (목록) 목회·사설·노회·인물·교계 → 신학.
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
    var PLAIN_LIST_CATS = ['목회', '사설', '노회', '인물', '교계'];
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

    // 중앙 컬럼: 최신 소식 — 카테고리와 무관하게 사이트 전체 최신 3건
    var topThree = ARTICLE_INDEX.slice(0, 3);
    var numList = document.getElementById('numList');
    if (numList) {
      var numerals = ['①', '②', '③', '④', '⑤', '⑥'];
      numList.innerHTML = ARTICLE_INDEX.slice(0, 6).map(function (item, i) {
        return '<li><span class="num">' + numerals[i] + '</span><a href="' + item.url + '">' + esc(item.title) + '</a></li>';
      }).join('');
    }
    var modHero = document.getElementById('modHero');
    if (modHero && topThree[0]) {
      modHero.innerHTML =
        '<a class="mod-hero" href="' + topThree[0].url + '">' +
          thumbImgHtml(topThree[0], 'thumb') +
          (topThree[0].desc ? '<p class="cap">' + esc(topThree[0].desc) + '</p>' : '') +
        '</a>';
    }
    // 우측 컬럼: 칼럼 — 최신 3건
    var columns = pickMany(['칼럼'], 3);
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
  }

  function initSiteSearch(ARTICLE_INDEX) {
    var input = document.getElementById('siteSearchInput');
    var resultsBox = document.getElementById('searchResults');
    if (!input || !resultsBox) return;
    var wrap = input.closest('.wrap');
    input.placeholder = '기사 검색 (제목·내용 모두 검색)';
    var st = document.createElement('style');
    st.textContent =
      '.search-results .count{padding:8px 14px;font-size:11.5px;font-weight:700;opacity:.7;}' +
      '.search-results .snip{display:block;margin-top:3px;font-size:12.5px;line-height:1.5;opacity:.75;font-weight:400;}' +
      '.search-results mark{background:#ffe38a;color:#1c1a16;border-radius:2px;padding:0 1px;}' +
      '.search-results a{display:block;}';
    document.head.appendChild(st);

    // 기사 본문 검색용 데이터(data/search-index.json: {기사 URL: 본문}).
    // 검색창을 처음 쓸 때 한 번만 내려받고, 받는 동안에는 제목·요약만으로 먼저 보여준다.
    var BODY = null, bodyLoading = false;
    function loadBodies(done) {
      if (BODY || bodyLoading) return;
      bodyLoading = true;
      fetch(root + 'data/search-index.json')
        .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
        .then(function (data) { BODY = data; })
        .catch(function () { BODY = {}; })
        .then(function () { bodyLoading = false; if (done) done(); });
    }

    function normalize(s) {
      // 자모 결합 형태 차이(NFC/NFD)까지 흡수해 한글 검색이 안정적으로 걸리게 함
      return (s || '').normalize('NFC').toLowerCase();
    }
    function escHtml(s) {
      return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
    }
    function escRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

    // 검색어를 공백 기준 단어로 나눠 모두 포함하는 기사만 찾는다(AND).
    function terms(query) {
      return normalize(query).split(/\s+/).filter(Boolean);
    }

    function search(query) {
      var ts = terms(query);
      if (!ts.length) return [];
      var out = [];
      ARTICLE_INDEX.forEach(function (item, idx) {
        var title = normalize(item.title), tag = normalize(item.tag), desc = normalize(item.desc);
        var body = normalize((BODY && BODY[item.url]) || '');
        var score = 0, ok = true;
        ts.forEach(function (q) {
          if (title.indexOf(q) !== -1) score += 100;
          else if (tag.indexOf(q) !== -1) score += 60;
          else if (desc.indexOf(q) !== -1) score += 30;
          else if (body.indexOf(q) !== -1) score += 10 + Math.min(body.split(q).length - 1, 20);
          else ok = false;
        });
        if (ok) out.push({ item: item, score: score, idx: idx, body: (BODY && BODY[item.url]) || '' });
      });
      // 제목 > 카테고리 > 요약 > 본문 순으로 정렬, 같으면 최신 기사 먼저
      out.sort(function (x, y) { return y.score - x.score || x.idx - y.idx; });
      return out;
    }

    // 본문에서 검색어가 처음 나오는 곳 주변을 잘라 보여준다.
    function snippet(text, ts) {
      if (!text) return '';
      var low = normalize(text), pos = -1;
      for (var i = 0; i < ts.length; i++) {
        var p = low.indexOf(ts[i]);
        if (p !== -1 && (pos === -1 || p < pos)) pos = p;
      }
      if (pos === -1) return '';
      var from = Math.max(0, pos - 24), to = Math.min(text.length, pos + 80);
      return (from > 0 ? '…' : '') + text.slice(from, to) + (to < text.length ? '…' : '');
    }
    function highlight(text, ts) {
      var html = escHtml(text);
      ts.forEach(function (q) {
        html = html.replace(new RegExp('(' + escRe(escHtml(q)) + ')', 'gi'), '<mark>$1</mark>');
      });
      return html;
    }

    var MAX_SHOWN = 12;
    function render(results, query) {
      resultsBox.innerHTML = '';
      if (!query) { resultsBox.hidden = true; return; }
      var ts = terms(query);
      if (results.length === 0) {
        var li = document.createElement('li');
        li.innerHTML = '<div class="empty">' + (bodyLoading ? '검색 중입니다…' : '검색 결과가 없습니다.') + '</div>';
        resultsBox.appendChild(li);
      } else {
        var cnt = document.createElement('li');
        cnt.innerHTML = '<div class="count">검색 결과 ' + results.length + '건</div>';
        resultsBox.appendChild(cnt);
        results.slice(0, MAX_SHOWN).forEach(function (r) {
          var item = r.item, li2 = document.createElement('li'), a = document.createElement('a');
          a.href = item.url;
          var inTitle = ts.every(function (q) { return normalize(item.title).indexOf(q) !== -1; });
          var snip = '';
          if (!inTitle) snip = snippet(r.body, ts) || (item.desc ? item.desc.slice(0, 90) : '');
          a.innerHTML = '<span class="tag">' + escHtml(item.tag) + '</span>' + highlight(item.title, ts) +
            (snip ? '<span class="snip">' + highlight(snip, ts) + '</span>' : '');
          li2.appendChild(a);
          resultsBox.appendChild(li2);
        });
        var all = document.createElement('li');
        all.innerHTML = '<a href="' + root + '검색.html?q=' + encodeURIComponent(query) + '" style="font-weight:700;color:var(--navy);">' +
          '전체 검색 결과 보기' + (results.length > MAX_SHOWN ? ' (' + results.length + '건)' : '') + ' ›</a>';
        resultsBox.appendChild(all);
      }
      resultsBox.hidden = false;
    }

    function run() {
      var q = input.value.trim();
      render(search(q), q);
    }

    // 엔터/검색 버튼 → 전체 검색 결과 페이지(검색.html)
    function goSearchPage() {
      var q = input.value.trim();
      if (q) window.location.href = root + '검색.html?q=' + encodeURIComponent(q);
    }
    var sform = input.form;
    if (sform) sform.addEventListener('submit', function (e) { e.preventDefault(); goSearchPage(); });
    input.setAttribute('aria-label', '기사 검색');
    input.setAttribute('type', 'search');
    input.setAttribute('enterkeyhint', 'search');

    input.addEventListener('focus', function () { loadBodies(run); });
    input.addEventListener('input', function () { loadBodies(run); run(); });

    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        goSearchPage();
      } else if (e.key === 'Escape') {
        resultsBox.hidden = true;
      }
    });

    document.addEventListener('click', function (e) {
      if (wrap && !wrap.contains(e.target)) resultsBox.hidden = true;
    });
  }

  // 접근성: 키보드·스크린리더 사용자가 머리말·메뉴를 건너뛰고 본문으로 바로 갈 수 있는 링크.
  // 본문 영역(#main → main → article → .page)을 찾아 id를 달고, 포커스를 받을 때만 화면에 보인다.
  function initSkipLink() {
    var target = document.getElementById('main') || document.querySelector('main') ||
      document.querySelector('article') || document.querySelector('.page');
    if (!target || document.querySelector('.yf-skip')) return;
    if (!target.id) target.id = 'main';
    var st = document.createElement('style');
    st.textContent = '.yf-skip{position:absolute;left:8px;top:-60px;z-index:1000;background:#0f1d3a;color:#fff;' +
      'padding:10px 16px;border-radius:0 0 6px 6px;font:700 14px "Noto Sans KR",sans-serif;text-decoration:none;}' +
      '.yf-skip:focus{top:0;outline:3px solid #ffbf47;}' +
      ':focus-visible{outline:3px solid #ffbf47;outline-offset:2px;}';
    document.head.appendChild(st);
    var a = document.createElement('a');
    a.className = 'yf-skip';
    a.href = '#' + target.id;
    a.textContent = '본문 바로가기';
    document.body.insertBefore(a, document.body.firstChild);
  }

  // 사이트는 화이트 모드 한 가지로 고정한다. (다크 모드/전환 버튼 없음)
  // <html data-theme="light">가 모든 페이지에 이미 들어 있어 첫 화면부터 밝게 나오며,
  // 여기서는 혹시 남아 있는 예전 다크 설정(localStorage)과 전환 버튼을 정리한다.
  function initThemeToggle() {
    document.documentElement.setAttribute('data-theme', 'light');
    try { localStorage.removeItem('yejangfocus-theme'); } catch (e) { /* 무시 */ }
    var old = document.getElementById('themeToggleBtn');
    if (old && old.parentNode) old.parentNode.removeChild(old);
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
