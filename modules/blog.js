/* __bamboo_module_ {"id":"blog","name":"本地博客","version":"0.1.0","fab":{"icon":"book-open","label":"博客"},"location":"left"} */
/**
 * 竹林模块 · 本地博客阅读器
 *
 * 单文件自包含模块（CSS 内联），经「竹林模块市场」分发，落盘在 vault 的 竹林模块/ 目录。
 * 运行于 module.html 的沙箱内，只能通过宿主注入的 api 与 Obsidian 交互：
 *   api.listFiles / api.readFile / api.openFile / api.resolveResource
 *   api.saveData / api.loadData
 * 沙箱约束（与主题同构）：禁用 fetch / XHR / WebSocket / eval / new Function / import /
 * window.parent 等越权能力；data: URL 下无 localStorage，故资料走 api.saveData 由宿主代存。
 */

var __bamboo_module_blog = (function () {
  var STYLE_ID = 'bamboo-blog-module-style';

  var state = {
    profile: { nickname: '竹林隐士', bio: '记录所思所想。', avatar: '' },
    folder: '博客',
    files: [],
    avatarUrl: '',
    editing: false,
    loading: true,
    error: '',
  };

  var api = null;
  var root = null;

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var st = document.createElement('style');
    st.id = STYLE_ID;
    st.textContent = [
      '.bm-wrap{padding:14px 12px;font-size:13px;line-height:1.6;height:100%;overflow:auto;box-sizing:border-box;}',
      '.bm-card{display:flex;gap:10px;align-items:center;padding:12px;border-radius:10px;',
      'background:var(--background-secondary,#f4f6ef);margin-bottom:14px;}',
      '.bm-avatar{width:44px;height:44px;flex:0 0 44px;border-radius:50%;overflow:hidden;',
      'display:flex;align-items:center;justify-content:center;background:#dbe4d4;color:#4a5a42;font-size:18px;}',
      '.bm-avatar img{width:100%;height:100%;object-fit:cover;display:block;}',
      '.bm-who{min-width:0;flex:1 1 auto;}',
      '.bm-name{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
      '.bm-bio{opacity:.68;font-size:12px;margin-top:2px;word-break:break-word;}',
      '.bm-edit{flex:0 0 auto;border:none;background:transparent;cursor:pointer;opacity:.55;font-size:15px;padding:2px 4px;}',
      '.bm-edit:hover{opacity:1;}',
      '.bm-form{margin-bottom:14px;padding:10px;border-radius:10px;background:var(--background-secondary-alt,#eef2e8);}',
      '.bm-label{font-size:11px;opacity:.6;margin:6px 0 3px;}',
      '.bm-input{width:100%;box-sizing:border-box;padding:6px 8px;border-radius:6px;font:inherit;',
      'border:1px solid rgba(128,128,128,.32);background:var(--background-primary,#fff);color:inherit;}',
      '.bm-textarea{width:100%;box-sizing:border-box;padding:6px 8px;border-radius:6px;font:inherit;resize:vertical;',
      'min-height:54px;border:1px solid rgba(128,128,128,.32);background:var(--background-primary,#fff);color:inherit;}',
      '.bm-actions{display:flex;gap:8px;margin-top:10px;}',
      '.bm-btn{flex:1 1 auto;padding:6px 10px;border-radius:6px;cursor:pointer;font:inherit;',
      'border:1px solid rgba(128,128,128,.32);background:var(--background-primary,#fff);color:inherit;}',
      '.bm-btn.primary{background:#2d5a27;color:#fff;border-color:#2d5a27;}',
      '.bm-head{display:flex;align-items:center;gap:8px;margin-bottom:8px;}',
      '.bm-title{font-weight:600;flex:1 1 auto;}',
      '.bm-folder{width:110px;padding:4px 6px;border-radius:6px;font:inherit;font-size:12px;',
      'border:1px solid rgba(128,128,128,.32);background:var(--background-primary,#fff);color:inherit;}',
      '.bm-item{padding:8px 10px;border-radius:8px;cursor:pointer;margin-bottom:4px;}',
      '.bm-item:hover{background:var(--background-secondary,#f4f6ef);}',
      '.bm-item-name{font-weight:500;}',
      '.bm-item-meta{font-size:11px;opacity:.55;margin-top:2px;}',
      '.bm-empty{padding:18px 8px;text-align:center;opacity:.6;font-size:12px;}',
    ].join('');
    document.head.appendChild(st);
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function fmtDate(ms) {
    if (!ms) return '';
    var d = new Date(ms);
    function p(n) { return n < 10 ? '0' + n : '' + n; }
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  function avatarHtml() {
    if (state.avatarUrl) {
      return '<img src="' + esc(state.avatarUrl) + '" alt="">';
    }
    var n = (state.profile.nickname || '竹').trim();
    return esc(n.charAt(0) || '竹');
  }

  function render() {
    if (!root) return;
    var html = '<div class="bm-wrap">';

    // ---- 资料卡 ----
    html += '<div class="bm-card">';
    html += '<div class="bm-avatar">' + avatarHtml() + '</div>';
    html += '<div class="bm-who">';
    html += '<div class="bm-name">' + esc(state.profile.nickname || '未命名') + '</div>';
    html += '<div class="bm-bio">' + esc(state.profile.bio || '暂无简介') + '</div>';
    html += '</div>';
    html += '<button class="bm-edit" data-act="toggle-edit" title="编辑资料" aria-label="编辑资料">✎</button>';
    html += '</div>';

    // ---- 编辑表单 ----
    if (state.editing) {
      html += '<div class="bm-form">';
      html += '<div class="bm-label">昵称</div>';
      html += '<input class="bm-input" data-field="nickname" value="' + esc(state.profile.nickname) + '" placeholder="博客作者名">';
      html += '<div class="bm-label">简介</div>';
      html += '<textarea class="bm-textarea" data-field="bio" placeholder="一句话介绍这个博客">' + esc(state.profile.bio) + '</textarea>';
      html += '<div class="bm-label">头像（vault 内图片路径，如 attachments/avatar.png）</div>';
      html += '<input class="bm-input" data-field="avatar" value="' + esc(state.profile.avatar) + '" placeholder="留空显示昵称首字">';
      html += '<div class="bm-actions">';
      html += '<button class="bm-btn primary" data-act="save">保存</button>';
      html += '<button class="bm-btn" data-act="cancel">取消</button>';
      html += '</div></div>';
    }

    // ---- 文章列表 ----
    html += '<div class="bm-head">';
    html += '<span class="bm-title">文章</span>';
    html += '<input class="bm-folder" data-field="folder" value="' + esc(state.folder) + '" placeholder="目录">';
    html += '<button class="bm-btn" data-act="refresh" style="flex:0 0 auto;padding:4px 8px;">刷新</button>';
    html += '</div>';

    if (state.loading) {
      html += '<div class="bm-empty">读取中…</div>';
    } else if (state.error) {
      html += '<div class="bm-empty">' + esc(state.error) + '</div>';
    } else if (!state.files || state.files.length === 0) {
      html += '<div class="bm-empty">目录「' + esc(state.folder) + '」下还没有文章。<br>换个目录，或在库里建几篇笔记试试。</div>';
    } else {
      for (var i = 0; i < state.files.length; i++) {
        var f = state.files[i];
        html += '<div class="bm-item" data-path="' + esc(f.path) + '">';
        html += '<div class="bm-item-name">' + esc(f.name) + '</div>';
        html += '<div class="bm-item-meta">' + fmtDate(f.mtime) + '</div>';
        html += '</div>';
      }
    }

    html += '</div>';
    root.innerHTML = html;
    bind();
  }

  function bind() {
    if (!root) return;
    var items = root.querySelectorAll('.bm-item');
    for (var i = 0; i < items.length; i++) {
      items[i].addEventListener('click', function () {
        var p = this.getAttribute('data-path');
        if (p && api) api.openFile(p);
      });
    }

    var editBtn = root.querySelector('[data-act="toggle-edit"]');
    if (editBtn) {
      editBtn.addEventListener('click', function () {
        state.editing = !state.editing;
        render();
      });
    }

    var cancelBtn = root.querySelector('[data-act="cancel"]');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', function () {
        state.editing = false;
        render();
      });
    }

    var saveBtn = root.querySelector('[data-act="save"]');
    if (saveBtn) {
      saveBtn.addEventListener('click', function () {
        var nick = root.querySelector('[data-field="nickname"]');
        var bio = root.querySelector('[data-field="bio"]');
        var av = root.querySelector('[data-field="avatar"]');
        if (nick) state.profile.nickname = nick.value.trim();
        if (bio) state.profile.bio = bio.value.trim();
        if (av) state.profile.avatar = av.value.trim();
        state.editing = false;
        persist();
        resolveAvatar();
      });
    }

    var refreshBtn = root.querySelector('[data-act="refresh"]');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', function () {
        var fld = root.querySelector('[data-field="folder"]');
        if (fld) state.folder = fld.value.trim() || '博客';
        persist();
        refreshFiles();
      });
    }
  }

  function persist() {
    if (!api) return;
    api.saveData({ profile: state.profile, folder: state.folder });
  }

  async function resolveAvatar() {
    state.avatarUrl = '';
    if (state.profile.avatar && api) {
      state.avatarUrl = (await api.resolveResource(state.profile.avatar)) || '';
    }
    render();
  }

  async function refreshFiles() {
    state.loading = true;
    state.error = '';
    render();
    try {
      var files = await api.listFiles(state.folder, true);
      state.files = files || [];
    } catch (e) {
      state.error = '目录读取失败：' + (e && e.message ? e.message : '未知错误');
      state.files = [];
    }
    state.loading = false;
    render();
  }

  async function loadAll() {
    var d = await api.loadData();
    if (d) {
      if (d.profile) {
        state.profile.nickname = d.profile.nickname || state.profile.nickname;
        state.profile.bio = d.profile.bio || state.profile.bio;
        state.profile.avatar = d.profile.avatar || '';
      }
      if (d.folder) state.folder = d.folder;
    }
    await resolveAvatar();
    await refreshFiles();
  }

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
      root = null;
      api = null;
    },
  };
})();
