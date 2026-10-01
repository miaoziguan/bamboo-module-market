/* __bamboo_module_ {"id":"blog","name":"本地博客","version":"0.6.2","fab":{"icon":"book-open","label":"博客"},"location":"left"} */
/**
 * 竹林模块 · 本地博客阅读器 v0.4
 *
 * 排版借鉴《竹杖芒鞋》专栏阅读器：竹青色板、宣纸暖白、卡片阴影、圆角留白、
 * 作者卡（描边头像 / 昵称 / handle / 简介）、文章卡片（相对日期 · 字数 · 分类徽章 / 已读淡化）。
 *
 * 交互：点击文章 → 经 api.openFile 在 Obsidian 中央视图打开（侧栏仅作导航）。
 * 单文件自包含（CSS 内联），经「竹林模块市场」分发，落盘 vault 的 竹林模块/ 目录。
 * 运行于 module.html 沙箱，仅通过宿主注入的 api 交互：
 *   api.listFiles / api.readFile / api.openFile / api.resolveResource / api.saveData / api.loadData
 * 沙箱约束：禁用 fetch / XHR / eval / new Function / import / window.parent 等。
 */

var __bamboo_module_blog = (function () {
  var STYLE_ID = 'bamboo-blog-module-style';
  var BAMBOO = '#4a7c59';
  var BAMBOO_DEEP = '#3d6b4a';
  var SEARCH_ICON = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%234a7c59' stroke-width='2' stroke-linecap='round'><circle cx='11' cy='11' r='7'/><line x1='21' y1='21' x2='16.65' y2='16.65'/></svg>";

  var state = {
    profile: {
      nickname: '竹林隐士',
      handle: '',
      bio: '记录所思所想，闲看竹影摇窗。',
      avatar: '',
      links: [], // [{ label, url }]
    },
    rootFolder: '博客',
    files: [],
    readSet: {},
    searchQuery: '',
    searchFull: false,
    filter: 'all',
    groupMode: 'category',
    collapsed: {},
    loading: true,
    error: '',
    selected: null,
    lastRefreshAt: 0,
    _searchTimer: null,
    _contentCache: {},
    _avatarUrl: '',
    view: 'list',
    current: null,
    loadingReader: false,
    readerError: '',
    fontSize: 15,
    focusMode: false,
    readerProgress: {},
  };

  var api = null;
  var root = null;

  /* ────────────── 竹杖芒鞋阅读排版（CSS snippet，按 cssclasses 限定） ────────────── */
  // 移植自《竹杖芒鞋》专栏阅读器 .bwr-body 排版：竹青色板、标题字距、两端对齐正文、
  // 竹林风引用块、竹青链接、圆角居中图片、竹节分割线、表格/列表/代码块、暗色校准。
  // 仅作用于 frontmatter 含 cssclasses: [bamboo-reading] 的笔记（Obsidian 原生阅读视图）。
  var BAMBOO_READING_CSS = [
    '/* 竹杖芒鞋 · 博客阅读排版（cssclasses: bamboo-reading）— 由「本地博客」模块注入 */',
    '.bamboo-reading{',
    '  --bw-bamboo-deep:#3d6b4a;--bw-bamboo:#4a7c59;--bw-bamboo-light:#6a9e6e;--bw-bamboo-pale:#a8c5a0;',
    '  --bw-ink:#2c2c2c;--bw-ink-light:#5a5a5a;--bw-divider:#d4ccb8;--bw-radius:6px;',
    '  --bw-blockquote-bg:rgba(168,197,160,.12);--bw-toc-active-bg:rgba(168,197,160,.15);',
    '}',
    '.bamboo-reading{max-width:38rem;margin:0 auto;padding-top:0;}',
    '.bamboo-reading p{margin-bottom:1.2em;text-align:justify;overflow-wrap:break-word;}',
    '.bamboo-reading h1{font-size:1.45em;margin-top:2em;}',
    '.bamboo-reading h2{font-size:1.35em;margin-top:1.8em;}',
    '.bamboo-reading h3{font-size:1.2em;margin-top:1.6em;}',
    '.bamboo-reading h1,.bamboo-reading h2,.bamboo-reading h3{line-height:1.4;letter-spacing:.02em;font-weight:600;color:var(--bw-ink,var(--text-normal));text-wrap:pretty;word-break:auto-phrase;}',
    '.bamboo-reading :not(pre)>code{white-space:nowrap;text-align:initial;}',
    '.bamboo-reading ::selection{background:color-mix(in srgb,var(--bw-bamboo) 22%,transparent);}',
    '.bamboo-reading a:focus-visible{outline:2px solid var(--bw-bamboo);outline-offset:2px;border-radius:2px;}',
    '.bamboo-reading ul,.bamboo-reading ol{padding-left:1.6em;margin:1.2em 0;}',
    '.bamboo-reading li{margin-bottom:.4em;line-height:1.75;text-align:justify;}',
    '.bamboo-reading li.task-list-item{list-style:none;margin-left:-.2em;}',
    '.bamboo-reading li.task-list-item input[type=checkbox]{margin-right:.5em;accent-color:var(--bw-bamboo);}',
    '.bamboo-reading strong{font-weight:600;color:var(--bw-ink,var(--text-normal));}',
    '.bamboo-reading em{font-style:italic;color:var(--bw-bamboo-deep);}',
    '.bamboo-reading table{width:100%;border-collapse:collapse;margin:1.4em 0;font-size:.95em;}',
    '.bamboo-reading th,.bamboo-reading td{border:1px solid var(--background-modifier-border);padding:8px 12px;text-align:left;}',
    '.bamboo-reading th{background:color-mix(in srgb,var(--bw-bamboo-pale) 16%,transparent);font-weight:600;}',
    '.bamboo-reading sup a{color:var(--bw-bamboo);}',
    '.bamboo-reading .footnotes{font-size:.85em;color:var(--text-muted);}',
    '.bamboo-reading blockquote{border-left:3px solid var(--bw-bamboo-light);background:color-mix(in srgb,var(--bw-bamboo-pale) 12%,transparent);padding:8px 16px;margin:1.2em 0;border-radius:0 4px 4px 0;color:var(--text-muted);text-align:justify;}',
    '.bamboo-reading pre{border-radius:var(--bw-radius);border:1px solid var(--background-modifier-border);}',
    '.bamboo-reading pre,.bamboo-reading code{font-family:"JetBrains Mono","SF Mono","Menlo","Consolas","Liberation Mono",monospace;}',
    '.bamboo-reading code{font-size:.9em;}',
    '.bamboo-reading img{display:block;max-width:100%;height:auto;margin:1.4em auto;border-radius:var(--bw-radius);box-shadow:0 1px 3px color-mix(in srgb,var(--bw-ink) 12%,transparent);}',
    '.bamboo-reading a{color:var(--bw-bamboo);border-bottom:1px solid var(--bw-bamboo-pale);transition:border-color .2s;}',
    '.bamboo-reading a:hover{border-bottom-color:var(--bw-bamboo);}',
    '.bamboo-reading hr{border:none;height:20px;margin:2em 0;background:none;position:relative;}',
    '.bamboo-reading hr::after{content:"";position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:40px;height:2px;background:var(--bw-bamboo-pale);border-radius:1px;}',
    '/* 暗色模式校准 */',
    '.theme-dark .bamboo-reading{',
    '  --bw-bamboo-deep:#7ab890;--bw-bamboo:#8fc59f;--bw-bamboo-light:#a8d6b5;--bw-bamboo-pale:rgba(143,197,159,.25);',
    '  --bw-ink:#e0e0e0;--bw-ink-light:#b0b0b0;--bw-divider:rgba(143,197,159,.15);',
    '  --bw-blockquote-bg:rgba(143,197,159,.08);--bw-toc-active-bg:rgba(143,197,159,.15);',
    '}',
    '.theme-dark .bamboo-reading ::selection{background:color-mix(in srgb,var(--bw-bamboo-pale) 30%,transparent);}',
    '.theme-dark .bamboo-reading blockquote{background:var(--bw-blockquote-bg);border-left-color:var(--bw-bamboo-pale);}',
    '.theme-dark .bamboo-reading em{color:var(--bw-bamboo-deep);}',
    '.theme-dark .bamboo-reading a{color:var(--bw-bamboo);}',
    '.theme-dark .bamboo-reading hr::after{background:var(--bw-bamboo-pale);}',
    '',
  ].join('\n');

  /* ────────────── 样式（对标竹杖芒鞋：竹青、卡片、留白） ────────────── */
  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var st = document.createElement('style');
    st.id = STYLE_ID;
    st.textContent = [
      '.bm-wrap{height:100%;display:flex;flex-direction:column;box-sizing:border-box;font-size:13px;color:var(--text-normal,#2b2b2b);}',
      // 作者卡
      '.bm-header{padding:16px 14px 12px;background:linear-gradient(180deg,rgba(74,124,89,.07),transparent);border-bottom:1px solid var(--background-modifier-border,#e8e4d8);}',
      '.bm-author{display:flex;gap:12px;align-items:center;}',
      '.bm-avatar{width:48px;height:48px;flex:0 0 48px;border-radius:50%;overflow:hidden;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#dce7d6,#cfe0c8);color:' + BAMBOO_DEEP + ';font-size:20px;font-weight:700;border:2px solid #fff;box-shadow:0 2px 7px rgba(74,124,89,.2);cursor:pointer;}',
      '.bm-avatar:hover{opacity:.88;}',
      '.bm-avatar img{width:100%;height:100%;object-fit:cover;}',
      '.bm-author-main{flex:1 1 auto;min-width:0;}',
      '.bm-name-row{display:flex;align-items:center;gap:6px;}',
      '.bm-name{font-size:15px;font-weight:700;letter-spacing:.3px;cursor:pointer;}',
      '.bm-name:hover{color:' + BAMBOO_DEEP + ';}',
      '.bm-handle{font-size:11px;color:var(--text-muted,#8a8a8a);margin-top:2px;letter-spacing:.2px;}',
      '.bm-bio{font-size:12px;line-height:1.65;color:var(--text-muted,#6b6b6b);margin-top:7px;word-break:break-word;}',
      '.bm-icon-btn{flex:0 0 auto;border:none;background:transparent;cursor:pointer;opacity:.45;font-size:15px;padding:2px 4px;color:inherit;line-height:1;transition:opacity .12s,color .12s;}',
      '.bm-icon-btn:hover{opacity:1;color:' + BAMBOO_DEEP + ';}',
      // 编辑表单
      '.bm-form{margin-top:12px;padding:12px;border-radius:12px;background:var(--background-secondary,#eef2e8);box-shadow:inset 0 0 0 1px rgba(74,124,89,.08);}',
      '.bm-label{font-size:11px;opacity:.6;margin:8px 0 3px;}',
      '.bm-label:first-child{margin-top:0;}',
      '.bm-input{width:100%;box-sizing:border-box;padding:7px 9px;border-radius:8px;font:inherit;font-size:13px;border:1px solid rgba(128,128,128,.28);background:var(--background-primary,#fff);color:inherit;transition:border-color .12s,box-shadow .12s;}',
      '.bm-input:focus{outline:none;border-color:' + BAMBOO + ';box-shadow:0 0 0 3px rgba(74,124,89,.12);}',
      '.bm-textarea{width:100%;box-sizing:border-box;padding:7px 9px;border-radius:8px;font:inherit;font-size:13px;resize:vertical;min-height:46px;border:1px solid rgba(128,128,128,.28);background:var(--background-primary,#fff);color:inherit;}',
      '.bm-textarea:focus{outline:none;border-color:' + BAMBOO + ';box-shadow:0 0 0 3px rgba(74,124,89,.12);}',
      '.bm-actions{display:flex;gap:8px;margin-top:12px;}',
      '.bm-btn{flex:1 1 auto;padding:7px 10px;border-radius:8px;cursor:pointer;font:inherit;font-size:13px;border:1px solid rgba(128,128,128,.28);background:var(--background-primary,#fff);color:inherit;transition:.12s;}',
      '.bm-btn:hover{box-shadow:0 1px 3px rgba(0,0,0,.06);}',
      '.bm-btn.primary{background:' + BAMBOO_DEEP + ';color:#fff;border-color:' + BAMBOO_DEEP + ';}',
      '.bm-btn.primary:hover{background:' + BAMBOO + ';}',
      // 工具行
      '.bm-toolbar{padding:10px 14px 8px;}',
      '.bm-search-wrap{position:relative;margin-bottom:10px;}',
      '.bm-search-wrap::before{content:"";position:absolute;left:10px;top:50%;width:14px;height:14px;transform:translateY(-50%);background:url("' + SEARCH_ICON + '") no-repeat center;opacity:.4;pointer-events:none;}',
      '.bm-search{width:100%;box-sizing:border-box;padding:8px 28px 8px 30px;border-radius:9px;font:inherit;font-size:13px;border:1px solid var(--background-modifier-border,#e0ddd2);background:var(--background-primary,#fff);color:inherit;transition:border-color .12s,box-shadow .12s;}',
      '.bm-search:focus{outline:none;border-color:' + BAMBOO + ';box-shadow:0 0 0 3px rgba(74,124,89,.12);}',
      '.bm-search-clear{position:absolute;right:7px;top:50%;transform:translateY(-50%);border:none;background:none;cursor:pointer;opacity:.45;font-size:16px;color:inherit;line-height:1;}',
      '.bm-search-clear:hover{opacity:1;}',
      '.bm-tabs{display:flex;gap:8px;align-items:center;}',
      '.bm-seg{display:flex;background:var(--background-secondary,#eef2e8);border-radius:9px;overflow:hidden;flex:1 1 auto;padding:2px;}',
      '.bm-tab{flex:1 1 0;min-width:0;border:none;background:none;padding:5px 6px;cursor:pointer;font:inherit;font-size:12px;color:var(--text-muted,#777);opacity:.85;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;border-radius:7px;transition:all .12s;}',
      '.bm-tab.is-active{background:var(--background-primary,#fff);color:' + BAMBOO_DEEP + ';font-weight:600;box-shadow:0 1px 3px rgba(0,0,0,.08);opacity:1;}',
      '.bm-refresh{flex:0 0 auto;border:1px solid var(--background-modifier-border,#e0ddd2);background:var(--background-primary,#fff);border-radius:9px;width:32px;height:30px;cursor:pointer;color:var(--text-muted,#777);font-size:14px;transition:.12s;}',
      '.bm-refresh:hover{color:' + BAMBOO_DEEP + ';border-color:' + BAMBOO + ';box-shadow:0 1px 3px rgba(0,0,0,.06);}',
      '.bm-refresh.bm-spin{animation:bm-spin 1s linear infinite;}',
      '@keyframes bm-spin{to{transform:rotate(360deg);}}',
      // 列表
      '.bm-list-region{flex:1 1 auto;overflow:auto;padding:4px 10px 8px;box-sizing:border-box;}',
      '.bm-category{margin-bottom:6px;}',
      '.bm-cat-title{display:flex;align-items:center;gap:6px;padding:11px 4px 6px;cursor:pointer;font-weight:700;font-size:12px;color:var(--text-normal,#444);border-bottom:1px solid var(--background-modifier-border,#ececec);letter-spacing:.3px;}',
      '.bm-cat-count{font-weight:500;font-size:11px;color:var(--text-muted,#aaa);margin-left:auto;}',
      '.bm-arrow{transition:transform .15s ease;opacity:.45;font-size:10px;}',
      '.bm-category.bm-collapsed .bm-arrow{transform:rotate(-90deg);}',
      '.bm-cat-items{overflow:hidden;}',
      '.bm-category.bm-collapsed .bm-cat-items{display:none;}',
      '.bm-item{display:flex;gap:4px;padding:10px 12px;border-radius:10px;cursor:pointer;margin-bottom:4px;align-items:flex-start;border:1px solid transparent;transition:background .12s,box-shadow .12s,border-color .12s;}',
      '.bm-item:hover{background:var(--background-secondary,#f3f5ef);box-shadow:0 1px 3px rgba(0,0,0,.05);}',
      '.bm-item.is-read{opacity:.5;}',
      '.bm-item.is-active{background:var(--background-secondary,#f3f5ef);border-color:rgba(74,124,89,.28);box-shadow:inset 3px 0 0 ' + BAMBOO + ';}',
      '.bm-item-body{flex:1 1 auto;min-width:0;}',
      '.bm-item-title{font-weight:600;font-size:13.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
      '.bm-item-meta{font-size:11px;color:var(--text-muted,#9a9a9a);margin-top:4px;display:flex;gap:5px;align-items:center;flex-wrap:wrap;}',
      '.bm-meta-sep{opacity:.45;}',
      '.bm-badge{font-size:10px;padding:1px 7px;border-radius:10px;background:rgba(74,124,89,.12);color:' + BAMBOO_DEEP + ';font-weight:500;}',
      '.bm-words{color:var(--text-muted,#9a9a9a);}',
      // 骨架 / 空 / 错
      '.bm-skeleton{padding:8px 4px;}',
      '.bm-sk-item{padding:10px 6px;}',
      '.bm-sk-line{height:9px;border-radius:4px;background:var(--background-modifier-border,#e3e0d6);margin-bottom:7px;animation:bm-pulse 1.1s ease-in-out infinite;}',
      '.bm-sk-line-long{width:72%;}.bm-sk-line-mid{width:55%;}.bm-sk-line-short{width:38%;}',
      '@keyframes bm-pulse{0%,100%{opacity:.5;}50%{opacity:1;}}',
      '.bm-empty{padding:30px 14px;text-align:center;color:var(--text-muted,#9a9a9a);font-size:12px;line-height:1.75;}',
      '.bm-empty small{opacity:.75;}',
      '.bm-error{padding:22px 14px;text-align:center;color:var(--text-muted,#777);font-size:12px;line-height:1.7;}',
      '.bm-error .bm-btn{flex:0 0 auto;margin-top:10px;}',
      // 状态栏
      '.bm-status{padding:8px 14px;font-size:11px;color:var(--text-faint,#acacac);border-top:1px solid var(--background-modifier-border,#eee);letter-spacing:.3px;}',
      // 弹层
      '.bm-mask{position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;z-index:9999;}',
      '.bm-modal{background:var(--background-primary,#fff);border-radius:12px;padding:18px;width:min(320px,86%);max-height:80vh;overflow:auto;box-sizing:border-box;color:var(--text-normal,#222);box-shadow:0 12px 40px rgba(0,0,0,.25);}',
      '.bm-modal h3{margin:0 0 10px;font-size:14px;}',
      '.bm-modal p{margin:7px 0;font-size:12px;opacity:.8;line-height:1.7;}',
      '.bm-link{display:block;padding:7px 9px;border-radius:8px;text-decoration:none;color:' + BAMBOO_DEEP + ';font-size:12px;transition:background .12s;}',
      '.bm-link:hover{background:var(--background-secondary,#eef2e8);}',
      '.bm-modal .bm-actions{margin-top:14px;}',
      '.bm-hint{font-size:11px;line-height:1.6;color:var(--text-muted,#888);opacity:.85;margin:2px 0 8px;}',
      '.bm-toast{max-width:300px;line-height:1.7;}',
      // ── 内置阅读视图（继承竹杖芒鞋排版 + 增强） ──
      '.bm-reader{height:100%;display:flex;flex-direction:column;box-sizing:border-box;overflow:hidden;}',
      '.bm-reader-bar{display:flex;align-items:center;gap:6px;padding:7px 9px;border-bottom:1px solid var(--background-modifier-border,#eee);flex:0 0 auto;}',
      '.bm-rbtn{border:1px solid var(--background-modifier-border,#e0ddd2);background:var(--background-primary,#fff);border-radius:8px;padding:4px 9px;cursor:pointer;font:inherit;font-size:12px;color:var(--text-muted,#777);transition:.12s;line-height:1;}',
      '.bm-rbtn:hover{color:' + BAMBOO_DEEP + ';border-color:' + BAMBOO + ';}',
      '.bm-rbtn.primary{background:' + BAMBOO_DEEP + ';color:#fff;border-color:' + BAMBOO_DEEP + ';}',
      '.bm-reader-scroll{flex:1 1 auto;overflow:auto;padding:2px 4px 30px;}',
      '.bm-article-head{padding:12px 12px 4px;}',
      '.bm-ah-title{font-size:17px;font-weight:700;line-height:1.4;letter-spacing:.02em;color:var(--bw-ink,var(--text-normal));}',
      '.bm-ah-meta{font-size:11px;color:var(--text-muted,#9a9a9a);margin-top:6px;display:flex;gap:5px;flex-wrap:wrap;align-items:center;}',
      '.bm-ah-sep{opacity:.45;}',
      '.bm-ah-badge{font-size:10px;padding:1px 7px;border-radius:10px;background:rgba(74,124,89,.12);color:' + BAMBOO_DEEP + ';}',
      '.bm-toc{margin:8px 12px;padding:8px 10px;border-radius:8px;background:var(--background-secondary,#eef2e8);}',
      '.bm-toc-title{font-size:11px;font-weight:600;color:var(--text-muted,#888);margin-bottom:4px;}',
      '.bm-toc-list{display:flex;flex-direction:column;gap:1px;}',
      '.bm-toc-item{font-size:12px;color:var(--text-muted,#777);cursor:pointer;padding:2px 0 2px 8px;border-left:2px solid transparent;}',
      '.bm-toc-item:hover{color:' + BAMBOO_DEEP + ';}',
      '.bm-toc-item.is-active{border-left-color:' + BAMBOO + ';color:' + BAMBOO_DEEP + ';font-weight:600;}',
      '.bm-toc-h2{padding-left:18px;}.bm-toc-h3{padding-left:28px;}.bm-toc-h4{padding-left:38px;}',
      // 正文排版（竹杖芒鞋 .bwr-body → .bm-md）
      '.bm-md{--bw-bamboo-deep:#3d6b4a;--bw-bamboo:#4a7c59;--bw-bamboo-light:#6a9e6e;--bw-bamboo-pale:#a8c5a0;--bw-ink:#2c2c2c;--bw-ink-light:#5a5a5a;--bw-divider:#d4ccb8;--bw-radius:6px;--bw-blockquote-bg:rgba(168,197,160,.12);}',
      '.bm-md{padding:6px 12px 20px;line-height:1.75;}',
      '.bm-md p{margin-bottom:1.2em;text-align:justify;overflow-wrap:break-word;}',
      '.bm-md h1{font-size:1.45em;margin-top:1.6em;}.bm-md h2{font-size:1.35em;margin-top:1.4em;}.bm-md h3{font-size:1.2em;margin-top:1.2em;}',
      '.bm-md h1,.bm-md h2,.bm-md h3{line-height:1.4;letter-spacing:.02em;font-weight:600;color:var(--bw-ink,var(--text-normal));}',
      '.bm-md :not(pre)>code{white-space:nowrap;text-align:initial;background:rgba(74,124,89,.1);padding:1px 5px;border-radius:4px;font-size:.9em;}',
      '.bm-md ::selection{background:color-mix(in srgb,var(--bw-bamboo) 22%,transparent);}',
      '.bm-md ul,.bm-md ol{padding-left:1.6em;margin:1.2em 0;}.bm-md li{margin-bottom:.4em;line-height:1.75;text-align:justify;}',
      '.bm-md li.task-list-item{list-style:none;margin-left:-.2em;}.bm-md li.task-list-item input[type=checkbox]{margin-right:.5em;accent-color:var(--bw-bamboo);}',
      '.bm-md strong{font-weight:600;color:var(--bw-ink,var(--text-normal));}.bm-md em{font-style:italic;color:var(--bw-bamboo-deep);}',
      '.bm-md table{width:100%;border-collapse:collapse;margin:1.4em 0;font-size:.95em;}',
      '.bm-md th,.bm-md td{border:1px solid var(--background-modifier-border);padding:8px 12px;text-align:left;}',
      '.bm-md th{background:color-mix(in srgb,var(--bw-bamboo-pale) 16%,transparent);font-weight:600;}',
      '.bm-md sup a{color:var(--bw-bamboo);}',
      '.bm-md .footnotes{font-size:.85em;color:var(--text-muted);}',
      '.bm-md blockquote{border-left:3px solid var(--bw-bamboo-light);background:color-mix(in srgb,var(--bw-bamboo-pale) 12%,transparent);padding:8px 16px;margin:1.2em 0;border-radius:0 4px 4px 0;color:var(--text-muted);text-align:justify;}',
      '.bm-md pre{border-radius:var(--bw-radius);border:1px solid var(--background-modifier-border);padding:0;margin:1.2em 0;position:relative;overflow:auto;}',
      '.bm-md pre,.bm-md code{font-family:"JetBrains Mono","SF Mono","Menlo","Consolas","Liberation Mono",monospace;}',
      '.bm-md pre code{display:block;padding:12px 14px;font-size:.88em;line-height:1.6;background:transparent;}',
      '.bm-md code{font-size:.9em;}',
      '.bm-md img{display:block;max-width:100%;height:auto;margin:1.4em auto;border-radius:var(--bw-radius);box-shadow:0 1px 3px color-mix(in srgb,var(--bw-ink) 12%,transparent);cursor:zoom-in;}',
      '.bm-md a{color:var(--bw-bamboo);border-bottom:1px solid var(--bw-bamboo-pale);transition:border-color .2s;text-decoration:none;}',
      '.bm-md a:hover{border-bottom-color:var(--bw-bamboo);}',
      '.bm-md hr{border:none;height:20px;margin:2em 0;background:none;position:relative;}',
      '.bm-md hr::after{content:"";position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:40px;height:2px;background:var(--bw-bamboo-pale);border-radius:1px;}',
      '.bm-code-header{display:flex;align-items:center;justify-content:space-between;padding:4px 10px;font-size:10px;color:var(--text-muted,#999);background:var(--background-secondary,#f0f0f0);border-bottom:1px solid var(--background-modifier-border);}',
      '.bm-code-lang{text-transform:uppercase;letter-spacing:.05em;}',
      '.bm-code-copy{border:none;background:none;cursor:pointer;font-size:11px;color:var(--text-muted,#999);padding:0;}',
      '.bm-code-copy:hover{color:' + BAMBOO_DEEP + ';}',
      '.bm-line{display:block;white-space:pre;}',
      '.bm-prevnext{display:flex;gap:8px;margin:18px 12px 0;}',
      '.bm-pn{flex:1 1 0;min-width:0;padding:10px 12px;border-radius:10px;background:var(--background-secondary,#f3f5ef);cursor:pointer;border:1px solid transparent;}',
      '.bm-pn:hover{border-color:rgba(74,124,89,.28);}',
      '.bm-pn-label{font-size:10px;color:var(--text-muted,#aaa);}',
      '.bm-pn-title{font-size:13px;font-weight:600;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
      '.bm-related{margin:18px 12px 0;}',
      '.bm-related-title{font-size:12px;font-weight:700;color:var(--text-normal,#444);margin-bottom:6px;border-bottom:1px solid var(--background-modifier-border,#ececec);padding-bottom:4px;}',
      '.bm-related-link{display:block;font-size:12.5px;color:' + BAMBOO_DEEP + ';padding:5px 0;cursor:pointer;}',
      '.bm-related-link:hover{text-decoration:underline;}',
      '.bm-reader-loading{padding:30px 14px;text-align:center;color:var(--text-muted,#9a9a9a);}',
      '.bm-reader.bm-focus .bm-toc,.bm-reader.bm-focus .bm-article-head{display:none;}',
      '.bm-lightbox-img{max-width:90vw;max-height:90vh;border-radius:8px;}',
      '.theme-dark .bm-md{--bw-bamboo-deep:#7ab890;--bw-bamboo:#8fc59f;--bw-bamboo-light:#a8d6b5;--bw-bamboo-pale:rgba(143,197,159,.25);--bw-ink:#e0e0e0;--bw-blockquote-bg:rgba(143,197,159,.08);}',
      '.theme-dark .bm-md blockquote{background:var(--bw-blockquote-bg);border-left-color:var(--bw-bamboo-pale);}',
      // 隐藏 webview 内默认滚动条（保留滚动能力）：模块外壳 #module-view-root 与内部列表/阅读区统一，
      // 去掉 Chromium 默认那条灰色宽滚动条，观感更贴合竹青排版。
      '#module-view-root,.bm-wrap,.bm-list-region,.bm-reader-scroll,.bm-modal{scrollbar-width:none;-ms-overflow-style:none;}',
      '#module-view-root::-webkit-scrollbar,.bm-wrap::-webkit-scrollbar,.bm-list-region::-webkit-scrollbar,.bm-reader-scroll::-webkit-scrollbar,.bm-modal::-webkit-scrollbar{width:0;height:0;display:none;}',
    ].join('');
    document.head.appendChild(st);
  }

  /* ────────────── 竹杖芒鞋排版注入辅助 ────────────── */
  /** 把指定 cssclass 合并进 markdown 的 frontmatter（无则新建，有则追加，保留原文） */
  function mergeCssClass(content, cls) {
    var fm = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
    if (!fm) return '---\ncssclasses: [' + cls + ']\n---\n\n' + content;
    var block = fm[1];
    if (/^cssclasses\s*:/m.test(block)) {
      if (/cssclasses\s*:\s*\[/.test(block)) {
        return content.replace(/(cssclasses\s*:\s*\[)([^\]]*)(\])/, function (full, a, arr, c) {
          var items = arr.split(',').map(function (s) { return s.trim().replace(/^['"]|['"]$/g, ''); }).filter(Boolean);
          if (items.indexOf(cls) < 0) items.push(cls);
          return a + items.join(', ') + c;
        });
      }
      // 列表形式 cssclasses: \n  - x
      return content.replace(/^(cssclasses\s*:)\r?\n/m, function (full, line) { return line + '\n  - ' + cls + '\n'; });
    }
    return content.replace(/^---\r?\n/, '---\ncssclasses: [' + cls + ']\n');
  }

  /** 轻量提示（复用弹层样式） */
  function showToast(msg) {
    var mask = document.createElement('div');
    mask.className = 'bm-mask';
    mask.innerHTML = '<div class="bm-modal bm-toast"><p style="white-space:pre-wrap">' + esc(msg) + '</p>' +
      '<div class="bm-actions"><button class="bm-btn primary" data-act="close-modal">知道了</button></div></div>';
    mask.addEventListener('click', function (e) {
      if (e.target === mask || (e.target.getAttribute && e.target.getAttribute('data-act') === 'close-modal')) {
        if (mask.parentNode) mask.parentNode.removeChild(mask);
      }
    });
    document.body.appendChild(mask);
  }

  /* ────────────── 工具 ────────────── */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function fmtDate(ms) {
    if (!ms) return '';
    var d = new Date(ms), now = new Date();
    var diff = Math.floor((now.getTime() - d.getTime()) / 86400000);
    if (diff < 1) return '今天';
    if (diff < 2) return '昨天';
    if (diff < 3) return '前天';
    if (diff < 7) return diff + '天前';
    if (diff < 30) return Math.floor(diff / 7) + '周前';
    if (diff < 365) return Math.floor(diff / 30) + '个月前';
    if (d.getFullYear() === now.getFullYear()) return (d.getMonth() + 1) + '月' + d.getDate() + '日';
    return d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日';
  }

  function fmtWords(bytes) {
    if (!bytes) return '';
    var n = Math.max(1, Math.round(bytes / 2.2));
    if (n >= 10000) return '约 ' + (n / 10000).toFixed(1) + ' 万字';
    return '约 ' + n + ' 字';
  }

  function avatarHtml() {
    if (state._avatarUrl) return '<img src="' + esc(state._avatarUrl) + '" alt="">';
    var n = (state.profile.nickname || '竹').trim();
    return esc(n.charAt(0) || '竹');
  }

  function nowClock() {
    var d = new Date();
    function p(x) { return x < 10 ? '0' + x : '' + x; }
    return p(d.getHours()) + ':' + p(d.getMinutes());
  }

  /* ────────────── 渲染 ────────────── */
  function render() {
    if (!root) return;
    if (state.view === 'reader') { renderReader(); return; }
    var html = '<div class="bm-wrap">';

    // 作者卡
    html += '<div class="bm-header">';
    html += '<div class="bm-author">';
    html += '<div class="bm-avatar" data-act="edit" title="点击编辑资料">' + avatarHtml() + '</div>';
    html += '<div class="bm-author-main">';
    html += '<div class="bm-name-row">';
    html += '<span class="bm-name" data-act="edit" title="点击编辑资料">' + esc(state.profile.nickname || '未命名') + '</span>';
    html += '<button class="bm-icon-btn" data-act="about" title="关于 / 投稿" aria-label="关于">ⓘ</button>';
    html += '</div>';
    if (state.profile.handle) html += '<div class="bm-handle">@' + esc(state.profile.handle) + '</div>';
    html += '<div class="bm-bio">' + esc(state.profile.bio || '暂无简介') + '</div>';
    html += '</div></div>';
    if (state.editing) html += renderEditForm();
    html += '</div>';

    // 工具行
    html += '<div class="bm-toolbar">';
    html += '<div class="bm-search-wrap">';
    html += '<input class="bm-search" data-field="search" placeholder="搜索文章…" value="' + esc(state.searchQuery) + '">';
    html += '<button class="bm-search-clear" data-act="clear-search" aria-label="清除">×</button>';
    html += '</div>';
    html += '<div class="bm-tabs">';
    html += '<div class="bm-seg">';
    html += '<button class="bm-tab' + (state.groupMode === 'category' ? ' is-active' : '') + '" data-group="category">分类</button>';
    html += '<button class="bm-tab' + (state.groupMode === 'time' ? ' is-active' : '') + '" data-group="time">时间线</button>';
    html += '</div>';
    html += '<div class="bm-seg">';
    var total = state.files.length;
    var unread = state.files.filter(function (f) { return !state.readSet[f.path]; }).length;
    html += '<button class="bm-tab' + (state.filter === 'all' ? ' is-active' : '') + '" data-filter="all">全部 ' + total + '</button>';
    html += '<button class="bm-tab' + (state.filter === 'unread' ? ' is-active' : '') + '" data-filter="unread">未读 ' + unread + '</button>';
    html += '</div>';
    html += '<button class="bm-refresh' + (state.loading ? ' bm-spin' : '') + '" data-act="refresh" title="刷新" aria-label="刷新">⟳</button>';
    html += '</div>';

    // 列表区
    html += '<div class="bm-list-region" data-region="list">' + renderListInner() + '</div>';

    // 状态栏
    html += '<div class="bm-status">' + renderStatus() + '</div>';

    html += '</div>';
    root.innerHTML = html;
    bind();
  }

  function renderEditForm() {
    var links = (state.profile.links || []).map(function (l) { return l.label + '|' + l.url; }).join('\n');
    return '<div class="bm-form">' +
      '<div class="bm-label">文章根目录（vault 内文件夹，文章按子目录自动分类）</div>' +
      '<input class="bm-input" data-field="rootFolder" value="' + esc(state.rootFolder) + '" placeholder="如 博客">' +
      '<div class="bm-label">昵称</div>' +
      '<input class="bm-input" data-field="nickname" value="' + esc(state.profile.nickname) + '" placeholder="博客作者名">' +
      '<div class="bm-label">用户名 / handle（显示 @xxx，可选）</div>' +
      '<input class="bm-input" data-field="handle" value="' + esc(state.profile.handle) + '" placeholder="如 miaoziguan">' +
      '<div class="bm-label">简介</div>' +
      '<textarea class="bm-textarea" data-field="bio" placeholder="一句话介绍这个博客">' + esc(state.profile.bio) + '</textarea>' +
      '<div class="bm-label">头像（vault 内图片路径，如 attachments/avatar.png，或填写 https 图片链接）</div>' +
      '<input class="bm-input" data-field="avatar" value="' + esc(state.profile.avatar) + '" placeholder="留空显示昵称首字，或填 https:// 图片 URL">' +
      '<div class="bm-label">平台链接（每行「标签|网址」，如 GitHub|https://github.com/...）</div>' +
      '<textarea class="bm-textarea" data-field="links" placeholder="GitHub|https://github.com/miaoziguan">' + esc(links) + '</textarea>' +
      '<div class="bm-actions">' +
      '<button class="bm-btn primary" data-act="save">保存</button>' +
      '<button class="bm-btn" data-act="cancel">取消</button>' +
      '</div>' +
      '<div class="bm-label" style="margin-top:14px">竹杖芒鞋文章排版</div>' +
      '<div class="bm-hint">为文章注入 cssclasses: bamboo-reading，并把竹青排版片段写入 vault 的 .obsidian/snippets/bamboo-reading.css。在 Obsidian 设置 → 外观 → CSS 片段 启用「bamboo-reading」后，点文章在中央打开即套用该排版（标题/引用/代码/图片/竹节分割线/竹青色板）。</div>' +
      '<button class="bm-btn primary" data-act="apply-typography">应用排版到全部文章</button>' +
      '</div>';
  }

  function renderStatus() {
    if (state.loading) return '读取中…';
    if (state.error) return state.error;
    if (!state.files.length) return '目录「' + esc(state.rootFolder) + '」暂无文章';
    return state.lastRefreshAt ? ('更新于 ' + nowClock()) : '共 ' + state.files.length + ' 篇';
  }

  function renderListInner() {
    if (state.loading) return renderSkeleton();
    if (state.error) return renderError();
    var pool = filterPool();
    if (!pool.length) {
      if (state.searchQuery) return '<div class="bm-empty">没有匹配的文章<br><small>搜索词：' + esc(state.searchQuery) + '</small></div>';
      if (state.filter === 'unread') return '<div class="bm-empty">所有文章都已读<br><small>切换到「全部」查看完整列表</small></div>';
      return '<div class="bm-empty">目录「' + esc(state.rootFolder) + '」下还没有文章<br><small>把 Markdown 笔记放进该目录，或点上方「分类」旁刷新</small></div>';
    }
    if (state.groupMode === 'time') return renderTimeline(pool);
    return renderByCategory(pool);
  }

  function renderSkeleton() {
    var s = '<div class="bm-skeleton">';
    for (var i = 0; i < 5; i++) {
      s += '<div class="bm-sk-item"><div class="bm-sk-line bm-sk-line-long"></div><div class="bm-sk-line bm-sk-line-mid"></div><div class="bm-sk-line bm-sk-line-short"></div></div>';
    }
    return s + '</div>';
  }

  function renderError() {
    return '<div class="bm-error"><div>' + esc(state.error) + '</div>' +
      '<button class="bm-btn primary" data-act="refresh">重试</button></div>';
  }

  function renderByCategory(pool) {
    var groups = groupByCategory(pool);
    if (!groups.length) return '<div class="bm-empty">没有匹配的文章</div>';
    var html = '';
    for (var i = 0; i < groups.length; i++) {
      var g = groups[i];
      var collapsed = state.collapsed[g.name] ? ' bm-collapsed' : '';
      html += '<div class="bm-category' + collapsed + '" data-cat="' + esc(g.name) + '">';
      html += '<div class="bm-cat-title" data-act="toggle-cat"><span class="bm-arrow">▾</span>' +
        '<span>' + esc(g.name) + '</span><span class="bm-cat-count">' + g.articles.length + '</span></div>';
      html += '<div class="bm-cat-items">';
      for (var j = 0; j < g.articles.length; j++) html += renderItem(g.articles[j]);
      html += '</div></div>';
    }
    return html;
  }

  function renderTimeline(pool) {
    var buckets = bucketByRelative(pool);
    var html = '';
    for (var b = 0; b < buckets.length; b++) {
      var bk = buckets[b];
      html += '<div class="bm-category"><div class="bm-cat-title"><span>' + esc(bk.label) + '</span>' +
        '<span class="bm-cat-count">' + bk.articles.length + '</span></div><div class="bm-cat-items">';
      for (var i = 0; i < bk.articles.length; i++) html += renderItem(bk.articles[i]);
      html += '</div></div>';
    }
    return html;
  }

  function renderItem(f) {
    var isRead = !!state.readSet[f.path];
    var cls = 'bm-item' + (isRead ? ' is-read' : '') + (state.selected === f.path ? ' is-active' : '');
    var html = '<div class="' + cls + '" data-path="' + esc(f.path) + '" tabindex="0" role="button">';
    html += '<div class="bm-item-body">';
    html += '<div class="bm-item-title">' + esc(f.name) + '</div>';
    html += '<div class="bm-item-meta">';
    html += '<span class="bm-date">' + fmtDate(f.mtime) + '</span>';
    if (f.size) html += '<span class="bm-meta-sep">·</span><span class="bm-words">' + fmtWords(f.size) + '</span>';
    if (f.category && f.category !== '未分类') html += '<span class="bm-meta-sep">·</span><span class="bm-badge">' + esc(f.category) + '</span>';
    html += '</div>';
    html += '</div></div>';
    return html;
  }

  /* ────────────── 过滤 / 分组 ────────────── */
  function filterPool() {
    var pool = state.files;
    if (state.filter === 'unread') pool = pool.filter(function (f) { return !state.readSet[f.path]; });
    if (state.searchQuery) {
      var q = state.searchQuery.toLowerCase();
      pool = pool.filter(function (f) {
        if (matchText(q, f.name) || matchText(q, f.category)) return true;
        if (state.searchFull) {
          var c = state._contentCache[f.path];
          if (c && c.indexOf(q) >= 0) return true;
        }
        return false;
      });
    }
    return pool;
  }

  function matchText(q, s) { return s ? String(s).toLowerCase().indexOf(q) >= 0 : false; }

  function groupByCategory(pool) {
    var map = {};
    for (var i = 0; i < pool.length; i++) {
      var c = pool[i].category || '未分类';
      if (!map[c]) map[c] = [];
      map[c].push(pool[i]);
    }
    return Object.keys(map).map(function (k) {
      return { name: k, articles: map[k].sort(function (a, b) { return b.mtime - a.mtime; }) };
    }).sort(function (a, b) {
      return (b.articles[0] ? b.articles[0].mtime : 0) - (a.articles[0] ? a.articles[0].mtime : 0);
    });
  }

  function bucketByRelative(pool) {
    var now = new Date(), y = now.getFullYear(), q = Math.floor(now.getMonth() / 3);
    var qStart = new Date(y, q * 3, 1), qEnd = new Date(y, q * 3 + 3, 0);
    var buckets = { quarter: [], year: [], older: [] };
    for (var i = 0; i < pool.length; i++) {
      var d = new Date(pool[i].mtime);
      if (isNaN(d.getTime())) buckets.older.push(pool[i]);
      else if (d >= qStart && d <= qEnd) buckets.quarter.push(pool[i]);
      else if (d.getFullYear() === y) buckets.year.push(pool[i]);
      else buckets.older.push(pool[i]);
    }
    var labels = { quarter: '本季 · ' + y + ' Q' + (q + 1), year: '今年 · ' + y, older: '更早' };
    return ['quarter', 'year', 'older'].filter(function (k) { return buckets[k].length; })
      .map(function (k) {
        return { key: k, label: labels[k], articles: buckets[k].sort(function (a, b) { return b.mtime - a.mtime; }) };
      });
  }

  /* ────────────── 事件绑定 ────────────── */
  function bind() {
    if (!root) return;
    root.removeEventListener('click', onRootClick);
    root.addEventListener('click', onRootClick);
    root.removeEventListener('keydown', onRootKey);
    root.addEventListener('keydown', onRootKey);
    var search = root.querySelector('[data-field="search"]');
    if (search) {
      search.addEventListener('input', function (e) {
        state.searchQuery = e.target.value;
        scheduleSearch();
      });
    }
  }

  function onRootClick(e) {
    var el = e.target;
    while (el && el !== root) {
      if (el.getAttribute && el.getAttribute('data-act')) {
        var act = el.getAttribute('data-act');
        if (act === 'edit') { toggleEdit(); return; }
        if (act === 'about') { openAbout(); return; }
        if (act === 'cancel') { state.editing = false; render(); return; }
        if (act === 'save') { saveProfile(); return; }
        if (act === 'apply-typography') { applyTypography(); return; }
        if (act === 'back-to-list') { backToList(); return; }
        if (act === 'open-central') { openCentral(); return; }
        if (act === 'font-inc') { changeFont(1); return; }
        if (act === 'font-dec') { changeFont(-1); return; }
        if (act === 'font-reset') { changeFont(0); return; }
        if (act === 'toggle-focus') { toggleFocus(); return; }
        if (act === 'refresh') { refresh(); return; }
        if (act === 'clear-search') { state.searchQuery = ''; state.searchFull = false; render(); return; }
        if (act === 'toggle-cat') {
          var cat = el.parentNode.getAttribute('data-cat');
          if (cat) state.collapsed[cat] = !state.collapsed[cat];
          render(); return;
        }
      }
      if (el.getAttribute && el.getAttribute('data-group')) { state.groupMode = el.getAttribute('data-group'); render(); return; }
      if (el.getAttribute && el.getAttribute('data-filter')) { state.filter = el.getAttribute('data-filter'); render(); return; }
      if (el.getAttribute && el.getAttribute('data-path')) { openArticle(el.getAttribute('data-path')); return; }
      el = el.parentNode;
    }
  }

  function onRootKey(e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    var el = e.target;
    if (el && el.getAttribute && el.getAttribute('data-path')) {
      e.preventDefault();
      openArticle(el.getAttribute('data-path'));
    }
  }

  function scheduleSearch() {
    state.searchFull = false;
    render();
    if (state._searchTimer) clearTimeout(state._searchTimer);
    state._searchTimer = setTimeout(applyFullText, 220);
  }

  function applyFullText() {
    if (!state.searchQuery) return;
    var q = state.searchQuery.toLowerCase();
    var need = filterPool().filter(function (f) { return !state._contentCache[f.path]; });
    if (!need.length) { state.searchFull = true; render(); return; }
    var idx = 0;
    function step() {
      if (idx >= need.length) { state.searchFull = true; render(); return; }
      var f = need[idx++];
      api.readFile(f.path).then(function (content) {
        state._contentCache[f.path] = (content || '').toLowerCase();
        if (matchText(q, f.name) || matchText(q, f.category) || state._contentCache[f.path].indexOf(q) >= 0) render();
        step();
      }).catch(function () { step(); });
    }
    step();
  }

  /* ────────────── 行为 ────────────── */
  function toggleEdit() { state.editing = !state.editing; render(); }

  /* 一键应用竹杖芒鞋排版：写入 CSS 片段 + 给全部文章注入 cssclasses */
  async function applyTypography() {
    if (!api) return;
    var cls = 'bamboo-reading';
    var snippetPath = '.obsidian/snippets/bamboo-reading.css';
    try {
      await api.writeFile(snippetPath, BAMBOO_READING_CSS);
    } catch (e) {
      showToast('排版片段写入失败：' + (e && e.message ? e.message : e));
      return;
    }
    var ok = 0, skip = 0, fail = 0;
    for (var i = 0; i < state.files.length; i++) {
      var p = state.files[i].path;
      try {
        var content = await api.readFile(p);
        if (content == null) { fail++; continue; }
        if (/cssclasses[\s\S]*\bbamboo-reading\b/.test(content)) { skip++; continue; }
        var next = mergeCssClass(content, cls);
        if (next === content) { skip++; continue; }
        await api.writeFile(p, next);
        ok++;
      } catch (e) { fail++; }
    }
    var msg = '已把竹青排版片段写入 ' + snippetPath + '，并为 ' + ok + ' 篇文章注入 cssclasses';
    if (skip) msg += '（' + skip + ' 篇已应用，跳过）';
    if (fail) msg += '；' + fail + ' 篇写入失败';
    msg += '。\n\n请到 Obsidian 设置 → 外观 → CSS 片段，点击刷新并启用「bamboo-reading」。之后点文章在中央打开即套用竹杖芒鞋排版。';
    showToast(msg);
  }

  /* ────────────── 内置阅读（继承竹杖芒鞋排版与增强） ────────────── */
  function slugify(text) {
    return (text || '').toLowerCase().replace(/[^\w\u4e00-\u9fff]+/g, '-').replace(/^-|-$/g, '');
  }

  function stripFrontmatter(raw) {
    return raw.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '').replace(/^---\r?\n[\s\S]*?\r?\n---$/, '');
  }

  /** 中英混排窄空格预处理（保护代码块/行内代码，避免误伤） */
  function preprocessMarkdown(md) {
    var codeBlocks = [], inlineCodes = [];
    var processed = md.replace(/```[\s\S]*?```/g, function (m) { codeBlocks.push(m); return ' CB' + (codeBlocks.length - 1) + ' '; });
    processed = processed.replace(/`[^`]*`/g, function (m) { inlineCodes.push(m); return ' IC' + (inlineCodes.length - 1) + ' '; });
    processed = processed
      .replace(/([\u4e00-\u9fff\u3400-\u4dbf\uff00-\uffef])([a-zA-Z0-9@&%$#])/g, '$1\u2009$2')
      .replace(/([a-zA-Z0-9@&%$#])([\u4e00-\u9fff\u3400-\u4dbf\uff00-\uffef])/g, '$1\u2009$2');
    processed = processed.replace(/ IC(\d+) /g, function (_, i) { return inlineCodes[+i] || ''; });
    processed = processed.replace(/ CB(\d+) /g, function (_, i) { return codeBlocks[+i] || ''; });
    return processed;
  }

  function parseArticle(raw, path) {
    var meta = {
      path: path,
      title: (path.split('/').pop() || '').replace(/\.md$/i, ''),
      date: '', tags: [], category: categoryOf(path),
      author: state.profile.nickname,
      mtime: (state.files.find(function (f) { return f.path === path; }) || {}).mtime || 0,
    };
    var m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
    if (m) {
      var fm = m[1];
      var t = fm.match(/title\s*:\s*(.+)/); if (t) meta.title = t[1].trim().replace(/^['"]|['"]$/g, '');
      var d = fm.match(/date\s*:\s*(.+)/); if (d) meta.date = d[1].trim().replace(/^['"]|['"]$/g, '').slice(0, 10);
      var tg = fm.match(/tags\s*:\s*\[([^\]]*)\]/); if (tg) meta.tags = tg[1].split(',').map(function (s) { return s.trim().replace(/^['"]|['"]$/g, ''); }).filter(Boolean);
      var au = fm.match(/author\s*:\s*(.+)/); if (au) meta.author = au[1].trim().replace(/^['"]|['"]$/g, '');
    }
    return meta;
  }

  function loadReaderProgress(path) { return state.readerProgress[path] || 0; }
  var _progTimer = null;
  function scheduleSaveProgress(top) {
    if (!state.current) return;
    state.readerProgress[state.current.path] = top;
    if (_progTimer) clearTimeout(_progTimer);
    _progTimer = setTimeout(persist, 200);
  }

  function backToList() { state.view = 'list'; state.current = null; state.readerError = ''; render(); }
  function openCentral() { if (state.current && api) api.openReader(state.current.path); }
  function changeFont(d) {
    if (d === 0) state.fontSize = 15;
    else state.fontSize = Math.max(12, Math.min(22, state.fontSize + d * 2));
    var md = root && root.querySelector('.bm-md'); if (md) md.style.fontSize = state.fontSize + 'px';
    persist();
  }
  function toggleFocus() { state.focusMode = !state.focusMode; persist(); render(); }
  function applyFontSize() { var md = root && root.querySelector('.bm-md'); if (md) md.style.fontSize = state.fontSize + 'px'; }

  function openArticle(path) { if (api) api.openReader(path); }

  async function enterReader(path) {
    state.view = 'reader';
    state.current = null;
    state.loadingReader = true;
    state.readerError = '';
    render();
    try {
      var raw = await api.readFile(path);
      var meta = parseArticle(raw, path);
      var body = stripFrontmatter(raw);
      var pre = preprocessMarkdown(body);
      var html = await api.renderMarkdown({ content: pre, sourcePath: path });
      state.current = { path: path, html: html, meta: meta };
      state.loadingReader = false;
      render();
      enhanceReader();
    } catch (e) {
      state.readerError = (e && e.message) ? e.message : '加载失败';
      state.loadingReader = false;
      render();
    }
    markRead(path);
  }

  function renderReader() {
    var html = '<div class="bm-reader' + (state.focusMode ? ' bm-focus' : '') + '">';
    html += '<div class="bm-reader-bar">';
    html += '<button class="bm-rbtn" data-act="back-to-list">← 列表</button>';
    html += '<button class="bm-rbtn" data-act="font-dec" title="减小字号">A⁻</button>';
    html += '<button class="bm-rbtn" data-act="font-reset" title="重置字号">A</button>';
    html += '<button class="bm-rbtn" data-act="font-inc" title="增大字号">A⁺</button>';
    html += '<button class="bm-rbtn' + (state.focusMode ? ' primary' : '') + '" data-act="toggle-focus" title="专注模式">◎</button>';
    html += '<button class="bm-rbtn primary" data-act="open-central" title="在 Obsidian 打开">↗ 中央</button>';
    html += '</div>';
    if (state.loadingReader) {
      html += '<div class="bm-reader-scroll"><div class="bm-reader-loading">正在加载文章…</div></div>';
      root.innerHTML = html; bind(); return;
    }
    if (state.readerError) {
      html += '<div class="bm-reader-scroll"><div class="bm-error"><div>' + esc(state.readerError) + '</div><button class="bm-btn primary" data-act="back-to-list">返回</button></div></div>';
      root.innerHTML = html; bind(); return;
    }
    var c = state.current;
    if (!c) { backToList(); return; }
    html += '<div class="bm-reader-scroll" data-region="reader">';
    html += '<div class="bm-article-head">';
    html += '<div class="bm-ah-title">' + esc(c.meta.title) + '</div>';
    html += '<div class="bm-ah-meta">';
    html += '<span>' + esc(c.meta.author || '') + '</span>';
    if (c.meta.date) { html += '<span class="bm-ah-sep">·</span><span>' + esc(c.meta.date) + '</span>'; }
    if (c.meta.category && c.meta.category !== '未分类') { html += '<span class="bm-ah-sep">·</span><span class="bm-ah-badge">' + esc(c.meta.category) + '</span>'; }
    html += '</div>';
    if (c.meta.tags && c.meta.tags.length) {
      html += '<div class="bm-ah-meta">';
      for (var i = 0; i < c.meta.tags.length; i++) html += '<span class="bm-ah-badge">' + esc(c.meta.tags[i]) + '</span>';
      html += '</div>';
    }
    html += '</div>';
    html += '<div class="bm-md" data-region="md">' + (c.html || '') + '</div>';
    html += '<div data-region="pn"></div>';
    html += '<div data-region="related"></div>';
    html += '</div>';
    root.innerHTML = html;
    bind();
    enhanceReader();
  }

  function enhanceReader() {
    var scroll = root.querySelector('[data-region="reader"]');
    var md = root.querySelector('[data-region="md"]');
    if (!md) return;
    var heads = md.querySelectorAll('h1,h2,h3,h4');
    var toc = [];
    heads.forEach(function (h) {
      var id = slugify(h.textContent || '');
      h.id = id;
      toc.push({ level: h.tagName.charAt(1), text: h.textContent, id: id });
    });
    md.querySelectorAll('pre').forEach(function (pre) { enhanceCode(pre); });
    md.querySelectorAll('img').forEach(function (img) {
      img.addEventListener('click', function () { showLightbox(img.src, img.alt); });
    });
    var head = root.querySelector('.bm-article-head');
    if (toc.length >= 2 && head) {
      var tc = document.createElement('div'); tc.className = 'bm-toc';
      tc.innerHTML = '<div class="bm-toc-title">目录</div><div class="bm-toc-list">' +
        toc.map(function (t) { return '<div class="bm-toc-item bm-toc-h' + t.level + '" data-toc="' + esc(t.id) + '">' + esc(t.text) + '</div>'; }).join('') + '</div>';
      head.parentNode.insertBefore(tc, md);
      tc.querySelectorAll('.bm-toc-item').forEach(function (it) {
        it.addEventListener('click', function () {
          var el = document.getElementById(it.getAttribute('data-toc'));
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      });
    }
    renderPrevNextRelated();
    if (state.current) {
      var saved = loadReaderProgress(state.current.path);
      if (saved && scroll) scroll.scrollTop = saved;
    }
    if (scroll) {
      scroll.addEventListener('scroll', function () {
        updateTocSpy(scroll);
        scheduleSaveProgress(scroll.scrollTop);
      }, { passive: true });
    }
    applyFontSize();
  }

  function enhanceCode(pre) {
    var code = pre.querySelector('code');
    var lang = code ? (code.className.match(/language-(\w+)/) || [])[1] : null;
    pre.classList.add('bm-code');
    var header = document.createElement('div'); header.className = 'bm-code-header';
    if (lang) { var l = document.createElement('span'); l.className = 'bm-code-lang'; l.textContent = lang; header.appendChild(l); }
    var copy = document.createElement('button'); copy.className = 'bm-code-copy'; copy.textContent = '复制';
    copy.addEventListener('click', function () {
      var txt = code ? code.textContent : pre.textContent;
      if (navigator.clipboard) navigator.clipboard.writeText(txt).then(function () { copy.textContent = '已复制 ✓'; setTimeout(function () { copy.textContent = '复制'; }, 1500); });
    });
    header.appendChild(copy);
    pre.insertBefore(header, pre.firstChild);
    if (code) {
      var nodes = Array.prototype.slice.call(code.childNodes);
      var lines = [[]];
      nodes.forEach(function (child) {
        if (child.nodeType === 3) {
          var parts = (child.textContent || '').split('\n');
          for (var i = 0; i < parts.length; i++) { if (parts[i]) lines[lines.length - 1].push(document.createTextNode(parts[i])); if (i < parts.length - 1) lines.push([]); }
        } else if (child.nodeName === 'BR') { lines.push([]); }
        else { lines[lines.length - 1].push(child.cloneNode(true)); }
      });
      code.textContent = '';
      var frag = document.createDocumentFragment();
      for (var i = 0; i < lines.length; i++) {
        var sp = document.createElement('span'); sp.className = 'bm-line';
        lines[i].forEach(function (n) { sp.appendChild(n); });
        frag.appendChild(sp);
        if (i < lines.length - 1) frag.appendChild(document.createTextNode('\n'));
      }
      code.appendChild(frag);
    }
  }

  function showLightbox(src, alt) {
    var mask = document.createElement('div'); mask.className = 'bm-mask';
    var img = document.createElement('img'); img.className = 'bm-lightbox-img'; img.src = src; img.alt = alt || '';
    mask.appendChild(img);
    mask.addEventListener('click', function (e) { if (e.target === mask && mask.parentNode) mask.parentNode.removeChild(mask); });
    document.body.appendChild(mask);
  }

  function renderPrevNextRelated() {
    var c = state.current; if (!c) return;
    var pn = root.querySelector('[data-region="pn"]');
    var rel = root.querySelector('[data-region="related"]');
    var cat = c.meta.category || '未分类';
    var same = state.files.filter(function (f) { return (f.category || '未分类') === cat; }).sort(function (a, b) { return b.mtime - a.mtime; });
    var idx = same.findIndex(function (f) { return f.path === c.meta.path; });
    var html = '';
    if (same.length >= 2 && idx >= 0) {
      var prev = idx < same.length - 1 ? same[idx + 1] : null;
      var next = idx > 0 ? same[idx - 1] : null;
      html += '<div class="bm-prevnext">';
      if (prev) html += '<div class="bm-pn" data-path="' + esc(prev.path) + '"><div class="bm-pn-label">← 上一篇</div><div class="bm-pn-title">' + esc(prev.name) + '</div></div>';
      else html += '<div class="bm-pn"></div>';
      if (next) html += '<div class="bm-pn" data-path="' + esc(next.path) + '"><div class="bm-pn-label">下一篇 →</div><div class="bm-pn-title">' + esc(next.name) + '</div></div>';
      else html += '<div class="bm-pn"></div>';
      html += '</div>';
    }
    if (pn) pn.innerHTML = html;
    var relList = same.filter(function (f) { return f.path !== c.meta.path; }).slice(0, 3);
    if (relList.length && rel) {
      var rh = '<div class="bm-related"><div class="bm-related-title">相关阅读</div>';
      relList.forEach(function (f) { rh += '<div class="bm-related-link" data-path="' + esc(f.path) + '">' + esc(f.name) + '</div>'; });
      rh += '</div>';
      rel.innerHTML = rh;
    }
  }

  function updateTocSpy(scroll) {
    var items = root.querySelectorAll('.bm-toc-item');
    if (!items.length) return;
    var active = null;
    items.forEach(function (it) {
      var el = document.getElementById(it.getAttribute('data-toc'));
      if (el && (el.offsetTop - scroll.offsetTop) <= scroll.scrollTop + 60) active = it;
    });
    items.forEach(function (it) { it.classList.toggle('is-active', it === active); });
  }

  function markRead(path) {
    if (state.readSet[path]) return;
    state.readSet[path] = true;
    persist();
    render();
  }

  function saveProfile() {
    if (!root) return;
    var rf = root.querySelector('[data-field="rootFolder"]');
    var nick = root.querySelector('[data-field="nickname"]');
    var handle = root.querySelector('[data-field="handle"]');
    var bio = root.querySelector('[data-field="bio"]');
    var av = root.querySelector('[data-field="avatar"]');
    var linksEl = root.querySelector('[data-field="links"]');
    if (rf) state.rootFolder = rf.value.trim() || '博客';
    if (nick) state.profile.nickname = nick.value.trim();
    if (handle) state.profile.handle = handle.value.trim();
    if (bio) state.profile.bio = bio.value.trim();
    if (av) state.profile.avatar = av.value.trim();
    if (linksEl) {
      state.profile.links = linksEl.value.split('\n').map(function (line) {
        var p = line.split('|');
        return { label: (p[0] || '').trim(), url: (p[1] || '').trim() };
      }).filter(function (l) { return l.label && l.url; });
    }
    state.editing = false;
    persist();
    if (/^https?:\/\//i.test(state.profile.avatar || '')) {
      state._avatarUrl = state.profile.avatar;
      render();
    } else if (state.profile.avatar && api) {
      api.resolveResource(state.profile.avatar).then(function (url) {
        state._avatarUrl = url || '';
        render();
      }).catch(function () { render(); });
    } else {
      state._avatarUrl = '';
      render();
    }
    if (rf) refresh();
  }

  function persist() {
    if (!api) return;
    api.saveData({
      profile: state.profile,
      rootFolder: state.rootFolder,
      readSet: state.readSet,
      fontSize: state.fontSize,
      focusMode: state.focusMode,
      readerProgress: state.readerProgress,
    });
  }

  function openAbout() {
    var links = state.profile.links && state.profile.links.length
      ? state.profile.links
      : [{ label: 'GitHub', url: 'https://github.com/miaoziguan' }];
    var linkHtml = links.map(function (l) {
      return '<a class="bm-link" href="' + esc(l.url) + '" target="_blank" rel="noopener noreferrer">' + esc(l.label) + '</a>';
    }).join('');
    var mask = document.createElement('div');
    mask.className = 'bm-mask';
    mask.innerHTML = '<div class="bm-modal">' +
      '<h3>关于「' + esc(state.profile.nickname || '本地博客') + '」</h3>' +
      '<p>' + esc(state.profile.bio || '') + '</p>' +
      '<p>欢迎交流与投稿。若你有想分享的文章、想法或合作意向，可通过下方平台联系我。</p>' +
      linkHtml +
      '<div class="bm-actions"><button class="bm-btn primary" data-act="close-modal">关闭</button></div>' +
      '</div>';
    mask.addEventListener('click', function (e) {
      if (e.target === mask || (e.target.getAttribute && e.target.getAttribute('data-act') === 'close-modal')) {
        if (mask.parentNode) mask.parentNode.removeChild(mask);
      }
    });
    document.body.appendChild(mask);
  }

  /* ────────────── 数据 ────────────── */
  function categoryOf(path) {
    var rel = path.split('/');
    if (rel.length <= 1) return '未分类';
    rel = rel.slice(0, rel.length - 1);
    if (rel[0] === state.rootFolder) rel = rel.slice(1);
    if (!rel.length) return '未分类';
    return rel.join('/');
  }

  async function refresh() {
    state.loading = true;
    state.error = '';
    render();
    try {
      var files = await api.listFiles(state.rootFolder, true);
      state.files = (files || []).map(function (f) {
        return {
          path: f.path,
          name: f.name.replace(/\.md$/i, ''),
          mtime: f.mtime || 0,
          ctime: f.ctime || 0,
          size: f.size || 0,
          category: categoryOf(f.path),
        };
      });
      state._contentCache = {};
      state.lastRefreshAt = Date.now();
    } catch (e) {
      state.error = '目录读取失败：' + (e && e.message ? e.message : '未知错误');
      state.files = [];
    }
    state.loading = false;
    render();
  }

  async function loadAll() {
    try {
      var d = await api.loadData();
      if (d) {
        if (d.profile) {
          state.profile.nickname = d.profile.nickname || state.profile.nickname;
          state.profile.handle = d.profile.handle || '';
          state.profile.bio = d.profile.bio || state.profile.bio;
          state.profile.avatar = d.profile.avatar || '';
          state.profile.links = d.profile.links || [];
        }
        if (d.rootFolder) state.rootFolder = d.rootFolder;
        if (d.readSet) state.readSet = d.readSet || {};
        if (typeof d.fontSize === 'number') state.fontSize = d.fontSize;
        if (typeof d.focusMode === 'boolean') state.focusMode = d.focusMode;
        if (d.readerProgress) state.readerProgress = d.readerProgress || {};
      }
    } catch (e) { /* 首次运行无数据 */ }

    state._avatarUrl = '';
    var av0 = state.profile.avatar;
    if (av0) {
      if (/^https?:\/\//i.test(av0)) { state._avatarUrl = av0; }
      else if (api) { try { state._avatarUrl = (await api.resolveResource(av0)) || ''; } catch (e) {} }
    }
    await refresh();
  }

  /* ────────────── 生命周期 ────────────── */
  return {
    name: '本地博客',
    mount: function (container, a) {
      api = a;
      root = container;
      ensureStyle();
      render();
      loadAll();
    },
    destroy: function () {
      var st = document.getElementById(STYLE_ID);
      if (st && st.parentNode) st.parentNode.removeChild(st);
      if (root) root.removeEventListener('click', onRootClick);
      if (root) root.removeEventListener('keydown', onRootKey);
      root = null;
      api = null;
    },
  };
})();
