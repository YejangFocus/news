// 예장포커스 공통 스크립트 — 전체 기사 카테고리 오버레이 + 사이트 검색
// 기사 데이터는 더 이상 각 페이지에 하드코딩하지 않고 data/articles.json 하나에서 불러옵니다.
// 새 기사가 올라오면 articles.json 한 곳만 수정하면 모든 페이지(검색, 카테고리 보기)에 반영됩니다.
(function () {
  var root = typeof window.SITE_ROOT === 'string' ? window.SITE_ROOT : '';

  fetch(root + 'data/articles.json')
    .then(function (res) { return res.json(); })
    .then(function (articles) {
      window.ARTICLE_INDEX = articles;
      initCategoryOverlay(articles);
      initSiteSearch(articles);
    })
    .catch(function (err) {
      console.error('기사 목록(articles.json)을 불러오지 못했습니다.', err);
    });

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
        a.textContent = item.title;
        li.appendChild(a);
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
})();
