/* __bamboo_module_ {"id":"blog","name":"本地博客","version":"0.4.0","fab":{"icon":"book-open","label":"博客"},"location":"left"} */
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
  };

  var api = null;
  var root = null;

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
    ].join('');
    document.head.appendChild(st);
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
      '</div></div>';
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

  function openArticle(path) {
    // 点击文章 → 在 Obsidian 中央视图打开（侧栏仅导航）
    state.selected = path;
    if (api) api.openFile(path);
    markRead(path);
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
