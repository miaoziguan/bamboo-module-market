/* __bamboo_module_ {"id":"shichen","name":"时色","version":"0.1.0","fab":{"icon":"clock","label":"时色"},"location":"right"} */
var __bamboo_module_shichen = (function () {
  'use strict';

  // 十二时辰 → 天光配色（初稿，可后续微调）
  // hue: 色相°；lo: 明度偏移（晨昏暗、正午亮）
  var SHICHEN = [
    { d: '子', name: '夜半', range: '23–1',  hue: 225, lo: -20 },
    { d: '丑', name: '鸡鸣', range: '1–3',   hue: 230, lo: -25 },
    { d: '寅', name: '平旦', range: '3–5',   hue: 200, lo: -5  },
    { d: '卯', name: '日出', range: '5–7',   hue: 18,  lo: 5   },
    { d: '辰', name: '食时', range: '7–9',   hue: 175, lo: 10  },
    { d: '巳', name: '隅中', range: '9–11',  hue: 150, lo: 15  },
    { d: '午', name: '日中', range: '11–13', hue: 5,   lo: 20  },
    { d: '未', name: '日昃', range: '13–15', hue: 45,  lo: 12  },
    { d: '申', name: '晡时', range: '15–17', hue: 35,  lo: 5   },
    { d: '酉', name: '日入', range: '17–19', hue: 345, lo: -5  },
    { d: '戌', name: '黄昏', range: '19–21', hue: 280, lo: -15 },
    { d: '亥', name: '人定', range: '21–23', hue: 250, lo: -22 }
  ];

  var state = { pinned: -1, fine: 0, timer: null };
  var el = {};
  var api = null;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerpHue(h1, h2, t) { var d = ((h2 - h1 + 540) % 360) - 180; return (h1 + d * t + 360) % 360; }

  // 当前时刻（0–24h）在两相邻时辰间插值出的天色
  function colorAtTime(date) {
    var h = date.getHours() + date.getMinutes() / 60;
    var idx = Math.floor(h / 2) % 12;
    var frac = (h - idx * 2) / 2;
    var a = SHICHEN[idx], b = SHICHEN[(idx + 1) % 12];
    return { hue: lerpHue(a.hue, b.hue, frac), lo: a.lo + (b.lo - a.lo) * frac, idx: idx };
  }

  function applyColor(hue, lo) {
    if (api && api.setTheme) api.setTheme({ hue: Math.round(hue), lightnessOffset: Math.round(lo) });
  }

  function polar(cx, cy, r, deg) {
    var rad = (deg - 90) * Math.PI / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  }
  function slicePath(cx, cy, r, a0, a1) {
    var p0 = polar(cx, cy, r, a0), p1 = polar(cx, cy, r, a1);
    return 'M ' + cx + ' ' + cy + ' L ' + p0.x.toFixed(2) + ' ' + p0.y.toFixed(2) +
      ' A ' + r + ' ' + r + ' 0 0 1 ' + p1.x.toFixed(2) + ' ' + p1.y.toFixed(2) + ' Z';
  }

  function buildDial() {
    var N = SHICHEN.length, R = 92, cx = 100, cy = 100, svg = '<svg class="sc-dial" viewBox="0 0 200 200">';
    for (var i = 0; i < N; i++) {
      var center = i * (360 / N), a0 = center - 15, a1 = center + 15;
      var fill = 'hsl(' + SHICHEN[i].hue + ',42%,' + clamp(50 + SHICHEN[i].lo * 0.7, 14, 92) + '%)';
      svg += '<path class="sc-slice" data-i="' + i + '" d="' + slicePath(cx, cy, R, a0, a1) +
        '" fill="' + fill + '" stroke="rgba(0,0,0,.18)" stroke-width="1"></path>';
      var tp = polar(cx, cy, R * 0.62, center);
      svg += '<text class="sc-d" x="' + tp.x.toFixed(1) + '" y="' + tp.y.toFixed(1) +
        '" text-anchor="middle" dominant-baseline="central" data-i="' + i + '">' + SHICHEN[i].d + '</text>';
    }
    svg += '<g class="sc-now"><circle class="sc-now-dot" r="4"></circle></g>';
    svg += '<circle class="sc-hub" cx="100" cy="100" r="30"></circle>';
    svg += '<text class="sc-hub-name" x="100" y="95" text-anchor="middle" dominant-baseline="central"></text>';
    svg += '<text class="sc-hub-range" x="100" y="112" text-anchor="middle" dominant-baseline="central"></text>';
    svg += '</svg>';
    return svg;
  }

  function render() {
    el.root.innerHTML =
      '<div class="sc-wrap">' +
        '<div class="sc-stage">' + buildDial() + '</div>' +
        '<div class="sc-bar">' +
          '<button class="sc-mode" type="button"></button>' +
          '<div class="sc-fine"><span>明</span>' +
            '<input class="sc-fine-input" type="range" min="-30" max="30" step="1" value="' + state.fine + '" />' +
            '<span>度</span></div>' +
        '</div>' +
        '<div class="sc-tip">拨色环取一天天色 · 点中心钉/放</div>' +
      '</div>';
    el.wrap = el.root.querySelector('.sc-wrap');
    el.dial = el.root.querySelector('.sc-dial');
    el.modeBtn = el.root.querySelector('.sc-mode');
    el.fineInput = el.root.querySelector('.sc-fine-input');
    bind();
    applyVisual();
  }

  function bind() {
    if (el.dial) el.dial.addEventListener('click', onDialClick);
    if (el.modeBtn) el.modeBtn.addEventListener('click', function () {
      setPinned(state.pinned >= 0 ? -1 : currentIndex());
    });
    if (el.fineInput) el.fineInput.addEventListener('input', function () {
      state.fine = parseInt(el.fineInput.value, 10) || 0; pushColor(); save();
    });
  }

  function onDialClick(e) {
    var t = e.target;
    if (t && (t.classList.contains('sc-hub') || t.classList.contains('sc-hub-name') || t.classList.contains('sc-hub-range'))) {
      setPinned(state.pinned >= 0 ? -1 : currentIndex()); return;
    }
    var i = t && t.getAttribute ? t.getAttribute('data-i') : null;
    if (i == null && t && t.parentNode) i = t.parentNode.getAttribute ? t.parentNode.getAttribute('data-i') : null;
    if (i == null) return;
    i = parseInt(i, 10);
    setPinned(state.pinned === i ? -1 : i);
  }

  function currentIndex() {
    var h = new Date().getHours() + new Date().getMinutes() / 60;
    return Math.floor(h / 2) % 12;
  }

  function setPinned(i) { state.pinned = i; pushColor(); save(); }

  function pushColor() {
    var c;
    if (state.pinned >= 0) c = { hue: SHICHEN[state.pinned].hue, lo: SHICHEN[state.pinned].lo + state.fine };
    else { c = colorAtTime(new Date()); c.lo += state.fine; }
    applyColor(c.hue, c.lo); updateHub();
  }

  function updateHub() {
    if (el.dial) {
      var slices = el.dial.querySelectorAll('.sc-slice');
      for (var k = 0; k < slices.length; k++)
        slices[k].classList.toggle('sel', state.pinned >= 0 && parseInt(slices[k].getAttribute('data-i'), 10) === state.pinned);
    }
    var idx = state.pinned >= 0 ? state.pinned : currentIndex();
    var s = SHICHEN[idx];
    var n = el.root.querySelector('.sc-hub-name'), r = el.root.querySelector('.sc-hub-range');
    if (n) n.textContent = s.d + '·' + s.name;
    if (r) r.textContent = state.pinned >= 0 ? '已钉' : s.range;
    if (el.modeBtn) el.modeBtn.textContent = state.pinned >= 0 ? '已钉 · 点放' : '随天 · 点钉';
  }

  function updateNowMarker() {
    if (!el.dial) return;
    var h = new Date().getHours() + new Date().getMinutes() / 60;
    var p = polar(100, 100, 100, (h / 24) * 360);
    var dot = el.dial.querySelector('.sc-now-dot');
    if (dot) { dot.setAttribute('cx', p.x.toFixed(2)); dot.setAttribute('cy', p.y.toFixed(2)); }
  }

  function applyVisual() { updateNowMarker(); updateHub(); pushColor(); }
  function tick() { updateNowMarker(); if (state.pinned < 0) pushColor(); }

  function startTimer() { stopTimer(); state.timer = setInterval(tick, 30000); }
  function stopTimer() { if (state.timer) { clearInterval(state.timer); state.timer = null; } }

  function save() { if (api && api.saveData) api.saveData({ pinned: state.pinned, fine: state.fine }); }
  function load(cb) {
    if (api && api.loadData) api.loadData().then(function (d) {
      if (d && typeof d === 'object') {
        if (typeof d.pinned === 'number') state.pinned = d.pinned;
        if (typeof d.fine === 'number') state.fine = d.fine;
      }
      cb && cb();
    }).catch(function () { cb && cb(); });
    else cb && cb();
  }

  function injectStyle() {
    if (document.getElementById('sc-style')) return;
    var s = document.createElement('style'); s.id = 'sc-style';
    s.textContent =
      '.sc-wrap{font-family:inherit;color:var(--text-normal,#333);user-select:none;}' +
      '.sc-stage{display:flex;justify-content:center;padding:8px 4px 2px;}' +
      '.sc-dial{width:100%;max-width:200px;height:auto;display:block;}' +
      '.sc-slice{cursor:pointer;transition:filter .2s,opacity .2s;opacity:.92;}' +
      '.sc-slice:hover{opacity:1;filter:brightness(1.08);}' +
      '.sc-slice.sel{opacity:1;stroke:#fff;stroke-width:2.5;}' +
      '.sc-d{fill:#fff;font-size:13px;font-weight:600;pointer-events:none;paint-order:stroke;stroke:rgba(0,0,0,.4);stroke-width:.6px;}' +
      '.sc-now-dot{fill:#fff;stroke:#222;stroke-width:1.2;}' +
      '.sc-hub{fill:rgba(255,255,255,.82);stroke:rgba(0,0,0,.18);stroke-width:1;cursor:pointer;}' +
      '.sc-hub-name{fill:#222;font-size:12px;font-weight:600;pointer-events:none;}' +
      '.sc-hub-range{fill:#555;font-size:9px;pointer-events:none;}' +
      '.sc-bar{display:flex;flex-direction:column;gap:6px;padding:4px 10px 6px;}' +
      '.sc-mode{width:100%;border:1px solid var(--background-modifier-border,rgba(128,128,128,.3));border-radius:6px;padding:5px;font-size:11px;cursor:pointer;background:transparent;color:inherit;}' +
      '.sc-fine{display:flex;align-items:center;gap:6px;font-size:10px;opacity:.8;}' +
      '.sc-fine-input{flex:1;accent-color:var(--interactive-accent,#7a9);}' +
      '.sc-tip{text-align:center;font-size:9.5px;opacity:.6;padding:0 8px 8px;}' +
      '@media (prefers-color-scheme: dark){' +
        '.sc-wrap{color:rgba(255,255,255,.85);}' +
        '.sc-hub{fill:rgba(20,20,20,.72);}' +
        '.sc-hub-name{fill:#eee;}.sc-hub-range{fill:#bbb;}' +
        '.sc-d{stroke:rgba(0,0,0,.55);}' +
      '}';
    document.head.appendChild(s);
  }

  return {
    mount: function (root, a, env) {
      api = a; el.root = root; injectStyle(); render();
      load(function () {
        if (el.fineInput) el.fineInput.value = state.fine;
        applyVisual();
      });
      startTimer();
    },
    destroy: function () { stopTimer(); api = null; }
  };
})();
if (typeof module !== 'undefined') { module.exports = __bamboo_module_shichen; }
