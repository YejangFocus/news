// 독자 확보·운영 기능 모음 (site.js 가 모든 페이지에서 불러온다)
//   - PWA: 매니페스트·아이콘 연결, 서비스워커 등록, "앱 설치" 버튼
//   - 방문 통계(GA4·GoatCounter·네이버): data/site-config.json 에 ID를 넣으면 켜진다
//   - 구독 안내 상자(뉴스레터·카카오 채널·예포TV·RSS), 푸터 링크 연결
//   - 기사 제보·정정 청구 링크, 의견란(giscus, 설정 시)
(function () {
  var root = typeof window.SITE_ROOT === 'string' ? window.SITE_ROOT : '/';
  var cfg = {}, installEvt = null;
  var YOUTUBE = 'https://www.youtube.com/@%EC%98%88%EC%9E%A5%ED%8F%AC%EC%BB%A4%EC%8A%A4';
  var TIP = '/%EB%A9%94%EC%9D%B8%ED%99%94%EB%A9%B4/%EA%B8%B0%EC%82%AC%EC%A0%9C%EB%B3%B4.html';

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function addHead(tag, attrs) {
    var sel = tag === 'link' ? 'link[rel="' + attrs.rel + '"]' : 'meta[name="' + attrs.name + '"]';
    if (document.head.querySelector(sel)) return;
    var el = document.createElement(tag);
    for (var k in attrs) el.setAttribute(k, attrs[k]);
    document.head.appendChild(el);
  }

  // ── PWA ─────────────────────────────────────────────────────────────────
  addHead('link', { rel: 'manifest', href: '/manifest.webmanifest' });
  addHead('meta', { name: 'theme-color', content: '#16294f' });
  addHead('link', { rel: 'apple-touch-icon', href: '/assets/icons/apple-touch-icon.png' });
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/sw.js').catch(function () { /* 설치 실패는 조용히 무시 */ });
    });
  }
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    installEvt = e;
    document.querySelectorAll('[data-yf-install]').forEach(function (b) { b.hidden = false; });
    addFooterInstall();
  });
  window.addEventListener('appinstalled', function () {
    track('app_install');
    installEvt = null;
    document.querySelectorAll('[data-yf-install]').forEach(function (b) { b.hidden = true; });
  });
  function doInstall() {
    if (!installEvt) return;
    installEvt.prompt();
    installEvt.userChoice.then(function () { installEvt = null; document.querySelectorAll('[data-yf-install]').forEach(function (b) { b.hidden = true; }); });
  }
  function addFooterInstall() {
    var links = document.querySelector('.flinks');
    if (!links || links.querySelector('[data-yf-install]')) return;
    var a = document.createElement('a');
    a.href = '#'; a.textContent = '앱 설치'; a.setAttribute('data-yf-install', '');
    a.addEventListener('click', function (e) { e.preventDefault(); doInstall(); });
    links.appendChild(a);
  }

  // ── 방문 통계 ───────────────────────────────────────────────────────────
  var analyticsOn = false;
  function initAnalytics() {
    var a = cfg.analytics || {};
    if (!a.provider || !a.id) return;
    if (navigator.doNotTrack === '1' || window.doNotTrack === '1') return;   // 추적 거부 설정을 존중한다
    function script(src, attrs, onload) {
      var s = document.createElement('script'); s.async = true; s.src = src;
      for (var k in (attrs || {})) s.setAttribute(k, attrs[k]);
      if (onload) s.onload = onload;
      document.head.appendChild(s);
    }
    if (a.provider === 'ga4') {
      window.dataLayer = window.dataLayer || [];
      window.gtag = function () { window.dataLayer.push(arguments); };
      window.gtag('js', new Date());
      window.gtag('config', a.id);
      script('https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(a.id));
      analyticsOn = true;
    } else if (a.provider === 'goatcounter') {
      script('https://gc.zgo.at/count.js', { 'data-goatcounter': 'https://' + a.id + '.goatcounter.com/count' });
      analyticsOn = true;
    } else if (a.provider === 'naver') {
      window.wcs_add = window.wcs_add || {};
      window.wcs_add.wa = a.id;
      script('https://wcs.naver.net/wcslog.js', null, function () { if (window.wcs) { window.wcs.inflow(); window.wcs_do(); } });
      analyticsOn = true;
    }
  }
  // 읽힌 기사·공유·저장 같은 행동을 기록한다(통계 도구가 켜져 있을 때만).
  function track(name, params) {
    if (!analyticsOn) return;
    var a = cfg.analytics || {};
    try {
      if (a.provider === 'ga4' && window.gtag) window.gtag('event', name, params || {});
      else if (a.provider === 'goatcounter' && window.goatcounter && window.goatcounter.count) {
        window.goatcounter.count({ path: 'event/' + name + (params && params.label ? '/' + params.label : ''), title: name, event: true });
      }
    } catch (e) { /* 통계 오류가 화면에 영향을 주지 않게 한다 */ }
  }
  window.yfTrack = track;

  // ── 푸터 링크 ───────────────────────────────────────────────────────────
  function fixFooter() {
    document.querySelectorAll('.flinks a').forEach(function (a) {
      var t = a.textContent.trim();
      if (t === '기사 제보') a.href = TIP;
      if (t === '구독 신청' && cfg.newsletter && cfg.newsletter.url) { a.href = cfg.newsletter.url; a.target = '_blank'; a.rel = 'noopener'; }
    });
    var links = document.querySelector('.flinks');
    if (links && cfg.kakaoChannel && !links.querySelector('[data-yf-kakao]')) {
      var k = document.createElement('a');
      k.href = cfg.kakaoChannel; k.target = '_blank'; k.rel = 'noopener'; k.textContent = '카카오톡 채널';
      k.setAttribute('data-yf-kakao', '');
      links.appendChild(k);
    }
    if (installEvt) addFooterInstall();
  }

  // ── 구독 안내 상자 ──────────────────────────────────────────────────────
  var BOX_CSS = '.yf-sub{margin:22px 0 0;padding:18px 20px;border:2px solid #111;border-radius:4px 16px 4px 16px;box-shadow:4px 4px 0 #111;background:var(--paper,#fff);font-family:"Noto Sans KR",sans-serif;color:var(--ink,#111)}' +
    '.yf-sub b{font:400 17px "Do Hyeon","Noto Sans KR",sans-serif}.yf-sub p{margin:4px 0 12px;font-size:13.5px;color:var(--muted,#555)}' +
    '.yf-sub .row{display:flex;flex-wrap:wrap;gap:8px}.yf-sub .row a,.yf-sub .row button{font:700 13px "Noto Sans KR",sans-serif;padding:7px 14px;border:2px solid #111;border-radius:14px 3px 14px 3px;background:var(--paper,#fff);color:var(--ink,#111);cursor:pointer;text-decoration:none;box-shadow:2px 2px 0 #111}' +
    '.yf-sub .row a:hover,.yf-sub .row button:hover{background:#ffe38a;color:#1c1a16}.yf-sub .row .pri{background:#16294f;color:#fff}.yf-sub .row .pri:hover{background:#0f1d3a;color:#fff}' +
    '.yf-sub small{display:block;margin-top:12px;font-size:12px;color:var(--muted,#777)}.yf-sub small a{text-decoration:underline}' +
    '.yf-cmt{margin:26px 0 0;font-family:"Noto Sans KR",sans-serif}.yf-cmt h3{margin:0 0 4px;font:400 17px "Do Hyeon","Noto Sans KR",sans-serif}.yf-cmt p{margin:0 0 10px;font-size:12.5px;color:var(--muted,#777)}' +
    '@media print{.yf-sub,.yf-cmt{display:none}}';
  function subBox(articleUrl) {
    var n = cfg.newsletter || {};
    var mail = n.url || ('mailto:' + (n.email || 'owenpej@naver.com') + '?subject=' + encodeURIComponent('[구독 신청]'));
    var ext = n.url ? ' target="_blank" rel="noopener"' : '';
    var tip = TIP + (articleUrl ? '?type=' + encodeURIComponent('정정 요청') + '&url=' + encodeURIComponent(articleUrl) : '');
    var d = document.createElement('div');
    d.className = 'yf-sub';
    d.innerHTML = '<b>예장포커스 소식 받아보기</b><p>총회·교계 소식을 놓치지 않도록, 편한 방법으로 구독하세요.</p><div class="row">' +
      '<a class="pri" href="' + esc(mail) + '"' + ext + ' data-t="subscribe_email">이메일 구독</a>' +
      (cfg.kakaoChannel ? '<a href="' + esc(cfg.kakaoChannel) + '" target="_blank" rel="noopener" data-t="subscribe_kakao">카카오톡 채널</a>' : '') +
      '<a href="' + YOUTUBE + '" target="_blank" rel="noopener" data-t="subscribe_youtube">예포TV 구독</a>' +
      '<a href="' + esc(root) + 'feed.xml" data-t="subscribe_rss">RSS</a>' +
      '<button type="button" data-yf-install hidden>앱 설치</button></div>' +
      '<small>기사 제보나 잘못된 내용 신고는 <a href="' + tip + '">제보·정정 요청</a>에서 받습니다.</small>';
    d.addEventListener('click', function (e) {
      var a = e.target.closest ? e.target.closest('[data-t]') : null;
      if (a) track(a.getAttribute('data-t'));
      if (e.target.closest && e.target.closest('[data-yf-install]')) doInstall();
    });
    if (installEvt) d.querySelector('[data-yf-install]').hidden = false;
    return d;
  }
  function addCss() {
    if (document.getElementById('yf-reader-css')) return;
    var st = document.createElement('style'); st.id = 'yf-reader-css'; st.textContent = BOX_CSS; document.head.appendChild(st);
  }

  // ── 기사 페이지: 구독 상자 + 의견란 + 끝까지 읽음 기록 ─────────────────────
  function onArticle() {
    var ctx = window.__yfArticle;
    if (!ctx || ctx.done) return;
    ctx.done = true;
    addCss();
    ctx.end.appendChild(subBox(ctx.cur.url));
    track('article_view', { label: ctx.cur.tag });

    var g = cfg.giscus || {};
    if (g.repo && g.repoId && g.category && g.categoryId) {
      var c = document.createElement('div');
      c.className = 'yf-cmt';
      c.innerHTML = '<h3>독자 의견</h3><p>의견은 GitHub 계정으로 남길 수 있습니다. 비방·허위 사실·사생활 침해 글은 예고 없이 삭제될 수 있습니다.</p>';
      var s = document.createElement('script');
      s.src = 'https://giscus.app/client.js'; s.async = true; s.crossOrigin = 'anonymous';
      var at = { 'data-repo': g.repo, 'data-repo-id': g.repoId, 'data-category': g.category, 'data-category-id': g.categoryId,
        'data-mapping': 'pathname', 'data-strict': '1', 'data-reactions-enabled': '1', 'data-emit-metadata': '0',
        'data-input-position': 'top', 'data-theme': 'light', 'data-lang': 'ko', 'data-loading': 'lazy' };
      for (var k in at) s.setAttribute(k, at[k]);
      c.appendChild(s);
      ctx.end.appendChild(c);
    }

    // 본문을 90% 이상 내려 읽으면 '끝까지 읽음'으로 한 번만 기록한다.
    var sent = false;
    window.addEventListener('scroll', function () {
      if (sent) return;
      var r = ctx.page.getBoundingClientRect(), total = r.height - window.innerHeight;
      if (total > 0 && -r.top / total >= 0.9) { sent = true; track('read_complete', { label: ctx.cur.tag }); }
    }, { passive: true });
  }

  // ── 주간 브리핑 페이지: 구독 상자 ─────────────────────────────────────────
  function onBriefing() {
    var br = document.getElementById('briefing');
    if (!br || document.querySelector('.yf-sub')) return;
    addCss();
    br.parentNode.insertBefore(subBox(''), br);
  }

  // ── 시작 ────────────────────────────────────────────────────────────────
  fetch(root + 'data/site-config.json')
    .then(function (r) { return r.ok ? r.json() : {}; })
    .catch(function () { return {}; })
    .then(function (c) {
      cfg = c || {};
      initAnalytics();
      fixFooter();
      onBriefing();
      if (window.__yfArticle) onArticle();
      document.addEventListener('yf:article', onArticle);
    });
})();
