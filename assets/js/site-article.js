// 예장포커스 — 기사 페이지 공통 기능: 읽기 진행바·공유·글자 크기·저장·이슈 안내, 인물·규정 용어 카드
// site.js(코어)가 필요한 페이지에서만 불러온다. 공통 도구는 window.YF 로 받는다.
(function (YF) {
  var root = YF.root,
      esc = YF.esc,
      lsGet = YF.lsGet,
      lsSet = YF.lsSet,
      prepareIssues = YF.prepareIssues;

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

    // 읽은 기사 기록(목록에서 흐리게 표시)
    var rd = lsGet('yf-read');
    if (rd.indexOf(cur.url) === -1) { rd.unshift(cur.url); lsSet('yf-read', rd.slice(0, 200)); }

    // 예상 읽기 시간 + 글자 크기 조절을 상단 메타 바에 붙인다.
    var meta = document.querySelector('.meta-bar');
    var chars = (page.innerText || '').replace(/\s+/g, '').length;
    var STEPS = [0.9, 1, 1.12, 1.25, 1.4], fsIdx = 1;
    try { var sv = parseInt(localStorage.getItem('yf-fs'), 10); if (sv >= 0 && sv < STEPS.length) fsIdx = sv; } catch (e) { /* 무시 */ }
    var TEXT_SEL = 'p,li,h2,h3,blockquote,figcaption,.lede,.subhead,td,th';
    function applyFs() {
      var els = page.querySelectorAll(TEXT_SEL);
      for (var i = 0; i < els.length; i++) {
        var el = els[i];
        if (el.closest('.yf-end,.yf-top,nav,footer,.meta-bar')) continue;
        el.style.fontSize = '';
        if (STEPS[fsIdx] !== 1) el.style.fontSize = (parseFloat(getComputedStyle(el).fontSize) * STEPS[fsIdx]) + 'px';
      }
      var lab = document.getElementById('yfFsLab');
      if (lab) lab.textContent = fsIdx === 1 ? '보통' : Math.round(STEPS[fsIdx] * 100) + '%';
    }
    if (meta) {
      var tools = document.createElement('span');
      tools.className = 'yf-tools';
      tools.innerHTML = '약 ' + Math.max(1, Math.round(chars / 500)) + '분 읽기 · 글자 ' +
        '<button type="button" data-fs="-1" aria-label="글자 작게">가-</button>' +
        '<span id="yfFsLab" aria-live="polite">보통</span>' +
        '<button type="button" data-fs="1" aria-label="글자 크게">가+</button>';
      meta.appendChild(tools);
      var fcss = document.createElement('style');
      fcss.textContent = '.yf-tools button{font:700 12px "Noto Sans KR",sans-serif;margin:0 4px;padding:1px 8px;border:1px solid var(--rule-soft,#ccc);' +
        'border-radius:10px;background:var(--paper,#fff);color:var(--ink,#111);cursor:pointer}.yf-tools button:hover{border-color:#cc2b24}';
      document.head.appendChild(fcss);
      tools.addEventListener('click', function (e) {
        var b = e.target.closest ? e.target.closest('button[data-fs]') : null;
        if (!b) return;
        fsIdx = Math.min(STEPS.length - 1, Math.max(0, fsIdx + parseInt(b.dataset.fs, 10)));
        try { localStorage.setItem('yf-fs', String(fsIdx)); } catch (e2) { /* 무시 */ }
        applyFs();
      });
      if (fsIdx !== 1) applyFs();
    }

    var css = document.createElement('style');
    css.textContent =
      '.yf-progress{position:fixed;left:0;top:0;height:4px;width:100%;z-index:1000;background:transparent;pointer-events:none}' +
      '.yf-progress i{display:block;height:100%;width:100%;transform:scaleX(0);transform-origin:left;background:linear-gradient(90deg,#ffb020,#cc2b24)}' +
      '.yf-end{margin:44px 0 0;font-family:"Noto Sans KR",sans-serif;color:var(--ink,#111)}' +
      '.yf-end a{text-decoration:none;color:inherit}' +
      '.yf-share{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:14px 0;border-top:2px solid var(--ink,#111);border-bottom:1px solid var(--rule-soft,#ddd)}' +
      '.yf-share b{font:400 15px "Do Hyeon","Noto Sans KR",sans-serif;margin-right:auto}' +
      '.yf-share button{font:600 13px "Noto Sans KR",sans-serif;cursor:pointer;color:var(--ink,#111);background:var(--paper,#fff);border:1px solid var(--rule-soft,#ccd);border-radius:999px;padding:8px 15px;transition:background .15s,border-color .15s,transform .12s}' +
      '.yf-share button:hover{background:var(--accent-soft,#e6ebf2);border-color:var(--accent,#1f4a8a)}' +
      '.yf-share button:active{transform:scale(.95)}' +
      '.yf-toc{margin:6px 0 26px;border:1px solid var(--rule-soft,#d5dbe4);border-radius:10px;background:var(--paper,#fff);font-family:"Noto Sans KR",sans-serif}' +
      '.yf-toc summary{cursor:pointer;padding:11px 16px;font-size:13.5px;font-weight:700;color:var(--ink-soft,#333);list-style:none;display:flex;justify-content:space-between;align-items:center}' +
      '.yf-toc summary::-webkit-details-marker{display:none}' +
      '.yf-toc summary::after{content:"＋";color:var(--muted,#667)}' +
      '.yf-toc[open] summary::after{content:"－"}' +
      '.yf-toc ol{margin:0;padding:2px 16px 14px 36px;font-size:14.5px;line-height:1.6}' +
      '.yf-toc li{padding:4px 0;color:var(--muted,#667)}' +
      '.yf-toc a{color:var(--ink,#111);text-decoration:none;border-bottom:1px solid transparent}' +
      '.yf-toc a:hover,.yf-toc a.on{color:var(--accent,#1f4a8a);border-bottom-color:currentColor}' +
      '.yf-box{margin-top:22px;padding:18px 20px;border:2px solid #111;border-radius:4px 16px 4px 16px;box-shadow:4px 4px 0 #111;background:var(--paper,#fff)}' +
      '.yf-box h3{margin:0 0 4px;font:400 17px "Do Hyeon","Noto Sans KR",sans-serif;color:var(--ink,#111)}' +
      '.yf-box .k{font-size:12px;font-weight:700;color:#cc2b24}' +
      '.yf-box .t{display:block;margin:4px 0 10px;font:700 16px/1.5 "Noto Serif KR",serif;word-break:keep-all}' +
      '.yf-box .t:hover{text-decoration:underline}' +
      '.yf-steps{display:flex;gap:5px;margin:10px 0 4px}' +
      '.yf-steps a{flex:1;height:8px;border-radius:4px;background:var(--rule-soft,#ddd)}' +
      '.yf-steps a:hover{background:#ffb020}' +
      '.yf-steps a.on{background:#cc2b24}' +
      '.yf-pos{font-size:12px;color:var(--muted,#777)}' +
      '.yf-nav{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:14px}' +
      '.yf-nav a{display:block;padding:10px 12px;border:1px solid var(--rule-soft,#ddd);border-radius:8px;font-size:13.5px;line-height:1.5}' +
      '.yf-nav a:hover{border-color:#cc2b24}' +
      '.yf-nav small{display:block;font-size:11.5px;font-weight:700;color:var(--muted,#777);margin-bottom:2px}' +
      '.yf-nav .pv{text-align:right;grid-column:2}' +
      '.yf-more{display:inline-block;margin-top:12px;font-size:12.5px;font-weight:700;color:#cc2b24 !important}' +
      '.yf-more:hover{text-decoration:underline}' +
      '.yf-rel{list-style:none;margin:10px 0 0;padding:0}' +
      '.yf-rel li{padding:9px 0;border-bottom:1px dashed var(--rule-soft,#ddd);font-size:14.5px;line-height:1.5}' +
      '.yf-rel li:last-child{border-bottom:none}' +
      '.yf-rel .g{font-weight:700;font-size:12px;margin-right:6px;color:#cc2b24}' +
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

    // 2-1) 기사 목차: 소제목이 3개 이상인 긴 기사에서만. 눌러 해당 소제목으로 이동하고, 읽는 위치를 따라 강조한다.
    (function () {
      var main = page.querySelector('main') || page;
      var hs = Array.prototype.filter.call(main.querySelectorAll('h2'), function (h) {
        return !h.closest('.yf-end,.yf-top,nav,footer,aside,.yf-box,.yf-card') && h.textContent.trim();
      });
      if (hs.length < 3 || document.querySelector('.yf-toc')) return;
      hs.forEach(function (h, i) { if (!h.id) h.id = 'sec-' + (i + 1); });
      var det = document.createElement('details');
      det.className = 'yf-toc';
      det.innerHTML = '<summary>기사 목차 · ' + hs.length + '개 대목</summary><ol>' + hs.map(function (h) {
        return '<li><a href="#' + esc(h.id) + '">' + esc(h.textContent.trim()) + '</a></li>';
      }).join('') + '</ol>';
      var after = page.querySelector('.byline') || page.querySelector('.subhead') || page.querySelector('h1');
      if (!after) return;
      after.parentNode.insertBefore(det, after.nextSibling);
      if (!window.matchMedia || !matchMedia('(max-width:640px)').matches) det.open = true;
      if ('IntersectionObserver' in window) {
        var links = det.querySelectorAll('a');
        var io = new IntersectionObserver(function (es) {
          es.forEach(function (en) {
            if (!en.isIntersecting) return;
            Array.prototype.forEach.call(links, function (a) { a.classList.toggle('on', a.getAttribute('href') === '#' + en.target.id); });
          });
        }, { rootMargin: '-10% 0px -75% 0px' });
        hs.forEach(function (h) { io.observe(h); });
      }
    })();

    // 3) 공유·링크 복사 (모바일에서는 기기 공유창에 카카오톡 등이 뜬다)
    var canon = document.querySelector('link[rel="canonical"]');
    var shareUrl = (canon && canon.href) || location.href.split('#')[0];
    var end = document.createElement('div');
    end.className = 'yf-end';
    end.innerHTML = '<div class="yf-share"><b>이 기사 공유하기</b>' +
      '<button type="button" data-a="mark">☆ 저장</button><button type="button" data-a="share">공유</button><button type="button" data-a="copy">링크 복사</button>' +
      '<button type="button" data-a="fb">페이스북</button><button type="button" data-a="x">X</button><button type="button" data-a="band">밴드</button></div><div class="yf-slot"></div>';
    (page.querySelector('main') || page).appendChild(end);
    window.__yfArticle = { cur: cur, end: end, page: page };
    document.dispatchEvent(new CustomEvent('yf:article'));
    if (lsGet('yf-bookmarks').indexOf(cur.url) !== -1) end.querySelector('[data-a="mark"]').textContent = '★ 저장됨';
    end.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('button[data-a]') : null;
      if (!b) return;
      function copy() {
        var done = function () { var o = b.textContent; b.textContent = '복사됨 ✓'; setTimeout(function () { b.textContent = o; }, 1800); };
        if (navigator.clipboard) navigator.clipboard.writeText(shareUrl).then(done, function () { window.prompt('링크를 복사하세요', shareUrl); });
        else window.prompt('링크를 복사하세요', shareUrl);
      }
      if (b.dataset.a === 'mark') {
        var bm = lsGet('yf-bookmarks'), at = bm.indexOf(cur.url);
        if (at === -1) bm.unshift(cur.url); else bm.splice(at, 1);
        lsSet('yf-bookmarks', bm.slice(0, 100));
        if (window.yfTrack && at === -1) window.yfTrack('bookmark', { label: cur.tag });
        b.textContent = at === -1 ? '★ 저장됨' : '☆ 저장';
        return;
      }
      if (window.yfTrack) window.yfTrack('share', { label: b.dataset.a });
      var q = encodeURIComponent(shareUrl), t = encodeURIComponent(cur.title);
      var out = { fb: 'https://www.facebook.com/sharer/sharer.php?u=' + q,
        x: 'https://twitter.com/intent/tweet?url=' + q + '&text=' + t,
        band: 'https://band.us/plugin/share?body=' + t + '%0A' + q + '&route=' + encodeURIComponent(location.hostname) }[b.dataset.a];
      if (out) { window.open(out, '_blank', 'noopener,width=640,height=560'); return; }
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
      '.yf-card .ty{display:inline-block;font:400 12px "Do Hyeon","Noto Sans KR",sans-serif;color:#fff;background:#cc2b24;border-radius:8px 2px 8px 2px;padding:1px 9px}' +
      '.yf-card h4{margin:6px 0 6px;font:700 16px/1.4 "Noto Serif KR",serif;color:var(--ink,#111);padding:0;border:0}' +
      '.yf-card p{margin:0;font-size:13.5px;line-height:1.7;color:var(--ink,#111)}' +
      '.yf-card .nt{margin-top:6px;font-size:11.5px;color:var(--muted,#777)}' +
      '.yf-card .src{margin-top:10px;padding-top:8px;border-top:1px dashed var(--rule-soft,#ccc);font-size:12.5px}' +
      '.yf-card .src b{display:block;font-size:11.5px;color:var(--muted,#777);margin-bottom:2px}' +
      '.yf-card .src a{display:block;padding:2px 0;color:#cc2b24;text-decoration:none}' +
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

  YF.mods['site-article'] = initArticleExtras;
})(window.YF);
