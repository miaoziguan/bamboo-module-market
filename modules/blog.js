/* __bamboo_module_ {"id":"blog","name":"本地博客","version":"0.7.2","fab":{"icon":"bookOpen","label":"博客"},"location":"left"} */
/**
 * 竹林模块 · 本地博客 v0.7
 *
 * 排版借鉴《竹杖芒鞋》专栏阅读器：竹青色板、宣纸暖白、卡片阴影、圆角留白。
 *
 * 形态：介绍区是一台拍立得 OneStep，样式继承参考稿（420×400，几何数值未改）：
 *   .camera / .top-panel / .lens-unit / .lens-barrel / .lens-glass
 *   / .lens-flare / .shutter / .rainbow / .brand / .grain
 * 顶部凹槽面板（.top-panel）原为取景器+闪光灯的位置，现改为内嵌一条搜索框：.bm-search
 * 直接嵌进凹槽里（凹陷质感与面板一致），搜索不再占用机身之外的独立工具行。
 * 侧栏放不下 420px，因此在机身外面套一层缩放基座 .bm-cam-stage，由 fitCamera() 计算
 * transform:scale(k)（k = (舞台宽 - 40) / 420，上限 1，两侧各留 20px 给机身投影）——
 * 缩放只是「把图看小」，不改任何设计数值。
 * 不属于相机、放在机身之外的模块部件：纸带（列表卡）。纸带每侧比机身窄 6px 且左右对称，
 * 方角、顶边离机身下沿 6px 抽出（原出纸口 .bm-slot 已删，见下方 CSS 注释），
 * 那 6px 由接地软影填满，读起来是「机身压着纸带」。
 * 参考稿的光影规则：凹陷件上缘暗/下缘亮，凸起件上缘亮/下缘暗 + 下方短促投影。
 *
 * 交互：点击文章 → 经 api.openFile 在 Obsidian 中央视图打开（侧栏仅作导航）。
 * 单文件自包含（CSS 内联），经「竹林模块市场」分发，落盘 vault 的 竹林模块/ 目录。
 * 运行于 module.html 沙箱，仅通过宿主注入的 api 交互：
 *   api.listFiles / api.readFile / api.openFile / api.resolveResource / api.saveData / api.loadData
 * 沙箱约束：禁用 fetch / XHR / eval / new Function / import / window.parent 等。
 */

var __bamboo_module_blog = (function () {
  var STYLE_ID = 'bamboo-blog-module-style';
  var BAMBOO = 'var(--bw-bamboo)';
  var BAMBOO_DEEP = 'var(--bw-bamboo-deep)';
  var SEARCH_ICON = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%234a7c59' stroke-width='2' stroke-linecap='round'><circle cx='11' cy='11' r='7'/><line x1='21' y1='21' x2='16.65' y2='16.65'/></svg>";

  var state = {
    profile: {
      // 默认空：昵称为空即视为「未设置」，机身品牌字与阅读页作者回退到 BAMBOO IMMORTALS
      nickname: '',
      avatar: '',
    },
    rootFolder: '博客',
    files: [],
    searchQuery: '',
    searchFull: false,
    loading: true,
    error: '',
    selected: null,
    lastRefreshAt: 0,
    _searchTimer: null,
    _searchGen: 0,
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
      // 外壳：不要大卡片了 —— 内容直接浮在 Obsidian 侧栏底色上，底板全透明
      // 影色令牌定义在模块根上（而非 .bm-wrap）：侧栏直接浮在 Obsidian 底色上，
      // 令牌放根上才不会被 .bm-wrap 作用域割裂
      // 影色改为冷调深板岩 28,30,42（原 30,30,34 近乎纯中性灰）。
      // 为什么：机身是暖奶油（实测 R−B=+5），中性灰压上去会把暖色往灰拉 —— 阴影越深越去饱和
      // （深处 R−B 只剩 +2、饱和度掉到 2），那段去饱和的过渡带就是「显脏」的成因。
      // 为什么取冷调而不是暖褐：暖褐（旧版 rgba(50,46,42,.20)）在奶油底上会读成黄渍（曾判「污黄」）；
      // 真实光照是「暖光冷影」——受光面顶光偏暖，阴影由环境光（天空＝冷）照亮，故阴影应偏冷。
      // 为什么 luma 不变：30,30,34 的 luma≈30.3，26,30,50 的 luma≈30.6 —— 只偏色相、不动阴影重量，
      // 否则改完要么阴影没分量、要么仍显脏。冷偏量取 B−R=24：实测阴影深处 R−B 从 +2 翻到 −7，
      // 与机身暖度 +6 正好对称（冷暖对偶）。试过更弱的 28,30,42（R−B 只到 −2，等于没改）
      // 与更蓝的 24,29,54（R−B −10，开始发青），故停在 26,30,50。
      'html,body,#module-view-root,:host{background:transparent;--bm-shade:26,30,50;}',
      // 四周留白：顶部对齐首页卡片的上沿（首页 .container 的 margin-top 即 var(--space-6)=24px）
      '#module-view-root{box-sizing:border-box;padding:var(--space-6,24px) 10px 10px;overflow:hidden;}',
      // 纸带卡片（.bm-paper-item / skeleton / empty / error）底色纯白（--bm-paper 系令牌一处改、四处同步）
      // 模块自带回退令牌：宿主若已提供 Obsidian 令牌，仍以宿主为准；缺令牌时按主题给对的值 ——
      // 否则暗色下 var(--text-normal,#2b2b2b) 会把卡片标题染成深灰而看不见、编辑表单回退成白板
      '.bm-wrap{height:100%;display:flex;flex-direction:column;box-sizing:border-box;font-size:13px;color:var(--text-normal,var(--bm-ink));--bm-ink:#2b2b2b;--bm-muted:#9a9a9a;--bm-faint:#a8a8a8;--bm-surface:hsl(var(--accent-hue),24%,97%);--bm-surface-2:hsl(var(--accent-hue),28%,92%);--bm-border:hsl(var(--accent-hue),26%,87%);--bm-hover:hsla(var(--accent-hue),26%,38%,.07);--bm-paper:hsl(var(--accent-hue),28%,97%);--bm-paper-hover:hsl(var(--accent-hue),30%,94%);--bm-paper-active:hsl(var(--accent-hue),32%,90%);--bm-tear:rgba(0,0,0,.22);--bw-bamboo-deep:hsl(var(--accent-hue),36%,calc(38% + var(--accent-lightness-offset,0%)));--bw-bamboo:hsl(var(--accent-hue),32%,calc(48% + var(--accent-lightness-offset,0%)));--bw-bamboo-light:hsl(var(--accent-hue),34%,calc(60% + var(--accent-lightness-offset,0%)));--bw-bamboo-pale:hsla(var(--accent-hue),40%,calc(70% + var(--accent-lightness-offset,0%)),.35);--bw-radius-sm:3px;--bw-radius-md:8px;--bw-space-xs:4px;overflow:visible;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;text-rendering:optimizeLegibility;}',
      // ────────────── 光影系统（本模块所有立体件的统一规矩） ──────────────
      // 病灶（都是量出来的，不是看着像）：机身上沿浮着一层 16px 灰纱、左右各裹一圈
      // 22~26px 灰箍、下沿压出一道 114~134 的近黑硬边、机身底色 R−B 高达 +13 的米黄
      // 与侧栏的青绿底撞成「米黄+灰」的污色。四条成因各自对应一条约束：
      //
      //   ① 下移 + 收缩 ≥ 模糊     影子的高斯尾部不得越过物体上缘（否则上缘浮灰纱）
      //   ② 模糊 − 收缩 ≤ 物体宽 6%  影子不得横向包裹物体（否则四周一圈灰箍）
      //   ③ 收缩 ≤ 圆角 × 0.6       投影保持圆角，不出现方影角
      //   ④ 影色只用 --bm-shade     中性偏冷，撞开机身底色的暖，污感随之消失
      //   ⑤ 影阶三级              接触影（贴边短实）→ 中景影（体积）→ 环境影（最远最淡），
      //                            写在前面的盖住后面的；三级都遵守 ①②③
      //   ⑥ 单一顶光源            所有高光 / 暗角 / 投影都来自正上方唯一光源：阴影一律向下、
      //                            高光一律在顶（background 高光圆心须落在顶部 at 50% 0%、内高光
      //                            只用 inset 0 Npx 而不用 x≠0 的横向高光），禁止任何左/右斜向光
      //                            —— 如 at 14% -6% 的左上高光、inset 3px 0 的左边高光、
      //                            金属环的 conic 多向反射、镜片/眩光偏下方的亮点，否则就是
      //                            「多个光源 / 阴影方向混乱」。软度统一：模糊÷下移 ≈ 1.67（见各件）
      //
      // 相机：参考稿 420×400 原值原样搬入，只在外面套一个缩放基座（JS 算 transform:scale）
      // —— 缩放只是「把图看小」，不改任何数值、不改任何零件关系
      // 缩放基座：提升为独立合成层，强制 GPU 栅格化，缩放后边缘不糊、不抖
      // z-index:3 是不可省的：.bm-paper 设了 position:relative，与 .bm-cam-stage 同处「定位层」，
      // 而纸带 DOM 在后 —— 不加 z-index 时纸带会盖在机身之上，把机身底部（重叠段）整段吞掉，
      // 亮色下机身底边就此消失（「边缘不清晰」的真因）。抬高相机层叠序＝相机整体压在纸带上。
      '.bm-cam-stage{position:relative;z-index:3;width:100%;will-change:transform;transform:translateZ(0);}',
      // 接地投影：机身正下方一道收束的椭圆软影，填满机身与纸带之间那 6px。
      // 原先 .20 的纯黑叠在机身三层投影上，把那道 6px 窄缝压到 114（近黑），
      // 在雪白纸带的衬托下就是一道焦痕 —— 现在压到 .10，只做「垫一层」不做「压黑」
      '.bm-cam-stage::after{content:"";position:absolute;left:37px;right:37px;bottom:-11px;height:18px;background:radial-gradient(ellipse at center,rgba(var(--bm-shade),.10),transparent 72%);filter:blur(6px);z-index:1;pointer-events:none;}',
      '.camera,.camera *{margin:0;padding:0;box-sizing:border-box;}',
      // 机身：420×400、圆角 32 → 约束②上限 25px、约束③上限 19px
      // 三级投影：Y24/B40/S18（①42≥40 ②22≤25 ③18≤19）｜Y14/B22/S12（①26≥22 ②10 ③12）
      //          ｜Y5/B8/S3（①8≥8 ②5 ③3）
      // 底色由「米黄」退成「冷调奶油」：#fdfcfa → #f5f3ef → #e9e7e3 → #d8d6d1 → #cdccc8，
      // 末端 R−B 从 +13 收到 +5，撞开青绿底的污感
      // 机身受光：高光圆心收到正上方 at 50% 0%（不再 18% 左上）；内高光只用 inset 0 2px
      // （顶部），删掉原 inset 3px 0 的左边高光（那是左向光，违反单一顶光源 ⑥）
      // 出纸槽（机身自带）：用 inset 阴影在机身底面开一道凹陷槽口 —— inset 阴影严格跟随
      // border-radius（32px 圆角），因此槽口永远与机身轮廓同形、不可能像独立横条那样戳出
      // 圆角之外（那正是旧 .bm-cam-lip 显假的根因）。槽落在 365~400 的空白段，不压品牌字。
      // 光影遵循 ⑥「凹陷件上缘暗/下缘亮」：槽顶（受机身遮挡）压暗，但槽口最下缘【不再提亮】——
      // 亮色下机身底边本色 #cdccc8 与纸带纯白 #ffffff 明度只差 20，原先那道 2px 白边(.22)又
      // 把底缘提亮，底边直接化进白纸里（暗色无此问题，故只改亮色）。改为：
      //   · 外圈补一道紧贴接触投影 0 2px 4px -2px .34 —— 白纸上勾出机身底边（替代白边）；
      //   · 机身底缘压一条 1px 接触暗线 inset 0 -1px 0 .20，把轮廓收住。
      '.camera{position:absolute;left:50%;top:0;width:420px;height:400px;transform-origin:top center;border-radius:32px;background:radial-gradient(120% 100% at 50% 0%,#fff 0%,rgba(255,255,255,0) 55%),linear-gradient(160deg,hsl(var(--accent-hue),20%,98%) 0%,hsl(var(--accent-hue),20%,94%) 28%,hsl(var(--accent-hue),24%,89%) 60%,hsl(var(--accent-hue),24%,83%) 92%,hsl(var(--accent-hue),24%,80%) 100%);box-shadow:0 2px 4px -2px rgba(var(--bm-shade),.34),0 24px 40px -18px rgba(var(--bm-shade),.24),0 14px 22px -12px rgba(var(--bm-shade),.20),0 5px 8px -3px rgba(var(--bm-shade),.16),inset 0 2px 2px rgba(255,255,255,.95),inset 0 -1px 0 rgba(var(--bm-shade),.20),inset 0 -14px 10px -4px rgba(var(--bm-shade),.24),inset 0 -5px 10px rgba(var(--bm-shade),.12),inset 0 -7px 16px rgba(var(--bm-shade),.08);z-index:2;-webkit-backface-visibility:hidden;backface-visibility:hidden;will-change:transform;image-rendering:auto;}',
      // 高光 / 暗角：正上方光源 → 高光圆心收到底部中线正上方 at 50% -6%（不再 14% 左上），
      // 暗角落到正下方 at 50% 108%（不再 95% 108% 右下）。右下那道原为暖褐 rgba(50,46,42,.20)
      // 已换成中性影色 .16，机身右下不再泛污黄
      '.camera::before{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;z-index:20;background:radial-gradient(130% 95% at 50% -6%,rgba(255,255,255,.72),transparent 52%),radial-gradient(92% 76% at 50% 108%,rgba(var(--bm-shade),.16),transparent 62%);}',
      // 上缘只留 1px 内白边（受光面）；原先叠在外圈的 inset 0 0 0 2.5px rgba(0,0,0,.05)
      // 实测在上缘压出 239 的灰线（机身本色 252），一条围着整机的「灰缝」正是脏感来源之一
      // —— 光从上方来，上缘不该有暗线，故删。
      // 但「只留上缘」此前写成全圈（inset 0 0 0 1.5px）：那圈白边 z-index:21 盖在机身底缘
      // 之上，把底边整个提成 #ffffff 与白纸同色 —— 亮色下机身底边就此消失（暗色 .10 太淡无感）。
      // 改为真正的「只留上缘」：inset 0 1.5px 0 0（仅顶部 1.5px 白线），底边交给接触暗线与接触投影
      '.camera::after{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;z-index:21;box-shadow:inset 0 1.5px 0 0 rgba(255,255,255,.55);}',
      // ① 顶部凹槽面板 —— 凹陷；面板里嵌的搜索框取代了参考稿的取景器 + 闪光灯
      // 面板随机身一起被 fitCamera() 缩放，故搜索格的尺寸一律乘 --bm-inv（= 1/k，由 JS 写入，
      // 夹在 1~1.5），让搜索框的「视觉尺寸」不随机身缩放而变小，字始终看得清
      '.top-panel{position:absolute;left:26px;right:26px;top:26px;height:76px;border-radius:22px;z-index:3;display:flex;align-items:center;padding:0 calc(11px * var(--bm-inv,1));background:linear-gradient(180deg,#d3d1ce 0%,#e0ded9 22%,#ecebe7 55%,#f6f5f3 100%);box-shadow:inset 0 6px 16px rgba(var(--bm-shade),.24),inset 0 -3px 5px rgba(255,255,255,.92),inset 0 0 0 1px rgba(255,255,255,.35),0 1px 0 rgba(255,255,255,.9);}',
      // 凹槽里的搜索格 —— 内嵌控件：上缘暗、下缘亮，与凹槽面板同一套光影语言
      '.top-panel .bm-search-wrap{position:relative;flex:1 1 auto;}',
      '.top-panel .bm-search-wrap::before{content:"";position:absolute;left:calc(12px * var(--bm-inv,1));top:50%;width:calc(15px * var(--bm-inv,1));height:calc(15px * var(--bm-inv,1));transform:translateY(-50%);background:url("' + SEARCH_ICON + '") no-repeat center;opacity:.42;pointer-events:none;}',
      '.bm-search{width:100%;box-sizing:border-box;height:calc(35px * var(--bm-inv,1));padding:0 calc(33px * var(--bm-inv,1));border-radius:calc(12px * var(--bm-inv,1));font:inherit;font-size:calc(13px * var(--bm-inv-t,1));border:1px solid rgba(146,143,138,.40);background:linear-gradient(180deg,#f6f5f2 0%,#faf9f7 42%,#fefefd 100%);color:inherit;box-shadow:inset 0 3px 6px rgba(var(--bm-shade),.18),inset 0 -2px 3px rgba(255,255,255,.95),0 1px 0 rgba(255,255,255,.85);transition:border-color .12s,box-shadow .12s;}',
      '.bm-search::placeholder{color:#9c9a95;}',
      '.bm-search:focus{outline:none;border-color:' + BAMBOO + ';box-shadow:inset 0 2px 5px rgba(var(--bm-shade),.15),inset 0 -2px 3px rgba(255,255,255,.95),0 0 0 3px rgba(74,124,89,.16),0 1px 0 rgba(255,255,255,.85);}',
      '.bm-search-clear{position:absolute;right:calc(9px * var(--bm-inv,1));top:50%;transform:translateY(-50%);width:calc(22px * var(--bm-inv,1));height:calc(22px * var(--bm-inv,1));padding:0;border:none;border-radius:50%;background:none;cursor:pointer;opacity:.5;font-size:calc(15px * var(--bm-inv,1));color:inherit;line-height:1;}',
      '.bm-search-clear:hover{opacity:1;background:rgba(128,120,110,.14);}',
      '.bm-search-clear.is-hidden{visibility:hidden;}',
      // ② 镜头座 —— 凸起；176 宽 → 约束②上限 10.5px
      // 三级：Y11/B18/S8（①19≥18 ②10≤10.5）｜Y6/B11/S5（①11≥11 ②6）｜Y3/B5/S2（①5≥5 ②3）
      // 外圈原为「1px 白 + 1px 7% 黑」的双环，那道黑环在机身亮面上就是一道灰箍，删黑留白
      // 镜座渐变改 180deg（竖向顶光，不再 148deg 的斜向）；删掉 inset 4px 0 / -4px 0 的左/右
      // 横向内高光与内阴影（那是左向光，违反 ⑥），只留顶部内高光 + 底部内阴影
      '.lens-unit{position:absolute;left:50%;top:206px;z-index:4;width:176px;height:176px;margin:-88px 0 0 -88px;border-radius:50%;cursor:pointer;background:linear-gradient(180deg,hsl(var(--accent-hue),20%,89%) 0%,hsl(var(--accent-hue),18%,93%) 20%,hsl(var(--accent-hue),24%,79%) 58%,hsl(var(--accent-hue),24%,71%) 80%,hsl(var(--accent-hue),22%,84%) 100%);box-shadow:0 11px 18px -8px rgba(var(--bm-shade),.28),0 6px 11px -5px rgba(var(--bm-shade),.22),0 3px 5px -2px rgba(var(--bm-shade),.18),inset 0 6px 12px rgba(255,255,255,.92),inset 0 -6px 12px rgba(var(--bm-shade),.30),0 0 0 1px rgba(255,255,255,.60);-webkit-backface-visibility:hidden;backface-visibility:hidden;}',
      // 镜座顶面眩光：高光圆心收到正上方 at 50% 14%（不再 30% 22% 左上）
      // 亮色下调淡（.50/.10 → .32/.08）：这层 screen 眩光覆盖整个镜头（含金属环与镜片），
      // 亮色下镜座本色就浅，再压一层 .50 白会把金属环的「顶亮→中沉」与镜片深坑一起洗掉，
      // 反而削弱镜头结构；调淡后金属环与镜片的结构透出来，才是「通透」。暗色按原值保留（见暗块）
      '.lens-unit::after{content:"";position:absolute;inset:0;border-radius:50%;pointer-events:none;background:radial-gradient(circle at 50% 14%,rgba(255,255,255,.32) 0%,rgba(255,255,255,.08) 24%,transparent 48%);mix-blend-mode:screen;}',
      // 金属镜圈 —— 微凸过渡环；180deg 竖向银色金属渐变（顶亮→中沉→底微回亮），
      // 单一顶光源下读起来是「环被上方照亮」。中段最暗只压到 #6e6e6e（银灰，不发黑）——
      // 之前那道 #2c2c2c 太重，把整圈压住了。投影仍落在镜头座上，收成 -4 收缩 + 模糊 10
      '.lens-barrel{position:absolute;inset:9px;border-radius:50%;background:linear-gradient(180deg,#fbfbfb 0%,#d4d4d4 18%,#9d9d9d 42%,#6e6e6e 58%,#8c8c8c 80%,#bcbcbc 100%);box-shadow:inset 0 0 0 1px rgba(255,255,255,.34),inset 0 0 0 2.5px rgba(var(--bm-shade),.10),0 5px 10px -4px rgba(var(--bm-shade),.28),0 2px 4px -1px rgba(var(--bm-shade),.18);}',
      // ③ 镜片玻璃 —— 凹陷深坑：高光圆心收正上方 at 50% 18%（不再 34% 26% 左上）；
      // 左/右内阴影改对称（inset 7px 0 / -7px 0 同值），去掉原左偏深 8px/右 6px 的左向偏差
      '.lens-glass{position:absolute;inset:24px;border-radius:50%;overflow:hidden;background:radial-gradient(circle at 50% 18%,hsl(var(--accent-hue),38%,58%) 0%,hsl(var(--accent-hue),40%,34%) 22%,hsl(var(--accent-hue),42%,19%) 50%,hsl(var(--accent-hue),44%,12%) 76%,hsl(var(--accent-hue),46%,7%) 100%);box-shadow:inset 0 10px 20px rgba(var(--bm-shade),.80),inset 0 -6px 12px rgba(255,255,255,.12),inset 7px 0 15px rgba(var(--bm-shade),.42),inset -7px 0 15px rgba(var(--bm-shade),.42),0 0 0 1px rgba(255,255,255,.12);-webkit-backface-visibility:hidden;backface-visibility:hidden;}',
      // 头像占住参考稿 iris 的位置：在 18px 基础上略放大到 inset:14px（74 → 82px），黑圈相应收到 14px，
      // 仅比原值多让出 4px，幅度克制；内投影维持原样（5px 12px / .60）保留镜头凹陷景深
      '.bm-avatar{position:absolute;inset:14px;border-radius:50%;overflow:hidden;display:flex;align-items:center;justify-content:center;background:linear-gradient(180deg,#e3ecdd 0%,#cfe0c8 100%);color:' + BAMBOO_DEEP + ';font-size:36px;font-weight:700;box-shadow:inset 0 0 0 1px rgba(150,175,215,.24),inset 0 5px 12px rgba(var(--bm-shade),.60);}',
      '.bm-avatar img{width:100%;height:100%;object-fit:cover;image-rendering:auto;-webkit-backface-visibility:hidden;backface-visibility:hidden;}',
      // 镜片眩光：原 126deg 斜向 + 底部两团蓝光（70% 76% / 28% 72%）等于光从下方/侧方反射，
      // 违反 ⑥。改为正上方顶光：一道竖向高光带 + 顶部居中的柔蓝晕
      // 亮色下调淡（白峰值 .92→.58、柔蓝晕 .40→.30）：.92 的白带在亮底上是一整块死白，
      // 盖住镜片本身的深坑景深；压到 .58 仍保留玻璃的反光，却让镜片结构与头像透出来
      '.lens-flare{position:absolute;inset:0;border-radius:50%;pointer-events:none;background:linear-gradient(180deg,rgba(255,255,255,.58) 0%,rgba(255,255,255,.26) 9%,rgba(255,255,255,.04) 24%,rgba(255,255,255,0) 36%),radial-gradient(ellipse 64% 42% at 50% 16%,hsla(var(--accent-hue),80%,72%,.30),transparent 72%);mix-blend-mode:screen;}',
      // ④ 红色快门 —— 凸起；现为明暗切换开关（手动刷新已挪到状态栏），按钮上不放图标
      // 缩到 46 宽：约束②上限随之降到 46 × 6% = 2.76px，故三级收缩由 7/3/0 改 8/4/0，
      // 使「模糊 − 收缩」= 2/2/2 ≤ 2.76 —— 否则影子会横向包住按钮，四周起一圈灰箍。
      // 三级模糊 12/6/2 原本分别向上渗出 6/3/2px，收缩后渗出归零，红色按钮顶上不再浮灰雾。
      // 快门高光圆心收正上方 at 50% 18%（不再 34% 26% 左上），与全图单一顶光源一致
      // 外圈（浅色垫圈 + 最外细线）保持上一轮定下的 2/3px
      // 位置：横向不动（left=321，圆心 x 仍 344）；纵向下移 18px —— 圆心 y 206 → 224，
      // 即不再与镜头同心（镜头圆心 y=206），快门落到镜头中线的下方，更接近真机快门的手位。
      // 想再调只改 top：top = 圆心y − 23（半径），横向保持 left=321 不动
      '.shutter{position:absolute;left:321px;top:201px;width:46px;height:46px;border-radius:50%;z-index:5;border:none;cursor:pointer;color:#fff;display:flex;align-items:center;justify-content:center;background:radial-gradient(circle at 50% 18%,#ff9d8e 0%,#ef3b2c 38%,#c4150c 68%,#7a0503 100%);box-shadow:0 6px 10px -8px rgba(var(--bm-shade),.40),0 3px 6px -4px rgba(var(--bm-shade),.28),0 1px 2px rgba(var(--bm-shade),.22),inset 0 -4px 8px rgba(var(--bm-shade),.38),inset 0 3px 7px rgba(255,255,255,.62),0 0 0 2px rgba(252,251,248,.95),0 0 0 3px rgba(var(--bm-shade),.06);}',
      // 穹顶伪元素内缩按同比例跟缩：15 × 46/56 ≈ 12px，保持穹顶与按钮的直径比不失调
      '.shutter::after{content:"";position:absolute;inset:12px;border-radius:50%;background:radial-gradient(circle at 50% 20%,#ff7f6c,#a80c06);box-shadow:inset 0 2px 4px rgba(var(--bm-shade),.45);}',
      '.shutter:hover{filter:brightness(1.08);}',
      '.shutter:active{transform:scale(.9);}',
      '.shutter:disabled{cursor:not-allowed;filter:saturate(.45);opacity:.6;}',
      '.shutter.bm-spin{animation:bm-spin 1s linear infinite;}',
      '@keyframes bm-spin{to{transform:rotate(360deg);}}',
      // ⑤ 彩虹条 —— 细带凸起：比参考稿更薄（22 → 8），像机身上一条精密印制的珐琅镶边。
      // top 由 311 上提到 314：高度从 14 收到 8 后，视觉中心仍锁在 318 不动（314+4=318）
      // 光影全部走「一条光」：上缘受光、下缘沉，五色共享同一光源方向，而非各自渐变拼贴
      '.rainbow{position:absolute;left:50%;top:314px;z-index:4;width:344px;height:8px;margin-left:-172px;border-radius:4px;overflow:hidden;display:flex;box-shadow:0 3px 5px -2px rgba(var(--bm-shade),.20),0 1px 2px -1px rgba(var(--bm-shade),.14),0 0 0 1px rgba(255,255,255,.30),inset 0 1px 1px rgba(255,255,255,.50),inset 0 -1px 2px rgba(var(--bm-shade),.26);}',
      '.rainbow i{flex:1;display:block;}',
      // 分段之间一道发丝缝：色界利落，看着像印制而非色块拼贴
      '.rainbow i + i{box-shadow:inset 1px 0 0 rgba(255,255,255,.22);}',
      // 彩虹条过片指针：绝对定位于相机、覆盖在彩虹条上方（不能进 .rainbow，否则被 overflow:hidden 裁掉）。
      // 沿彩虹条做横向定位，色相随所在分段（红/橙/黄/绿/蓝）染色，像取景器指针坐在正确颜色上。
      '.bm-rainbow-needle{position:absolute;top:322px;left:38px;width:0;height:0;z-index:5;pointer-events:none;transform:translateX(calc(var(--p,.5) * 344px)) translateX(-50%);transition:transform .18s cubic-bezier(.22,.61,.36,1);border-left:5px solid transparent;border-right:5px solid transparent;border-bottom:8px solid #fff;filter:drop-shadow(0 1px 1px rgba(var(--bm-shade),.5));}',
      // 彩虹条可点/拖＝过片定位（seek）：把死装饰变成主导航轴
      '.rainbow{cursor:pointer;}',
      '.rainbow::after{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;background:linear-gradient(180deg,rgba(255,255,255,.50) 0%,rgba(255,255,255,.10) 40%,rgba(var(--bm-shade),.06) 60%,rgba(var(--bm-shade),.26) 100%);}',
      // ⑥ 品牌字：原 text-shadow 上侧还挂了一道 0 -1px 0 rgba(0,0,0,.05)，
      // 等于在字的上方描一条暗线（光从上方来的方向恰好反了），删；字色同步去暖
      // 品牌字：显示「昵称」，未设置时回退 BAMBOO IMMORTALS（竹林修仙传品牌）。
      // 全宽居中 + nowrap/ellipsis 兜底，超长昵称不会溢出机身
      '.brand{position:absolute;left:0;right:0;top:340px;z-index:5;text-align:center;font-size:19px;font-weight:700;letter-spacing:.44em;text-indent:.44em;color:#9f9c96;text-shadow:0 1px 0 rgba(255,255,255,.95);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding:0 30px;}',
      // 中文昵称不必用拉丁字那么大字距（0.44em 是给 8 字母 POLAROID 的）：收到 .24em 更自然
      '.brand.is-cjk{letter-spacing:.24em;text-indent:.24em;}',
      // 较长拉丁串（如默认 BAMBOO IMMORTALS，16 字母）在 19px/.44em 下会超出机身可用宽，
      // 收成 13px/.26em 让它完整落回机身上（is-long 由渲染时按字数判定，仅非中日韩时生效）
      '.brand.is-long{font-size:13px;letter-spacing:.26em;text-indent:.26em;}',
      // ⑦ 颗粒质感层（feTurbulence 噪点）—— 压到极淡的软光噪点，去掉「脏斑」感，只留胶片味
      '.grain{position:absolute;inset:0;z-index:30;pointer-events:none;filter:url(#bm-grain);opacity:.03;mix-blend-mode:soft-light;border-radius:32px;-webkit-backface-visibility:hidden;backface-visibility:hidden;}',
      // ───────── 以下不属于相机，是模块自己的东西（放在机身之外，不污染机身） ─────────
      // 重叠法：纸带顶边直接钻到机身后面（净重叠 8px），由机身底沿压住 —— 纸带不再有
      // 「露在外面的一圈顶边」，读起来才是「从机身里抽出来」而不是「一张卡躺在机身下面」。
      // 为什么是 8px：必须 < 第一联的 padding-top 9px。重叠吃掉的是内边距，标题（从第 9px
      // 起）一个字都不会被啃掉 —— 这正是旧注释担心的「第一联像被啃掉一块」。
      // 纸带保持方角：它是纸，撕口在尾部，顶部不该有圆角。
      '.bm-header{padding:10px 10px 0;background:none;border:none;}',
      // 出纸口的历史：老 .bm-slot 是独立横杠，卡口 312px < 纸带 348px（纸比口宽 36px），
      // 物理上讲不通、且那根纯黑横杠是全模块最重的一块，故删。后来试过独立薄唇
      // （.bm-cam-lip）：机身底角是 32px 圆角，而纸带只比机身窄 8px/侧，任何「比纸带宽」
      // 才包得住的横条都会戳出圆角轮廓之外，看着就是贴上去的假条，故也删。
      // 最终方案（两件事，各管一头）：
      //  ① 槽口开在机身本体上（.camera 的 inset 阴影）—— 与机身轮廓同形、同材质、同光影，
      //     inset 阴影严格跟随 32px 圆角，是拍立得真正该有的出纸口；
      //  ② 纸带顶边钻进机身背后 8px（重叠法），由机身底沿压住——包边感来自机身本身，
      //     不靠任何独立元素，因此没有「横条戳出圆角」的假结构。
      // 分隔/压感仍由 .bm-cam-stage::after 的接地软影承担。
      // 编辑表单
      '.bm-form{margin-top:12px;padding:12px;border-radius:12px;background:var(--background-secondary,var(--bm-surface-2));box-shadow:inset 0 0 0 1px rgba(74,124,89,.08);}',
      '.bm-label{font-size:11px;opacity:.6;margin:8px 0 3px;}',
      '.bm-label:first-child{margin-top:0;}',
      '.bm-input{width:100%;box-sizing:border-box;padding:7px 9px;border-radius:8px;font:inherit;font-size:13px;border:1px solid rgba(128,128,128,.28);background:var(--background-primary,var(--bm-surface));color:inherit;transition:border-color .12s,box-shadow .12s;}',
      '.bm-input:focus{outline:none;border-color:' + BAMBOO + ';box-shadow:0 0 0 3px rgba(74,124,89,.12);}',
      '.bm-actions{display:flex;gap:8px;margin-top:12px;}',
      '.bm-btn{flex:1 1 auto;padding:7px 10px;border-radius:8px;cursor:pointer;font:inherit;font-size:13px;border:1px solid rgba(128,128,128,.28);background:var(--background-primary,var(--bm-surface));color:inherit;transition:.12s;}',
      '.bm-btn:hover{box-shadow:0 1px 3px rgba(0,0,0,.06);}',
      '.bm-btn.primary{background:' + BAMBOO_DEEP + ';color:#fff;border-color:' + BAMBOO_DEEP + ';}',
      '.bm-btn.primary:hover{background:' + BAMBOO + ';}',
      // 搜索样式已上移到相机 .top-panel 内（见 ① 顶部凹槽面板）
      // 纸带：从出纸口吐出来的连续小票
      // 上移 14px 把纸带顶边送进机身背后（负 margin 而非 padding：纸带区是 overflow:auto，
      // 用负 padding 会被容器裁掉、白挪；负 margin 是整体上移容器，内容不被裁）。
      // 为什么必须是 14 而不是 8：机身底角圆角 R=28（视觉值），纸带边缘处弧线已抬高
      // rise=10.7px；重叠量必须 > rise，否则纸带顶边那道白线会从弧线下方漏出来横切圆角
      // —— 那正是「圆角被破坏」的成因。取 14 = rise 10.7 + 3.3 余量，白线全程藏在轮廓内。
      '.bm-list-region{flex:1 1 auto;overflow:auto;margin-top:-14px;padding:0 0 8px;box-sizing:border-box;}',
      // 纸带对齐机身（左右对称），比机身每侧窄 6px（机身宽 = 侧栏 - 80，纸带 = 侧栏 - 92）
      // 纸带投影：原 0 8px 16px 会向上渗出 8px，正好灌进机身与纸带之间那 6px 窄缝，
      // 与机身三级投影+接地影叠成 114 的近黑焦痕。加 -8 收缩并加大下移后，上渗归零
      '.bm-paper{position:relative;margin:0 36px 8px;box-shadow:0 1px 2px -1px rgba(var(--bm-shade),.08),0 10px 18px -8px rgba(var(--bm-shade),.07);}',
      // 纸尾原是一条 7px 的撕断锯齿边（.bm-paper::after），已删：实测它让纸带底部
      // 多出一排起伏的三角，像被虫蛀过；纸带收口改成最后一联自己的平直底边。
      // 【试过并撤销】纸带受光：曾加 .bm-paper::before 盖一层「竖向顶亮底暗 + 横向两侧收暗」
      // 的连续渐变想让纸有厚度。实测亮色下反而不如平涂——纸带原本的干净白被压出了一条自上而下的
      // 灰调，跟机身那圈浅色垫圈、撕口缺口一起看会显脏。教训：纸带是「刚吐出来的干净纸」，
      // 它的质感来自撕口/孔线/悬停这些结构，不是靠加渐变；平涂白本身就是这张纸的材质。勿再试。
      '.bm-category{margin:0;padding-bottom:6px;border-bottom:1px solid var(--background-modifier-border,var(--bm-border));}',
      '.bm-cat-title{display:flex;align-items:center;gap:5px;padding:8px 12px 4px;cursor:pointer;font-weight:700;font-size:11px;color:var(--bw-bamboo);user-select:none;text-transform:uppercase;letter-spacing:.5px;transition:background .15s;}',
      '.bm-cat-title:hover{background:var(--background-modifier-hover);}',
      '.bm-cat-count{font-weight:500;font-size:10px;color:var(--text-faint,var(--bm-faint));background:var(--background-modifier-hover,var(--bm-hover));padding:1px 6px;border-radius:var(--bw-radius-md);margin-left:auto;min-width:16px;text-align:center;}',
      '.bm-arrow{font-size:9px;width:10px;text-align:center;flex-shrink:0;color:var(--text-faint,var(--bm-faint));opacity:.6;transition:transform .2s ease;}',
      '.bm-category.bm-collapsed .bm-arrow{transform:rotate(-90deg);}',
      '.bm-cat-items{overflow:hidden;}',
      '.bm-category.bm-collapsed .bm-cat-items{display:none;}',
      // 纸上的一联：标题 + 元信息
      '.bm-paper-item{position:relative;box-sizing:border-box;padding:9px 13px;cursor:pointer;background:var(--bm-paper);transition:background .12s;}',
      '.bm-paper-item:hover{background:var(--bm-paper-hover);}',
      '.bm-paper-item.is-active{background:var(--bm-paper-active);}',
      '.bm-paper-item:not(:last-child){border-bottom:1px dashed var(--bm-tear);}',
      // 第一联刚从机身下沿探出：顶部压一道内阴影（原 .4 偏重，与上方窄缝叠起来像焦痕，收到 .26）
      // 第一联：重叠 14px 后顶部有 14px 埋在机身后面。padding-top 取 23 = 14（被埋）+ 9（可见，
      // 与其余各联的 9px 完全一致），故标题距机身底沿恒为 9px、绝不会被啃；padding-bottom 保持
      // 9px 不动。DOM 里这一联虽高 14px，但高的部分全在机身背后，可见部分的节奏与其它联相同。
      // 顶边另压一道内阴影，让贴着槽口露出的那段纸边不发亮。
      '.bm-paper-item:first-child{padding:23px 13px 9px;box-shadow:inset 0 10px 10px -7px rgba(var(--bm-shade),.36);}',
      // 撕口：相邻两联之间咬出的缺口（clip-path 真镂空，直接露出卡片底色，不依赖配色匹配）
      '.bm-paper-item:not(:last-child){clip-path:polygon(0 0,100% 0,100% calc(100% - 5px),calc(100% - 5px) 100%,5px 100%,0 calc(100% - 5px));}',
      '.bm-paper-item + .bm-paper-item{clip-path:polygon(5px 0,calc(100% - 5px) 0,100% 5px,100% 100%,0 100%,0 5px);}',
      '.bm-paper-item + .bm-paper-item:not(:last-child){clip-path:polygon(5px 0,calc(100% - 5px) 0,100% 5px,100% calc(100% - 5px),calc(100% - 5px) 100%,5px 100%,0 calc(100% - 5px),0 5px);}',
      '.bm-item-title{font-weight:500;font-size:13px;line-height:1.35;color:var(--text-normal,var(--bm-ink));white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
      '.bm-paper-item.is-active .bm-item-title{font-weight:700;}',
      '.bm-item-meta{font-size:11px;color:var(--text-faint,var(--bm-faint));margin-top:2px;display:flex;gap:5px;align-items:center;flex-wrap:wrap;line-height:1.3;}',
      '.bm-meta-sep{opacity:.45;}',
      '.bm-badge{font-size:10px;padding:1px 7px;border-radius:10px;background:var(--background-modifier-hover,var(--bm-hover));color:var(--text-faint,var(--bm-faint));font-weight:500;}',
      '.bm-words{color:var(--text-faint,var(--bm-faint));}',
      // 骨架 / 空 / 错 —— 也都印在纸上
      '.bm-skeleton{padding:10px 4px 8px;background:var(--bm-paper);}',
      '.bm-sk-item{padding:10px 6px;}',
      '.bm-sk-line{height:9px;border-radius:4px;background:var(--background-modifier-border,var(--bm-border));margin-bottom:7px;animation:bm-pulse 1.1s ease-in-out infinite;}',
      '.bm-sk-line-long{width:72%;}.bm-sk-line-mid{width:55%;}.bm-sk-line-short{width:38%;}',
      '@keyframes bm-pulse{0%,100%{opacity:.5;}50%{opacity:1;}}',
      '.bm-empty{padding:26px 14px;text-align:center;color:var(--text-muted,var(--bm-muted));font-size:12px;line-height:1.75;background:var(--bm-paper);}',
      '.bm-empty small{opacity:.75;}',
      '.bm-error{padding:22px 14px;text-align:center;color:var(--text-muted,var(--bm-muted));font-size:12px;line-height:1.7;background:var(--bm-paper);}',
      '.bm-error .bm-btn{flex:0 0 auto;margin-top:10px;}',
      // 状态栏居中：左右 14px 内边距本就对称，一条 text-align:center 即成中轴。
      // letter-spacing 会在末字之后再留 .3px（居中时整行因此左偏 .15px），
      // 用 text-indent:.3px 补偿 —— 居中时缩进的实际位移是它的一半，正好 .15px
      // 状态栏现在是手动刷新的入口（原快门），故加可点样式：悬停提亮 + 竹青提示色
      '.bm-status{padding:8px 14px;font-size:11px;color:var(--text-faint,var(--bm-faint));border-top:1px solid var(--background-modifier-border,var(--bm-border));letter-spacing:.3px;text-align:center;text-indent:.3px;cursor:pointer;user-select:none;transition:color .12s;}',
      '.bm-status:hover{color:' + BAMBOO + ';}',
      // ────────────── 暗色（宿主暗色 + Obsidian 暗色）──────────────
      // 下面整块必须同时认两个选择器，缺一个就会在另一种环境里整套静默失效：
      //   宿主「竹林修仙传」webapp 的暗色开关是挂在 documentElement 上的 .dark
      //   （store.js / bridge.js 只 toggle('dark')，全仓 theme-dark 出现 0 次）；
      //   Obsidian 原生暗色则是 .theme-dark。
      // 暗色沿用原影色 30,30,34：暗底上中性影色本就不显脏（问题只在亮色的暖奶油底上出现），
      // 且暗色观感已定稿，故整体还原。选择器必须分别压过 html / body / #module-view-root
      // 各自在根规则上的声明 —— 尤其 #module-view-root 是 id 声明，只有带 .dark 前缀的
      // 复合选择器（权重 1,1,0 > 1,0,0）才压得住，否则暗色会漏出亮色的冷调值。
      ':is(.theme-dark,.dark),:is(.theme-dark,.dark) body,:is(.theme-dark,.dark) #module-view-root{--bm-shade:30,30,34;}',
      // 暗色：卡片底色中性压深；并补上模块回退令牌的暗色值（宿主无令牌时表单/输入/文字也不露白）
      ':is(.theme-dark,.dark) .bm-wrap{--bm-ink:#dcddde;--bm-muted:#9b9b9b;--bm-faint:#8a8a8a;--bm-surface:hsl(var(--accent-hue),12%,15%);--bm-surface-2:hsl(var(--accent-hue),12%,13%);--bm-border:hsl(var(--accent-hue),14%,22%);--bm-hover:hsla(var(--accent-hue),18%,80%,.08);--bm-paper:hsl(var(--accent-hue),14%,18%);--bm-paper-hover:hsl(var(--accent-hue),14%,21%);--bm-paper-active:hsl(var(--accent-hue),16%,20%);--bm-tear:rgba(255,255,255,.18);--bw-bamboo-deep:hsl(var(--accent-hue),32%,calc(58% + var(--accent-lightness-offset,0%)));--bw-bamboo:hsl(var(--accent-hue),30%,calc(66% + var(--accent-lightness-offset,0%)));--bw-bamboo-light:hsl(var(--accent-hue),28%,calc(74% + var(--accent-lightness-offset,0%)));--bw-bamboo-pale:hsla(var(--accent-hue),38%,calc(78% + var(--accent-lightness-offset,0%)),.28);}',
      // 暗色：三个面同样保持「顶亮 / 正中共 / 侧暗」的落差，否则立体感会塌掉
      // 暗色：参考稿没有暗色版，这里只把三个大面压深，凹凸的光影规则与投影数值一律照搬
      // 暗色机身同样遵守 ⑥：高光圆心收正上方 at 50% 0%，删左边高光 inset 3px 0，暗角落正下方
      // 暗色出纸槽：槽顶压得更深（中性黑 .48，暗面不发灰），槽口下沿的受光亮边压到 .08
      ':is(.theme-dark,.dark) .camera{background:radial-gradient(120% 100% at 50% 0%,rgba(255,255,255,.16) 0%,rgba(255,255,255,0) 55%),linear-gradient(160deg,hsl(var(--accent-hue),10%,30%) 0%,hsl(var(--accent-hue),10%,27%) 28%,hsl(var(--accent-hue),12%,23%) 60%,hsl(var(--accent-hue),12%,19%) 92%,hsl(var(--accent-hue),12%,17%) 100%);box-shadow:0 24px 40px -18px rgba(0,0,0,.50),0 14px 22px -12px rgba(0,0,0,.40),0 5px 8px -3px rgba(0,0,0,.30),inset 0 2px 2px rgba(255,255,255,.10),inset 0 -14px 10px -4px rgba(0,0,0,.48),inset 0 -2px 3px -1px rgba(255,255,255,.08),inset 0 -5px 10px rgba(0,0,0,.42),inset 0 -7px 16px rgba(0,0,0,.30);}',
      // 暗色机身 ::before 高光/暗角同步到正上/正下
      ':is(.theme-dark,.dark) .camera::before{background:radial-gradient(130% 95% at 50% -6%,rgba(255,255,255,.16),transparent 52%),radial-gradient(92% 76% at 50% 108%,rgba(0,0,0,.42),transparent 62%);}',
      ':is(.theme-dark,.dark) .camera::after{box-shadow:inset 0 0 0 1.5px rgba(255,255,255,.10);}',
      ':is(.theme-dark,.dark) .top-panel{background:linear-gradient(180deg,#22231e 0%,#2b2c26 22%,#35362f 55%,#3c3d36 100%);box-shadow:inset 0 6px 16px rgba(0,0,0,.55),inset 0 -3px 5px rgba(255,255,255,.10),inset 0 0 0 1px rgba(255,255,255,.06),0 1px 0 rgba(255,255,255,.10);}',
      // 暗色：凹槽面板里的搜索格同样保持「上缘暗、下缘亮」的内嵌感
      ':is(.theme-dark,.dark) .bm-search{background:linear-gradient(180deg,#1b1c17 0%,#21221c 45%,#27281f 100%);border-color:rgba(255,255,255,.10);color:#e6e4dd;box-shadow:inset 0 3px 6px rgba(0,0,0,.60),inset 0 -2px 3px rgba(255,255,255,.06),0 1px 0 rgba(255,255,255,.06);}',
      ':is(.theme-dark,.dark) .bm-search::placeholder{color:#8b8880;}',
      ':is(.theme-dark,.dark) .bm-search:focus{border-color:var(--bw-bamboo);box-shadow:inset 0 2px 5px rgba(0,0,0,.50),inset 0 -2px 3px rgba(255,255,255,.06),0 0 0 3px rgba(143,197,159,.18),0 1px 0 rgba(255,255,255,.06);}',
      ':is(.theme-dark,.dark) .top-panel .bm-search-wrap::before{filter:brightness(1.7) saturate(.75);}',
      ':is(.theme-dark,.dark) .bm-search-clear:hover{background:rgba(255,255,255,.10);}',
      // 暗色镜座：渐变改 180deg 竖向顶光，删左/右横向内高光与内阴影（遵守 ⑥）
      ':is(.theme-dark,.dark) .lens-unit{background:linear-gradient(180deg,hsl(var(--accent-hue),10%,25%) 0%,hsl(var(--accent-hue),10%,29%) 20%,hsl(var(--accent-hue),12%,20%) 58%,hsl(var(--accent-hue),12%,16%) 80%,hsl(var(--accent-hue),10%,23%) 100%);box-shadow:0 11px 18px -8px rgba(0,0,0,.55),0 6px 11px -5px rgba(0,0,0,.45),0 3px 5px -2px rgba(0,0,0,.35),inset 0 6px 12px rgba(255,255,255,.18),inset 0 -6px 12px rgba(0,0,0,.5),0 0 0 1px rgba(255,255,255,.12);}',
      // 暗色眩光回到调淡前的原值（.50/.10 与 .92/.40/.40）：暗色下镜座底色深，同样的白眩光
      // 反而把结构「挑」出来，不会洗掉，故暗色维持不动
      ':is(.theme-dark,.dark) .lens-unit::after{background:radial-gradient(circle at 50% 14%,rgba(255,255,255,.50) 0%,rgba(255,255,255,.10) 24%,transparent 48%);}',
      ':is(.theme-dark,.dark) .lens-flare{background:linear-gradient(180deg,rgba(255,255,255,.92) 0%,rgba(255,255,255,.40) 9%,rgba(255,255,255,.05) 24%,rgba(255,255,255,0) 36%),radial-gradient(ellipse 64% 42% at 50% 16%,rgba(150,200,255,.40),transparent 72%);}',
      ':is(.theme-dark,.dark) .lens-glass{background:radial-gradient(circle at 50% 18%,hsl(var(--accent-hue),36%,46%) 0%,hsl(var(--accent-hue),40%,26%) 22%,hsl(var(--accent-hue),42%,14%) 50%,hsl(var(--accent-hue),44%,9%) 76%,hsl(var(--accent-hue),46%,5%) 100%);}',
      // 暗色金属环：竖向银色金属渐变，中段最暗只到 #5e5e5e（不发黑），与亮色同一光源方向
      ':is(.theme-dark,.dark) .lens-barrel{background:linear-gradient(180deg,#e6e6e6 0%,#b4b4b4 18%,#828282 42%,#5e5e5e 58%,#787878 80%,#a6a6a6 100%);box-shadow:inset 0 0 0 1px rgba(255,255,255,.34),inset 0 0 0 2.5px rgba(var(--bm-shade),.16),0 5px 10px -4px rgba(var(--bm-shade),.42),0 2px 4px -1px rgba(var(--bm-shade),.30);}',
      ':is(.theme-dark,.dark) .shutter{box-shadow:0 6px 10px -7px rgba(0,0,0,.55),0 3px 6px -3px rgba(0,0,0,.45),0 1px 2px rgba(0,0,0,.35),inset 0 -5px 10px rgba(0,0,0,.5),inset 0 4px 9px rgba(255,255,255,.5),0 0 0 2px rgba(60,61,55,.95),0 0 0 3px rgba(0,0,0,.18);}',

      ':is(.theme-dark,.dark) .bm-paper-item:first-child{box-shadow:inset 0 10px 10px -7px rgba(0,0,0,.62);}',
      // 隐藏 webview 内默认滚动条（保留滚动能力）：模块外壳 #module-view-root 与内部列表/阅读区统一，
      // 去掉 Chromium 默认那条灰色宽滚动条，观感更贴合竹青排版。
      '#module-view-root,.bm-wrap,.bm-list-region{scrollbar-width:none;-ms-overflow-style:none;}',
      '#module-view-root::-webkit-scrollbar,.bm-wrap::-webkit-scrollbar,.bm-list-region::-webkit-scrollbar{width:0;height:0;display:none;}',
    ].join('');
    document.head.appendChild(st);
    ensureGrainFilter();
  }

  // 噪点滤镜（feTurbulence）—— .bm-grain 用它给机身蒙一层极淡的颗粒，去掉纯渐变的塑料味
  // 噪点滤镜（feTurbulence）—— .bm-grain 用它给机身蒙一层极淡的颗粒，去掉纯渐变的塑料味
  // 质量提升：① sRGB 色彩插值（滤镜内混色更准、不偏脏）② 降 octave 到 2（少高频杂点）
  // ③ feComponentTransfer 把噪声幅度压到约一半，避免脏斑；整体只是「胶片味」而非「灰尘」
  function ensureGrainFilter() {
    if (document.getElementById('bm-grain-svg')) return;
    var ns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('id', 'bm-grain-svg');
    svg.setAttribute('width', '0');
    svg.setAttribute('height', '0');
    svg.setAttribute('aria-hidden', 'true');
    svg.style.position = 'absolute';
    var f = document.createElementNS(ns, 'filter');
    f.setAttribute('id', 'bm-grain');
    f.setAttribute('color-interpolation-filters', 'sRGB');
    f.setAttribute('x', '0');
    f.setAttribute('y', '0');
    f.setAttribute('width', '100%');
    f.setAttribute('height', '100%');
    var t = document.createElementNS(ns, 'feTurbulence');
    t.setAttribute('type', 'fractalNoise');
    t.setAttribute('baseFrequency', '0.72');
    t.setAttribute('numOctaves', '2');
    t.setAttribute('stitchTiles', 'stitch');
    t.setAttribute('color-interpolation-filters', 'sRGB');
    var c = document.createElementNS(ns, 'feColorMatrix');
    c.setAttribute('type', 'saturate');
    c.setAttribute('values', '0');
    // 压低噪点对比：把噪声幅度压缩到约一半，消除脏斑
    var ct = document.createElementNS(ns, 'feComponentTransfer');
    ['R', 'G', 'B'].forEach(function (ch) {
      var fn = document.createElementNS(ns, 'feFunc' + ch);
      fn.setAttribute('type', 'linear');
      fn.setAttribute('slope', '0.5');
      fn.setAttribute('intercept', '0');
      ct.appendChild(fn);
    });
    f.appendChild(t);
    f.appendChild(c);
    f.appendChild(ct);
    svg.appendChild(f);
    document.body.appendChild(svg);
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

  /** 当前明暗：宿主把主题开关挂在 documentElement 上（.dark = 宿主 webapp 开关，
   *  .theme-dark = Obsidian 原生暗色），模块据这两个类判断自己处在哪种模式 */
  function isDarkNow() {
    var cl = document.documentElement.classList;
    return !!(cl && (cl.contains('dark') || cl.contains('theme-dark')));
  }

  /** 快门：切换 Obsidian 基础明暗。宿主代劳（与画中卷·打字机机身明暗开关同一实现），
   *  切换后主题管线会把新明暗推回来，本模块随侧栏一起变。宿主无此能力（旧版）则静默跳过 */
  function toggleTheme() {
    if (api && typeof api.toggleTheme === 'function') api.toggleTheme();
  }

  /** 只更新快门的语义（tooltip / aria），不整体重建 —— 重建会重跑 fitCamera，相机抖一下 */
  function syncShutter() {
    var btn = root && root.querySelector('.shutter');
    if (!btn) return;
    var dark = isDarkNow();
    btn.setAttribute('title', dark ? '切换到亮色（快门）' : '切换到暗色（快门）');
    btn.setAttribute('aria-label', dark ? '切换到亮色' : '切换到暗色');
  }

  var _themeObserver = null;
  /** 监听宿主推送的明暗变化：只翻快门图标，避免整树重建导致的相机抖动 */
  function observeTheme() {
    if (typeof MutationObserver === 'undefined' || _themeObserver) return;
    var last = isDarkNow();
    _themeObserver = new MutationObserver(function () {
      var now = isDarkNow();
      if (now === last) return;
      last = now;
      syncShutter();
    });
    _themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  }

  /* ────────────── 渲染 ────────────── */
  function render() {
    if (!root) return;


    var html = '<div class="bm-wrap">';

    // 相机：参考稿原结构（420×400），外面套缩放基座
    html += '<div class="bm-header">';
    html += '<div class="bm-cam-stage">';
    html += '<div class="camera">';
    html += '<div class="top-panel">';
    html += '<div class="bm-search-wrap">';
    html += '<input class="bm-search" data-field="search" placeholder="搜索文章…" value="' + esc(state.searchQuery) + '">';
    html += '<button class="bm-search-clear' + (state.searchQuery ? '' : ' is-hidden') + '" data-act="clear-search" aria-label="清除">×</button>';
    html += '</div>';
    html += '</div>';
    html += '<div class="lens-unit" data-act="edit" title="点击编辑资料">';
    html += '<div class="lens-barrel"><div class="lens-glass">';
    html += '<div class="bm-avatar">' + avatarHtml() + '</div>';
    html += '<div class="lens-flare"></div>';
    html += '</div></div>';
    html += '</div>';
    // 快门改作明暗开关（手动刷新已挪到状态栏「更新于 …」上，见 .bm-status）。
    // 按钮上不放任何图标：它是机身的一颗物理按键，只靠 tooltip / aria 说明当前会切到哪种，
    // 所处模式由侧栏本身的明暗直接体现，不需要在按钮上再标一次
    var _dark = isDarkNow();
    html += '<button class="shutter" data-act="toggle-theme" title="' + (_dark ? '切换到亮色（快门）' : '切换到暗色（快门）') + '" aria-label="' + (_dark ? '切换到亮色' : '切换到暗色') + '"></button>';
    html += '<div class="rainbow">';
    html += '<i style="background:#e2231a"></i><i style="background:#f58220"></i><i style="background:#ffd200"></i><i style="background:#00a651"></i><i style="background:#0072bc"></i>';
    html += '</div>';
    html += '<div class="bm-rainbow-needle" data-region="needle"></div>';
    // 品牌字显示昵称；未设置（空）时回退 BAMBOO IMMORTALS。
    // 含中日韩字符 → is-cjk（收紧字距）；纯拉丁且较长（去空格 ≥14 字） → is-long（缩字号避免溢出机身）
    var brandText = (state.profile.nickname || '').trim() || 'BAMBOO IMMORTALS';
    var brandCjk = /[\u3400-\u9fff\u3040-\u30ff]/.test(brandText);
    var brandLong = !brandCjk && brandText.replace(/\s/g, '').length >= 14;
    html += '<div class="brand' + (brandCjk ? ' is-cjk' : '') + (brandLong ? ' is-long' : '') + '">' + esc(brandText) + '</div>';
    html += '<div class="grain"></div>';
    html += '</div>';
    html += '</div>';
    if (state.editing) html += renderEditForm();
    html += '</div>';

    // 列表区
    html += '<div class="bm-list-region" data-region="list">' + renderListInner() + '</div>';

    // 状态栏
    // 手动刷新的落脚点：状态栏本身就在讲「更新于 HH:MM」，点它重扫一次（重载中会显示「吐纸中…」）
    html += '<div class="bm-status" data-act="refresh" role="button" tabindex="0" title="点击刷新文章列表">' + renderStatus() + '</div>';

    html += '</div>';
    root.innerHTML = html;
    bind();
    fitCamera();
    updateNeedle();
  }

  // 相机按参考稿原生 420×400 渲染后整体等比缩放：缩放只是「把图看小」，不动任何设计数值
  function fitCamera() {
    if (!root) return;
    var stage = root.querySelector('.bm-cam-stage');
    var cam = stage && stage.querySelector('.camera');
    if (!cam) return;
    var w = stage.clientWidth;
    if (!w) return;
    // 机身两侧各留 20px 给投影：k 按 (内容宽-40)/420 算，缩放后的阴影正好落在侧栏内边距里，不再被裁
    var k = Math.min(1, Math.max(0, (w - 40) / 420));
    cam.style.transform = 'translateX(-50%) translateZ(0) scale(' + k + ')';
    stage.style.height = Math.round(400 * k) + 'px';
    // 机身里的搜索框要「视觉尺寸恒定」：按 1/k 反向补偿。
    // --bm-inv 管盒子（上限 1.5，再大就会撑破凹槽面板）；--bm-inv-t 只管字号（上限 1.9，
    // 让窄侧栏下文字也保持约 13px 的可读尺寸，框内放得下更大的字）
    var inv = 1 / k;
    stage.style.setProperty('--bm-inv', String(Math.max(1, Math.min(1.5, inv))));
    stage.style.setProperty('--bm-inv-t', String(Math.max(1, Math.min(1.9, inv))));
  }

  function renderEditForm() {
    return '<div class="bm-form">' +
      '<div class="bm-label">文章根目录（vault 内文件夹，文章按子目录自动分类）</div>' +
      '<input class="bm-input" data-field="rootFolder" value="' + esc(state.rootFolder) + '" placeholder="如 博客">' +
      '<div class="bm-label">昵称</div>' +
      '<input class="bm-input" data-field="nickname" value="' + esc(state.profile.nickname) + '" placeholder="博客作者名">' +
      '<div class="bm-label">头像（vault 内图片路径，如 attachments/avatar.png，或填写 https 图片链接）</div>' +
      '<input class="bm-input" data-field="avatar" value="' + esc(state.profile.avatar) + '" placeholder="留空显示昵称首字，或填 https:// 图片 URL">' +
      '<div class="bm-actions">' +
      '<button class="bm-btn primary" data-act="save">保存</button>' +
      '<button class="bm-btn" data-act="cancel">取消</button>' +
      '</div>' +
      '</div>';
  }

  function renderStatus() {
    if (state.loading) return '吐纸中…';
    if (state.error) return state.error;
    if (!state.files.length) return '目录「' + esc(state.rootFolder) + '」暂无文章';
    return '已吐 ' + state.files.length + ' 张' + (state.lastRefreshAt ? (' · 更新于 ' + nowClock()) : '');
  }

  function renderListInner() {
    if (state.loading) return renderSkeleton();
    if (state.error) return renderError();
    var pool = filterPool();
    if (!pool.length) {
      if (state.searchQuery) return '<div class="bm-paper"><div class="bm-empty">没有匹配的文章<br><small>搜索词：' + esc(state.searchQuery) + '</small></div></div>';
      return '<div class="bm-paper"><div class="bm-empty">目录「' + esc(state.rootFolder) + '」下还没有文章<br><small>把 Markdown 笔记放进该目录即可显示在这里</small></div></div>';
    }
    return renderFlat(pool);
  }

  function renderSkeleton() {
    var s = '<div class="bm-paper"><div class="bm-skeleton">';
    for (var i = 0; i < 5; i++) {
      s += '<div class="bm-sk-item"><div class="bm-sk-line bm-sk-line-long"></div><div class="bm-sk-line bm-sk-line-mid"></div><div class="bm-sk-line bm-sk-line-short"></div></div>';
    }
    return s + '</div></div>';
  }

  function renderError() {
    return '<div class="bm-paper"><div class="bm-error"><div>' + esc(state.error) + '</div>' +
      '<button class="bm-btn primary" data-act="refresh">重试</button></div></div>';
  }

  // 纸带：按修改时间倒序，一联一篇文章
  function renderFlat(pool) {
    var items = pool.slice().sort(function (a, b) { return b.mtime - a.mtime; });
    var html = '<div class="bm-paper">';
    for (var i = 0; i < items.length; i++) html += renderItem(items[i]);
    return html + '</div>';
  }

  function renderItem(f) {
    var cls = 'bm-paper-item' + (state.selected === f.path ? ' is-active' : '');
    var html = '<div class="' + cls + '" data-path="' + esc(f.path) + '" tabindex="0" role="button">';
    html += '<div class="bm-item-title">' + esc(f.name) + '</div>';
    html += '<div class="bm-item-meta">';
    html += '<span class="bm-date">' + fmtDate(f.mtime) + '</span>';
    if (f.size) html += '<span class="bm-meta-sep">·</span><span class="bm-words">' + fmtWords(f.size) + '</span>';
    if (f.category && f.category !== '未分类') html += '<span class="bm-meta-sep">·</span><span class="bm-badge">' + esc(f.category) + '</span>';
    html += '</div>';
    html += '</div>';
    return html;
  }

  /* ────────────── 过滤 / 分组 ────────────── */
  function filterPool() {
    var pool = state.files;
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

  /* ────────────── 事件绑定 ────────────── */
  function bind() {
    if (!root) return;
    window.removeEventListener('resize', fitCamera);
    window.addEventListener('resize', fitCamera);
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
    // 列表滚动 → 指针连续跟手（进度指示）
    var region = root.querySelector('.bm-list-region');
    if (region) region.addEventListener('scroll', updateNeedle, { passive: true });
    // 彩虹条点/拖 → 过片定位（seek）
    var rainbow = root.querySelector('.rainbow');
    if (rainbow) rainbow.addEventListener('pointerdown', onRainbowSeek);
  }

  function onRootClick(e) {
    var el = e.target;
    while (el && el !== root) {
      if (el.getAttribute && el.getAttribute('data-act')) {
        var act = el.getAttribute('data-act');
        if (act === 'edit') { toggleEdit(); return; }
        if (act === 'cancel') { state.editing = false; render(); return; }
        if (act === 'save') { saveProfile(); return; }

        if (act === 'refresh') { refresh(); return; }
        if (act === 'toggle-theme') { toggleTheme(); return; }
        if (act === 'clear-search') { state.searchQuery = ''; state.searchFull = false; updateListOnly(); var sb = root.querySelector('[data-field="search"]'); if (sb) sb.focus(); return; }
      }
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
    // 状态栏是 div（手动刷新入口，role=button tabindex=0），回车/空格要等价于点击
    if (el && el.getAttribute && el.getAttribute('data-act')) {
      e.preventDefault();
      var a = el.getAttribute('data-act');
      if (a === 'refresh') refresh();
      else if (a === 'toggle-theme') toggleTheme();
    }
  }

  /* 搜索时只刷新列表区（不动相机/搜索框），避免整页重渲卡输入 */
  function updateListOnly() {
    if (!root) return;
    var region = root.querySelector('.bm-list-region');
    if (region) region.innerHTML = renderListInner();
    var clear = root.querySelector('.bm-search-clear');
    if (clear) clear.classList.toggle('is-hidden', !state.searchQuery);
    updateNeedle();
  }

  function scheduleSearch() {
    state.searchFull = false;
    state._searchGen++;
    updateListOnly();
    if (state._searchTimer) clearTimeout(state._searchTimer);
    state._searchTimer = setTimeout(applyFullText, 220);
  }

  function applyFullText() {
    var gen = state._searchGen;
    if (!state.searchQuery) return;
    var q = state.searchQuery.toLowerCase();
    // 扫全部未缓存文件（而非仅「标题/分类已命中」的文件），否则正文命中但标题/分类
    // 未命中的文章永远进不了 _contentCache，全文搜索实质失效
    var need = state.files.filter(function (f) { return !state._contentCache[f.path]; });
    if (!need.length) { state.searchFull = true; updateListOnly(); return; }
    var idx = 0;
    function step() {
      if (gen !== state._searchGen) return;
      if (idx >= need.length) { state.searchFull = true; updateListOnly(); return; }
      var f = need[idx++];
      api.readFile(f.path).then(function (content) {
        if (gen !== state._searchGen) return;
        state._contentCache[f.path] = (content || '').toLowerCase();
        if (matchText(q, f.name) || matchText(q, f.category) || state._contentCache[f.path].indexOf(q) >= 0) updateListOnly();
        step();
      }).catch(function () { step(); });
    }
    step();
  }

  /* ────────────── 彩虹条过片指针 ────────────── */
  function updateNeedle() {
    var needle = root && root.querySelector('[data-region="needle"]');
    var region = root && root.querySelector('.bm-list-region');
    if (!needle || !region) return;
    var max = region.scrollHeight - region.clientHeight;
    var p = max > 0 ? region.scrollTop / max : 0.5;
    p = p < 0 ? 0 : p > 1 ? 1 : p;
    needle.style.setProperty('--p', p);
    var seg = Math.floor(p * 5);
    if (seg < 0) seg = 0; if (seg > 4) seg = 4;
    var colors = ['#e2231a', '#f58220', '#ffd200', '#00a651', '#0072bc'];
    needle.style.borderBottomColor = colors[seg];
  }

  function seekTo(p) {
    var region = root.querySelector('.bm-list-region');
    if (!region) return;
    var max = region.scrollHeight - region.clientHeight;
    if (max <= 0) { updateNeedle(); return; }
    region.scrollTop = p * max;
    updateNeedle();
  }

  function onRainbowSeek(e) {
    var rainbow = root.querySelector('.rainbow');
    if (!rainbow) return;
    e.preventDefault();
    try { rainbow.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    function move(ev) {
      var rect = rainbow.getBoundingClientRect();
      var p = (ev.clientX - rect.left) / rect.width;
      p = p < 0 ? 0 : p > 1 ? 1 : p;
      seekTo(p);
    }
    function up() {
      try { rainbow.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      rainbow.removeEventListener('pointermove', move);
      rainbow.removeEventListener('pointerup', up);
      rainbow.removeEventListener('pointercancel', up);
    }
    rainbow.addEventListener('pointermove', move);
    rainbow.addEventListener('pointerup', up);
    rainbow.addEventListener('pointercancel', up);
    move(e);
  }



  /* ────────────── 行为 ────────────── */
  function toggleEdit() { state.editing = !state.editing; render(); }






  function openArticle(path) {
    state.selected = path;
    var item = root && root.querySelector('.bm-paper-item[data-path="' + (window.CSS && CSS.escape ? CSS.escape(path) : path) + '"]');
    if (item && item.scrollIntoView) { try { item.scrollIntoView({ block: 'nearest' }); } catch (e) { /* ignore */ } }
    var opener = api && (api.onOpenReader || api.openReader);
    if (opener) opener(path);
  }















  function saveProfile() {
    if (!root) return;
    var rf = root.querySelector('[data-field="rootFolder"]');
    var nick = root.querySelector('[data-field="nickname"]');
    var av = root.querySelector('[data-field="avatar"]');
    if (rf) state.rootFolder = rf.value.trim() || '博客';
    if (nick) state.profile.nickname = nick.value.trim();
    if (av) state.profile.avatar = av.value.trim();
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
    });
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

  async function refresh(silent) {
    state.isRefreshing = true;
    state.error = '';
    // 静默刷新（焦点/可见性回弹）不显示 loading 态，避免闪一下
    if (!silent) { state.loading = true; render(); }
    var changed = true;
    try {
      var files = await api.listFiles(state.rootFolder, true);
      var next = (files || []).map(function (f) {
        return {
          path: f.path,
          name: f.name.replace(/\.md$/i, ''),
          mtime: f.mtime || 0,
          ctime: f.ctime || 0,
          size: f.size || 0,
          category: categoryOf(f.path),
        };
      });
      // 静默刷新：列表（路径 + 修改时间）没变就别重建 DOM —— 否则每次获得焦点都重跑
      // fitCamera 缩放相机，侧栏会抖一下；同时也不浪费一次整树重建
      changed = silent ? !sameFiles(state.files, next) : true;
      state.files = next;
      state._contentCache = {};
      state.lastRefreshAt = Date.now();
    } catch (e) {
      state.error = '目录读取失败：' + (e && e.message ? e.message : '未知错误');
      state.files = [];
      changed = true;
    }
    state.loading = false;
    state.isRefreshing = false;
    if (changed) render();
  }

  // 两个列表是否一致（按路径 + 修改时间）；用于静默刷新的「无变化就跳过重建」
  function sameFiles(a, b) {
    if (a.length !== b.length) return false;
    // 按 path 建 Map 比对 mtime，不再依赖 listFiles 返回顺序稳定，避免顺序波动误判「已变」触发无谓整树重建
    var mb = {};
    for (var i = 0; i < b.length; i++) mb[b[i].path] = b[i].mtime;
    for (var j = 0; j < a.length; j++) {
      if (!(a[j].path in mb) || mb[a[j].path] !== a[j].mtime) return false;
    }
    return true;
  }

  async function loadAll() {
    try {
      var d = await api.loadData();
      if (d) {
        if (d.profile) {
          state.profile.nickname = d.profile.nickname || state.profile.nickname;
          state.profile.avatar = d.profile.avatar || '';
        }
        if (d.rootFolder) state.rootFolder = d.rootFolder;

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

  // 自动兜底：侧边栏重新获得焦点 / 页面恢复可见时静默重扫，降低对手动刷新的依赖
  function onAutoRefresh() {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    if (Date.now() - (state.lastRefreshAt || 0) < 1000) return; // 节流：避免焦点抖动频繁重扫
    // 关键修复：焦点/可见性回调若「同步」refresh()，会在 mousedown→focus→mouseup→click
    // 之间整体重建 DOM，把用户正按着的列表项节点销毁，导致本次 click 落空（表现成
    // 「双击才切换文章」）。推迟到下一宏任务，让这下 click 先完成，再静默重扫；
    // 列表无变化时不重建（见 refresh(silent)），相机也不会再抖
    setTimeout(function () { refresh(true); }, 0);
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
      // 自动兜底：获得焦点 / 页面恢复可见时静默刷新
      window.addEventListener('focus', onAutoRefresh);
      document.addEventListener('visibilitychange', onAutoRefresh);
      if (api.onFocus) api.onFocus(onAutoRefresh);
      // 明暗由宿主推送：快门图标要跟着翻，故监听 documentElement 的 class 变化
      observeTheme();
    },
    destroy: function () {
      var st = document.getElementById(STYLE_ID);
      if (st && st.parentNode) st.parentNode.removeChild(st);
      if (root) root.removeEventListener('click', onRootClick);
      if (root) root.removeEventListener('keydown', onRootKey);
      window.removeEventListener('focus', onAutoRefresh);
      document.removeEventListener('visibilitychange', onAutoRefresh);
      if (_themeObserver) { _themeObserver.disconnect(); _themeObserver = null; }
      root = null;
      api = null;
    },
  };
})();
