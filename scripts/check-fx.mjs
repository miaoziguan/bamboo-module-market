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
 *   4) 增强只做静态光影，不引入动画（blog 目前无 reduced-motion 保护）；
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

const scoped = rules.filter(r => r.slice(0, r.indexOf('{')).includes('.bm-fx-on'));
ok(scoped.length === rules.length, `${rules.length - scoped.length} 条增强规则没带 .bm-fx-on，关档不会回退`);

const light = scoped.filter(r => !r.startsWith(':is(.theme-dark,.dark)'));
const dark = scoped.filter(r => r.startsWith(':is(.theme-dark,.dark)'));
ok(light.length >= 10, `亮色增强规则仅 ${light.length} 条`);
ok(dark.length >= 10, `暗色增强规则仅 ${dark.length} 条（暗色光影是本次重点）`);
ok(!/animation|@keyframes|transition:/i.test(fxBlock), 'FX 块引入了动效；blog 尚无 prefers-reduced-motion 保护');

/* ── 3：暗色关键光影项 ── */
const findDark = (sel) => dark.find(r => r.startsWith(':is(.theme-dark,.dark) .bm-wrap.bm-fx-on ' + sel + '{')) || '';
const findLight = (sel) => light.find(r => r.startsWith('.bm-wrap.bm-fx-on ' + sel + '{')) || '';
const cam = findDark('.camera');
ok(cam.includes('0 0 0 1px rgba(255,255,255,.16)'), '暗色机身缺轮廓光');
ok(cam.includes('0 0 40px -12px'), '暗色机身缺冷色柔晕');
ok(cam.includes('linear-gradient(160deg'), '暗色机身未重建青瓷底色（形体会糊进背景）');
ok(/min\(46%,max\(34%,calc\(40%/.test(cam), '暗色机身底色缺明度上下限（滑块极端时形体仍会糊）');
const lens = findDark('.lens-unit');
ok(lens.includes('0 0 24px -8px'), '暗色镜头缺柔光');
const shutter = findDark('.shutter');
ok(shutter.includes('rgba(239,59,44,.32)'), '暗色快门缺暖色辉光');
const paper = findDark('.bm-paper');
ok(paper.includes('0 0 0 1px rgba(255,255,255,.06)'), '暗色纸带缺边缘亮线');
const grain = findDark('.grain');
ok(grain.includes('mix-blend-mode:overlay') && grain.includes('opacity:.022'), '暗色颗粒未改成「更细的材质感」');
ok(dark.some(r => r.startsWith(':is(.theme-dark,.dark) .bm-wrap.bm-fx-on .camera::before{')), '暗色机身高光/暗角未增强');
ok(dark.some(r => r.startsWith(':is(.theme-dark,.dark) .bm-wrap.bm-fx-on .top-panel{')), '暗色凹槽未增强');

/* ── 3b：瓷器釉面五特征（迁移自 tea.js FX_PBR spec/coat/sss/env + P4 口沿）──
   亮暗两套都必须齐；缺一条就退化回「普通塑料光影」。 */
for (const [mode, find] of [['亮色', findLight], ['暗色', findDark]]) {
  const clearcoat = find('.camera::before');
  ok(clearcoat.includes('ellipse 7%') && clearcoat.includes('at 50% 0%'),
    `${mode}缺 clearcoat 极窄顶部高光（釉的第二层镜面）`);

  const shell = find('.camera');
  ok(/rgba\(255,(?:190,132|186,126),/.test(shell),
    `${mode}缺薄胎背光暖透射（tea 的 sss，白瓷暖 1.0/0.72/0.48）`);
  ok(shell.includes('0 0 0 1px rgba(255,255,255,'), `${mode}缺掠射釉口亮边`);

  const windows = find('.lens-unit::after');
  const panes = (windows.match(/rgba\(255,250,235,/g) || []).length;
  ok(panes === 3, `${mode}镜座窗光应为三扇（tea ENV centers 0.12/0.46/0.80），实得 ${panes} 扇`);

  const rim = find('.lens-barrel');
  ok(rim.includes('inset 0 0 0 2px'), `${mode}口沿缺 1px 亮+暗硬折角`);

  ok(!!find('.shutter::after'), `${mode}快门穹顶缺釉面窄高光`);
  const flare = find('.lens-flare');
  ok(!!flare && flare.includes('linear-gradient(180deg'), `${mode}镜片缺釉面高光带`);
  ok(flare.includes('18%') || flare.includes('26%'), `${mode}镜片高光带过宽（应收在 18~26% 内）`);
}
/* 单一顶光源：所有径向渐变的光心横向坐标必须是 50%，
   出现 at 14% 22% 这类左上光心就等于多了一个光源。 */
for (const m of fxBlock.matchAll(/at\s+(\d+)%\s+(-?\d+)%/g)) {
  ok(m[1] === '50', `釉面光心横坐标 ${m[1]}%（应为 50%），违反 blog 的单一顶光源规矩`);
}

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
