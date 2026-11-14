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
    function pickMany(tags, count) {
      return ARTICLE_INDEX.filter(function (item) {
        return tags.indexOf(item.tag) !== -1;
      }).slice(0, count);
    }

    // alwaysImg: 사진 없는 기사도 CI 로고 썸네일을 넣어 카드 높이가 비지 않게 한다(교단·신학 카드)
    function featureItemHtml(item, extraStyle, emptyLabel, eager, alwaysImg) {
      if (!item) {
        return emptyLabel ? '<div class="feature-item"' + (extraStyle ? ' style="' + extraStyle + '"' : '') + '>' +
          '<div class="body"><span class="tag" style="color:' + tagColor(emptyLabel) + ';">' + esc(emptyLabel) + '</span></div></div>' : '';
      }
      return '' +
        '<a class="feature-item" href="' + item.url + '"' + (extraStyle ? ' style="' + extraStyle + '"' : '') + '>' +
          (eager || alwaysImg || hasPhoto(item) ? thumbImgHtml(item, 'thumb', eager) : '') +
          '<div class="body">' +
            '<span class="tag" style="color:' + tagColor(item.tag) + ';">' + esc(item.tag) + '</span>' +
            '<h3>' + esc(item.title) + '</h3>' +
            (item.desc ? '<p>' + esc(item.desc) + '</p>' : '') +
          '</div>' +
        '</a>';
    }


    // 특집 최신 3건 자동 슬라이드 (첫 장은 서버가 미리 그려 둔 그대로 두어 깜빡임·레이아웃 이동이 없다)
    function buildHeroSlider(box, items) {
      var slides = items.map(function (it, i) {
        return featureItemHtml(it, '', '특집', i === 0).replace('class="feature-item"', 'class="feature-item hero-slide"');
      });
      box.innerHTML = '<div class="hero-carousel" role="region" aria-roledescription="carousel" aria-label="주요 특집 기사">' +
        slides.join('') +
        '<div class="hero-ctl"><button type="button" class="hero-arrow" data-d="-1" aria-label="이전 특집">‹</button>' +
        '<div class="hero-dots">' + items.map(function (_, i) {
          return '<button type="button" class="hero-dot" data-i="' + i + '" aria-label="특집 ' + (i + 1) + ' / ' + items.length + '"><i></i></button>';
        }).join('') + '</div>' +
        '<button type="button" class="hero-arrow" data-d="1" aria-label="다음 특집">›</button></div></div>';
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

    var hero = latestOf(['특집']);
    var second = latestOf(['교단', '교단소식']);
    var third = latestOf(['신학']);

    // 홈에서 같은 기사가 여러 칸에 반복되지 않도록, 본문·칼럼 칸에 쓴 기사를 기록해 두었다가
    // '최신 소식'에서는 그것들을 뺀다. (맨 위 티커는 새 기사 알림이라 예외)
    var used = {};
    function mark(it) { if (it) used[it.url] = true; }
    mark(hero); mark(second); mark(third);
    ['목회', '사설', '노회', '인물', '교계'].forEach(function (cat) {
      mark(ARTICLE_INDEX.find(function (a) { return a.tag === cat; }));
    });
    var columns = pickMany(['칼럼'], 3);
    columns.forEach(mark);

    var heroEl = document.getElementById('heroFeature');
    var secondEl = document.getElementById('secondFeature');
    var thirdEl = document.getElementById('thirdFeature');
    if (heroEl) {
      var heroes = pickMany(['특집'], 3);
      heroes.forEach(mark);
      heroEl.innerHTML = featureItemHtml(hero, '', '특집', true);
      if (heroes.length > 1) buildHeroSlider(heroEl, heroes);
    }
    if (secondEl) secondEl.innerHTML = featureItemHtml(second, '', '교단', false, true);
    if (thirdEl) thirdEl.innerHTML = featureItemHtml(third, 'border-bottom:none;', '신학', false, true);

    // 최신뉴스 티커: 항상 전체 최신 5건, 같은 묶음을 두 번 이어붙여 끊김 없이 순환
    var tickerGroup = ARTICLE_INDEX.slice(0, 5).map(function (item) {
      return '<a href="' + item.url + '">' + esc(item.title) + '</a>';
    }).join('<span class="sep">•</span>');
    tickerBox.innerHTML = '<span class="ticker-group">' + tickerGroup + '</span>' +
      '<span class="ticker-group" aria-hidden="true">' + tickerGroup + '</span>';

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

    // 우측 '최신 소식': 본문 칸에 이미 나온 기사를 뺀 최신 기사. 큰 사진은 사진이 있는 첫 기사로.
    // 다른 칸에 나온 기사도 빼지 않고, 전체 기사를 최신순 그대로: 맨 위 큰 칸이 가장 최신, 이어서 ①~⑥.
    var latestHero = ARTICLE_INDEX[0] || null;
    var latestList = ARTICLE_INDEX.slice(1, 7); // 맨 위 사진이 ①, 목록은 ②부터
    var numList = document.getElementById('numList');
    if (numList) {
      var numerals = ['②', '③', '④', '⑤', '⑥', '⑦'];
      numList.innerHTML = latestList.map(function (item, i) {
        return '<li><span class="num">' + numerals[i] + '</span><a href="' + item.url + '">' + esc(item.title) + '</a></li>';
      }).join('');
    }
    var modHero = document.getElementById('modHero');
    if (modHero) {
      modHero.innerHTML = !latestHero ? '' :
        '<a class="mod-hero" href="' + latestHero.url + '">' +
          thumbImgHtml(latestHero, 'thumb', true, '(max-width: 700px) 100vw, 420px') +
          '<span class="hero-title"><span class="num">①</span><span class="t">' + esc(latestHero.title) + '</span></span>' +
        '</a>';
    }
    // 우측 컬럼: 칼럼 — 최신 3건
    var sideList = document.getElementById('sideList');
    if (sideList) {
      sideList.innerHTML = columns.map(function (item) {
        return '' +
          '<li>' +
            (hasPhoto(item) ? '<a href="' + item.url + '">' + thumbImgHtml(item, 'thumb') + '</a>' : '') +
            '<div class="body">' +
              '<a href="' + item.url + '"><h4>' + esc(item.title) + '</h4></a>' +
              (item.desc ? '<p>' + esc(item.desc) + '</p>' : '') +
            '</div>' +
          '</li>';
      }).join('');
    }

    // ───── 카테고리별 최신 기사 탭 피드 ─────
    var feed = document.getElementById('yfFeed');
    if (feed) {
      var cats = ['전체'];
      ARTICLE_INDEX.forEach(function (a) { if (cats.indexOf(a.tag) === -1) cats.push(a.tag); });
      var cur = '전체', shown = 6;
      var fmt = function (d) { return d ? d.slice(5).replace('-', '.') : ''; };
      var draw = function () {
        var list = ARTICLE_INDEX.filter(function (a) { return cur === '전체' || a.tag === cur; });
        var cards = list.slice(0, shown).map(function (a) {
          return '<a class="yf-card yf-reveal" href="' + a.url + '"><div class="yf-img">' + thumbImgHtml(a, 'thumb') + '</div>' +
            '<div class="yf-b"><div class="yf-meta"><b style="color:' + tagColor(a.tag) + ';">' + esc(a.tag) + '</b><span>' + fmt(a.date) + '</span></div>' +
            '<h3>' + esc(a.title) + '</h3>' + (a.desc ? '<p>' + esc(a.desc) + '</p>' : '') + '</div></a>';
        }).join('');
        feed.innerHTML = '<div class="yf-feed-head"><h2>카테고리별 최신 기사</h2><span class="yf-feed-count">' + list.length + '건</span></div>' +
          '<div class="yf-tabs" role="tablist">' + cats.map(function (c) {
            return '<button class="yf-tab" role="tab" data-c="' + esc(c) + '" aria-selected="' + (c === cur) + '">' + esc(c) + '</button>';
          }).join('') + '</div><div class="yf-grid">' + cards + '</div>' +
          (list.length > shown ? '<button class="yf-more" type="button">기사 더 보기</button>' : '');
        reveal(feed);
      };
      feed.addEventListener('click', function (e) {
        var t = e.target.closest('.yf-tab, .yf-more');
        if (!t) return;
        if (t.classList.contains('yf-more')) shown += 6; else { cur = t.getAttribute('data-c'); shown = 6; }
        draw();
        var act = feed.querySelector('.yf-tab[aria-selected="true"]'); if (act && act.scrollIntoView) act.scrollIntoView({ inline: 'center', block: 'nearest' });
      });
      feed.hidden = false;
      draw();
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
