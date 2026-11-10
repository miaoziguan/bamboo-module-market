#!/usr/bin/env node
/**
 * check-fx.mjs — blog.js「质感增强」回退契约校验（零依赖，CI 直接 node 跑）
 *
 * 为什么要这个闸门：增强档是后加的一层光影，最容易悄悄渗回基线规则里。
 * 一旦某条增强值被写进基础 CSS，关掉开关就回不到 v0.7.11 的画面，
 * 而「关闭＝逐值回退」是这个开关唯一的语义。人眼很难发现，故固化为断言：
 *
 *   1) FX 块内每条规则的选择器都必须带 .bm-fx-on；
 *   2) 基础 CSS 段不得出现 .bm-fx-on，也不得改掉几个关键基线值；
 *   3) 亮/暗两套增强都齐全，暗色的轮廓光 / 镜头辉光 / 快门暖光 / 纸带亮边不可缺；
 *   4) 增强默认静态光影；允许带 prefers-reduced-motion 兜底的轻量动画（blog 已加降级保护），裸动画仍禁止；
 *   5) JS 侧：默认开、老配置不静默退档、保存/读回/即时预览的契约齐全，
 *      且预览回调不得调用 render()（重建会重跑 fitCamera，相机抖一下）。
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

/* ── 3：暗色关键光影项 ── */
const findDark = (sel) => dark.find(r => r.startsWith(':is(.theme-dark,.dark) .bm-wrap.bm-fx-on ' + sel + '{')) || '';
const findLight = (sel) => light.find(r => r.startsWith('.bm-wrap.bm-fx-on ' + sel + '{')) || '';
const cam = findDark('.camera');
ok(cam.includes('background:linear-gradient(160deg,hsla(190,24%,72%,.34)'), '暗色机身不是半透明玻璃底');
ok(cam.includes('-webkit-backdrop-filter:blur(') && cam.includes('backdrop-filter:blur('), '暗色机身缺 backdrop-filter');
ok(cam.includes('inset 0 0 0 7px rgba(220,245,240,.06)'), '暗色机身缺 7px 玻璃侧壁（厚度）');
ok(cam.includes('inset 0 0 30px rgba(200,240,235,.12)'), '暗色机身缺边缘聚光');
ok(cam.includes('inset 0 2px 0 rgba(255,255,255,.26)'), '暗色机身缺顶面亮边');
const lens = findDark('.lens-unit');
ok(lens.includes('0 0 30px -8px'), '暗色镜头缺柔光');
const shutter = findDark('.shutter');
ok(shutter.includes('rgba(239,59,44,.48)'), '暗色快门缺暖色辉光');
const paper = findDark('.bm-paper');
ok(paper.includes('0 0 0 1px rgba(255,255,255,.06)'), '暗色纸带缺边缘亮线');
const grain = findDark('.grain');
ok(grain.includes('mix-blend-mode:overlay') && grain.includes('opacity:.022'), '暗色颗粒未改成「更细的材质感」');
ok(dark.some(r => r.startsWith(':is(.theme-dark,.dark) .bm-wrap.bm-fx-on .camera::before{')), '暗色机身缺表面反射层');
ok(dark.some(r => r.startsWith(':is(.theme-dark,.dark) .bm-wrap.bm-fx-on .top-panel{')), '暗色凹槽未增强');

/* ── 3b：厚玻璃四特征（亮暗各一套）──
   半透明 + 7px 侧壁 + 边缘聚光 + 顶面亮边 + 斜向反光 + 边缘色散。
   缺任何一条就退化成「薄片」或「塑料」。 */
for (const [mode, find] of [['亮色', findLight], ['暗色', findDark]]) {
  const shell = find('.camera');
  ok(/background:linear-gradient\(160deg,hsla\(/.test(shell), `${mode}机身不是半透明玻璃底`);
  ok(shell.includes('backdrop-filter:blur('), `${mode}机身缺 backdrop-filter`);
  ok(shell.includes('inset 0 0 0 7px'), `${mode}机身缺 7px 侧壁（厚度）`);
  ok(shell.includes('inset 0 0 26px') || shell.includes('inset 0 0 30px'), `${mode}机身缺边缘聚光`);
  ok(shell.includes('inset 0 2px 0 rgba(255,255,255,'), `${mode}机身缺顶面亮边`);

  const refl = find('.camera::before');
  ok(refl.includes('linear-gradient(115deg'), `${mode}缺斜向玻璃反光`);

  const rim = find('.camera::after');
  ok(rim.includes('inset 0 1.5px 0 0 rgba(255,255,255,') || rim.includes('inset 0 1px 0 0 rgba(255,255,255,'), `${mode}缺上缘细高光`);
}

/* 单一顶光源：白色高光的径向光心横坐标必须是 50%；彩色环境光允许偏离 */
for (const rule of rules) {
  for (const m of rule.matchAll(/at\s+(\d+)%\s+(-?\d+)%/g)) {
    if (m[1] === '50') continue;
    const tail = rule.slice(m.index, m.index + 60);
    ok(!/rgba\(255,255,255/.test(tail), `白色高光横坐标 ${m[1]}% 偏离正上方，违反单一顶光源`);
  }
}

/* 镜片与快门保留彩色反射 */
const glass = findDark('.lens-glass');
ok(!!glass && glass.includes('rgba(150,215,255,') && glass.includes('rgba(255,170,235,') && glass.includes('rgba(255,240,190,'), '镜片缺三色釉面反射');
const shutter2 = findDark('.shutter');
ok(shutter2.includes('rgba(255,200,240,'), '快门缺粉紫高光');

/* 玻璃集中处：镜头、快门、彩虹条 —— 小尺寸下这几处才看得见 */
const lensGlass = findDark('.lens-glass');
ok(lensGlass.includes('inset 0 0 24px rgba(180,230,255,.20)'), '镜片缺玻璃内光');
const shutterGlass = findDark('.shutter');
ok(shutterGlass.includes('inset 0 0 16px rgba(255,140,110,.34)'), '快门缺玻璃内透光');
const rainbowGlass = findDark('.rainbow');
ok(rainbowGlass.includes('saturate(1.45)'), '彩虹条未玻璃化（饱和度不足）');

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
