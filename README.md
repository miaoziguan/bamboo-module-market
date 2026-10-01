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
   /* __bamboo_module_ {"id":"blog","name":"本地博客","version":"0.1.0","fab":{"icon":"book-open","label":"博客"},"location":"left"} */
   ```

2. 在 `manifest.json` 的 `modules` 数组追加一项（注意 `url` 指向本仓库 raw 地址）。
3. 提交并推送到 `main` 分支，插件侧「模块市场」即可看到并安装。
