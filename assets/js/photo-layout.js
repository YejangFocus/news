// 기사 본문 사진 배치 — 세로형 사진이 연달아 나오면 두 장씩 나란히 배치한다.
//  - 같은 부모 안에서 <figure>끼리 바로 이어진 경우에만 묶는다(사이에 문단이 있으면 묶지 않음).
//  - 연속된 세로형(높이 > 너비) 사진이 2장 이상일 때만 두 장씩 짝지으며, 남는 1장은 그대로 둔다.
//  - 좁은 화면(모바일)에서는 한 줄에 한 장씩 보여준다.
//  - 이벤트·마크업 수정 없이 새 기사에도 자동 적용된다.
(function () {
  var st = document.createElement('style');
  st.textContent = [
    '.yf-fig-row{display:flex;gap:14px;align-items:flex-start;justify-content:center;margin:30px 0}',
    '.yf-fig-row>figure{flex:1 1 0;min-width:0;margin:0}',
    '.yf-fig-row>figure img{max-height:520px}',
    '@media (max-width:560px){.yf-fig-row{flex-direction:column;align-items:stretch;gap:0}',
    '.yf-fig-row>figure{margin:15px 0}}'
  ].join('\n');
  document.head.appendChild(st);

  function ready(img) {
    img.loading = 'eager'; // 지연 로딩 사진도 크기를 알아야 배치할 수 있다
    return new Promise(function (res) {
      if (img.complete && img.naturalWidth) return res();
      img.addEventListener('load', res, { once: true });
      img.addEventListener('error', res, { once: true });
    });
  }
  function isPortrait(fig) {
    var img = fig.querySelector('img');
    return !!img && img.naturalHeight > img.naturalWidth * 1.05;
  }

  function layout() {
    var figs = Array.prototype.slice.call(document.querySelectorAll('figure'))
      .filter(function (f) { return f.querySelector('img') && !f.closest('.yf-fig-row'); });
    Promise.all(figs.map(function (f) { return ready(f.querySelector('img')); })).then(function () {
      var i = 0;
      while (i < figs.length) {
        // 서로 바로 이어진(형제) 세로형 사진 묶음 찾기
        var run = [figs[i]];
        while (i + run.length < figs.length &&
               run[run.length - 1].nextElementSibling === figs[i + run.length]) run.push(figs[i + run.length]);
        var n = run.length;
        i += n;
        var j = 0;
        while (j < n) {
          var a = run[j], b = run[j + 1];
          if (b && isPortrait(a) && isPortrait(b)) {
            var row = document.createElement('div');
            row.className = 'yf-fig-row';
            a.parentNode.insertBefore(row, a);
            row.appendChild(a);
            row.appendChild(b);
            j += 2;
          } else {
            j += 1;
          }
        }
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', layout);
  else layout();
})();
