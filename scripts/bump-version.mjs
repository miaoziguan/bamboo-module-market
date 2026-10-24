#!/usr/bin/env node
/**
 * 同步 bump 某模块版本：同时更新 manifest.json 与 modules/<id>.js 文件头
 * `__bamboo_module_` 的 version —— 从机制上消除「两处版本」漂移。
 *
 * 用法：
 *   node scripts/bump-version.mjs <id> <x.y.z>    指定版本
 *   node scripts/bump-version.mjs <id> --patch    当前 patch +1
 *   node scripts/bump-version.mjs <id> --minor    当前 minor +1，patch 归零
 *   node scripts/bump-version.mjs <id> --major    主版本 +1，minor/patch 归零
 *
 * 只改版本号字段；description 的变更说明请自行补充后再 commit。
 * 改完建议跑 `npm run check:versions` 复核。
 */
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const TAG = '__bamboo_module_';
const SELF = 'scripts/bump-version.mjs';

const [, , id, want] = process.argv;
if (!id || !want) {
  console.error(`用法: node ${SELF} <id> <x.y.z | --patch | --minor | --major>`);
  process.exit(1);
}

const manifestPath = path.join(ROOT, 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const entry = (manifest.modules || []).find((m) => m && m.id === id);
if (!entry) {
  console.error(`manifest 中找不到 id="${id}"`);
  process.exit(1);
}

const old = String(entry.version || '0.0.0');
let next = want;
if (want === '--patch' || want === '--minor' || want === '--major') {
  const [maj, min, pat] = old.split('.').map((n) => parseInt(n, 10) || 0);
  if (want === '--patch') next = `${maj}.${min}.${pat + 1}`;
  else if (want === '--minor') next = `${maj}.${min + 1}.0`;
  else next = `${maj + 1}.0.0`;
}
if (!/^\d+\.\d+\.\d+$/.test(next)) {
  console.error(`版本号应形如 1.2.3，收到: ${next}`);
  process.exit(1);
}
if (next === old) {
  console.error(`版本未变化（${old}），无需 bump`);
  process.exit(1);
}

// 1) manifest 版本
entry.version = next;

// 2) 文件头版本（保留其余字段与书写格式）
const file = path.join(ROOT, 'modules', `${id}.js`);
const code = fs.readFileSync(file, 'utf8');
const i = code.indexOf(TAG);
if (i < 0) {
  console.error(`${id}.js 缺少 ${TAG} 标记`);
  process.exit(1);
}
const after = code.slice(i + TAG.length);
const m = after.match(/^\s*(\{[\s\S]*?\})\s*\*\//);
if (!m) {
  console.error(`${id}.js 头部元数据解析失败（应为 ${TAG} {…} */）`);
  process.exit(1);
}
const meta = JSON.parse(m[1]);
meta.version = next;
const rebuilt = code.slice(0, i) + `${TAG} ${JSON.stringify(meta)} */` + after.slice(m[0].length);
fs.writeFileSync(file, rebuilt);
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

console.log(`✅ ${id}: ${old} → ${next}（manifest 与文件头已同步）`);
console.log('提醒：请补充 manifest 的 description 变更说明，再提交。');
