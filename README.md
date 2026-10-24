# 竹林模块市场

竹林修仙传（Obsidian 插件）的第三方模块分发仓库。插件内「模块市场」面板会从本仓库拉取
`manifest.json`，提供模块的浏览 / 安装 / 更新 / 卸载。

## 目录结构

```
bamboo-module-market/
├── manifest.json        # 模块清单（插件读取此文件）
├── modules/             # 各模块的源码（.js），每个文件顶部用 __bamboo_module_ 声明元信息
└── README.md
```

## 模块清单字段

`manifest.json` 形如：

```json
{
  "name": "竹林模块市场",
  "version": "1.0.0",
  "maintainer": "羽鳞君",
  "license": "MIT",
  "repository": "https://github.com/miaoziguan/bamboo-module-market",
  "modules": [
    {
      "id": "blog",
      "name": "本地博客",
      "author": "羽鳞君",
      "version": "0.1.0",
      "url": "https://raw.githubusercontent.com/miaoziguan/bamboo-module-market/main/modules/blog.js",
      "description": "在画中卷侧栏加载一个极简本地博客界面。"
    }
  ]
}
```

| 字段 | 说明 |
|------|------|
| `id` | 模块唯一标识，与模块文件顶部 `__bamboo_module_` 声明的 `id` 一致 |
| `name` | 显示名 |
| `author` | 作者 |
| `version` | 语义化版本号 |
| `url` | 模块 `.js` 的 raw 下载地址（插件据此下载到本地 `竹林模块/` 目录） |
| `description` | 简介 |

## 发布一个模块

1. 把模块源码放到 `modules/<id>.js`，文件顶部用注释声明元信息：

   ```js
   /* __bamboo_module_ {"id":"blog","name":"本地博客","version":"0.1.0","fab":{"icon":"bookOpen","label":"博客"},"location":"left"} */
   ```

   > ⚠️ `fab.icon` 必须用 **webapp 图标表里的驼峰名**（如 `bookOpen`、`fileText`、`shoppingCart`），
   > 而不是 Lucide 官方的 kebab-case（`book-open`）。宿主 `LucideUtils.createIcon` 按驼峰名查表，
   > 查不到会**静默回退成一个空心圆圈**，不报错但图标完全不对。
   > 可用名见 `webapp/assets/scripts/utils/lucideUtils.js` 的 `ICONS`（约 91 个）。

2. 在 `manifest.json` 的 `modules` 数组追加一项（注意 `url` 指向本仓库 raw 地址）。
3. 提交并推送到 `main` 分支，插件侧「模块市场」即可看到并安装。

## 版本一致性（机制保证）

模块版本号在**两处**出现，必须始终一致，否则市场「可更新」判定 / 已安装版本展示会出现漂移：

1. `manifest.json` → `modules[i].version`
2. `modules/<id>.js` 顶部 `__bamboo_module_ {…"version":…}`

为避免「manifest 已 bump、文件头忘改」这类问题，本仓库提供：

- **校验**：`npm run check:versions`（`scripts/check-versions.mjs`）——逐条比对 manifest 与文件头版本，
  并反向检查 `modules/` 下的 `.js` 是否都已登记在 manifest。不一致即非零退出。
- **同步 bump**：`npm run bump -- <id> --patch`（也支持 `<id> <x.y.z>` / `--minor` / `--major`）
  ——一条命令同时修改 manifest 与文件头，从源头消除「双写」。
- **CI**：`.github/workflows/check-versions.yml` 在 `push` / `PR` 时自动跑校验。
- **本地 pre-commit**：`.githooks/pre-commit` 提交前拦截。一次性启用：

  ```sh
  git config core.hooksPath .githooks
  ```

### 发布流程（推荐）

```sh
npm run bump -- blog --patch     # 同步 bump manifest + 文件头（自动 patch+1）
# 手动补充 manifest 里该模块 description 的变更说明
npm run check:versions           # 复核一致性
git add -A && git commit -m "module: blog vX.Y.Z —— …" && git push origin main
```
