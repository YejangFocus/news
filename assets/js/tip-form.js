// 기사 제보·정정 요청 폼(기사제보.html)
//   ?type=정정 요청&url=기사주소  로 열면 종류와 기사 주소가 미리 채워진다.
//   data/site-config.json 의 form.endpoint(Formspree 등)가 있으면 그 주소로 전송하고,
//   없으면 작성 내용이 들어간 이메일 작성창을 연다(별도 계정 없이도 동작).
(function () {
  var form = document.getElementById('tipForm');
  if (!form) return;
  var out = document.getElementById('tipOut');
  var params = new URLSearchParams(location.search);
  var type = form.elements.type, url = form.elements.url;
  if (params.get('type')) {
    for (var i = 0; i < type.options.length; i++) if (type.options[i].value === params.get('type')) type.selectedIndex = i;
  }
  if (params.get('url')) url.value = params.get('url');

  var CLAIM = ['정정보도 청구', '반론보도 청구', '추후보도 청구'];
  function sync() {
    var claim = CLAIM.indexOf(type.value) !== -1;
    ['name', 'address', 'contact'].forEach(function (n) {
      form.elements[n].required = claim;
      var lab = document.querySelector('label[for="tip-' + n + '"] .req');
      if (lab) lab.hidden = !claim;
    });
    document.getElementById('tipClaimNote').hidden = !claim;
  }
  type.addEventListener('change', sync);
  sync();

  var cfg = {};
  fetch('/data/site-config.json').then(function (r) { return r.ok ? r.json() : {}; }).catch(function () { return {}; })
    .then(function (c) { cfg = c || {}; });

  function summary(d) {
    return '[' + d.type + ']\n' +
      (d.url ? '기사 주소: ' + d.url + '\n' : '') +
      '\n' + d.message + '\n\n' +
      '— 보내는 사람 —\n이름: ' + (d.name || '(미기재)') + '\n연락처: ' + (d.contact || '(미기재)') + '\n주소: ' + (d.address || '(미기재)') + '\n';
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (form.elements.website.value) return;                // 스팸 봇이 채우는 숨김 칸
    if (!form.reportValidity()) return;
    var d = {};
    ['type', 'url', 'message', 'name', 'contact', 'address'].forEach(function (n) { d[n] = form.elements[n].value.trim(); });
    var endpoint = (cfg.form && cfg.form.endpoint) || '';
    var email = (cfg.form && cfg.form.email) || 'owenpej@naver.com';
    var btn = form.querySelector('button[type=submit]');
    if (endpoint) {
      btn.disabled = true; out.textContent = '보내는 중입니다…';
      fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }, body: JSON.stringify(d) })
        .then(function (r) {
          if (!r.ok) throw new Error(r.status);
          out.innerHTML = '<b>접수되었습니다.</b> 확인 후 남겨 주신 연락처로 안내드리겠습니다.';
          form.reset(); sync();
          window.yfTrack && window.yfTrack('tip_submit', { label: d.type });
        })
        .catch(function () { out.innerHTML = '전송하지 못했습니다. 잠시 후 다시 시도하시거나 <a href="mailto:' + email + '">' + email + '</a> 으로 보내 주세요.'; })
        .then(function () { btn.disabled = false; });
    } else {
      location.href = 'mailto:' + email + '?subject=' + encodeURIComponent('[' + d.type + '] ' + (d.message.slice(0, 30))) + '&body=' + encodeURIComponent(summary(d));
      out.innerHTML = '이메일 작성창이 열렸습니다. 열리지 않으면 <a href="mailto:' + email + '">' + email + '</a> 으로 직접 보내 주세요. 첨부 파일이 있으면 이메일에 함께 붙여 주세요.';
      window.yfTrack && window.yfTrack('tip_submit', { label: d.type });
    }
  });
})();
