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

    function featureItemHtml(item, extraStyle, emptyLabel, eager) {
      if (!item) {
        return emptyLabel ? '<div class="feature-item"' + (extraStyle ? ' style="' + extraStyle + '"' : '') + '>' +
          '<div class="body"><span class="tag" style="color:' + tagColor(emptyLabel) + ';">' + esc(emptyLabel) + '</span></div></div>' : '';
      }
      return '' +
        '<a class="feature-item" href="' + item.url + '"' + (extraStyle ? ' style="' + extraStyle + '"' : '') + '>' +
          (eager || hasPhoto(item) ? thumbImgHtml(item, 'thumb', eager) : '') +
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
    if (heroEl) heroEl.innerHTML = featureItemHtml(hero, '', '특집', true);
    if (secondEl) secondEl.innerHTML = featureItemHtml(second, '', '교단');
    if (thirdEl) thirdEl.innerHTML = featureItemHtml(third, 'border-bottom:none;', '신학');

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
    var rest = ARTICLE_INDEX.filter(function (a) { return !used[a.url]; });
    var latestHero = rest.find(hasPhoto) || null;
    var latestList = rest.filter(function (a) { return a !== latestHero; }).slice(0, 6);
    var numList = document.getElementById('numList');
    if (numList) {
      var numerals = ['①', '②', '③', '④', '⑤', '⑥'];
      numList.innerHTML = latestList.map(function (item, i) {
        return '<li><span class="num">' + numerals[i] + '</span><a href="' + item.url + '">' + esc(item.title) + '</a></li>';
      }).join('');
    }
    var modHero = document.getElementById('modHero');
    if (modHero) {
      modHero.innerHTML = !latestHero ? '' :
        '<a class="mod-hero" href="' + latestHero.url + '">' +
          thumbImgHtml(latestHero, 'thumb', true, '(max-width: 700px) 100vw, 420px') +
          (latestHero.desc ? '<p class="cap">' + esc(latestHero.desc) + '</p>' : '') +
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
  }

  YF.mods['site-home'] = renderHomepage;
})(window.YF);
