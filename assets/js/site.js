// 예장포커스 공통 스크립트 — 전체 기사 카테고리 오버레이 + 사이트 검색
// 기사 데이터는 더 이상 각 페이지에 하드코딩하지 않고 data/articles.json 하나에서 불러옵니다.
// 새 기사가 올라오면 articles.json 한 곳만 수정하면 모든 페이지(검색, 카테고리 보기)에 반영됩니다.
(function () {
  var root = typeof window.SITE_ROOT === 'string' ? window.SITE_ROOT : '';

  // 독자 확보·운영 기능(PWA·통계·구독 안내·제보 링크)은 별도 파일에서 불러온다.
  (function () { var s = document.createElement('script'); s.src = root + 'assets/js/reader.js'; s.defer = true; document.head.appendChild(s); })();

  // 기사 본문 사진 배치(세로형 사진 나란히 보기)
  (function () { var s = document.createElement('script'); s.src = root + 'assets/js/photo-layout.js'; s.defer = true; document.head.appendChild(s); })();

  // 태그(카테고리)별 강조색과 이스케이프는 전체 기사 목록·홈페이지 썸네일에서
  // 공통으로 쓰므로 한 곳에서 관리한다.
  // 색이 너무 많으면 산만하므로, 속보만 빨강이고 나머지 분류 표시는 모두 남색으로 통일한다.
  var TAG_COLOR = { '속보': 'var(--red)' };
  var TAG_DEFAULT = 'var(--navy)';

  function tagColor(tag) { return TAG_COLOR[tag] || TAG_DEFAULT; }

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

  // ── 기능 파일(모듈) 불러오기 ─────────────────────────────────────────────
  // 코어(이 파일)는 모든 페이지에 필요한 것만 담고, 홈·기사·브리핑·이슈 기능과 사진 확대는
  // assets/js/site-*.js, lightbox.js 로 나눠 해당 페이지에서만 불러온다.
  // 나눈 파일들은 아래 YF 로 공통 도구를 받고, YF.mods[이름] 에 실행 함수를 등록한다.
  var YF = window.YF = {
    root: root, esc: esc, tagColor: tagColor, lsGet: lsGet, lsSet: lsSet, pathTail: pathTail,
    prepareIssues: prepareIssues, dayNum: dayNum, DAY: 86400000, mods: {}
  };
  var loading = {};
  function loadModule(name) {
    if (!loading[name]) {
      loading[name] = new Promise(function (resolve) {
        var s = document.createElement('script');
        s.src = root + 'assets/js/' + name + '.js';
        s.onload = resolve;
        s.onerror = function () { console.error('기능 파일을 불러오지 못했습니다: ' + name); resolve(); };
        document.head.appendChild(s);
      });
    }
    return loading[name];
  }
  if (document.querySelector('figure img')) loadModule('lightbox');

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
      // 페이지 종류에 맞는 기능 파일만 불러온 뒤, 예전과 같은 순서로 실행한다.
      var wants = [];
      if (document.getElementById('tickerBox')) wants.push('site-home');
      var hubPage = !!(document.getElementById('focusHub') || document.getElementById('issueDetail'));
      if (hubPage) wants.push('site-hub');
      if (!hubPage && document.querySelector('.page')) wants.push('site-article');
      if (document.getElementById('briefing')) wants.push('site-briefing');
      Promise.all(wants.map(loadModule)).then(function () {
        wants.forEach(function (name) { if (YF.mods[name]) YF.mods[name](articles); });
        initBadges(articles);
      });
    })
    .catch(function (err) {
      console.error('기사 목록(articles.json)을 불러오지 못했습니다.', err);
    });

  initSkipLink();
  initCatScrollHint();
  initMastheadWatch();
  initNoticeMarquee();
  initThemeToggle();
  initPlaceholderButtons();
  initSupportModal();


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



  // 타임라인: 화면에 들어오는 순서대로 하나씩 나타나고, 진행선이 따라 내려온다.




  // ── 배지(NEW·속보·단독)와 읽은 기사 표시 ───────────────────────────────────
  // NEW = 업로드 48시간 이내(오래 달아 두면 모든 기사에 붙어 의미가 없어진다). 속보·단독 등은 기사 <head>의 <meta name="yf-badge" content="속보">가
  // articles.json 의 badge 필드로 들어온 값이다. 목록 곳곳(홈·카테고리·검색·티커)에 같은 방식으로 붙는다.
  // 예전에 저장된 주소(https://…com//목회/…)도 같은 기사로 맞도록 // 를 /로 고쳐서 읽는다.
  function lsGet(key) {
    try {
      return (JSON.parse(localStorage.getItem(key)) || []).map(function (v) { return typeof v === 'string' ? v.replace(/([^:])\/\/+/g, '$1/') : v; });
    } catch (e) { return []; }
  }
  function lsSet(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) { /* 무시 */ } }
  function pathTail(u) {
    var seg = (u || '').split('?')[0].split('#')[0].split('/').filter(Boolean).slice(-2).join('/');
    try { return decodeURIComponent(seg); } catch (e) { return seg; }
  }
  function initBadges(articles) {
    var st = document.createElement('style');
    st.textContent = '.yf-new{display:inline-block;margin-right:5px;padding:0 5px;border-radius:3px;background:#cc2b24;color:#fff;' +
      'font:700 10.5px/17px "Noto Sans KR",sans-serif;vertical-align:2px;letter-spacing:0}.yf-new.hot{background:#111}' +
      '.yf-read{opacity:.62}';
    document.head.appendChild(st);
    var byTail = {};
    articles.forEach(function (a) { byTail[pathTail(a.url)] = a; });
    var SEL = '.feature-item h3,.side-list h4,#tickerBox a,#numList a,#plainList a,.yf-list h2,.aa-list a,.headline h3';
    // 홈(#tickerBox 가 있는 페이지)은 업로드 후 7일, 그 밖의 목록 페이지는 2일 동안 NEW 를 붙인다.
    var NEW_DAYS = document.getElementById('tickerBox') ? 7 : 2;
    var busy = false;
    function apply() {
      busy = true;
      var read = lsGet('yf-read');
      document.querySelectorAll(SEL).forEach(function (el) {
        var link = el.tagName === 'A' ? el : (el.closest ? el.closest('a') : null);
        var a = link && byTail[pathTail(link.getAttribute('href'))];
        if (!a) return;
        if (read.indexOf(a.url) !== -1) el.classList.add('yf-read');
        if (el.querySelector('.yf-new')) return;
        var up = Date.parse(a.uploaded);
        var label = a.badge || (up && (Date.now() - up) < NEW_DAYS * 86400000 ? 'NEW' : '');
        if (!label) return;
        var b = document.createElement('span');
        b.className = 'yf-new' + (label === 'NEW' ? '' : ' hot');
        b.textContent = label;
        el.insertBefore(b, el.firstChild);
      });
      busy = false;
    }
    window.__yfBadges = apply;
    apply();
    // 전체 기사 오버레이처럼 나중에 그려지는 목록에도 붙인다.
    var ov = document.getElementById('allArticlesList');
    if (ov && window.MutationObserver) new MutationObserver(function () { if (!busy) apply(); }).observe(ov, { childList: true });
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
    'nav.catnav .cat-tools .support-btn{display:inline-flex;align-items:center;background:linear-gradient(90deg,#ff9f1c,#cc2b24);color:#fff;border:0;height:34px;padding:0 14px;font-size:13.5px;border-radius:17px;box-shadow:none;animation:none;white-space:nowrap;gap:4px;}' +
    'nav.catnav .cat-tools .support-btn:hover{transform:none;}' +
    '.catlist .cat-more-btn .car{font-size:10px;margin-left:5px;opacity:.8;}' +
    '.catlist .cat-brief .sh{display:none;}' +
    '.cat-panel{position:fixed;z-index:35;background:var(--paper,#fff);color:var(--ink,#111);border:1px solid var(--hair-strong,#ccc);border-radius:10px;box-shadow:0 14px 30px -12px rgba(15,29,58,.4);padding:6px;min-width:150px;}' +
    '.cat-panel[hidden]{display:none;}' +
    '.cat-panel a{display:block;padding:10px 14px;border-radius:6px;font:700 14px/1.2 "Noto Sans KR",sans-serif;color:inherit;text-decoration:none;white-space:nowrap;}' +
    '.cat-panel a:hover{background:var(--paper-alt,#f1f2f7);}' +
    '.cat-panel a.active{color:var(--red,#cc2b24);}' +
    '.searchrow.cat-search{position:fixed;left:0;right:0;z-index:35;background:var(--paper,#fff);border-bottom:1px solid var(--hair-strong,#ccc);box-shadow:0 14px 24px -14px rgba(15,29,58,.4);}' +
    '.searchrow.cat-search[hidden]{display:none;}' +
    '.searchrow.cat-search .search-results{left:18px;right:18px;}' +
    'nav.catnav .cnt,.cat-panel .cnt,.cat-sheet .cnt{margin-left:5px;font-size:10.5px;font-weight:700;opacity:.9;}' +
    '.cat-panel a.zero,.cat-sheet a.zero{opacity:.45;}' +
    '.yf-tabbar,.cat-sheet{display:none;}' +
    '.cat-sheet{position:fixed;inset:0;z-index:550;background:rgba(15,29,58,.5);align-items:flex-end;}' +
    '.cat-sheet .box{width:100%;box-sizing:border-box;background:var(--paper,#fff);color:var(--ink,#111);border-radius:16px 16px 0 0;padding:16px 14px calc(16px + env(safe-area-inset-bottom,0px));max-height:80vh;overflow:auto;}' +
    '.cat-sheet h3{margin:0 0 12px;font:700 15px "Noto Sans KR",sans-serif;color:inherit;}' +
    '.cat-sheet .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;}' +
    '.cat-sheet a{display:flex;align-items:center;justify-content:center;padding:12px 6px;border:1px solid var(--hair-strong,#ccc);border-radius:10px;font:700 14px "Noto Sans KR",sans-serif;color:inherit;text-decoration:none;}' +
    '.cat-sheet a.active{color:var(--red,#cc2b24);border-color:var(--red,#cc2b24);}' +
    '@media (max-width:640px){' +
      '.yf-tabbar{display:flex;position:fixed;left:0;right:0;bottom:0;z-index:40;background:var(--paper,#fff);border-top:1px solid var(--hair-strong,#ccc);padding-bottom:env(safe-area-inset-bottom,0px);}' +
      '.cat-sheet:not([hidden]){display:flex;}' +
      '.yf-tabbar > *{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;height:54px;padding:0;border:0;background:none;color:var(--ink-soft,#666);font:600 11px "Noto Sans KR",sans-serif;text-decoration:none;cursor:pointer;}' +
      '.yf-tabbar i{font-style:normal;line-height:0;display:block;}' +
      '.yf-tabbar .on{color:var(--red,#cc2b24);}' +
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
      '<a data-tab="home" href="' + homeHref + '"><i><svg class="ti" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v10h13V10"/><path d="M10 20v-6h4v6"/></svg></i><span>홈</span></a>' +
      '<button type="button" data-tab="cats"><i><svg class="ti" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg></i><span>카테고리</span></button>' +
      (row ? '<button type="button" data-tab="search"><i><svg class="ti" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/></svg></i><span>검색</span></button>' : '') +
      '<a data-tab="issues" href="' + navHref('이슈') + '"><i><svg class="ti" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 21V4h11l-2 4 2 4H6"/></svg></i><span>이슈</span></a>' +
      (sup ? '<button type="button" data-tab="support"><i><svg class="ti" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.8a4.3 4.3 0 0 1 7.5 2.7c0 5.4-7.5 10-7.5 10Z"/></svg></i><span>후원</span></button>' : '');
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
  // 메뉴줄이 가로로 넘칠 때, 더 넘길 수 있는 쪽 끝을 흐리게 해서 '더 있음'을 알린다.
  function initCatScrollHint() {
    var el = document.getElementById('catNav');
    if (!el) return;
    function update() {
      var max = el.scrollWidth - el.clientWidth;
      el.classList.toggle('fade-l', el.scrollLeft > 4);
      el.classList.toggle('fade-r', max > 4 && el.scrollLeft < max - 4);
    }
    el.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    window.addEventListener('load', update);
    update();
  }

  // 공지가 한 줄에 다 들어가면 그대로 두고, 넘칠 때만 흐르게 한다.
  function initNoticeMarquee() {
    var box = document.querySelector('.notice-marquee');
    var a = box && box.querySelector('a');
    if (!a) return;
    function check() {
      box.classList.remove('is-overflow');
      box.classList.toggle('is-overflow', a.scrollWidth > box.clientWidth + 1);
    }
    window.addEventListener('resize', check);
    window.addEventListener('load', check);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(check);
    check();
  }

  // 머리(masthead)의 로고가 화면에 보이는 동안은 메뉴줄의 YF 로고를 숨기기 위해 body 에 mast-in 표시를 붙인다.
  function initMastheadWatch() {
    var m = document.querySelector('.masthead');
    if (!m || !('IntersectionObserver' in window)) return;
    new IntersectionObserver(function (es) {
      document.body.classList.toggle('mast-in', es[0].isIntersecting);
    }).observe(m);
  }

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
