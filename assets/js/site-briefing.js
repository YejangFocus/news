// 예장포커스 — 주간 브리핑 페이지(#briefing)
// site.js(코어)가 필요한 페이지에서만 불러온다. 공통 도구는 window.YF 로 받는다.
(function (YF) {
  var root = YF.root,
      esc = YF.esc,
      tagColor = YF.tagColor,
      prepareIssues = YF.prepareIssues;

  // 주간 브리핑: articles.json을 월~일 주 단위로 묶어 "이번 주 이슈 · 주요 기사 · 읽어볼 글 · 하루씩 보기"를
  // 자동 편집한다. #briefing 이 있는 페이지(주간브리핑.html)에서만 동작한다.
  //  - 주소 끝에 #2026-10-26 처럼 날짜를 붙이면 그 날짜가 속한 주를 연다.
  //  - 데이터가 있는 주만 오가며, 카카오톡 등에 붙여넣을 요약 글을 복사하는 버튼이 있다.
  function renderBriefing(ARTICLE_INDEX) {
    var host = document.getElementById('briefing');
    if (!host) return;
    var DAYMS = 86400000;
    var NEWS = ['특집', '사설', '교단', '노회', '교계', '목회', '속보', '정치'];
    var READ = ['칼럼', '신학', '인물'];
    function ymd(ms) { return new Date(ms).toISOString().slice(0, 10); }
    function toMs(d) { var p = d.split('-'); return Date.UTC(+p[0], +p[1] - 1, +p[2]); }
    function weekStart(d) { var ms = toMs(d); return ms - ((new Date(ms).getUTCDay() + 6) % 7) * DAYMS; }
    function md(ms) { var d = new Date(ms); return (d.getUTCMonth() + 1) + '.' + d.getUTCDate(); }
    var DOW = ['월', '화', '수', '목', '금', '토', '일'];

    var weeks = {};
    ARTICLE_INDEX.forEach(function (a) {
      if (!a.date) return;
      var k = ymd(weekStart(a.date));
      (weeks[k] = weeks[k] || []).push(a);
    });
    var keys = Object.keys(weeks).sort();   // 오래된 주 → 최신 주
    if (!keys.length) return;

    var issuesList = [];
    fetch(root + 'data/issues.json').then(function (r) { return r.json(); })
      .then(function (iss) { issuesList = prepareIssues(iss, ARTICLE_INDEX); render(); })
      .catch(function () {});

    var cur = keys.length - 1;
    function fromHash() {
      var h = (location.hash || '').replace(/^#/, '');
      if (/^\d{4}-\d{2}-\d{2}$/.test(h)) {
        var k = ymd(weekStart(h)), i = keys.indexOf(k);
        if (i >= 0) return i;
      }
      return keys.length - 1;
    }

    function byNew(a, b) { return (b.date || '').localeCompare(a.date || '') || (Date.parse(b.uploaded) || 0) - (Date.parse(a.uploaded) || 0); }

    function render() {
      var key = keys[cur], start = toMs(key), end = start + 6 * DAYMS;
      var items = weeks[key].slice().sort(byNew);
      var range = ymd(start).replace(/-/g, '.') + ' – ' + md(end);

      // 분류별 건수
      var counts = {}, order = [];
      items.forEach(function (a) { if (!counts[a.tag]) { counts[a.tag] = 0; order.push(a.tag); } counts[a.tag]++; });
      order.sort(function (x, y) { return counts[y] - counts[x]; });

      var leads = items.filter(function (a) { return NEWS.indexOf(a.tag) >= 0; }).slice(0, 3);
      if (!leads.length) leads = items.slice(0, 1);
      var reads = items.filter(function (a) { return READ.indexOf(a.tag) >= 0 && leads.indexOf(a) < 0; }).slice(0, 3);

      var weekIssues = issuesList.map(function (it) {
        var inWeek = it.arts.filter(function (a) { return a.date >= ymd(start) && a.date <= ymd(end); });
        return inWeek.length ? { it: it, n: inWeek.length } : null;
      }).filter(Boolean);

      // 하루씩 보기
      var days = {};
      items.forEach(function (a) { (days[a.date] = days[a.date] || []).push(a); });
      var dayKeys = Object.keys(days).sort().reverse();

      function li(a) {
        return '<li><a href="' + esc(a.url) + '"><span class="g" style="color:' + tagColor(a.tag) + '">' + esc(a.tag) + '</span>' + esc(a.title) + '</a></li>';
      }

      var html = '';
      html += '<div class="br-nav"><button type="button" data-d="-1"' + (cur === 0 ? ' disabled' : '') + '>〈 이전 주</button>' +
        '<div class="br-week"><small>주간 브리핑</small><b>' + esc(range) + '</b></div>' +
        '<button type="button" data-d="1"' + (cur === keys.length - 1 ? ' disabled' : '') + '>다음 주 〉</button></div>';

      html += '<div class="br-sum"><div class="br-count"><b>' + items.length + '</b><span>건 보도</span></div><div class="br-chips">' +
        order.map(function (t) { return '<span class="br-chip" style="border-color:' + tagColor(t) + ';color:' + tagColor(t) + '">' + esc(t) + ' ' + counts[t] + '</span>'; }).join('') +
        '</div><button type="button" class="br-copy" data-copy="1">카톡용 요약 복사</button></div>';

      if (weekIssues.length) {
        html += '<div class="is-sec"><h2>이번 주 이슈</h2><span>타임라인으로 이어 읽기</span></div><div class="is-grid">' +
          weekIssues.map(function (w) {
            var is = w.it.def, link = root + '이슈.html#' + encodeURIComponent(is.id);
            return '<a class="is-card" href="' + esc(link) + '"><div class="k">' + esc(is.kicker) + '</div><h3>' + esc(is.title) + '</h3>' +
              '<div class="m"><span>이번 주 ' + w.n + '건</span><span>누적 ' + w.it.arts.length + '건</span></div></a>';
          }).join('') + '</div>';
      }

      html += '<div class="is-sec"><h2>이번 주 주요 기사</h2><span>' + leads.length + '건</span></div><div class="br-leads">' +
        leads.map(function (a, i) {
          return '<a class="br-lead' + (i === 0 ? ' first' : '') + '" href="' + esc(a.url) + '"><span class="g" style="color:' + tagColor(a.tag) + '">' + esc(a.tag) + ' · ' + esc(a.date.slice(5).replace('-', '.')) + '</span>' +
            '<h3>' + esc(a.title) + '</h3>' + (a.desc ? '<p>' + esc(a.desc) + '</p>' : '') + '</a>';
        }).join('') + '</div>';

      if (reads.length) {
        html += '<div class="is-sec"><h2>읽어볼 만한 글</h2><span>칼럼 · 신학 · 인물</span></div><ul class="br-list">' + reads.map(li).join('') + '</ul>';
      }

      html += '<div class="is-sec"><h2>하루씩 보기</h2><span>전체 ' + items.length + '건</span></div>' +
        dayKeys.map(function (d) {
          var ms = toMs(d);
          return '<div class="br-day"><div class="br-dh">' + md(ms) + ' <small>(' + DOW[(new Date(ms).getUTCDay() + 6) % 7] + ')</small></div><ul class="br-list">' + days[d].map(li).join('') + '</ul></div>';
        }).join('');

      host.innerHTML = html;
      document.title = '주간 브리핑 ' + range + ' | 예장포커스';

      Array.prototype.forEach.call(host.querySelectorAll('.br-nav button'), function (b) {
        b.addEventListener('click', function () {
          cur = Math.min(Math.max(cur + (+b.dataset.d), 0), keys.length - 1);
          history.replaceState(null, '', '#' + keys[cur]);
          render();
          window.scrollTo({ top: Math.max(host.getBoundingClientRect().top + window.scrollY - 70, 0), behavior: 'smooth' });
        });
      });
      host.querySelector('.br-copy').addEventListener('click', function () {
        var canon = document.querySelector('link[rel="canonical"]');
        var base = ((canon && canon.href) || location.href).split('#')[0];
        var lines = ['[예장포커스 주간 브리핑] ' + range, ''];
        leads.forEach(function (a) { lines.push('▶ [' + a.tag + '] ' + a.title); lines.push(a.url); lines.push(''); });
        if (weekIssues.length) { lines.push('■ 이번 주 이슈: ' + weekIssues.map(function (w) { return w.it.def.title; }).join(' / ')); lines.push(''); }
        lines.push('전체 브리핑 보기 ' + base + '#' + key);
        var text = lines.join('\n'), btn = host.querySelector('.br-copy');
        var done = function () { btn.textContent = '복사됨 ✓'; setTimeout(function () { btn.textContent = '카톡용 요약 복사'; }, 1800); };
        if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, function () { window.prompt('복사하세요', text); });
        else window.prompt('복사하세요', text);
      });
    }

    cur = fromHash();
    render();
    window.addEventListener('hashchange', function () { cur = fromHash(); render(); });
  }

  YF.mods['site-briefing'] = renderBriefing;
})(window.YF);
