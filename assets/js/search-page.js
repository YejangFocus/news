// 검색 결과 페이지(검색.html): ?q=검색어&page=N
// data/articles.json + data/search-index.json 으로 제목·카테고리·요약·본문에서 찾는다(공백으로 나눈 단어 모두 포함).
(function () {
  var PER_PAGE = 10;
  var params = new URLSearchParams(location.search);
  var q = (params.get('q') || '').trim();
  var page = Math.max(1, parseInt(params.get('page'), 10) || 1);
  var input = document.getElementById('yfq');
  var sum = document.getElementById('yfsum');
  var box = document.getElementById('yfres');
  var pager = document.getElementById('yfpager');
  if (!input || !box) return;
  input.value = q;
  if (q) document.title = '"' + q + '" 검색 결과 | 예장포커스';

  function norm(s) { return (s || '').normalize('NFC').toLowerCase(); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function escRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function highlight(text, ts) {
    var h = esc(text);
    ts.forEach(function (t) { h = h.replace(new RegExp('(' + escRe(esc(t)) + ')', 'gi'), '<mark>$1</mark>'); });
    return h;
  }
  function snippet(text, ts) {
    if (!text) return '';
    var low = norm(text), pos = -1;
    ts.forEach(function (t) { var p = low.indexOf(t); if (p !== -1 && (pos === -1 || p < pos)) pos = p; });
    if (pos === -1) return '';
    var from = Math.max(0, pos - 30), to = Math.min(text.length, pos + 110);
    return (from > 0 ? '…' : '') + text.slice(from, to) + (to < text.length ? '…' : '');
  }
  function pageHref(n) {
    return '?q=' + encodeURIComponent(q) + (n > 1 ? '&page=' + n : '');
  }

  if (!q) { sum.textContent = '검색어를 입력해 주세요.'; return; }
  sum.textContent = '검색 중입니다…';

  Promise.all([
    fetch('/data/articles.json').then(function (r) { return r.json(); }),
    fetch('/data/search-index.json').then(function (r) { return r.ok ? r.json() : {}; }).catch(function () { return {}; })
  ]).then(function (res) {
    var articles = res[0], bodies = res[1] || {};
    var ts = norm(q).split(/\s+/).filter(Boolean);
    var hits = [];
    articles.forEach(function (a, idx) {
      var title = norm(a.title), tag = norm(a.tag), desc = norm(a.desc), body = norm(bodies[a.url] || '');
      var score = 0, ok = true;
      ts.forEach(function (t) {
        if (title.indexOf(t) !== -1) score += 100;
        else if (tag.indexOf(t) !== -1) score += 60;
        else if (desc.indexOf(t) !== -1) score += 30;
        else if (body.indexOf(t) !== -1) score += 10 + Math.min(body.split(t).length - 1, 20);
        else ok = false;
      });
      if (ok) hits.push({ a: a, score: score, idx: idx });
    });
    hits.sort(function (x, y) { return y.score - x.score || x.idx - y.idx; });

    var pages = Math.max(1, Math.ceil(hits.length / PER_PAGE));
    if (page > pages) page = pages;
    sum.textContent = hits.length ? '"' + q + '" 검색 결과 ' + hits.length + '건' : '"' + q + '"에 대한 검색 결과가 없습니다.';
    if (!hits.length) {
      box.innerHTML = '<li class="yf-empty" style="display:block;border:0;">다른 검색어로 다시 찾아보시거나 <a href="/전체/" style="text-decoration:underline;">전체 기사</a>를 둘러보세요.</li>';
      return;
    }
    box.innerHTML = hits.slice((page - 1) * PER_PAGE, page * PER_PAGE).map(function (h) {
      var a = h.a;
      var inTitle = ts.every(function (t) { return norm(a.title).indexOf(t) !== -1; });
      var snip = inTitle ? (a.desc || '') : (snippet(bodies[a.url] || '', ts) || a.desc || '');
      var fallback = !a.image || a.image.indexOf('yejang-focus-ci') !== -1;
      return '<li><a href="' + esc(a.url) + '" aria-hidden="true" tabindex="-1"><img class="thumb' + (fallback ? ' is-fallback' : '') +
        '" src="' + esc(a.image || '/assets/images/yejang-focus-ci.webp') + '" alt="" loading="lazy" decoding="async"></a><div>' +
        '<span class="tg">' + esc(a.tag) + '</span>' +
        '<a href="' + esc(a.url) + '"><h2>' + highlight(a.title, ts) + '</h2></a>' +
        (snip ? '<p>' + highlight(snip, ts) + '</p>' : '') +
        '<time datetime="' + esc(a.date) + '">' + esc((a.date || '').replace(/-/g, '.')) + '</time></div></li>';
    }).join('');

    if (pages > 1) {
      var h = '<nav class="yf-pager" aria-label="페이지 이동">';
      if (page > 1) h += '<a href="' + pageHref(page - 1) + '">이전</a>';
      for (var n = 1; n <= pages; n++) {
        h += n === page ? '<span class="cur" aria-current="page">' + n + '</span>' : '<a href="' + pageHref(n) + '">' + n + '</a>';
      }
      if (page < pages) h += '<a href="' + pageHref(page + 1) + '">다음</a>';
      pager.innerHTML = h + '</nav>';
    }
  }).catch(function () {
    sum.textContent = '검색 데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.';
  });
})();
