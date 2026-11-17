/* __bamboo_module_ {"id":"ambient","name":"编辑区顶光","version":"0.1.0","fab":{"icon":"sunrise","label":"顶光"},"location":"left"} */
/**
 * 竹林模块 · 编辑区顶光 v0.1.0
 *
 * 在 md 笔记编辑区内容顶部投一层可调氛围光：开关、预设/自定义光色、亮度、
 * 光带高度、出现时机、呼吸动效、暗色独立参数均可实时调节。
 *
 * 模块运行在沙箱 iframe 内，拿不到 Obsidian 编辑区 DOM；参数经宿主新增的
 * setAmbient 能力交给宿主，由宿主写入主文档 body 变量与 styles.css 规则。
 * 本模块只负责设置面板、参数持久化与一张模拟预览。
 */
(function () {
  'use strict';

  var STYLE_ID = 'bamboo-ambient-module-style';
  var DEFAULTS = {
    enabled: true,
    intensity: 42,
    height: 148,
    color: '#e0a35c',
    mode: 'focus',
    darkMode: 'follow',
    darkIntensity: 42,
    darkColor: '#6fa8a0',
    breathe: false,
    period: 6,
    preset: 'warm',
    darkPreset: 'green'
  };
  var PRESETS = [
    { id: 'warm', name: '暖金', color: '#e0a35c' },
    { id: 'green', name: '竹青', color: '#6fa8a0' },
    { id: 'white', name: '月白', color: '#dfe7ef' },
    { id: 'purple', name: '暮紫', color: '#9b8cc4' },
    { id: 'custom', name: '自定义', color: '' }
  ];

  var api = null;
  var root = null;
  var styleNode = null;
  var state = null;
  var saveTimer = null;
  var hostOK = true;

  function clamp(n, lo, hi, fallback) {
    var v = typeof n === 'number' ? n : Number(n);
    if (!isFinite(v)) return fallback;
    return Math.round(Math.max(lo, Math.min(hi, v)));
  }

  function isHex(v) { return typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v); }

  function normalize(raw) {
    var r = raw && typeof raw === 'object' ? raw : {};
    var s = {};
    s.enabled = typeof r.enabled === 'boolean' ? r.enabled : DEFAULTS.enabled;
    s.intensity = clamp(r.intensity, 0, 100, DEFAULTS.intensity);
    s.height = clamp(r.height, 40, 320, DEFAULTS.height);
    s.color = isHex(r.color) ? r.color.toLowerCase() : DEFAULTS.color;
    s.mode = r.mode === 'always' ? 'always' : 'focus';
    s.darkMode = r.darkMode === 'custom' ? 'custom' : 'follow';
    s.darkIntensity = clamp(r.darkIntensity, 0, 100, DEFAULTS.darkIntensity);
    s.darkColor = isHex(r.darkColor) ? r.darkColor.toLowerCase() : DEFAULTS.darkColor;
    s.breathe = typeof r.breathe === 'boolean' ? r.breathe : DEFAULTS.breathe;
    s.period = clamp(r.period, 2, 12, DEFAULTS.period);
    s.preset = typeof r.preset === 'string' ? r.preset : DEFAULTS.preset;
    s.darkPreset = typeof r.darkPreset === 'string' ? r.darkPreset : DEFAULTS.darkPreset;
    if (s.preset !== 'custom' && !PRESETS.some(function (p) { return p.id === s.preset; })) s.preset = 'custom';
    if (s.darkPreset !== 'custom' && !PRESETS.some(function (p) { return p.id === s.darkPreset; })) s.darkPreset = 'custom';
    return s;
  }

  function rgba(hex, intensity, tail) {
    var n = parseInt(hex.slice(1), 16);
    var a = (intensity / 100) * (tail ? 0.16 : 0.62);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a.toFixed(3) + ')';
  }

  function hostConfig() {
    return {
      enabled: state.enabled,
      intensity: state.intensity,
      height: state.height,
      color: state.color,
      mode: state.mode,
      darkMode: state.darkMode,
      darkIntensity: state.darkIntensity,
      darkColor: state.darkColor,
      breathe: state.breathe,
      period: state.period
    };
  }

  function ensureStyle() {
    if (styleNode && styleNode.parentNode) return;
    var old = document.getElementById(STYLE_ID);
    if (old) old.remove();
    styleNode = document.createElement('style');
    styleNode.id = STYLE_ID;
    styleNode.textContent = [
      '.amb-wrap{--amb-ink:var(--text-normal,#e8e8e8);--amb-muted:var(--text-muted,#9a9a9a);--amb-line:var(--background-modifier-border,rgba(128,128,128,.22));--amb-card:color-mix(in srgb,var(--background-secondary,rgba(0,0,0,.24)) 72%,transparent);box-sizing:border-box;padding:14px 14px 18px;color:var(--amb-ink);font-size:12px;}',
      '.amb-wrap *{box-sizing:border-box;}',
      '.amb-title{font-size:14px;font-weight:600;letter-spacing:.04em;margin:0 0 3px;}',
      '.amb-sub{margin:0 0 12px;font-size:11px;line-height:1.5;opacity:.62;}',
      '.amb-preview{position:relative;overflow:hidden;height:118px;border:1px solid var(--amb-line);border-radius:10px;background:color-mix(in srgb,var(--background-primary,rgba(0,0,0,.35)) 82%,transparent);padding:14px 16px;margin-bottom:14px;}',
      '.amb-preview::before{content:"";position:absolute;left:0;right:0;top:0;height:var(--amb-height,74px);pointer-events:none;opacity:var(--amb-opacity,.8);background:radial-gradient(115% 100% at 50% -28%,var(--amb-glow) 0%,var(--amb-tail) 58%,transparent 100%);}',
      '.amb-preview-title{position:relative;z-index:1;font-size:13px;font-weight:600;text-align:center;margin-bottom:12px;}',
      '.amb-preview-line{position:relative;z-index:1;height:5px;border-radius:3px;background:var(--amb-line);margin:7px 0;opacity:.7;}',
      '.amb-preview-line:nth-of-type(2n){width:88%;}',
      '.amb-preview-line:nth-of-type(3n){width:94%;}',
      '.amb-sec{margin-top:14px;padding-top:11px;border-top:1px solid var(--amb-line);}',
      '.amb-sec:first-of-type{border-top:0;padding-top:0;}',
      '.amb-sec-h{font-size:11px;font-weight:600;letter-spacing:.08em;opacity:.72;margin-bottom:9px;}',
      '.amb-field{margin-bottom:11px;}',
      '.amb-field-label{display:block;font-size:11px;opacity:.8;margin-bottom:6px;}',
      '.amb-hint{font-size:10.5px;line-height:1.5;opacity:.55;margin-top:2px;}',
      '.amb-chips{display:flex;flex-wrap:wrap;gap:6px;}',
      '.amb-chip{appearance:none;border:1px solid var(--amb-line);border-radius:999px;background:transparent;color:inherit;font:inherit;font-size:11px;padding:5px 11px;cursor:pointer;transition:background .18s,border-color .18s,opacity .18s;}',
      '.amb-chip:hover{border-color:currentColor;opacity:.82;}',
      '.amb-chip.on{background:color-mix(in srgb,var(--text-accent,#6fa8a0) 20%,transparent);border-color:var(--text-accent,#6fa8a0);}',
      '.amb-switch{display:flex;align-items:center;justify-content:space-between;gap:10px;cursor:pointer;}',
      '.amb-switch-track{position:relative;width:34px;height:19px;border-radius:999px;border:1px solid var(--amb-line);background:var(--amb-card);transition:background .18s,border-color .18s;flex:none;}',
      '.amb-switch-track::after{content:"";position:absolute;top:2px;left:2px;width:13px;height:13px;border-radius:50%;background:var(--amb-muted);transition:transform .18s,background .18s;}',
      '.amb-switch[aria-checked="true"] .amb-switch-track{border-color:var(--text-accent,#6fa8a0);background:color-mix(in srgb,var(--text-accent,#6fa8a0) 25%,transparent);}',
      '.amb-switch[aria-checked="true"] .amb-switch-track::after{transform:translateX(15px);background:var(--text-accent,#6fa8a0);}',
      '.amb-range-row{display:flex;align-items:center;gap:9px;}',
      '.amb-range{flex:1;accent-color:var(--text-accent,#6fa8a0);height:18px;}',
      '.amb-value{font-variant-numeric:tabular-nums;font-size:11px;min-width:46px;text-align:right;opacity:.78;}',
      '.amb-color{width:100%;height:28px;padding:2px;border:1px solid var(--amb-line);border-radius:6px;background:transparent;cursor:pointer;}',
      '.amb-reset{appearance:none;border:0;background:transparent;color:var(--text-accent,#6fa8a0);font:inherit;font-size:11px;cursor:pointer;padding:4px 0;margin-top:12px;}',
      '.amb-status{margin-top:8px;font-size:10.5px;line-height:1.5;color:#d98b6a;}',
      '@media (prefers-reduced-motion: no-preference){.amb-wrap.amb-on-breathe .amb-preview::before{animation:amb-breath var(--amb-period) ease-in-out infinite;}}',
      '@keyframes amb-breath{0%,100%{opacity:.55}50%{opacity:1}}'
    ].join('\n');
    document.head.appendChild(styleNode);
  }

  function chipRow(items, active, attr) {
    return '<div class="amb-chips">' + items.map(function (it) {
      return '<button type="button" class="amb-chip' + (active === it.id ? ' on' : '') + '" ' + attr + '="' + it.id + '">' + it.name + '</button>';
    }).join('') + '</div>';
  }

  function rangeRow(key, label, value, min, max, unit) {
    return '<div class="amb-field"><span class="amb-field-label">' + label + '</span>' +
      '<div class="amb-range-row"><input type="range" class="amb-range" data-range="' + key + '" min="' + min + '" max="' + max + '" value="' + value + '">' +
      '<span class="amb-value" data-value="' + key + '">' + value + unit + '</span></div></div>';
  }

  function render() {
    if (!root) return;
    var presetVisible = state.preset === 'custom';
    var darkVisible = state.darkMode === 'custom';
    var darkPresetVisible = darkVisible && state.darkPreset === 'custom';
    root.classList.toggle('amb-on-breathe', state.enabled && state.breathe);
    root.innerHTML =
      '<div class="amb-wrap' + (state.enabled && state.breathe ? ' amb-on-breathe' : '') + '">' +
        '<h2 class="amb-title">编辑区顶光</h2>' +
        '<p class="amb-sub">给 md 笔记内容顶部投一层氛围光。参数即时生效，写入宿主后长期保留。</p>' +
        '<div class="amb-preview" id="amb-preview">' +
          '<div class="amb-preview-title">笔记标题</div>' +
          '<div class="amb-preview-line"></div><div class="amb-preview-line"></div><div class="amb-preview-line"></div>' +
        '</div>' +

        '<div class="amb-sec"><div class="amb-sec-h">光效</div>' +
          '<div class="amb-field"><div class="amb-switch" role="switch" data-toggle="enabled" aria-checked="' + state.enabled + '">' +
            '<span class="amb-field-label" style="margin:0">顶光</span><span class="amb-switch-track"></span></div>' +
            '<div class="amb-hint">关闭后编辑区不留任何光效，参数仍保留。</div></div>' +
          '<div class="amb-field"><span class="amb-field-label">出现时机</span>' +
            chipRow([{ id: 'focus', name: '仅编辑时' }, { id: 'always', name: '常驻' }], state.mode, 'data-mode') + '</div>' +
          '<div class="amb-field"><div class="amb-switch" role="switch" data-toggle="breathe" aria-checked="' + state.breathe + '">' +
            '<span class="amb-field-label" style="margin:0">呼吸光</span><span class="amb-switch-track"></span></div>' +
            '<div class="amb-hint">系统要求减少动态效果时不播放。</div></div>' +
          rangeRow('period', '呼吸周期', state.period, 2, 12, 's') +
        '</div>' +

        '<div class="amb-sec"><div class="amb-sec-h">光色</div>' +
          '<div class="amb-field"><span class="amb-field-label">预设</span>' + chipRow(PRESETS, state.preset, 'data-preset') + '</div>' +
          (presetVisible ? '<div class="amb-field"><span class="amb-field-label">自定义光色</span>' +
            '<input type="color" class="amb-color" data-color="color" value="' + state.color + '"></div>' : '') +
          rangeRow('intensity', '亮度', state.intensity, 0, 100, '%') +
          rangeRow('height', '光带高度', state.height, 40, 320, 'px') +
        '</div>' +

        '<div class="amb-sec"><div class="amb-sec-h">暗色主题</div>' +
          '<div class="amb-field"><span class="amb-field-label">暗色参数</span>' +
            chipRow([{ id: 'follow', name: '跟随亮色' }, { id: 'custom', name: '独立设置' }], state.darkMode, 'data-dark') + '</div>' +
          (darkVisible ?
            chipRow(PRESETS, state.darkPreset, 'data-darkpreset') +
            (darkPresetVisible ? '<div class="amb-field" style="margin-top:9px"><span class="amb-field-label">暗色自定义光色</span>' +
              '<input type="color" class="amb-color" data-color="darkColor" value="' + state.darkColor + '"></div>' : '') +
            rangeRow('darkIntensity', '暗色亮度', state.darkIntensity, 0, 100, '%') : '<div class="amb-hint">暗色沿用上方光色与亮度。</div>') +
        '</div>' +

        '<button type="button" class="amb-reset" data-action="reset">恢复默认参数</button>' +
        '<div class="amb-status" id="amb-status" style="display:' + (hostOK ? 'none' : 'block') + '">宿主不支持顶光，请升级竹林插件到 3.35.0 及以上。</div>' +
      '</div>';
    applyPreview();
  }

  function applyPreview() {
    if (!root) return;
    var el = root.querySelector('#amb-preview');
    if (!el) return;
    el.style.setProperty('--amb-height', Math.round(state.height * 0.5) + 'px');
    el.style.setProperty('--amb-glow', rgba(state.color, state.intensity, false));
    el.style.setProperty('--amb-tail', rgba(state.color, state.intensity, true));
    el.style.setProperty('--amb-opacity', state.enabled ? '1' : '0');
    el.style.setProperty('--amb-period', state.period + 's');
  }

  function updateStatus() {
    if (!root) return;
    var el = root.querySelector('#amb-status');
    if (el) el.style.display = hostOK ? 'none' : 'block';
  }

  function scheduleSave() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      saveTimer = null;
      if (api && api.saveData) void api.saveData(state);
    }, 400);
  }

  function push() {
    if (!api || typeof api.setAmbient !== 'function') {
      hostOK = false; updateStatus(); return;
    }
    var result = api.setAmbient(hostConfig());
    Promise.resolve(result).then(function (ok) {
      hostOK = ok !== false; updateStatus();
    }).catch(function () {
      hostOK = false; updateStatus();
    });
  }

  function commit(rebuild) {
    if (rebuild) render(); else applyPreview();
    push();
    scheduleSave();
  }

  function onClick(e) {
    var t = e.target.closest('[data-toggle],[data-mode],[data-preset],[data-dark],[data-darkpreset],[data-action]');
    if (!t || !root || !root.contains(t)) return;
    if (t.hasAttribute('data-toggle')) {
      var key = t.getAttribute('data-toggle');
      state[key] = !state[key];
      commit(true);
    } else if (t.hasAttribute('data-mode')) {
      state.mode = t.getAttribute('data-mode');
      commit(true);
    } else if (t.hasAttribute('data-preset')) {
      var pid = t.getAttribute('data-preset');
      state.preset = pid;
      var found = PRESETS.filter(function (p) { return p.id === pid; })[0];
      if (found && found.color) state.color = found.color;
      commit(true);
    } else if (t.hasAttribute('data-dark')) {
      state.darkMode = t.getAttribute('data-dark');
      commit(true);
    } else if (t.hasAttribute('data-darkpreset')) {
      var did = t.getAttribute('data-darkpreset');
      state.darkPreset = did;
      var dfound = PRESETS.filter(function (p) { return p.id === did; })[0];
      if (dfound && dfound.color) state.darkColor = dfound.color;
      commit(true);
    } else if (t.getAttribute('data-action') === 'reset') {
      state = normalize(DEFAULTS);
      commit(true);
    }
  }

  function onInput(e) {
    var t = e.target;
    if (!t || !root || !root.contains(t)) return;
    if (t.hasAttribute('data-range')) {
      var key = t.getAttribute('data-range');
      var val = Number(t.value);
      if (key === 'intensity') state.intensity = clamp(val, 0, 100, DEFAULTS.intensity);
      else if (key === 'height') state.height = clamp(val, 40, 320, DEFAULTS.height);
      else if (key === 'period') state.period = clamp(val, 2, 12, DEFAULTS.period);
      else if (key === 'darkIntensity') state.darkIntensity = clamp(val, 0, 100, DEFAULTS.darkIntensity);
      var label = root.querySelector('[data-value="' + key + '"]');
      if (label) label.textContent = val + (key === 'period' ? 's' : key === 'height' ? 'px' : '%');
      commit(false);
    } else if (t.hasAttribute('data-color')) {
      var ck = t.getAttribute('data-color');
      if (isHex(t.value)) {
        state[ck] = t.value.toLowerCase();
        if (ck === 'color') state.preset = 'custom';
        if (ck === 'darkColor') state.darkPreset = 'custom';
      }
      // 取色器拖动中不重建 DOM，否则输入控件会在拖动途中被换掉
      commit(false);
    }
  }

  function onChange(e) {
    var t = e.target;
    if (t && t.hasAttribute && t.hasAttribute('data-color') && root && root.contains(t)) render();
  }

  function teardown() {
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    if (root) {
      root.removeEventListener('click', onClick);
      root.removeEventListener('input', onInput);
      root.removeEventListener('change', onChange);
      root.innerHTML = '';
    }
    if (styleNode && styleNode.parentNode) styleNode.remove();
    styleNode = null; root = null; api = null;
  }

  function mount(container, a) {
    if (root) teardown();
    api = a;
    root = container;
    root.classList.add('amb-module-root');
    ensureStyle();
    state = normalize(DEFAULTS);
    render();
    root.addEventListener('click', onClick);
    root.addEventListener('input', onInput);
    root.addEventListener('change', onChange);
    Promise.resolve(api && api.loadData ? api.loadData() : null).then(function (saved) {
      if (!root || !saved || typeof saved !== 'object') return;
      state = normalize(saved);
      render();
      push();
    }).catch(function () { /* 读档失败时沿用默认参数 */ });
    push();
  }

  window.__bamboo_module_ambient = {
    name: '编辑区顶光',
    mount: mount,
    unmount: teardown,
    destroy: teardown
  };
})();
