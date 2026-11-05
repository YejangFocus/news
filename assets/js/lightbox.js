// ── 기사 본문 사진 확대 보기(라이트박스) ─────────────────────────────────
// 기사 본문의 <figure> 사진을 클릭하면 화면 전체에 사진을 띄운다.
//  - 처음엔 화면에 맞춰 보여주고, 사진을 다시 클릭(탭)하면 원본 크기로 보여준다
//    (원본이 화면보다 크면 스크롤/드래그로 이동). 한 번 더 클릭하면 화면 맞춤으로 복귀.
//  - 닫기: 배경 클릭, 오른쪽 위 ✕ 버튼, ESC 키.
// 이벤트 위임으로 동작하므로 기사 HTML을 따로 고칠 필요 없이 새 기사에도 자동 적용된다.
(function () {
  var SELECTOR = 'figure img';
  var overlay, scroller, bigImg, caption, hint;
  var lastFocus = null;

  function injectStyle() {
    var css = [
      SELECTOR + '{cursor:zoom-in}',
      '.yf-lb{position:fixed;inset:0;z-index:99999;display:none;background:rgba(0,0,0,.92)}',
      '.yf-lb.open{display:block}',
      '.yf-lb-scroll{position:absolute;inset:0;overflow:auto;-webkit-overflow-scrolling:touch;display:flex;padding:48px 16px 64px;box-sizing:border-box}',
      '.yf-lb-scroll img{margin:auto;display:block;max-width:100%;max-height:100%;width:auto;height:auto;cursor:zoom-in;background:#fff}',
      '.yf-lb.orig .yf-lb-scroll img{max-width:none;max-height:none;cursor:zoom-out}',
      '.yf-lb-close{position:fixed;top:10px;right:14px;z-index:2;width:40px;height:40px;border:0;border-radius:50%;background:rgba(255,255,255,.18);color:#fff;font-size:24px;line-height:40px;cursor:pointer}',
      '.yf-lb-close:hover{background:rgba(255,255,255,.32)}',
      '.yf-lb-bar{position:fixed;left:0;right:0;bottom:0;z-index:2;padding:10px 16px;color:#eee;font-size:13px;line-height:1.5;text-align:center;background:linear-gradient(transparent,rgba(0,0,0,.75));pointer-events:none}',
      '.yf-lb-hint{display:block;margin-top:2px;color:#bbb;font-size:12px}'
    ].join('\n');
    var st = document.createElement('style');
    st.textContent = css;
    document.head.appendChild(st);
  }

  function build() {
    overlay = document.createElement('div');
    overlay.className = 'yf-lb';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', '사진 확대 보기');
    overlay.innerHTML =
      '<button type="button" class="yf-lb-close" aria-label="닫기">&times;</button>' +
      '<div class="yf-lb-scroll"><img alt=""></div>' +
      '<div class="yf-lb-bar"><span class="yf-lb-cap"></span><span class="yf-lb-hint"></span></div>';
    document.body.appendChild(overlay);
    scroller = overlay.querySelector('.yf-lb-scroll');
    bigImg = scroller.querySelector('img');
    caption = overlay.querySelector('.yf-lb-cap');
    hint = overlay.querySelector('.yf-lb-hint');

    overlay.querySelector('.yf-lb-close').addEventListener('click', close);
    // 사진 바깥(배경)을 누르면 닫고, 사진을 누르면 화면맞춤 ↔ 원본크기 전환
    scroller.addEventListener('click', function (e) {
      if (e.target === bigImg) toggleOriginal(); else close();
    });
  }

  function updateHint() {
    var orig = overlay.classList.contains('orig');
    hint.textContent = orig ? '사진을 누르면 화면 맞춤 · 배경을 누르거나 ESC로 닫기'
                            : '사진을 누르면 원본 크기 · 배경을 누르거나 ESC로 닫기';
  }

  function toggleOriginal() {
    overlay.classList.toggle('orig');
    scroller.scrollTop = 0;
    scroller.scrollLeft = 0;
    updateHint();
  }

  function open(img) {
    if (!overlay) build();
    lastFocus = document.activeElement;
    // 지연 로딩·축소본(data-full)이 있으면 원본 주소를 우선 사용
    bigImg.src = img.getAttribute('data-full') || img.currentSrc || img.src;
    bigImg.alt = img.alt || '';
    var fig = img.closest('figure');
    var cap = fig && fig.querySelector('figcaption');
    caption.textContent = cap ? cap.textContent.trim() : (img.alt || '');
    overlay.classList.remove('orig');
    updateHint();
    overlay.classList.add('open');
    document.documentElement.style.overflow = 'hidden';
    overlay.querySelector('.yf-lb-close').focus();
  }

  function close() {
    if (!overlay || !overlay.classList.contains('open')) return;
    overlay.classList.remove('open', 'orig');
    bigImg.removeAttribute('src');
    document.documentElement.style.overflow = '';
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  injectStyle();
  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || t.tagName !== 'IMG' || !t.matches(SELECTOR)) return;
    if (t.closest('a')) return; // 링크가 걸린 사진은 링크 동작을 우선
    e.preventDefault();
    open(t);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') close();
  });
})();
