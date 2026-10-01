/* __bamboo_module_ {"id":"blog","name":"本地博客","version":"0.3.2","fab":{"icon":"book-open","label":"博客"},"location":"left"} */
/**
 * 竹林模块 · 本地博客阅读器 v0.2
 *
 * 借鉴羽鳞君《竹杖芒鞋》专栏阅读器的成熟排版与交互范式：
 *   - 作者资料卡（头像 / 昵称 / 简介 / 关于·投稿）
 *   - 按子目录分类浏览（折叠 + 计数）、时间线模式
 *   - 文章卡片（相对日期 / 字数估算 / 分类徽章 / 已读淡化）
 *   - 搜索（标题即时匹配 + 正文全文异步补扫）
 *   - 全部 / 未读切换、刷新、骨架屏 / 空态 / 错误态、状态栏
 *
 * 单文件自包含模块（CSS 内联），经「竹林模块市场」分发，落盘在 vault 的 竹林模块/ 目录。
 * 运行于 module.html 的沙箱内，只能通过宿主注入的 api 与 Obsidian 交互：
 *   api.listFiles / api.readFile / api.openFile / api.resolveResource / api.saveData / api.loadData
 * 沙箱约束（与主题同构）：禁用 fetch / XHR / WebSocket / eval / new Function / import /
 * window.parent 等越权能力；data: URL 下无 localStorage，故资料走 api.saveData 由宿主代存。
 * 阅读沿用「侧栏导航 + 中央阅读」架构：点击文章经 api.openFile 在 Obsidian 中央页签打开。
 */

var __bamboo_module_blog = (function () {
  var STYLE_ID = 'bamboo-blog-module-style';
  var BAMBOO = '#4a7c59';
  var BAMBOO_DEEP = '#3d6b4a';

  var state = {
    profile: {
      nickname: '竹林隐士',
      bio: '记录所思所想，闲看竹影摇窗。',
      avatar: '',
      links: [], // [{ label, url }]
    },
    rootFolder: '博客',
    files: [], // [{ path, name, mtime, ctime, size, category }]
    readSet: {}, // path -> true
    searchQuery: '',
    searchFull: false,
    filter: 'all', // all | unread
    groupMode: 'category', // category | time
    collapsed: {}, // category -> true
    loading: true,
    error: '',
    selected: null,
    view: 'list', // list | reader
    current: null, // { path, name, html, loading }
    lastRefreshAt: 0,
    _searchTimer: null,
    _contentCache: {}, // path -> lowercased content（搜索全文用）
  };

  var api = null;
  var root = null;

  /* ────────────── 样式（借鉴竹杖芒鞋设计语言：竹青、宣纸暖白、卡片圆角留白） ────────────── */
  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var st = document.createElement('style');
    st.id = STYLE_ID;
    st.textContent = [
      '.bm-wrap{height:100%;display:flex;flex-direction:column;box-sizing:border-box;font-size:13px;line-height:1.55;}',
      '.bm-header{padding:12px 12px 10px;border-bottom:1px solid var(--background-modifier-border,#e3e0d6);}',
      '.bm-author{display:flex;gap:10px;align-items:center;}',
      '.bm-avatar{width:44px;height:44px;flex:0 0 44px;border-radius:50%;overflow:hidden;display:flex;align-items:center;justify-content:center;background:#dbe4d4;color:' + BAMBOO_DEEP + ';font-size:18px;font-weight:600;}',
      '.bm-avatar img{width:100%;height:100%;object-fit:cover;display:block;}',
      '.bm-author-main{flex:1 1 auto;min-width:0;}',
      '.bm-name-row{display:flex;align-items:center;gap:6px;}',
      '.bm-name{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
      '.bm-avatar[data-act],.bm-name[data-act]{cursor:pointer;}',
      '.bm-avatar[data-act]:hover,.bm-name[data-act]:hover{opacity:.85;}',
      '.bm-handle{font-size:11px;opacity:.55;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
      '.bm-bio{opacity:.7;font-size:12px;margin-top:2px;word-break:break-word;}',
      '.bm-icon-btn{flex:0 0 auto;border:none;background:transparent;cursor:pointer;opacity:.5;font-size:15px;padding:2px 4px;color:inherit;line-height:1;}',
      '.bm-icon-btn:hover{opacity:1;}',
      // 编辑表单
      '.bm-form{margin-top:10px;padding:10px;border-radius:10px;background:var(--background-secondary,#eef2e8);}',
      '.bm-label{font-size:11px;opacity:.6;margin:6px 0 3px;}',
      '.bm-input{width:100%;box-sizing:border-box;padding:6px 8px;border-radius:6px;font:inherit;border:1px solid rgba(128,128,128,.32);background:var(--background-primary,#fff);color:inherit;}',
      '.bm-textarea{width:100%;box-sizing:border-box;padding:6px 8px;border-radius:6px;font:inherit;resize:vertical;min-height:48px;border:1px solid rgba(128,128,128,.32);background:var(--background-primary,#fff);color:inherit;}',
      '.bm-actions{display:flex;gap:8px;margin-top:10px;}',
      '.bm-btn{flex:1 1 auto;padding:6px 10px;border-radius:6px;cursor:pointer;font:inherit;border:1px solid rgba(128,128,128,.32);background:var(--background-primary,#fff);color:inherit;}',
      '.bm-btn.primary{background:' + BAMBOO_DEEP + ';color:#fff;border-color:' + BAMBOO_DEEP + ';}',
      // 工具行
      '.bm-toolbar{padding:8px 12px 6px;}',
      '.bm-search-wrap{position:relative;margin-bottom:8px;}',
      '.bm-search{width:100%;box-sizing:border-box;padding:6px 28px 6px 8px;border-radius:6px;font:inherit;border:1px solid rgba(128,128,128,.3);background:var(--background-primary,#fff);color:inherit;}',
      '.bm-search-clear{position:absolute;right:6px;top:50%;transform:translateY(-50%);border:none;background:none;cursor:pointer;opacity:.5;font-size:16px;color:inherit;line-height:1;}',
      '.bm-search-clear:hover{opacity:1;}',
      '.bm-tabs{display:flex;gap:6px;align-items:center;}',
      '.bm-seg{display:flex;background:var(--background-secondary,#eef2e8);border-radius:6px;overflow:hidden;flex:1 1 auto;}',
      '.bm-tab{flex:1 1 0;min-width:0;border:none;background:none;padding:5px 6px;cursor:pointer;font:inherit;font-size:12px;color:inherit;opacity:.65;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
      '.bm-tab.is-active{background:var(--background-primary,#fff);opacity:1;font-weight:600;box-shadow:0 1px 2px rgba(0,0,0,.08);}',
      '.bm-refresh{flex:0 0 auto;border:1px solid rgba(128,128,128,.3);background:var(--background-primary,#fff);border-radius:6px;width:30px;height:28px;cursor:pointer;color:inherit;opacity:.8;}',
      '.bm-refresh:hover{opacity:1;}',
      '.bm-refresh.bm-spin{animation:bm-spin 1s linear infinite;}',
      '@keyframes bm-spin{to{transform:rotate(360deg);}}',
      // 列表
      '.bm-list-region{flex:1 1 auto;overflow:auto;padding:4px 8px 8px;box-sizing:border-box;}',
      '.bm-category{margin-bottom:4px;}',
      '.bm-cat-title{display:flex;align-items:center;gap:6px;padding:7px 4px;cursor:pointer;font-weight:600;font-size:12px;opacity:.88;user-select:none;}',
      '.bm-cat-title .bm-arrow{transition:transform .15s ease;opacity:.6;font-size:10px;}',
      '.bm-category.bm-collapsed .bm-arrow{transform:rotate(-90deg);}',
      '.bm-cat-count{font-size:11px;font-weight:400;opacity:.6;}',
      '.bm-cat-items{overflow:hidden;}',
      '.bm-category.bm-collapsed .bm-cat-items{display:none;}',
      '.bm-item{display:flex;gap:4px;padding:8px 10px;border-radius:8px;cursor:pointer;margin-bottom:2px;align-items:flex-start;}',
      '.bm-item:hover{background:var(--background-secondary,#eef2e8);}',
      '.bm-item.is-read{opacity:.5;}',
      '.bm-item.is-active{background:var(--background-secondary,#eef2e8);box-shadow:inset 2px 0 0 ' + BAMBOO + ';}',
      '.bm-item-body{flex:1 1 auto;min-width:0;}',
      '.bm-item-title{font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
      '.bm-item-meta{font-size:11px;opacity:.55;margin-top:3px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;}',
      '.bm-badge{font-size:10px;padding:1px 6px;border-radius:10px;background:rgba(74,124,89,.14);color:' + BAMBOO_DEEP + ';opacity:1;}',
      '.bm-words{opacity:.7;}',
      // 骨架 / 空 / 错
      '.bm-skeleton{padding:6px 4px;}',
      '.bm-sk-item{padding:8px 6px;}',
      '.bm-sk-line{height:9px;border-radius:4px;background:var(--background-modifier-border,#e3e0d6);margin-bottom:6px;animation:bm-pulse 1.1s ease-in-out infinite;}',
      '.bm-sk-line-long{width:70%;}.bm-sk-line-short{width:40%;}',
      '@keyframes bm-pulse{0%,100%{opacity:.5;}50%{opacity:1;}}',
      '.bm-empty{padding:22px 10px;text-align:center;opacity:.6;font-size:12px;}',
      '.bm-empty small{opacity:.8;}',
      '.bm-error{padding:18px 10px;text-align:center;opacity:.85;font-size:12px;}',
      '.bm-error .bm-btn{margin-top:8px;flex:0 0 auto;}',
      // 状态栏
      '.bm-status{padding:6px 12px;font-size:11px;opacity:.5;border-top:1px solid var(--background-modifier-border,#e3e0d6);}',
      // 弹层
      '.bm-mask{position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;z-index:9999;}',
      '.bm-modal{background:var(--background-primary,#fff);border-radius:10px;padding:16px;width:min(320px,86%);max-height:80vh;overflow:auto;box-sizing:border-box;color:var(--text-normal,#222);}',
      '.bm-modal h3{margin:0 0 8px;font-size:14px;}',
      '.bm-modal p{margin:6px 0;font-size:12px;opacity:.8;line-height:1.6;}',
      '.bm-link{display:block;padding:6px 8px;border-radius:6px;text-decoration:none;color:' + BAMBOO_DEEP + ';font-size:12px;}',
      '.bm-link:hover{background:var(--background-secondary,#eef2e8);}',
      '.bm-modal .bm-actions{margin-top:12px;}',
      // 阅读器
      '.bm-reader{display:flex;flex-direction:column;height:100%;box-sizing:border-box;}',
      '.bm-reader-bar{position:sticky;top:0;display:flex;align-items:center;gap:8px;padding:8px 10px;background:var(--background-primary,#fff);border-bottom:1px solid var(--background-modifier-border,#e3e0d6);z-index:2;}',
      '.bm-back{border:none;background:none;cursor:pointer;font-size:16px;opacity:.6;padding:2px 4px;color:inherit;line-height:1;}',
      '.bm-back:hover{opacity:1;}',
      '.bm-reader-title{flex:1 1 auto;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
      '.bm-open-ext{flex:0 0 auto;border:1px solid rgba(128,128,128,.3);background:var(--background-primary,#fff);border-radius:6px;cursor:pointer;font-size:12px;padding:3px 8px;color:inherit;opacity:.8;}',
      '.bm-open-ext:hover{opacity:1;}',
      '.bm-md-wrap{flex:1 1 auto;overflow:auto;padding:8px 12px 24px;box-sizing:border-box;}',
      '.bm-md{font-size:14px;line-height:1.7;word-break:break-word;}',
      '.bm-md>:first-child{margin-top:0;}',
      '.bm-md h1,.bm-md h2,.bm-md h3,.bm-md h4{margin:1em 0 .45em;line-height:1.3;font-weight:600;}',
      '.bm-md h1{font-size:1.5em;border-bottom:1px solid var(--background-modifier-border,#eee);padding-bottom:.2em;}',
      '.bm-md h2{font-size:1.3em;border-bottom:1px solid var(--background-modifier-border,#eee);padding-bottom:.15em;}',
      '.bm-md h3{font-size:1.14em;}',
      '.bm-md p{margin:.6em 0;}',
      '.bm-md ul,.bm-md ol{margin:.4em 0;padding-left:1.5em;}',
      '.bm-md li{margin:.2em 0;}',
      '.bm-md blockquote{margin:.6em 0;padding:.2em .8em;border-left:3px solid var(--background-modifier-border,#ccc);opacity:.85;}',
      '.bm-md code{background:var(--background-secondary,#eee);padding:.1em .3em;border-radius:4px;font-size:.9em;font-family:var(--font-monospace,monospace);}',
      '.bm-md pre{background:var(--background-secondary,#eee);padding:.8em;border-radius:8px;overflow:auto;}',
      '.bm-md pre code{background:none;padding:0;}',
      '.bm-md a{color:var(--text-accent,#4a7c59);}',
      '.bm-md a.internal-link{color:var(--text-accent,#4a7c59);cursor:pointer;}',
      '.bm-md img{max-width:100%;border-radius:8px;margin:.4em 0;}',
      '.bm-md hr{border:none;border-top:1px solid var(--background-modifier-border,#ddd);margin:1em 0;}',
      '.bm-md table{border-collapse:collapse;width:100%;margin:.6em 0;font-size:.92em;}',
      '.bm-md th,.bm-md td{border:1px solid var(--background-modifier-border,#ddd);padding:.3em .5em;}',
      '.bm-md .bm-md-loading{opacity:.6;padding:10px 4px;}',
    ].join('');
    document.head.appendChild(st);
  }

  /* ────────────── 工具 ────────────── */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // 相对日期（借鉴竹杖芒鞋 formatDate）
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

  // 字数估算（按字节粗算，中文约 2.2 字节/字）
  function fmtWords(bytes) {
    if (!bytes) return '';
    var n = Math.max(1, Math.round(bytes / 2.2));
    if (n >= 10000) return '约 ' + (n / 10000).toFixed(1) + ' 万字';
    return '约 ' + n + ' 字';
  }

  function avatarHtml() {
    if (state.profile.avatar && api) {
      // resolveResource 是异步的，首次渲染时可能还没拿到 url；
      // 这里仅在已缓存 url 时出 img，否则回退首字（resolveAvatar 完成后会整体重绘）。
      if (state._avatarUrl) return '<img src="' + esc(state._avatarUrl) + '" alt="">';
    }
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
    if (state.view === 'reader') {
      html += renderReader();
      html += '</div>';
      root.innerHTML = html;
      bind();
      return;
    }

    // 作者卡
    html += '<div class="bm-header">';
    html += '<div class="bm-author">';
    html += '<div class="bm-avatar" data-act="edit" title="点击编辑资料">' + avatarHtml() + '</div>';
    html += '<div class="bm-author-main">';
    html += '<div class="bm-name-row">';
    html += '<span class="bm-name" data-act="edit" title="点击编辑资料">' + esc(state.profile.nickname || '未命名') + '</span>';
    html += '<button class="bm-icon-btn" data-act="about" title="关于 / 投稿" aria-label="关于">ⓘ</button>';
    html += '</div>';
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
    // 分组：分类 / 时间线
    html += '<div class="bm-seg">';
    html += '<button class="bm-tab' + (state.groupMode === 'category' ? ' is-active' : '') + '" data-group="category">分类</button>';
    html += '<button class="bm-tab' + (state.groupMode === 'time' ? ' is-active' : '') + '" data-group="time">时间线</button>';
    html += '</div>';
    // 过滤：全部 / 未读
    html += '<div class="bm-seg">';
    var total = state.files.length;
    var unread = state.files.filter(function (f) { return !state.readSet[f.path]; }).length;
    html += '<button class="bm-tab' + (state.filter === 'all' ? ' is-active' : '') + '" data-filter="all">全部 ' + total + '</button>';
    html += '<button class="bm-tab' + (state.filter === 'unread' ? ' is-active' : '') + '" data-filter="unread">未读 ' + unread + '</button>';
    html += '</div>';
    html += '<button class="bm-refresh' + (state.loading ? ' bm-spin' : '') + '" data-act="refresh" title="刷新" aria-label="刷新">⟳</button>';
    html += '</div>';

    // 列表区（独立容器，搜索/过滤时只重建这块）
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
      '<div class="bm-label">简介</div>' +
      '<textarea class="bm-textarea" data-field="bio" placeholder="一句话介绍这个博客">' + esc(state.profile.bio) + '</textarea>' +
      '<div class="bm-label">头像（vault 内图片路径，如 attachments/avatar.png，或直接填写 https 图片链接）</div>' +
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
    var head = state.lastRefreshAt ? ('更新于 ' + nowClock()) : '共 ' + state.files.length + ' 篇';
    return head;
  }

  // 仅列表区内容（搜索/过滤时局部重建）
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
      s += '<div class="bm-sk-item"><div class="bm-sk-line bm-sk-line-long"></div><div class="bm-sk-line bm-sk-line-short"></div></div>';
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
    if (f.size) html += '<span class="bm-words">' + fmtWords(f.size) + '</span>';
    if (f.category && f.category !== '未分类') html += '<span class="bm-badge">' + esc(f.category) + '</span>';
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
    var region = root.querySelector('[data-region="list"]');

    // 文章点击（事件委托）
    root.addEventListener('click', onRootClick);
    root.removeEventListener('keydown', onRootKey);
    root.addEventListener('keydown', onRootKey);

    // 搜索输入
    var search = root.querySelector('[data-field="search"]');
    if (search) {
      search.addEventListener('input', function (e) {
        state.searchQuery = e.target.value;
        scheduleSearch();
      });
    }
  }

  function onRootClick(e) {
    // 阅读器内：wikilink / 内部链接 → 模块内递归阅读
    if (e.target && e.target.closest) {
      var il = e.target.closest('a.internal-link');
      if (il) {
        var href = il.getAttribute('data-href') || il.getAttribute('href');
        if (href) { openReader(href); return; }
      }
    }
    var el = e.target;
    while (el && el !== root) {
      if (el.getAttribute && el.getAttribute('data-act')) {
        var act = el.getAttribute('data-act');
        if (act === 'edit') { toggleEdit(); return; }
        if (act === 'about') { openAbout(); return; }
        if (act === 'back') { state.view = 'list'; render(); return; }
        if (act === 'open-ext') { if (api && state.current) api.openFile(state.current.path); return; }
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
    // 轻量字段即时出结果，再异步补扫正文
    state.searchFull = false;
    render();
    updateSearchMeta();
    if (state._searchTimer) clearTimeout(state._searchTimer);
    state._searchTimer = setTimeout(applyFullText, 220);
  }

  function updateSearchMeta() {
    // 状态栏临时显示搜索结果数（轻量口径）
    var region = root && root.querySelector('[data-region="list"]');
    if (!region) return;
  }

  function applyFullText() {
    if (!state.searchQuery) return;
    var q = state.searchQuery.toLowerCase();
    var need = filterPool().filter(function (f) { return !state._contentCache[f.path]; });
    if (!need.length) { state.searchFull = true; render(); return; }
    // 异步逐篇读正文并缓存，边读边局部刷新
    var idx = 0;
    function step() {
      if (idx >= need.length) { state.searchFull = true; render(); return; }
      var f = need[idx++];
      api.readFile(f.path).then(function (content) {
        state._contentCache[f.path] = (content || '').toLowerCase();
        if (matchText(q, f.name) || matchText(q, f.category) || state._contentCache[f.path].indexOf(q) >= 0) {
          render();
        }
        step();
      }).catch(function () { step(); });
    }
    step();
  }

  /* ────────────── 行为 ────────────── */
  function toggleEdit() { state.editing = !state.editing; render(); }

  function saveProfile() {
    if (!root) return;
    var rf = root.querySelector('[data-field="rootFolder"]');
    var nick = root.querySelector('[data-field="nickname"]');
    var bio = root.querySelector('[data-field="bio"]');
    var av = root.querySelector('[data-field="avatar"]');
    var linksEl = root.querySelector('[data-field="links"]');
    if (rf) state.rootFolder = rf.value.trim() || '博客';
    if (nick) state.profile.nickname = nick.value.trim();
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
    if (rf) refresh(); // 根目录可能变化，重列文章
  }

  function persist() {
    if (!api) return;
    api.saveData({
      profile: state.profile,
      rootFolder: state.rootFolder,
      readSet: state.readSet,
    });
  }

  function markRead(path) {
    if (state.readSet[path]) return;
    state.readSet[path] = true;
    persist();
    render();
  }

  function openArticle(path) {
    openReader(path);
  }

  function openReader(path) {
    state.view = 'reader';
    state.current = {
      path: path,
      name: (path.split('/').pop() || path).replace(/\.md$/i, ''),
      html: '',
      loading: true,
    };
    render();
    if (api) {
      api.renderMarkdown({ path: path }).then(function (html) {
        if (state.view === 'reader' && state.current && state.current.path === path) {
          state.current.html = html || '<p style="opacity:.6">（空文章）</p>';
          state.current.loading = false;
          render();
        }
      }).catch(function (e) {
        if (state.current) {
          state.current.html = '<p style="opacity:.6">渲染失败：' + esc(e && e.message ? e.message : '未知错误') + '</p>';
          state.current.loading = false;
          render();
        }
      });
    }
    markRead(path);
  }

  function renderReader() {
    var c = state.current || { path: '', name: '', html: '', loading: true };
    var bar = '<div class="bm-reader-bar">' +
      '<button class="bm-back" data-act="back" title="返回" aria-label="返回">←</button>' +
      '<span class="bm-reader-title">' + esc(c.name) + '</span>' +
      '<button class="bm-open-ext" data-act="open-ext" title="在 Obsidian 中打开">在 Obsidian 打开</button>' +
      '</div>';
    var body = '<div class="bm-md-wrap">' +
      (c.loading ? '<div class="bm-md-loading">渲染中…</div>' : '<div class="bm-md">' + (c.html || '') + '</div>') +
      '</div>';
    return '<div class="bm-reader">' + bar + body + '</div>';
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
    // path 形如 「博客/技术随想/xxx.md」→ 取 rootFolder 之后第一段子目录
    var rel = path.split('/');
    if (rel.length <= 1) return '未分类';
    // 去掉文件名
    rel = rel.slice(0, rel.length - 1);
    // 去掉 rootFolder 前缀
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
