// 예장포커스 — 오늘의 포커스·이슈 타임라인(홈의 #focusHub, 이슈 페이지의 #issueDetail)
// site.js(코어)가 필요한 페이지에서만 불러온다. 공통 도구는 window.YF 로 받는다.
(function (YF) {
  var root = YF.root,
      esc = YF.esc,
      prepareIssues = YF.prepareIssues,
      dayNum = YF.dayNum,
      DAY = YF.DAY;

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
        if (hub) {
          // 홈 탭에서는 30일 넘은 '지난 이슈'를 뺀다(이슈 페이지에는 그대로 남는다). 전부 지난 이슈면 목록 그대로 쓴다.
          var active = list.filter(function (x) { return issueStats(x).state !== 'past'; });
          buildHub(hub, active.length ? active : list);
        }
        if (detail) buildIssuePage(detail, list);
      })
      .catch(function (err) { console.error('이슈 목록(issues.json)을 불러오지 못했습니다.', err); });
  }

  function issueStats(it) {
    var first = it.arts[0].date, last = it.last;
    var ago = Math.max(Math.floor(Date.now() / DAY) - dayNum(last), 0);
    return {
      span: Math.max(dayNum(last) - dayNum(first), 0) + 1,
      ago: ago,
      agoText: ago === 0 ? '오늘' : ago + '일 전',
      recent: ago <= 7,
      // 자동 3단계: 7일 이내 진행 중 / 8~30일 최근 이슈 / 30일 초과 지난 이슈
      state: ago <= 7 ? 'live' : (ago <= 30 ? 'recent' : 'past')
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
      (st.recent ? '<span class="fh-live">진행 중인 이슈</span>' : (opts.page ? '<span class="fh-state">' + (st.state === 'past' ? '지난 이슈' : '최근 이슈') + '</span>' : '')) + tabs + right + '</div>' +
      '<div class="fh-body">' +
        '<div><div class="fh-kicker">' + esc(is.kicker) + '</div>' +
        '<h2 class="fh-title">' + (opts.page ? esc(is.title) : '<a href="' + esc(link) + '">' + esc(is.title) + '</a>') + '</h2>' +
        '<div class="fh-stats">' +
          '<div class="fh-stat"><b>' + arts.length + '건</b><span>관련 기사</span></div>' +
          '<div class="fh-stat"><b>' + st.span + '일</b><span>보도 기간</span></div>' +
          '<div class="fh-stat"><b>' + st.agoText + '</b><span>최근 업데이트</span></div>' +
        '</div>' +
        '<details class="fh-glance"' + (window.matchMedia && matchMedia('(max-width:640px)').matches ? '' : ' open') + '><summary><h3>한눈에 보기</h3></summary><ul>' + points + '</ul></details></div>' +
        '<div><div class="fh-tl-head">사건의 흐름 · 최신순' + (hidden ? ' · 최근 ' + opts.limit + '건' : '') + '</div><ol class="fh-timeline">' + tl + '</ol></div>' +
      '</div></div>';
  }

  var hubObserver = null;

  function animateTimeline(hub) {
    var items = hub.querySelectorAll('.fh-item'), tl = hub.querySelector('.fh-timeline');
    if (hubObserver) hubObserver.disconnect();
    if (!('IntersectionObserver' in window)) {
      Array.prototype.forEach.call(items, function (n) { n.classList.add('in'); });
      tl.style.setProperty('--fh-fill', '100%');
      return;
    }
    tl.classList.add('fh-anim');
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
    window.addEventListener('beforeprint', function () { tl.classList.remove('fh-anim'); tl.style.setProperty('--fh-fill', '100%'); });
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
          '<div class="m">' + (st.recent ? '<span class="live">진행 중</span>' : '<span class="state ' + st.state + '">' + (st.state === 'past' ? '지난 이슈' : '최근 이슈') + '</span>') +
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

  YF.mods['site-hub'] = renderFocusHub;
})(window.YF);
