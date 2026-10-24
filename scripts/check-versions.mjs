#!/usr/bin/env node
/**
 * 校验 manifest.json 中每个模块的 version 与 modules/<id>.js 头部
 * `__bamboo_module_ {…}` 里的 version 完全一致。
 *
 * 背景：曾出现「manifest 已 bump、文件头忘改」的漂移
 * （blog 文件头 0.7.9 vs manifest 0.7.10；curtain 0.3.21 vs 0.3.22）。
 * 本脚本把「两处必须是同一版本」变成可自动检测的断言：
 *   - 本地：pre-commit（.githooks/pre-commit）与 `npm run check:versions`
 *   - CI：.github/workflows/check-versions.yml（push / PR）
 *
 * 同时反向检查：modules/ 下的 .js 必须都在 manifest.modules 里登记，避免漏登记导致市场看不到。
 */
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const TAG = '__bamboo_module_';

/** 从模块文件首部解析 `__bamboo_module_ {…}` 元数据（JSON）；失败返回 { error } */
function readHeaderMeta(file, rel) {
  const code = fs.readFileSync(file, 'utf8');
  const i = code.indexOf(TAG);
  if (i < 0) return { error: `${rel} 缺少 ${TAG} 标记` };
  const m = code.slice(i + TAG.length).match(/^\s*(\{[\s\S]*?\})\s*\*\//);
  if (!m) return { error: `${rel} 的 ${TAG} 后未找到 {…} */ 元数据` };
  try {
    return { meta: JSON.parse(m[1]) };
  } catch (e) {
    return { error: `${rel} 的元数据 JSON 解析失败：${e.message}` };
  }
}

const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
const modules = Array.isArray(manifest.modules) ? manifest.modules : [];
const errors = [];
const declared = new Set();

for (const m of modules) {
  if (!m || typeof m.id !== 'string' || !m.id) {
    errors.push('manifest.modules 存在缺少 id 的条目');
    continue;
  }
  const id = m.id;
  declared.add(id);
  const rel = `modules/${id}.js`;
  const file = path.join(ROOT, 'modules', `${id}.js`);
  if (!fs.existsSync(file)) {
    errors.push(`[${id}] 缺少 ${rel}`);
    continue;
  }
  if (typeof m.version !== 'string' || !m.version) {
    errors.push(`[${id}] manifest 缺少 version`);
  }
  const r = readHeaderMeta(file, rel);
  if (r.error) {
    errors.push(`[${id}] ${r.error}`);
    continue;
  }
  if (r.meta.id !== id) {
    errors.push(`[${id}] 文件头 id="${r.meta.id}" 与 manifest id 不一致`);
  }
  if (r.meta.version !== m.version) {
    errors.push(`[${id}] 版本不一致：manifest="${m.version}" 文件头="${r.meta.version}"`);
  }
}

// 反向：modules/ 下的 .js 必须都在 manifest 登记
const dir = path.join(ROOT, 'modules');
if (fs.existsSync(dir)) {
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.js')) continue;
    const id = f.slice(0, -3);
    if (!declared.has(id)) errors.push(`modules/${f} 未在 manifest.modules 登记`);
  }
}

if (errors.length) {
  console.error('❌ 模块版本/元数据校验失败：');
  for (const e of errors) console.error(`  - ${e}`);
  console.error('\n修复：用 `npm run bump -- <id> <version>`（或 `--patch` / `--minor`）同步 manifest 与文件头版本。');
  process.exit(1);
}

console.log('✅ 模块版本一致：' + modules.map((m) => `${m.id}@${m.version}`).join(', '));
