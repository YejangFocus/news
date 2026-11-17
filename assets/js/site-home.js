// 예장포커스 — 홈페이지 첫 화면의 헤드라인·목록·티커
// site.js(코어)가 필요한 페이지에서만 불러온다. 공통 도구는 window.YF 로 받는다.
(function (YF) {
  var root = YF.root,
      esc = YF.esc,
      tagColor = YF.tagColor;

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

    // assets/images 의 사진은 scripts/optimize_images.py 가 만든 WebP(foo.webp, foo-640.webp)로 보여 준다.
    // 변형이 없으면 onerror 로 원본 주소로 되돌린다. 첫 화면 큰 사진(eager)만 즉시, 나머지는 지연 로딩.
    function thumbImgHtml(item, cls, eager, sizes) {
      var isFallback = !item.image || item.image.indexOf('yejang-focus-ci') !== -1;
      var src = item.image || DEFAULT_IMAGE;
      if (src.indexOf(location.origin + '/') === 0) src = src.slice(location.origin.length); // 같은 사이트 이미지는 상대 주소로
      var extra = isFallback ? ' is-fallback' : '';
      var attrs = '';
      var m = !isFallback && src.match(/^(.*\/assets\/images\/[^\/]+?)(-640)?\.(jpe?g|png|webp)$/i);
      if (m) {
        var base = m[1];
        attrs = ' srcset="' + esc(base + '-640.webp') + ' 640w, ' + esc(base + '.webp') + ' 1600w"' +
          ' sizes="' + (sizes || '(max-width: 700px) 45vw, 260px') + '"' +
          ' onerror="this.onerror=null;this.removeAttribute(\'srcset\');this.src=\'' + esc(src) + '\'"';
        src = base + '.webp';
      }
      return '<img class="' + cls + extra + '" src="' + esc(src) + '"' + attrs + ' alt="' + esc(item.title) + '"' +
        (eager ? ' fetchpriority="high"' : ' loading="lazy"') + ' decoding="async">';
    }
    // 기사 날짜(2026-11-14 → 2026.11.14). 속보인지 지난 글인지 카드에서 바로 알 수 있게 한다.
    function dateHtml(item) {
      var d = item && item.date;
      if (!d || !/^\d{4}-\d{2}-\d{2}/.test(d)) return '';
      return '<time class="date" datetime="' + esc(d.slice(0, 10)) + '">' + d.slice(0, 4) + '.' + d.slice(5, 7) + '.' + d.slice(8, 10) + '</time>';
    }
    // 큰 대표 사진은 칼럼 폭(약 760px)만큼 그려지고, 교단·신학 카드는 절반 폭(약 380px)이다.
    var HERO_SIZES = '(max-width: 700px) 100vw, 760px';
    var CARD_SIZES = '(max-width: 700px) 100vw, 380px';
    // 진짜 사진이 있는 기사인가(없으면 CI 로고가 대신 들어가 같은 그림이 반복되므로, 작은 칸에서는 사진 없이 글로만 보여 준다)
    function hasPhoto(item) { return !!(item && item.image && item.image.indexOf('yejang-focus-ci') === -1); }
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

    // alwaysImg: 사진 없는 기사도 CI 로고 썸네일을 넣어 카드 높이가 비지 않게 한다(교단·신학 카드)
    function featureItemHtml(item, extraStyle, emptyLabel, eager, alwaysImg, sizes) {
      if (!item) {
        return emptyLabel ? '<div class="feature-item"' + (extraStyle ? ' style="' + extraStyle + '"' : '') + '>' +
          '<div class="body"><span class="tag" style="color:' + tagColor(emptyLabel) + ';">' + esc(emptyLabel) + '</span></div></div>' : '';
      }
      return '' +
        '<a class="feature-item" href="' + item.url + '"' + (extraStyle ? ' style="' + extraStyle + '"' : '') + '>' +
          (eager || alwaysImg || hasPhoto(item) ? thumbImgHtml(item, 'thumb', eager, sizes) : '') +
          '<div class="body">' +
            '<span class="tag" style="color:' + tagColor(item.tag) + ';">' + esc(item.tag) + '</span>' +
            '<h3>' + esc(item.title) + '</h3>' +
            (item.desc ? '<p>' + esc(item.desc) + '</p>' : '') +
            dateHtml(item) +
          '</div>' +
        '</a>';
    }


    // 특집 최신 3건 자동 슬라이드 (첫 장은 서버가 미리 그려 둔 그대로 두어 깜빡임·레이아웃 이동이 없다)
    function buildHeroSlider(box, items) {
      var slides = items.map(function (it, i) {
        return featureItemHtml(it, '', '속보', i === 0, false, HERO_SIZES).replace('class="feature-item"', 'class="feature-item hero-slide"');
      });
      box.innerHTML = '<div class="hero-carousel" role="region" aria-roledescription="carousel" aria-label="주요 기사">' +
        slides.join('') +
        '<div class="hero-ctl"><button type="button" class="hero-arrow" data-d="-1" aria-label="이전 기사">‹</button>' +
        '<div class="hero-dots">' + items.map(function (_, i) {
          return '<button type="button" class="hero-dot" data-i="' + i + '" aria-label="특집 ' + (i + 1) + ' / ' + items.length + '"><i></i></button>';
        }).join('') + '</div>' +
        '<button type="button" class="hero-arrow" data-d="1" aria-label="다음 기사">›</button></div></div>';
      var car = box.firstChild, els = car.querySelectorAll('.hero-slide'), dots = car.querySelectorAll('.hero-dot');
      var idx = 0, timer = null, paused = false, DELAY = 6000;
      var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
      function show(n) {
        idx = (n + els.length) % els.length;
        els.forEach(function (el, i) {
          var on = i === idx;
          el.classList.toggle('on', on);
          el.setAttribute('aria-hidden', on ? 'false' : 'true');
          el.tabIndex = on ? 0 : -1;
        });
        dots.forEach(function (d, i) {
          d.classList.remove('on'); void d.offsetWidth; // 진행 애니메이션 재시작
          d.classList.toggle('on', i === idx);
          d.setAttribute('aria-current', i === idx ? 'true' : 'false');
        });
        car.classList.toggle('run', !reduce && !paused);
      }
      function schedule() {
        clearTimeout(timer);
        if (reduce || paused || document.hidden) return;
        timer = setTimeout(function () { show(idx + 1); schedule(); }, DELAY);
      }
      function pause(v) { paused = v; car.classList.toggle('run', !reduce && !paused); if (!v) show(idx); schedule(); if (v) clearTimeout(timer); }
      car.addEventListener('click', function (e) {
        var b = e.target.closest('.hero-dot, .hero-arrow');
        if (!b) return;
        show(b.classList.contains('hero-dot') ? +b.getAttribute('data-i') : idx + +b.getAttribute('data-d'));
        schedule();
      });
      car.addEventListener('mouseenter', function () { pause(true); });
      car.addEventListener('mouseleave', function () { pause(false); });
      car.addEventListener('focusin', function () { pause(true); });
      car.addEventListener('focusout', function () { pause(false); });
      var x0 = null;
      car.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; }, { passive: true });
      car.addEventListener('touchend', function (e) {
        if (x0 === null) return;
        var dx = e.changedTouches[0].clientX - x0; x0 = null;
        if (Math.abs(dx) > 40) { show(idx + (dx < 0 ? 1 : -1)); schedule(); }
      }, { passive: true });
      document.addEventListener('visibilitychange', function () { document.hidden ? clearTimeout(timer) : schedule(); });
      show(0); schedule();
    }

    // 최신순 우선 배치(build_pages.py 와 같은 규칙): 카테고리 칸마다 오래된 기사가 올라오지 않도록
    // 대표(최신 3건) → 칼럼 칸(최신 칼럼 3건 예약) → 주요 카드 2칸 → 텍스트 목록 5칸 → 최신 소식 순으로,
    // 칼럼을 뺀 나머지 기사를 날짜순으로 채운다. 같은 기사는 한 번만 쓴다. (맨 위 티커는 새 기사 알림이라 예외)
    var heroes = ARTICLE_INDEX.slice(0, 3);
    var hero = heroes[0] || null;
    var used = {};
    function mark(it) { if (it) used[it.url] = true; }
    function unused(a) { return !used[a.url]; }
    function notColumn(a) { return a.tag !== '칼럼'; }
    heroes.forEach(mark);
    var columns = ARTICLE_INDEX.filter(function (a) { return a.tag === '칼럼' && unused(a); }).slice(0, 3);
    columns.forEach(mark);
    // 주요 카드 2칸은 큰 사진이 들어가므로 사진 있는 최신 기사를 우선(부족하면 사진 없는 최신 기사로 채움)
    var cards = ARTICLE_INDEX.filter(function (a) { return notColumn(a) && unused(a) && hasPhoto(a); }).slice(0, 2);
    cards.forEach(mark);
    if (cards.length < 2) {
      ARTICLE_INDEX.filter(function (a) { return notColumn(a) && unused(a); }).slice(0, 2 - cards.length)
        .forEach(function (a) { cards.push(a); mark(a); });
    }
    var second = cards[0] || null;
    var third = cards[1] || null;

    var heroEl = document.getElementById('heroFeature');
    var secondEl = document.getElementById('secondFeature');
    var thirdEl = document.getElementById('thirdFeature');
    if (heroEl) {
      heroEl.innerHTML = featureItemHtml(hero, '', '속보', true, false, HERO_SIZES);
      if (heroes.length > 1) buildHeroSlider(heroEl, heroes);
    }
    if (secondEl) secondEl.innerHTML = featureItemHtml(second, '', '', false, true, CARD_SIZES);
    if (thirdEl) thirdEl.innerHTML = featureItemHtml(third, 'border-bottom:none;', '', false, true, CARD_SIZES);

    // 최신뉴스 티커: 항상 전체 최신 5건, 같은 묶음을 두 번 이어붙여 끊김 없이 순환
    var tickerGroup = ARTICLE_INDEX.slice(0, 5).map(function (item) {
      return '<a href="' + item.url + '">' + esc(item.title) + '</a>';
    }).join('<span class="sep">•</span>');
    tickerBox.innerHTML = '<span class="ticker-group">' + tickerGroup + '</span>' +
      '<span class="ticker-group" aria-hidden="true">' + tickerGroup + '</span>';

    // 티커 일시정지 버튼 (마우스를 올리지 못하는 터치 기기·키보드 사용자를 위해)
    var pauseBtn = document.getElementById('tickerPause');
    if (pauseBtn) {
      pauseBtn.addEventListener('click', function () {
        var bar = pauseBtn.closest('.ticker-bar');
        var on = bar.classList.toggle('is-paused');
        pauseBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
        pauseBtn.setAttribute('aria-label', on ? '최신뉴스 자동 이동 다시 시작' : '최신뉴스 자동 이동 멈춤');
      });
    }

    // 좌측 하단 텍스트 목록: 위 칸에 나오지 않은 최신 기사(칼럼 제외) 5건을 날짜순으로.
    var plainList = document.getElementById('plainList');
    if (plainList) {
      var plain = ARTICLE_INDEX.filter(function (a) { return notColumn(a) && unused(a); }).slice(0, 5);
      plain.forEach(mark);
      plainList.innerHTML = plain.map(function (item) {
        return '<li><span class="tag" style="color:' + tagColor(item.tag) + ';">' + esc(item.tag) + '</span>' +
          '<a href="' + item.url + '">' + esc(item.title) + '</a>' + dateHtml(item) + '</li>';
      }).join('');
    }

    // 우측 '이어지는 소식': 위 칸들에 나오지 않은 기사를 최신순으로. 맨 위 큰 사진이 ①, 목록은 ②부터.
    var restArticles = ARTICLE_INDEX.filter(unused);
    var latestHero = restArticles[0] || null;
    var latestList = restArticles.slice(1, 7);
    var numList = document.getElementById('numList');
    if (numList) {
      var numerals = ['②', '③', '④', '⑤', '⑥', '⑦'];
      numList.innerHTML = latestList.map(function (item, i) {
        return '<li><span class="num">' + numerals[i] + '</span><a href="' + item.url + '">' + esc(item.title) + '</a>' + dateHtml(item) + '</li>';
      }).join('');
    }
    var modHero = document.getElementById('modHero');
    if (modHero) {
      modHero.innerHTML = !latestHero ? '' :
        '<a class="mod-hero" href="' + latestHero.url + '">' +
          thumbImgHtml(latestHero, 'thumb', false, '(max-width: 700px) 100vw, 420px') +
          '<span class="hero-title"><span class="num">①</span><span class="t">' + esc(latestHero.title) + '</span>' + dateHtml(latestHero) + '</span>' +
        '</a>';
    }
    // 분류별 최신 기사 칸 (build_pages.py 의 HOME_CATEGORIES 와 같은 값)
    var catSections = document.getElementById('catSections');
    if (catSections) {
      catSections.innerHTML = ['교단', '목회', '노회', '신학', '사설', '특집'].map(function (cat) {
        var items = ARTICLE_INDEX.filter(function (a) { return a.tag === cat; }).slice(0, 4);
        if (!items.length) return '';
        return '<section class="panel cat-card"><div class="mod-head"><h3>' + esc(cat) + '</h3>' +
          '<a class="more" href="/' + cat + '/">더보기〉</a></div><ul class="cat-list">' +
          items.map(function (a) { return '<li><a href="' + a.url + '">' + esc(a.title) + '</a>' + dateHtml(a) + '</li>'; }).join('') +
          '</ul></section>';
      }).join('');
    }
    var sideList = document.getElementById('sideList');
    if (sideList) {
      sideList.innerHTML = columns.map(function (item) {
        return '' +
          '<li>' +
            (hasPhoto(item) ? '<a href="' + item.url + '">' + thumbImgHtml(item, 'thumb') + '</a>' : '') +
            '<div class="body">' +
              '<a href="' + item.url + '"><h4>' + esc(item.title) + '</h4></a>' +
              (item.desc ? '<p>' + esc(item.desc) + '</p>' : '') +
              dateHtml(item) +
            '</div>' +
          '</li>';
      }).join('');
    }

    // 헤더 날짜
    var mhDate = document.getElementById('mhDate');
    if (mhDate) {
      var now = new Date();
      var wk = ['일', '월', '화', '수', '목', '금', '토'][now.getDay()];
      mhDate.textContent = now.getFullYear() + '년 ' + (now.getMonth() + 1) + '월 ' + now.getDate() + '일 ' + wk + '요일';
      mhDate.setAttribute('datetime', now.toISOString().slice(0, 10));
    }

    // 스크롤 등장 효과
    function reveal(scope) {
      var els = (scope || document).querySelectorAll('.yf-reveal:not(.in)');
      if (!('IntersectionObserver' in window)) { els.forEach(function (el) { el.classList.add('in'); }); return; }
      var io = new IntersectionObserver(function (es) {
        es.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
      }, { rootMargin: '0px 0px -40px 0px' });
      els.forEach(function (el, i) { el.style.transitionDelay = Math.min(i % 6, 5) * 60 + 'ms'; io.observe(el); });
    }
    ['.hero-slot', '.panel', '.focus-hub'].forEach(function (s) {
      document.querySelectorAll(s).forEach(function (el) { el.classList.add('yf-reveal'); });
    });
    reveal();

    // 페이지 읽기 진행바
    var bar = document.getElementById('yfProgress');
    if (bar) {
      var tick = false;
      window.addEventListener('scroll', function () {
        if (tick) return; tick = true;
        requestAnimationFrame(function () {
          var h = document.documentElement.scrollHeight - innerHeight;
          bar.style.transform = 'scaleX(' + (h > 0 ? Math.min(scrollY / h, 1) : 0) + ')'; tick = false;
        });
      }, { passive: true });
    }
  }

  YF.mods['site-home'] = renderHomepage;
})(window.YF);
