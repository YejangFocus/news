/* 오늘의 말씀 띠: 날짜별로 구절이 바뀐다. (index.html과 하위 페이지 공통) */
(function () {
  var V = [
    ['너희는 세상의 빛이라', '마태복음 5:14'],
    ['진리를 알지니 진리가 너희를 자유롭게 하리라', '요한복음 8:32'],
    ['오직 정의를 물같이, 공의를 마르지 않는 강같이 흐르게 할지로다', '아모스 5:24'],
    ['오직 사랑 안에서 참된 것을 하여', '에베소서 4:15'],
    ['주의 말씀은 내 발에 등이요 내 길에 빛이니이다', '시편 119:105'],
    ['화평하게 하는 자는 복이 있나니', '마태복음 5:9'],
    ['하나님의 말씀은 살아 있고 활력이 있어', '히브리서 4:12']
  ];
  var d = new Date(), day = Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 864e5);
  var v = V[day % V.length];
  var t = document.getElementById('vbText'), r = document.getElementById('vbRef');
  if (t && r) { t.textContent = v[0]; r.textContent = v[1]; }
})();
