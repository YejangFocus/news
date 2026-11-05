// 검색 결과 페이지(검색.html)
//   ?q=검색어  &tag=분류  &period=7|30|90|365(일)  &sort=new(최신순, 기본은 관련도)  &page=N
// data/articles.json + data/search-index.json 으로 제목·분류·요약·본문에서 찾는다(공백으로 나눈 단어 모두 포함).
// 초성 검색(ㅊㅇ → 처음… 등), 오타 보정(결과가 없을 때 비슷한 기사), 분류·기간 필터, 정렬,
// 최근 검색어·저장한 기사(localStorage), 용어·규정 카드(data/glossary.json)를 지원한다.
(function () {
  var PER_PAGE = 10;
  var params = new URLSearchParams(location.search);
  var state = {
    q: (params.get('q') || '').trim(),
    tag: params.get('tag') || '',
    period: parseInt(params.get('period'), 10) || 0,
    sort: params.get('sort') === 'new' ? 'new' : 'rel',
    page: Math.max(1, parseInt(params.get('page'), 10) || 1)
  };
  var input = document.getElementById('yfq');
  var sum = document.getElementById('yfsum');
  var box = document.getElementById('yfres');
  var pager = document.getElementById('yfpager');
  var filters = document.getElementById('yffilters');
  var extra = document.getElementById('yfextra');
  if (!input || !box) return;
  input.value = state.q;
  if (state.q) document.title = '"' + state.q + '" 검색 결과 | 예장포커스';

  function norm(s) { return (s || '').normalize('NFC').toLowerCase(); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function escRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  // ── localStorage (막혀 있어도 검색은 동작) ──────────────────────────────
  function load(key) {
    try { return (JSON.parse(localStorage.getItem(key)) || []).map(function (v) { return typeof v === 'string' ? v.replace(/([^:])\/\/+/g, '$1/') : v; }); } catch (e) { return []; }
  }
  function save(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) { /* 무시 */ } }

  // ── 초성 검색: 'ㅊ' 같은 초성 자모는 그 초성으로 시작하는 모든 글자에 맞는다 ──
  var CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
  function termRegex(t) {
    var src = '';
    for (var i = 0; i < t.length; i++) {
      var ch = t.charAt(i), k = CHO.indexOf(ch);
      if (k >= 0) {
        var from = 0xAC00 + k * 588;
        src += '[' + ch + String.fromCharCode(from) + '-' + String.fromCharCode(from + 587) + ']';
      } else src += escRe(ch);
    }
    return new RegExp(src, 'i');
  }
  function highlight(text, res) {
    var h = esc(text);
    res.forEach(function (re) {
      var g = new RegExp(re.source, 'gi');
      h = h.replace(g, function (m) { return '<mark>' + m + '</mark>'; });
    });
    return h;
  }
  function snippet(text, res) {
    if (!text) return '';
    var pos = -1;
    res.forEach(function (re) { var m = re.exec(text); if (m && (pos === -1 || m.index < pos)) pos = m.index; });
    if (pos === -1) return '';
    var from = Math.max(0, pos - 30), to = Math.min(text.length, pos + 110);
    return (from > 0 ? '…' : '') + text.slice(from, to) + (to < text.length ? '…' : '') ;
  }

  // ── 오타 보정: 자모 단위(NFD) 2글자 조각의 겹침 비율 ─────────────────────
  function bigrams(s) {
    s = s.normalize('NFD').replace(/\s+/g, '');
    var set = {}, n = 0;
    for (var i = 0; i < s.length - 1; i++) { var g = s.substr(i, 2); if (!set[g]) { set[g] = 1; n++; } }
    return { set: set, n: n };
  }
  function similarity(qb, text) {
    if (!qb.n) return 0;
    var tb = bigrams(text), hit = 0;
    for (var g in qb.set) if (tb.set[g]) hit++;
    return hit / qb.n;
  }

  // ── 상태 → URL ──────────────────────────────────────────────────────────
  function query(over) {
    var s = {}; for (var k in state) s[k] = state[k];
    for (var k2 in over) s[k2] = over[k2];
    var p = [];
    if (s.q) p.push('q=' + encodeURIComponent(s.q));
    if (s.tag) p.push('tag=' + encodeURIComponent(s.tag));
    if (s.period) p.push('period=' + s.period);
    if (s.sort === 'new') p.push('sort=new');
    if (s.page > 1) p.push('page=' + s.page);
    return '?' + p.join('&');
  }

  var articles = [], bodies = {}, glossary = [], hitsAll = [], fuzzy = false;

  function runSearch() {
    var ts = norm(state.q).split(/\s+/).filter(Boolean);
    var res = ts.map(termRegex);
    var hits = [];
    articles.forEach(function (a, idx) {
      var title = norm(a.title), tag = norm(a.tag), desc = norm(a.desc), body = norm(bodies[a.url] || '');
      var score = 0, ok = true;
      res.forEach(function (re) {
        var m;
        if (re.test(title)) score += 100;
        else if (re.test(tag)) score += 60;
        else if (re.test(desc)) score += 30;
        else if ((m = body.match(new RegExp(re.source, 'gi')))) score += 10 + Math.min(m.length, 20);
        else ok = false;
      });
      if (ok) hits.push({ a: a, score: score, idx: idx });
    });
    fuzzy = false;
    if (!hits.length) {
      var qb = bigrams(norm(state.q));
      if (qb.n >= 5) {
        articles.forEach(function (a, idx) {
          var sc = similarity(qb, a.title + ' ' + a.tag + ' ' + (a.desc || ''));
          if (sc >= 0.65) hits.push({ a: a, score: Math.round(sc * 100), idx: idx });
        });
        fuzzy = hits.length > 0;
      }
    }
    return { hits: hits, res: res };
  }

  function periodOk(a) {
    if (!state.period) return true;
    var t = Date.parse(a.uploaded || a.date);
    return !t || (Date.now() - t) <= state.period * 86400000;
  }

  function renderFilters(hits) {
    if (!hits.length && !state.tag && !state.period) { filters.hidden = true; return; }
    var counts = {}, order = [];
    hits.filter(periodOk).forEach(function (h) { if (!counts[h.a.tag]) { counts[h.a.tag] = 0; order.push(h.a.tag); } counts[h.a.tag]++; });
    if (state.tag && !counts[state.tag]) { counts[state.tag] = 0; order.push(state.tag); }
    var total = hits.filter(periodOk).length;
    var h = '<div class="yf-chips" role="group" aria-label="분류">' +
      '<button type="button" class="yf-chip' + (state.tag ? '' : ' on') + '" data-tag="">전체 ' + total + '</button>' +
      order.map(function (t) {
        return '<button type="button" class="yf-chip' + (state.tag === t ? ' on' : '') + '" data-tag="' + esc(t) + '">' + esc(t) + ' ' + counts[t] + '</button>';
      }).join('') + '</div>';
    h += '<label>기간 <select id="yfperiod">' + [[0, '전체'], [7, '1주일'], [30, '1개월'], [90, '3개월'], [365, '1년']].map(function (o) {
      return '<option value="' + o[0] + '"' + (state.period === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
    }).join('') + '</select></label>';
    h += '<label>정렬 <select id="yfsort"><option value="rel"' + (state.sort === 'rel' ? ' selected' : '') + '>관련도순</option>' +
      '<option value="new"' + (state.sort === 'new' ? ' selected' : '') + '>최신순</option></select></label>';
    filters.innerHTML = h;
    filters.hidden = false;
  }

  function renderResults() {
    var out = runSearch(), res = out.res;
    hitsAll = out.hits;
    renderFilters(hitsAll);
    var hits = hitsAll.filter(function (h) { return periodOk(h.a) && (!state.tag || h.a.tag === state.tag); });
    if (state.sort === 'new') {
      hits.sort(function (x, y) { return (Date.parse(y.a.uploaded) || 0) - (Date.parse(x.a.uploaded) || 0) || x.idx - y.idx; });
    } else {
      hits.sort(function (x, y) { return y.score - x.score || x.idx - y.idx; });
    }
    var pages = Math.max(1, Math.ceil(hits.length / PER_PAGE));
    if (state.page > pages) state.page = pages;

    if (!hits.length) {
      sum.textContent = '"' + state.q + '"에 대한 검색 결과가 없습니다.';
      box.innerHTML = '<li class="yf-empty" style="display:block;border:0;">' +
        ((state.tag || state.period) ? '필터를 바꿔 보시거나 ' : '다른 검색어로 다시 찾아보시거나 ') +
        '<a href="/전체/" style="text-decoration:underline;">전체 기사</a>를 둘러보세요. (초성 검색도 가능합니다. 예: ㅊㅎ)</li>';
      pager.innerHTML = '';
      return;
    }
    sum.textContent = fuzzy
      ? '"' + state.q + '"와 정확히 일치하는 기사가 없어 비슷한 기사 ' + hits.length + '건을 보여 드립니다.'
      : '"' + state.q + '" 검색 결과 ' + hits.length + '건';
    box.innerHTML = hits.slice((state.page - 1) * PER_PAGE, state.page * PER_PAGE).map(function (h) {
      var a = h.a;
      var inTitle = !fuzzy && res.every(function (re) { return re.test(norm(a.title)); });
      var snip = (inTitle || fuzzy) ? (a.desc || '') : (snippet(bodies[a.url] || '', res) || a.desc || '');
      var fallback = !a.image || a.image.indexOf('yejang-focus-ci') !== -1;
      var src = a.image || '/assets/images/yejang-focus-ci.webp';
      var m = !fallback && src.match(/^(.*\/assets\/images\/[^\/]+?)(-640)?\.(jpe?g|png|webp)$/i);
      var imgAttrs = m
        ? ' src="' + esc(m[1] + '-640.webp') + '" onerror="this.onerror=null;this.src=\'' + esc(src) + '\'"'
        : ' src="' + esc(src) + '"';
      return '<li><a href="' + esc(a.url) + '" aria-hidden="true" tabindex="-1"><img class="thumb' + (fallback ? ' is-fallback' : '') +
        '"' + imgAttrs + ' alt="" loading="lazy" decoding="async"></a><div>' +
        '<span class="tg">' + esc(a.tag) + '</span>' +
        '<a href="' + esc(a.url) + '"><h2>' + (fuzzy ? esc(a.title) : highlight(a.title, res)) + '</h2></a>' +
        (snip ? '<p>' + (fuzzy ? esc(snip) : highlight(snip, res)) + '</p>' : '') +
        '<time datetime="' + esc(a.date) + '">' + esc((a.date || '').replace(/-/g, '.')) + '</time></div></li>';
    }).join('');

    pager.innerHTML = '';
    if (pages > 1) {
      var h = '<nav class="yf-pager" aria-label="페이지 이동">';
      if (state.page > 1) h += '<a href="' + query({ page: state.page - 1 }) + '">이전</a>';
      for (var n = 1; n <= pages; n++) {
        h += n === state.page ? '<span class="cur" aria-current="page">' + n + '</span>' : '<a href="' + query({ page: n }) + '">' + n + '</a>';
      }
      if (state.page < pages) h += '<a href="' + query({ page: state.page + 1 }) + '">다음</a>';
      pager.innerHTML = h + '</nav>';
    }
    window.__yfBadges && window.__yfBadges();
  }

  // ── 용어·규정 카드 ──────────────────────────────────────────────────────
  function renderGlossary() {
    var ts = norm(state.q).split(/\s+/).filter(Boolean), q = norm(state.q).replace(/\s+/g, '');
    if (!ts.length) return '';
    var found = glossary.filter(function (g) {
      var names = [g.term].concat(g.aliases || []).map(function (n) { return norm(n).replace(/\s+/g, ''); });
      return names.some(function (n) { return n.indexOf(q) !== -1 || (n.length >= 3 && q.indexOf(n) !== -1); });
    }).slice(0, 2);
    if (!found.length) return '';
    return '<div class="yf-box2"><h2>용어·규정</h2>' + found.map(function (g) {
      return '<div class="yf-gl"><b>' + esc(g.term) + '</b><small>' + esc(g.type) + '</small><p>' + esc(g.summary) + '</p>' +
        (g.sources && g.sources.length ? '<div class="src">' + g.sources.map(function (s) {
          var a = articles.filter(function (x) { return decodeURIComponent(x.url).slice(-(s.length + 1)) === '/' + s; })[0];
          return a ? '<a href="' + esc(a.url) + '">' + esc(a.title) + '</a>' : '';
        }).join('') + '</div>' : '') + '</div>';
    }).join('') + '</div>';
  }

  // ── 검색어가 없을 때: 최근 검색어 + 저장한 기사 ─────────────────────────
  function renderIdle() {
    var h = '', rec = load('yf-recent');
    if (rec.length) {
      h += '<div class="yf-box2"><h2>최근 검색어</h2><div class="row">' + rec.map(function (r) {
        return '<a href="' + query({ q: r, page: 1, tag: '', period: 0 }) + '">' + esc(r) + '</a>';
      }).join('') + '<button type="button" class="clr" id="yfclr">지우기</button></div></div>';
    }
    var marks = load('yf-bookmarks'), list = marks.map(function (u) {
      return articles.filter(function (a) { return a.url === u; })[0];
    }).filter(Boolean);
    if (list.length) {
      h += '<div class="yf-box2"><h2>저장한 기사</h2>' + list.map(function (a) {
        return '<div style="padding:4px 0;"><span class="tg" style="font-weight:700;font-size:12px;margin-right:6px;">' + esc(a.tag) +
          '</span><a href="' + esc(a.url) + '">' + esc(a.title) + '</a></div>';
      }).join('') + '</div>';
    }
    extra.innerHTML = h || '';
    sum.textContent = h ? '' : '검색어를 입력해 주세요. 초성만 입력해도 찾을 수 있습니다. (예: ㅇㅈㅍㅋㅅ)';
    var clr = document.getElementById('yfclr');
    if (clr) clr.onclick = function () { save('yf-recent', []); renderIdle(); };
  }

  // 필터·정렬은 새로고침 없이 바로 반영하고 주소만 갱신한다(주소를 공유하면 같은 결과가 열린다).
  function update(over) {
    for (var k in over) state[k] = over[k];
    if (!('page' in over)) state.page = 1;
    try { history.replaceState(null, '', query({})); } catch (e) { /* 무시 */ }
    renderResults();
  }
  filters.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('button[data-tag]');
    if (b) update({ tag: b.getAttribute('data-tag') });
  });
  filters.addEventListener('change', function (e) {
    if (e.target.id === 'yfperiod') update({ period: parseInt(e.target.value, 10) || 0 });
    if (e.target.id === 'yfsort') update({ sort: e.target.value });
  });

  sum.textContent = '불러오는 중입니다…';
  Promise.all([
    fetch('/data/articles.json').then(function (r) { return r.json(); }),
    fetch('/data/search-index.json').then(function (r) { return r.ok ? r.json() : {}; }).catch(function () { return {}; }),
    fetch('/data/glossary.json').then(function (r) { return r.ok ? r.json() : []; }).catch(function () { return []; })
  ]).then(function (r) {
    articles = r[0]; bodies = r[1] || {}; glossary = r[2] || [];
    if (!state.q) { renderIdle(); return; }
    var rec = load('yf-recent').filter(function (x) { return x !== state.q; });
    rec.unshift(state.q);
    save('yf-recent', rec.slice(0, 8));
    extra.innerHTML = renderGlossary();
    renderResults();
  }).catch(function () {
    sum.textContent = '검색 데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.';
  });
})();
