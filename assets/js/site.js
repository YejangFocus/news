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
