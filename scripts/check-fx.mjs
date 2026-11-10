#!/usr/bin/env node
/**
 * check-fx.mjs — blog.js「质感增强」回退契约校验（零依赖，CI 直接 node 跑）
 *
 * 为什么要这个闸门：增强档是后加的一层光影，最容易悄悄渗回基线规则里。
 * 一旦某条增强值被写进基础 CSS，关掉开关就回不到 v0.7.11 的画面，
 * 而「关闭＝逐值回退」是这个开关唯一的语义。人眼很难发现，故固化为断言：
 *
 *   1) FX 块内每条增强值规则的选择器都必须带 .bm-fx-on（@media / @keyframes
 *      结构性规则除外）；材质 token 集中定义、blur 引用不得悬空；
 *   2) 基础 CSS 段不得出现 .bm-fx-on，也不得改掉几个关键基线值；
 *   3) 亮/暗两套增强都齐全，暗色的轮廓光 / 镜片反射 / 彩虹条 / 纸带亮边不可缺；
 *   4) 增强默认静态光影；允许带 prefers-reduced-motion 兜底的轻量动画（blog 已加降级保护），裸动画仍禁止；
 *   5) JS 侧：默认开、老配置不静默退档、保存/读回/即时预览的契约齐全，
 *      且预览回调不得调用 render()（重建会重跑 fitCamera，相机抖一下）；
 *   6) 架构与无障碍：相机链只允许 .camera 一层 backdrop-filter（内层不得回潮）；
 *      必须有 prefers-reduced-transparency 兜底，给玻璃垫实色、关 blur、隐藏竖纹层；
 *      竖纹玻璃为默认关的独立开关，依赖增强档、静态微结构、全链路可回退。
 */
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const src = fs.readFileSync(path.join(ROOT, 'modules', 'blog.js'), 'utf8');
const errors = [];
const ok = (cond, msg) => { if (!cond) errors.push(msg); };

const fxStart = src.indexOf('FX-BLOCK-START');
const fxEnd = src.indexOf('FX-BLOCK-END');
ok(fxStart > 0 && fxEnd > fxStart, '找不到 FX-BLOCK-START / FX-BLOCK-END 注释边界');

const cssStart = src.indexOf('function ensureStyle()');
ok(cssStart > 0 && cssStart < fxStart, '找不到 ensureStyle() 起点');

const baseCss = src.slice(cssStart, fxStart);
const fxBlock = fxStart > 0 && fxEnd > fxStart ? src.slice(fxStart, fxEnd) : '';

/* ── 1/4：提取 FX 块内的规则字符串 ── */
const rules = [];
for (const m of fxBlock.matchAll(/'([^']*\{[^']*\})'/g)) rules.push(m[1]);
ok(rules.length >= 20, `FX 块规则数偏少（${rules.length} 条），疑似漏加或拼接被吞`);

/* @media / @keyframes 是结构性规则，不是增强值，不要求带 .bm-fx-on；
   真正的增强值规则必须全部限定在 .bm-fx-on 下，关档才干净 */
const structural = (r) => r.startsWith('@media') || r.startsWith('@keyframes');
const enhRules = rules.filter((r) => !structural(r));
const scoped = enhRules.filter((r) => r.slice(0, r.indexOf('{')).includes('.bm-fx-on'));
ok(scoped.length === enhRules.length, `${enhRules.length - scoped.length} 条增强规则没带 .bm-fx-on，关档不会回退`);

const light = scoped.filter(r => !r.startsWith(':is(.theme-dark,.dark)'));
const dark = scoped.filter(r => r.startsWith(':is(.theme-dark,.dark)'));
ok(light.length >= 10, `亮色增强规则仅 ${light.length} 条`);
ok(dark.length >= 10, `暗色增强规则仅 ${dark.length} 条（暗色光影是本次重点）`);
/* 允许「带 prefers-reduced-motion 兜底的轻量动画」：降级/关档时停播。
   裸动画（无 reduced-motion 兜底）仍禁止，避免关档后还在动 */
const fxHasReducedMotion = /prefers-reduced-motion/.test(fxBlock);
ok(!/animation|@keyframes|transition:/i.test(fxBlock) || fxHasReducedMotion, 'FX 块引入了动效，但缺少 prefers-reduced-motion 兜底（关档/降级应停播）');

/* ── 3：关键光影项（主题化：跟随 --accent-hue / --accent-lightness-offset）── */
const findDark = (sel) => dark.find(r => r.startsWith(':is(.theme-dark,.dark) .bm-wrap.bm-fx-on ' + sel + '{')) || '';
const findLight = (sel) => light.find(r => r.startsWith('.bm-wrap.bm-fx-on ' + sel + '{')) || '';
const cam = findDark('.camera');
ok(cam.includes('var(--accent-hue') && cam.includes('background:linear-gradient(160deg,hsla(calc(var(--accent-hue,120) + 8)'), '暗色机身不是主题化半透明玻璃底');
ok(cam.includes('-webkit-backdrop-filter:blur(') && cam.includes('backdrop-filter:blur('), '暗色机身缺 backdrop-filter');
ok(/0 0 0 7px hsla\(var\(--accent-hue/.test(cam), '暗色机身缺 7px 玻璃侧壁（厚度）');
ok(cam.includes('inset 0 0 30px') || cam.includes('inset 0 0 26px'), '暗色机身缺边缘聚光');
ok(cam.includes('inset 0 2px 0 rgba(255,255,255,'), '暗色机身缺顶面亮边');
const grain = findDark('.grain');
ok(grain.includes('mix-blend-mode:overlay') && grain.includes('opacity:.022'), '暗色颗粒未改成「更细的材质感」');
ok(dark.some(r => r.startsWith(':is(.theme-dark,.dark) .bm-wrap.bm-fx-on .camera::before{')), '暗色机身缺表面反射层');
ok(dark.some(r => r.startsWith(':is(.theme-dark,.dark) .bm-wrap.bm-fx-on .top-panel{')), '暗色凹槽未增强');

/* ── 3b：厚玻璃四特征（亮暗各一套，主题化）──
   半透明 + 7px 侧壁 + 边缘聚光 + 顶面亮边 + 斜向反光 + 边缘色散。
   颜色全部跟随 --accent-hue，不再写死。 */
for (const [mode, find] of [['亮色', findLight], ['暗色', findDark]]) {
  const shell = find('.camera');
  ok(shell.includes('var(--accent-hue') && shell.includes('background:linear-gradient(160deg,hsla(calc(var(--accent-hue,120) + 8)'), `${mode}机身不是主题化玻璃底`);
  ok(shell.includes('backdrop-filter:blur('), `${mode}机身缺 backdrop-filter`);
  ok(/0 0 0 7px hsla\(var\(--accent-hue/.test(shell), `${mode}机身缺 7px 侧壁（厚度）`);
  ok(shell.includes('inset 0 0 26px') || shell.includes('inset 0 0 30px'), `${mode}机身缺边缘聚光`);
  ok(shell.includes('inset 0 2px 0 rgba(255,255,255,'), `${mode}机身缺顶面亮边`);

  const refl = find('.camera::before');
  ok(refl.includes('radial-gradient(155% 48%'), `${mode}缺斜向玻璃反光`);

  const rim = find('.camera::after');
  ok(rim.includes('inset 0 1.5px 0 0 rgba(255,255,255,') || rim.includes('inset 0 1px 0 0 rgba(255,255,255,'), `${mode}缺上缘细高光`);
}

/* ── 材质 token（P1）：光学常量集中定义，且值受契约约束 ── */
const tokVal = (r, name) => {
  const m = r && r.match(new RegExp(name + ':\\s*([^;]+);'));
  return m ? m[1] : '';
};
const lightDef = rules.find(r => r.startsWith('.bm-wrap.bm-fx-on{') && r.includes('--bm-light-x:'));
const darkDef = rules.find(r => r.startsWith(':is(.theme-dark,.dark) .bm-wrap.bm-fx-on{') && r.includes('--bm-glass-blur:'));
ok(!!lightDef, '缺亮色材质 token 定义（.bm-wrap.bm-fx-on）');
ok(!!darkDef, '缺暗色材质 token 覆盖定义');
for (const t of ['--bm-light-x', '--bm-depth-blur', '--bm-glass-blur', '--bm-input-blur']) {
  ok(!!tokVal(lightDef, t), `亮色缺材质 token ${t} 定义`);
}
for (const t of ['--bm-depth-blur', '--bm-glass-blur']) {
  ok(!!tokVal(darkDef, t), `暗色缺材质 token ${t} 覆盖`);
}
const lightX = tokVal(lightDef, '--bm-light-x');
ok(lightX === '50%', `--bm-light-x 必须为正上方 50%（单一顶光源），当前「${lightX || '未定义'}」`);
/* 引用完整性：blur(var(--bm-…)) 引用的 token 必须有定义，否则整条声明在浏览器里失效 */
for (const m of fxBlock.matchAll(/blur\(var\((--bm-[\w-]+)\)\)/g)) {
  ok(!!tokVal(lightDef, m[1]) || !!tokVal(darkDef, m[1]), `blur 引用了未定义的 ${m[1]}`);
}

/* ── P2 架构约束：相机链只允许 .camera 一层 backdrop-filter ──
   内层（凹槽/搜索框）曾嵌套 3 层，受 Backdrop Root 限制根本采不到机身背后
   的景深光斑，只是白付合成开销；内层玻璃改由半透明 hsla + 自带折射光表现。
   .bm-input 在列表区、不属相机链，允许保有独立的一层。 */
const innerSel = /\.(top-panel|bm-search)\{/;
for (const r of rules) {
  const sel = r.slice(0, r.indexOf('{'));
  if (innerSel.test(sel + '{')) {
    ok(!/backdrop-filter/.test(r), `${sel} 又给内层加了 backdrop-filter（相机链应保持 3→1）`);
  }
}

/* ── P3 无障碍：prefers-reduced-transparency 兜底 ──
   语义是「别让半透明背景损害文字可读性」，故只垫实色/关 blur 于承载文字的
   控件（凹槽/搜索框/输入框/表单）；相机外壳 .camera 是纯装饰件、无文字，
   必须保持半透明玻璃 + 那层 blur，否则整块机身被垫成实色、透不出背景景深。
   未开启该偏好时整块被浏览器忽略；但容易在后续改动里被误删，固化断言。 */
const rtRule = rules.find(r => r.startsWith('@media (prefers-reduced-transparency: reduce)'));
ok(!!rtRule, '缺 prefers-reduced-transparency 兜底（减少透明度偏好下玻璃应收敛）');
if (rtRule) {
  /* 亮/暗各一套，必须精确计数：只写「存在一处」会让删掉一半的兜底蒙混过关 */
  const bgCount = (rtRule.match(/background-color:/g) || []).length;
  ok(bgCount === 2, `兜底应给亮/暗各垫一次实色，实际 ${bgCount} 次`);
  const offCount = (rtRule.match(/-webkit-backdrop-filter:none;backdrop-filter:none;/g) || []).length;
  ok(offCount === 2, `兜底应给亮/暗各关一次 blur，实际 ${offCount} 次`);
  const darkAt = rtRule.indexOf(':is(.theme-dark,.dark)');
  const rtLight = darkAt > 0 ? rtRule.slice(0, darkAt) : '';
  const rtDark = darkAt > 0 ? rtRule.slice(darkAt) : '';
  ok(darkAt > 0, '兜底缺暗色选择器组（暗档玻璃仍透）');
  /* 文字/凹槽控件必须亮暗都覆盖 */
  for (const part of ['.top-panel', '.bm-search', '.bm-input', '.bm-form']) {
    ok(rtLight.includes('.bm-wrap.bm-fx-on ' + part), `兜底缺亮色覆盖 ${part}`);
    ok(rtDark.includes(':is(.theme-dark,.dark) .bm-wrap.bm-fx-on ' + part), `兜底缺暗色覆盖 ${part}`);
  }
  /* 反向锁：相机外壳是纯装饰件，reduced-transparency 不得把它垫实色或关 blur，
     否则半透明玻璃叠在实色上会「透不出背景」（曾实测 camBg=rgb(49,63,49)） */
  ok(!/\.camera[,{]/.test(rtRule), '兜底误把相机外壳 .camera 垫实色/关 blur（会透不出背景）');
  /* 竖纹是不透明表面微结构，不涉及透视背景；减少透明度时不得隐藏它，
     否则系统偏好会静默否决用户主动打开的开关（曾导致「完全没生效」） */
  ok(!rtRule.includes('.bm-cam-reed{display:none;}'), '兜底误隐藏竖纹层（reduced-transparency 不应否决表面纹理）');
}

/* ── 竖纹玻璃 CSS：双 class 限定、周期、边缘渐隐、零动效 ──
   本质是可开关的表面微结构，不能渗进基线、不能带动画、亮暗都要在
   .bm-fx-on.bm-fx-reed 下命中，否则关档回退不干净。 */
const reedRules = rules.filter(r => r.includes('.bm-cam-reed{') && r.includes('repeating-linear-gradient'));
ok(reedRules.length === 2, `竖纹应有亮/暗各一套，实际 ${reedRules.length} 套`);
for (const r of reedRules) {
  const sel = r.slice(0, r.indexOf('{'));
  ok(sel.includes('.bm-fx-on.bm-fx-reed'), `竖纹规则未限定双 class: ${sel.slice(0, 70)}`);
  ok(/repeating-linear-gradient\(90deg,/.test(r), '竖纹缺 90deg 三段式棱条');
  ok(r.includes('12px'), '竖纹周期不是 12px（k<1 缩放下 9px 易起摩尔纹）');
  ok(r.includes('mask-image:'), '竖纹缺 radial mask 边缘渐隐（圆角会硬截断）');
  ok(!/animation|transition:|@keyframes/i.test(r), '竖纹引入了动效（应为静态微结构）');
}
ok(reedRules.some(r => r.startsWith(':is(.theme-dark,.dark)')), '竖纹缺暗色档');

/* 单一顶光源：白色高光的径向光心横坐标必须是 50%；彩色环境光允许偏离。
   token 化后先把 var(--bm-light-x) 归一化成其定义值，再跑原检查（契约不降强度） */
const normalized = rules.map(r => r.replace(/var\(--bm-light-x\)/g, lightX || '50%'));
for (const rule of normalized) {
  for (const m of rule.matchAll(/at\s+(\d+)%\s+(-?\d+)%/g)) {
    if (m[1] === '50') continue;
    const tail = rule.slice(m.index, m.index + 60);
    ok(!/rgba\(255,255,255/.test(tail), `白色高光横坐标 ${m[1]}% 偏离正上方，违反单一顶光源`);
  }
}

/* 镜片 / 快门 / 彩虹条：主题化玻璃反射（跟随 --accent-hue），不依赖写死三色 */
const glass = findDark('.lens-glass');
ok(!!glass && glass.includes('var(--accent-hue'), '镜片缺主题化釉面反射');
const rainbowGlass = findDark('.rainbow');
ok(rainbowGlass.includes('var(--accent-hue'), '彩虹条未主题化');
ok(fxBlock.includes('--accent-lightness-offset'), 'FX 块未使用 --accent-lightness-offset（丢失主题化亮度推导）');

/* ── 2：基线未被改动 ── */
ok(!baseCss.includes('.bm-fx-on'), '基础 CSS 段出现了 .bm-fx-on（增强值渗回基线，关档不干净）');
const baseNeedles = [
  "filter:url(#bm-grain);opacity:.03;mix-blend-mode:soft-light",
  '0 24px 40px -18px rgba(0,0,0,.50)',
  ':is(.theme-dark,.dark) .camera::after{box-shadow:inset 0 0 0 1.5px rgba(255,255,255,.10);}',
  "'.grain{position:absolute;inset:0;z-index:30;",
];
for (const n of baseNeedles) ok(baseCss.includes(n), '基线关键值被改动或删除：' + n.slice(0, 56));

/* 开关行样式（常驻，不属于 FX 块） */
for (const n of ['.bm-fx-row{', '.bm-fx-input:checked ~ .bm-fx-track', '.bm-fx-input:focus-visible ~ .bm-fx-track']) {
  ok(src.includes(n), '开关行样式缺失：' + n);
}

/* ── 5：JS 契约 ── */
ok(/enhance:\s*true,/.test(src), 'state.enhance 默认值不是 true');
ok(src.includes('enhance: state.enhance,'), 'persist() 未写入 enhance');
ok(src.includes('!(d.enhance === false)'), 'loadAll() 未处理老配置缺字段（会静默退档）');
ok(src.includes("(state.enhance ? ' bm-fx-on' : '')"), 'render() 未按 state 带增强 class');
ok(src.includes('data-field="enhance"'), '设置表单缺增强开关');
ok(src.includes('if (fx) state.enhance = !!fx.checked;'), 'saveProfile() 未读取开关值');
ok(src.includes("wrap.classList.toggle('bm-fx-on', !!state.enhance)"), '异步读回配置后未兜底同步 class');
/* 流光动效开关：change 时必须写入 state.motion，否则 persist 存旧值、收起/重开即复位 */
ok(src.includes('data-field="motion"'), '设置表单缺流光动效开关');
ok(src.includes('state.motion = !!e.target.checked;'), '流光动效 change 未写入 state.motion（会不持久/复位）');
ok(src.includes('motion: state.motion,'), 'persist() 未写入 motion');
/* 竖纹玻璃开关：默认关、依赖 enhance、class 与 state 全链路一致。
   复用 motion 的教训——change 不写 state 会不持久、收起/重开即复位 */
ok(/reed:\s*false,/.test(src), 'state.reed 默认值不是 false（新效果应默认关）');
ok(src.includes('data-field="reed"'), '设置表单缺竖纹玻璃开关');
ok(src.includes("(state.reed ? ' bm-fx-reed' : '')"), 'render() 未按 state 带竖纹 class');
ok(src.includes("'<div class=\"bm-cam-reed\"></div>'"), '相机缺 .bm-cam-reed 竖纹层');
ok(src.includes('state.reed = !!e.target.checked;'), '竖纹 change 未写入 state.reed（会不持久/复位）');
ok(src.includes("classList.toggle('bm-fx-reed', !!e.target.checked)"), '竖纹预览回调未切换根 class');
ok(src.includes('reed: state.reed,'), 'persist() 未写入 reed');
ok(src.includes('state.reed = !!(d.reed)'), 'loadAll() 未读回 reed');
ok(src.includes("wrap.classList.toggle('bm-fx-reed', !!state.reed)"), '异步读回配置后未兜底同步竖纹 class');
ok(src.includes("if (rd) state.reed = !!rd.checked;"), 'saveProfile() 未读取竖纹开关值');
ok(src.includes("if (!state.enhance) { state.motion = false; state.reed = false; }"), '缺 enhance 关闭时的竖纹联动/脏数据兜底');

const changeAt = src.indexOf("fx.addEventListener('change'");
ok(changeAt > 0, '缺开关即时预览的 change 监听');
if (changeAt > 0) {
  const body = src.slice(changeAt, src.indexOf('});', changeAt) + 3);
  ok(!/render\s*\(/.test(body), '预览回调调用了 render()，会重跑 fitCamera 让相机抖动');
  ok(body.includes("classList.toggle('bm-fx-on'"), '预览回调没有切换根 class');
}

if (errors.length) {
  console.error('[check-fx] ❌ 质感增强契约被破坏：');
  errors.forEach(e => console.error('  · ' + e));
  process.exit(1);
}
console.log(`[check-fx] ✅ 回退契约成立：FX 规则 ${rules.length} 条（亮 ${light.length} / 暗 ${dark.length}）全部限定在 .bm-fx-on 下，基线未改。`);
