/* __bamboo_module_ {"id":"curtain","name":"竹林卷帘窗","version":"0.2.1","fab":{"icon":"blinds","label":"窗台"},"location":"left"} */
/**
 * 竹林模块 · 竹林卷帘窗 v0.2
 *
 * 形态：一扇占满侧栏的竖长百叶窗。顶部毛竹横筒架在两端轴托上，筒下垂一挂
 * 竹叶百叶（片数由 LAM_H / LAM_GAP 推出，当前 42 片，片间留缝），底端一根配重横杆，
 * 右侧一串玉珠拉绳。
 * 拽玉珠 → 叶片跟手上移卷进筒里 → 露出窗外一片朦胧远山（固定构图，主题色）。
 *
 * 三条来自实机的教训，直接决定了这一版：
 *
 * 1) 占满。v0.1 用「固定设计稿 + scale 适配」，侧栏一窄 k 就掉到 0.6，
 *    整扇窗缩成角落里一小块。现在的 k 由「宽」和「高」双向取小：
 *    k = min(侧栏宽/稿宽, 可用高/稿高)，且允许放大 —— 稿子只是比例尺，不是最终尺寸。
 *
 * 2) 百叶，不是竹席。v0.1 的 6px 密竹丝读起来是一片「席」。百叶的识别度在
 *    片与片之间的缝：缝隙透出后面的窗，帘子才成为一件「立体的、能挡光的器物」。
 *    所以叶片 12px、缝 3px（见 LAM_H / LAM_GAP），且缝必须是真空隙（透出背景），
 *    不能画一条暗线了事。
 *
 * 3) 随主题。宿主会 postMessage 推 theme:changed，payload 里带着从 --interactive-accent
 *    提取的 hue、isDark、bg、textMuted。帘子的色相就挂在这个 hue 上（默认竹青 152），
 *    明度阶另备深浅两套 —— 帘子的「竹」色因此和整个界面的强调色同源，
 *    而不是我在稿子里写死的一个土黄。
 *
 * 单文件自包含（CSS 内联、画用 SVG 现画），运行于 module.html 沙箱，
 * 仅通过宿主注入的 api 与 postMessage 交互。沙箱禁 fetch / XHR / eval /
 * new Function / import / window.parent —— 远山也不可能去取图，只能按 --bc-hue 现画：
 * 固定构图，同一幅永远复现（不是每次开窗换一幅的随机噪声）。
 */

var __bamboo_module_curtain = (function () {
  'use strict';

  var STYLE_ID = 'bamboo-curtain-module-style';

  // 设计稿：竖向长窗。所有数值是「比例尺」，最终由 fitStage 的 k 缩放到实际尺寸
  var BASE_W = 200;
  var ROLLER_H = 20;
  var FRAME_W = 186; // 窗比卷筒窄，两侧露出筒架 = 轴托
  var FRAME_H = 620;
  var OVERLAP = 3; // 卷筒压住窗框上边的量
  var GAP = 7; // 帘下沿离窗底的缝
  var SILL_H = 13; // 窗台：台面 + 前立面的总厚
  var SILL_TUCK = 2; // 窗台压住窗框底边的量（贴合，不留缝）
  var SILL_OUT = 8; // 台面两端探出窗框的量
  var SILL_W = FRAME_W + SILL_OUT * 2;
  var TOTAL_H = ROLLER_H - OVERLAP + FRAME_H + SILL_H;
  // 拉珠链：比整窗矮一截，垂到约 2/3 处即可，太长会拖到窗台像晾衣绳
  var CHAIN_H = Math.round((FRAME_H - 16) * 2 / 3);

  var LAM_H = 12; // 百叶叶片高 —— 比 16 薄一档，去「厚」
  var LAM_GAP = 3; // 片间缝 —— 比 5 收一档，缝不再抢戏；叶仍 12 保住「薄」
  var TRAVEL = 150; // 拖满所需像素
  var SNAP = 0.42; // 松手吸附阈值


  // 主题：hue 是宿主从 --interactive-accent 提的色相；152 = 竹青，作为拿不到主题时的兜底
  // bg / textMuted 曾在此声明，但从未被赋值或使用 —— 主题同步只用 hue 与 isDark，已删。
  var THEME = { hue: 152, isDark: false };

  var state = {
    pull: 0,
    dragging: false,
  };

  var api = null;
  var root = null;
  var el = {};
  var _ro = null;
  var _uid = 0; // 每幅远山一个唯一 id 前缀：SVG 的 id 是文档级的，两份会互相抢引用
  var _lastK = -1; // 上一次写入的缩放比，用于 fitStage 的写前比对

  /* ────────────────────────────── 小工具 ────────────────────────────── */

  function clamp(v, a, b) {
    return v < a ? a : v > b ? b : v;
  }

  function f(n) {
    return Math.round(n * 10) / 10;
  }

  

  // 同 seed 必复现同一幅画：帘面重绘时不会「闪」出另一张
  function mulberry32(a) {
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ─────────────── 极简朦胧山水 ───────────────
  //
  // 窗后是「远山一抹」。全部只有三样：几道泡在雾里的软山影、一片留白的天、一线水。
  // 没有树、船、舟、亭、日、月、云、皴 —— 什么都不画，只留形与雾。朦胧里「形」
  // 只给到刚好认得出是山，多一笔就俗。
  //
  // 颜色全挂在 --bc-hue（宿主推来的强调色相）：远山偏青、近山偏绿，同一套色相的
  // 浓淡与虚实拉出五进：最远两层几乎化进天里，靠「进」与「虚」分远近，不靠细节。
  // 每层轮廓刻意做得不一样、峰位彼此错开（不竖向对齐），免得叠出重复的节奏。
  // 固定构图，不随时间变 ——
  // 同一幅永远复现。
  var RANGES = [
    // 最远：山脊压得极低、几乎只剩一线，埋在雾里 —— 纵深就是从这两层开始的
    { base: 0.42, dh: 13, s:  9, l: 90, o: 0.20, dl: 32, do: 0.28, blur: 6.0,
      prof: [ [0,0.42],[0.24,0.406],[0.46,0.40],[0.62,0.39],[0.8,0.356],[0.92,0.378],[1,0.402] ] },
    { base: 0.47, dh: 10, s: 11, l: 87, o: 0.30, dl: 29, do: 0.34, blur: 5.0,
      prof: [ [0,0.455],[0.14,0.43],[0.3,0.398],[0.44,0.385],[0.58,0.40],[0.72,0.425],[0.86,0.445],[1,0.462] ] },
    { base: 0.53, dh:  8, s: 12, l: 86, o: 0.42, dl: 27, do: 0.42, blur: 4.6,
      prof: [ [0,0.505],[0.12,0.468],[0.25,0.44],[0.38,0.468],[0.5,0.47],[0.66,0.42],[0.8,0.45],[0.9,0.472],[1,0.495] ] },
    { base: 0.62, dh:  3, s: 16, l: 74, o: 0.54, dl: 21, do: 0.52, blur: 3.2,
      prof: [ [0,0.605],[0.05,0.55],[0.12,0.508],[0.23,0.53],[0.36,0.556],[0.5,0.575],[0.63,0.586],[0.76,0.57],[0.88,0.586],[1,0.607] ] },
    { base: 0.71, dh: -3, s: 15, l: 68, o: 0.52, dl: 18, do: 0.46, blur: 2.2,
      // 主峰（峰值在 x≈0.72–0.80）整体下移约 0.045：那段峰顶 y 抬高，
      // 山就矮一截、峰落进更靠下的位置（y 越大越靠下）
      prof: [ [0,0.700],[0.18,0.670],[0.34,0.634],[0.50,0.586],[0.62,0.585],[0.72,0.557],[0.80,0.553],[0.88,0.569],[0.95,0.550],[1,0.572] ] },
  ];

  /** 天际线：控制点 [x,y]（画幅比例）经 Catmull-Rom 样条插值成平滑轮廓，填到底。
      用样条而非高斯叠加 —— 样条才画得出峰的转折，像山不像土包。 */
  function ridge(w, h, prof, baseY) {
    var P = [];
    for (var i = 0; i < prof.length; i++) P.push([prof[i][0] * w, prof[i][1] * h]);
    var s = 'M' + f(P[0][0]) + ',' + f(P[0][1]);
    for (var j = 0; j < P.length - 1; j++) {
      var p0 = P[j - 1] || P[j], p1 = P[j], p2 = P[j + 1], p3 = P[j + 2] || P[j + 1];
      s += ' C' + f(p1[0] + (p2[0] - p0[0]) / 6) + ',' + f(p1[1] + (p2[1] - p0[1]) / 6) +
        ' ' + f(p2[0] - (p3[0] - p1[0]) / 6) + ',' + f(p2[1] - (p3[1] - p1[1]) / 6) +
        ' ' + f(p2[0]) + ',' + f(p2[1]);
    }
    return s + ' L' + w + ',' + f(baseY) + ' L0,' + f(baseY) + ' Z';
  }

  // 满天星：星位固定（定种子），只在暗色出现。夜里满天星，位置不跳才像真天；
  // 画在山之前，低处的星会被山自然遮住。格式 [x, y, 大小, 亮度]。
  var STARS = (function () {
    var r = mulberry32(99), a = [];
    for (var i = 0; i < 72; i++) {
      a.push([r(), 0.04 + r() * 0.36, 0.35 + r() * 0.95, 0.28 + r() * 0.72]);
    }
    return a;
  })();

  function landSvg() {
    var W = FRAME_W, H = FRAME_H;
    var P = 'bc' + (++_uid) + '_'; // 唯一前缀：同文档内两幅画不会抢同一批 id
    var h = ((THEME.hue % 360) + 360) % 360;
    var dk = !!THEME.isDark;
    // 绢底 / 雾 / 水：浅暗两套，同一色相只换明度。暗色下雾要更亮（夜雾反光），
    // 山更暗（近山成剪影、远山化进雾里），反差靠明度而非饱和。
    var top, low, fog, water, fogOp;
    if (dk) {
      top = 'hsl(' + h + ',12%,18%)'; low = 'hsl(' + h + ',14%,30%)';
      fog = 'hsl(' + h + ',8%,52%)'; water = 'hsl(' + h + ',12%,26%)'; fogOp = 0.6;
    } else {
      top = 'hsl(' + h + ',10%,95%)'; low = 'hsl(' + h + ',12%,88%)';
      fog = 'hsl(' + h + ',16%,97%)'; water = 'hsl(' + h + ',14%,90%)'; fogOp = 0.9;
    }
    var s = '<svg class="bc-art" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" aria-hidden="true">';
    s += '<defs>';
    s += '<linearGradient id="' + P + 'Paper" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0%" stop-color="' + top + '"/>' +
      '<stop offset="58%" stop-color="' + low + '"/>' +
      '<stop offset="100%" stop-color="' + low + '"/></linearGradient>';
    // 雾：上透明→中满→下透明，用来把层与层切开、把山脚埋进去
    s += '<linearGradient id="' + P + 'Fog" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0%" stop-color="' + fog + '" stop-opacity="0"/>' +
      '<stop offset="46%" stop-color="' + fog + '" stop-opacity="' + fogOp + '"/>' +
      '<stop offset="100%" stop-color="' + fog + '" stop-opacity="0"/></linearGradient>';
    // 柔化：每层一个滤镜，stdDeviation 直接取 RANGES[i].blur（越远越糊）
    for (var bi = 0; bi < RANGES.length; bi++) {
      s += '<filter id="' + P + 'BR' + bi + '" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="' + RANGES[bi].blur + '"/></filter>';
    }
    s += '<filter id="' + P + 'BRr" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="2.8"/></filter>';
    s += '<filter id="' + P + 'BStar" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="0.45"/></filter>';
    s += '</defs>';

    s += '<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="url(#' + P + 'Paper)"/>';
    // 满天星（只暗色）
    if (dk) {
      for (var si = 0; si < STARS.length; si++) {
        var st = STARS[si];
        s += '<circle cx="' + f(st[0] * W) + '" cy="' + f(st[1] * H) + '" r="' + f(st[2]) +
          '" fill="#eef4fb" opacity="' + (st[3] * 0.85).toFixed(2) + '" filter="url(#' + P + 'BStar)"/>';
      }
    }
    // 水：一笔淡痕（山 + 水 = 山水），倒影在上头
    var wy = H * 0.735;
    s += '<rect x="0" y="' + f(wy) + '" width="' + W + '" height="' + f(H - wy) + '" fill="' + water + '" opacity=".5"/>';

    // 远 → 近三层，每层之间垫一道雾，山脚都埋进雾里，只剩峰浮着
    for (var i = 0; i < RANGES.length; i++) {
      var R = RANGES[i];
      var LL = dk ? R.dl : R.l, OO = dk ? R.do : R.o;
      s += '<path d="' + ridge(W, H, R.prof, R.base * H) + '" fill="hsl(' + ((h + R.dh) % 360) + ',' + R.s + '%,' + LL + '%)" opacity="' + OO + '" filter="url(#' + P + 'BR' + i + ')"/>';
      var fy = R.base * H, fh = H * 0.11;
      s += '<rect x="0" y="' + f(fy - fh / 2) + '" width="' + W + '" height="' + f(fh) + '" fill="url(#' + P + 'Fog)"/>';
    }
    // 近山倒影：淡淡一笔，暗示水
    var last = RANGES[RANGES.length - 1];
    s += '<g transform="translate(0,' + f(wy * 2) + ') scale(1,-1)" opacity=".12" filter="url(#' + P + 'BRr)"><path d="' + ridge(W, H, last.prof, last.base * H) + '" fill="hsl(' + ((h + last.dh) % 360) + ',' + last.s + '%,' + (dk ? last.dl : last.l) + '%)"/></g>';
    // 画底化入留白，不留一道硬口
    s += '<rect x="0" y="' + f(H * 0.80) + '" width="' + W + '" height="' + f(H * 0.20) + '" fill="url(#' + P + 'Fog)"/>';
    s += '</svg>';
    return s;
  }

  function paintLand() {
    if (el.insert) el.insert.innerHTML = '<div class="bc-art-wrap">' + landSvg() + '</div>';
  }

  /* ────────────────────────────── 样式 ────────────────────────────── */

  /**
   * 色阶两套，只有明度不同：叶片四档、窗洞一档、缝线一档。
   * 色相全部挂在 --bc-hue 上（宿主推来的强调色相），饱和度压到 18~34% ——
   * 竹是低饱和的青，不是荧光绿；同时保证它仍是「受控的一套色」而非拼色。
   */
  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var st = document.createElement('style');
    st.id = STYLE_ID;
    st.textContent = [
      '.bc-wrap{position:relative;padding:34px 4px 18px;box-sizing:border-box;' +
        '--bc-hue:152;' + // 与 THEME.hue 的兜底值一致（挂载后即由 applyTheme 覆盖）
        '--bc-cav-l:96%;' +
        // 提饱和、同时把最暗一档抬起来：发浑＝低饱和＋中明度。
        // 上轮为了「减重」把饱和一路压到 23~30%，正好落进浑浊带，整片糊成灰绿。
        // 减重要靠明度，不能靠抽饱和 —— 抽了饱和就发灰。
        '--bc-l1:hsl(calc(var(--bc-hue) + 3),18%,90%);' +
        '--bc-l2:hsl(calc(var(--bc-hue) + 2),19%,83%);' +
        '--bc-l3:hsl(calc(var(--bc-hue) + 1),20%,75%);' +
        '--bc-l4:hsl(var(--bc-hue),21%,66%);' +
        '--bc-line:hsl(var(--bc-hue),22%,57%);' +
        // 天光用「暖」而非跟着强调色走：冷绿叶 + 暖光才有通透。
        // 全场一个色相才会糊 —— 暖冷对冲颜色才立得住；日光本来也不是主题色。
        '--bc-glow1:hsl(44,42%,94%);' +
        // 亮色下投影也得半透：不透明会糊进叶缝、把缝填成浅条，挡掉后面的山水
        '--bc-glow2:hsla(40,22%,44%,.30);' +
        // 纱的底色 / 纱的辉光 / 叶的不透明度 / 叶顶那道棱光 / 帘后磨砂。
        // 五样都做成变量 —— 暗色要的那点「玻璃」，全靠在这五个值上换，不动任何结构。
        '--bc-lam-op:.96;' +
        '--bc-lam-rim:rgba(255,255,255,.45);' +
        '--bc-veil-bg:linear-gradient(180deg,var(--bc-glow1) 0%,var(--bc-glow1) 52%,var(--bc-glow2) 100%);' +
        '--bc-veil-glow:var(--bc-glow1);' +
        '--bc-glass:none;' +
        // 白玉：几乎无色，饱和只留 11~15% 的一点青白底，全靠明度塑形。
        // 也不能真给纯白 —— 纯白落在白底侧栏上会化掉，得留一点灰青才有石头的分量。
        '--bc-jh:calc(var(--bc-hue) + 7);' +
        '--bc-j1:hsl(var(--bc-jh),12%,93%);' +
        '--bc-j2:hsl(var(--bc-jh),11%,87%);' +
        '--bc-j3:hsl(var(--bc-jh),11%,79%);' +
        '--bc-j4:hsl(var(--bc-jh),13%,69%);' +
        '--bc-j5:hsl(var(--bc-jh),15%,57%);' +
        // 投影也带青 —— 中性灰的影子会把附近的绿抽成脏灰
        '--bc-shadow:rgba(14,52,44,.3);}',
      // 深色主题：一扇「夜里的玻璃帘」。三件事 ——
      // 一，叶半透（--bc-lam-op）：帘不再是挡视线的板，而是隔着玻璃看夜色；
      // 二，纱换成半透冷雾（--bc-veil-bg）：叶缝里透出来的是夜雾，不是一块实色；
      // 三，帘后磨砂（--bc-glass）：窗外山水被 blur 化开，玻璃的「厚度」全从这里来。
      // 色相仍挂主题 hue，但饱和压到 14~17%、明度压进 15~44% 一档，
      // 让它躺在深绿主题里而不是浮在上面；暖天光换冷夜雾（青白），冷绿才不发脏。
      // 深色主题：一扇「夜里的玻璃帘」。玻璃的四件事 ——
      // 一，清不清：纱减到近乎无（--bc-veil-bg 只留一丝冷调），玻璃是清的，不是奶奶的；
      // 二，透不透：叶半透（--bc-lam-op .6），窗外的夜山从叶后透上来；
      // 三，亮不亮：叶顶一道锐利棱光（--bc-lam-rim）—— 玻璃的「亮」全在棱上，不在面上；
      // 四，厚不厚：帘后一点磨砂（--bc-glass），夜山被柔化，玻璃才有厚度。
      // 叶面做成上亮下暗的强渐变（40%→9%），一道光从上方斜落在玻璃上；
      // 色调：色相仍挂主题 hue，饱和压到 18%、明度压进 7~40% —— 躺在深绿里，不浮在上面。
      '.bc-wrap.bc-dark{--bc-cav-l:12%;' +
        '--bc-l1:hsl(calc(var(--bc-hue) + 2),18%,40%);' +
        '--bc-l2:hsl(calc(var(--bc-hue) + 1),18%,26%);' +
        '--bc-l3:hsl(var(--bc-hue),18%,16%);' +
        '--bc-l4:hsl(var(--bc-hue),18%,9%);' +
        '--bc-line:hsl(var(--bc-hue),19%,7%);' +
        '--bc-lam-op:.6;' +
        '--bc-lam-rim:rgba(228,248,242,.6);' +
        '--bc-glass:blur(2px);' +
        '--bc-veil-bg:linear-gradient(180deg,rgba(206,232,222,.10) 0%,rgba(170,200,190,.04) 100%);' +
        '--bc-veil-glow:rgba(206,232,222,.08);' +
        '--bc-glow2:rgba(200,228,218,.22);' +
        '--bc-j1:hsl(var(--bc-jh),9%,56%);' +
        '--bc-j2:hsl(var(--bc-jh),8%,48%);' +
        '--bc-j3:hsl(var(--bc-jh),9%,40%);' +
        '--bc-j4:hsl(var(--bc-jh),11%,31%);' +
        '--bc-j5:hsl(var(--bc-jh),13%,23%);' +
        '--bc-shadow:rgba(2,18,16,.55);}',

      // 裁掉 .bc-win 那截未缩放的布局盒：transform 不参与布局，absolute 的窗口
      // 布局宽仍是 200px，侧栏一窄就横向溢出，在栏底顶出一条滚动条。
      // 必须双向 hidden —— 只写 overflow-x:hidden 会把另一轴提成 auto，反倒多出纵向条。
      '.bc-stage{position:relative;width:100%;overflow:hidden;}',
      '.bc-win{position:absolute;left:50%;top:0;width:' + BASE_W + 'px;height:' + TOTAL_H +
        'px;transform-origin:top center;transform:translateX(-50%);}',

      // —— 卷筒：毛竹横筒。圆柱全靠竖向光影（上缘受光、下缘入暗），平涂一块色立刻成「一根条」
      '.bc-roller{position:absolute;left:50%;top:0;width:' + FRAME_W + 'px;height:' + ROLLER_H +
        'px;margin-left:-' + FRAME_W / 2 + 'px;z-index:4;' +
        'transform-origin:50% 50%;transition:transform .34s cubic-bezier(.22,.9,.24,1);}',
      '.bc-roll-body{position:absolute;left:0;right:0;top:0;bottom:0;border-radius:' + ROLLER_H / 2 + 'px;' +
        'background:linear-gradient(180deg,' +
        'var(--bc-l4) 0%,var(--bc-l2) 24%,var(--bc-l1) 44%,' +
        'var(--bc-l3) 68%,var(--bc-l4) 100%);' +
        'box-shadow:0 3px 8px var(--bc-shadow),inset 0 1px 0 rgba(255,255,255,.42);}',
      // 竹节：两道环，环上沿亮、下沿暗（凸起件的通例）
      '.bc-roll-body:before,.bc-roll-body:after{content:"";position:absolute;top:1px;bottom:1px;width:2px;' +
        'background:linear-gradient(90deg,rgba(255,255,255,.34),rgba(0,0,0,.26));border-radius:1px;}',
      '.bc-roll-body:before{left:24%;}',
      '.bc-roll-body:after{right:24%;}',
      // 两端轴托：筒是「架」在托架上的 —— 少了这对，那根竹筒就是横空浮着的一根条
      '.bc-bracket{position:absolute;top:3px;width:6px;height:' + (ROLLER_H - 6) + 'px;border-radius:3px;' +
        'background:linear-gradient(180deg,var(--bc-l3),var(--bc-l2) 42%,var(--bc-l4));' +
        'box-shadow:0 2px 5px var(--bc-shadow);}',
      '.bc-bracket.l{left:-5px;}',
      '.bc-bracket.r{right:-5px;}',

      // —— 窗：竹框 + 内窗洞。窗洞比叶色深一档，百叶才有「后面有空间」的纵深
      '.bc-frame{position:absolute;left:50%;top:' + (ROLLER_H - OVERLAP) + 'px;width:' + FRAME_W +
        'px;height:' + FRAME_H + 'px;margin-left:-' + FRAME_W / 2 +
        'px;overflow:hidden;box-sizing:border-box;border-radius:2px;' +
        'border:4px solid var(--bc-l4);' +
        'background:hsl(calc(var(--bc-hue) + 3),16%,var(--bc-cav-l));' +
        'box-shadow:inset 0 0 0 1px rgba(255,255,255,.16),inset 0 3px 6px rgba(4,30,26,.24),' +
        'inset 6px 0 12px rgba(4,30,26,.16),inset -6px 0 12px rgba(4,30,26,.16),' +
        '0 10px 22px var(--bc-shadow);}',

      // —— 窗台：一块白玉，横压在窗底、两端探出窗框。
      // 白玉的辨识点和青玉相反：几乎没有颜色，全靠「光」。三件事 ——
      // 一，蜡质柔光：台沿一道宽而柔的亮棱（硬线立刻变镀铬）；
      // 二，内部白色棉絮：两团柔云是「白絮」，白玉的絮是白的，青玉才是暗絮；
      // 三，半透：光从石头里透出来，薄边尤其透 —— 这是白玉最像玉的一处，
      //    所以两端探出的边和下缘都给了内透光，通体再压一层极淡的内发光。
      // 白玉的明暗不能靠高光雕，只能靠影 —— 底色越白，形体越要靠渐层和投影交代。
      '.bc-sill{position:absolute;left:50%;top:' + (ROLLER_H - OVERLAP + FRAME_H - SILL_TUCK) +
        'px;width:' + SILL_W + 'px;height:' + SILL_H + 'px;margin-left:-' + SILL_W / 2 +
        'px;z-index:3;box-sizing:border-box;border-radius:3px;' +
        'background:' +
        'linear-gradient(90deg,rgba(255,253,247,.5),rgba(255,253,247,0) 19%,' +
        'rgba(255,253,247,0) 81%,rgba(255,253,247,.5)),' +
        'radial-gradient(62% 98% at 24% 44%,rgba(255,255,255,.34),rgba(255,255,255,0) 72%),' +
        'radial-gradient(50% 84% at 73% 58%,rgba(255,255,255,.22),rgba(255,255,255,0) 74%),' +
        // 一缕极淡的沉色（不是绿絮，白玉的杂质是中性的），只给一点内部深度
        'radial-gradient(40% 66% at 54% 62%,rgba(146,158,150,.18),rgba(146,158,150,0) 74%),' +
        'linear-gradient(180deg,' +
        'var(--bc-j1) 0px,var(--bc-j2) 3.5px,' +
        'rgba(255,255,255,.5) 5.5px,' +
        'rgba(255,255,255,.12) 7px,' +
        'var(--bc-j2) 8px,var(--bc-j3) 10px,' +
        'var(--bc-j4) 12px,var(--bc-j5) ' + SILL_H + 'px);' +
        'box-shadow:0 7px 13px var(--bc-shadow),' +
        // 抛光后的圆边，上缘一道窄亮棱
        'inset 0 1px 0 rgba(255,255,255,.72),' +
        // 下缘薄处透光：白玉最有说服力的一处
        'inset 0 -2px 4px rgba(255,255,255,.42),' +
        // 通体微透，避免大面积白平涂成一张白纸
        'inset 0 0 13px rgba(255,255,255,.28),' +
        'inset 7px 0 11px -7px rgba(20,40,34,.16),inset -7px 0 11px -7px rgba(20,40,34,.16);}',
      // 暗色下玉台要退下去：它的白是靠几层不透明白叠出来的，光调 --bc-j* 压不住，
      // 直接整体降亮 —— 夜色里它该是一块「月下玉」，不是全窗最亮的一根白条。
      '.bc-wrap.bc-dark .bc-sill{filter:brightness(.66) saturate(.9);}',

      // —— 拉开后：满窗的青绿山水立轴。画自带绢底与远山近水，铺满整个窗洞；
      // 窗框只在最外圈压一道内影（见 .bc-frame），像画嵌在窗里，不是居中明信片。
      '.bc-insert{position:absolute;left:0;top:0;right:0;bottom:0;z-index:1;overflow:hidden;}',
      '.bc-art-wrap{position:absolute;inset:0;overflow:hidden;background:hsl(var(--bc-hue),12%,90%);}',
      '.bc-art{display:block;width:100%;height:100%;}',

      // —— 帘后的纱：浅色下它是「光源」（天光渐层），暗色下它是「夜雾」（半透冷雾）。
      // 缝里露出来的是光而不是一块颜色 —— 透光感全在这一层。
      // 两套只差 --bc-veil-bg / --bc-veil-glow 两个变量，结构一动不动。
      // 它同时仍要挡住明信片（纱在帘内、帘在卡之上），纱随帘一起上移：
      // 帘升多少、纱退多少，画才从下往上一寸寸显出来。
      '.bc-veil{position:absolute;left:0;top:0;right:0;bottom:0;z-index:0;' +
        'background:var(--bc-veil-bg);' +
        'box-shadow:inset 0 0 18px var(--bc-veil-glow);}',
      // —— 百叶：片间必须留真空隙。叶片要「立体」，全靠每条自己的上亮下暗 + 下缘投影
      '.bc-curtain{position:absolute;left:0;top:0;width:100%;bottom:' + GAP + 'px;z-index:2;' +
        'transform:translateY(0);transition:transform .42s cubic-bezier(.22,.9,.24,1);}',
      // 帘叶是「多铺一片」铺满的（见 lamsHtml），叶堆天生比帘盒高出一截。
      // 不裁的话，帘平移满 100%（＝盒高）之后，多出的那截叶仍露在窗顶 —— 就是「没拉干净」。
      // 把叶堆单独关进一个裁剪层：帘盒走多少就干净多少。配重横杆留在裁剪层外 ——
      // 它本来就该探出帘底，不能被一起裁掉。
      // 这层同时兼「磨砂」：暗色下 --bc-glass 给一个 blur，把窗外的山水 blur 化开，
      // 于是透过半透的叶看到的是柔化的夜山 —— 玻璃的「厚度」就是从这来的。
      '.bc-inner{position:absolute;left:0;top:0;right:0;bottom:0;overflow:hidden;z-index:0;' +
        '-webkit-backdrop-filter:var(--bc-glass);backdrop-filter:var(--bc-glass);}',
      // 拖拽中关掉帘后磨砂：backdrop-filter 每帧都要重采样一次背景，暗色下是全程最贵的一笔。
      // 「玻璃厚度」留给静止时表现，动起来先保跟手。
      '.bc-wrap.is-dragging .bc-inner{-webkit-backdrop-filter:none;backdrop-filter:none;}',
      // 叶的透明度也走变量：浅色 .96（竹片薄，透一点光），暗色 .6（玻璃帘）。
      // 刻意保持「平」：只有上缘一道受光 + 整体由浅到中，底缘不再给光 ——
      // 上亮/中暗/底亮三段一叠就成圆管了。亮一律交给缝，缝才是光来的地方。
      '.bc-lam{position:relative;height:' + LAM_H + 'px;margin-bottom:' + LAM_GAP +
        'px;box-sizing:border-box;border-radius:1px;opacity:var(--bc-lam-op);' +
        'background:linear-gradient(180deg,' +
        'var(--bc-l1) 0%,var(--bc-l2) 32%,var(--bc-l3) 74%,var(--bc-l4) 100%);' +
        'box-shadow:0 2px 4px var(--bc-glow2),' +
        'inset 0 1px 0 var(--bc-lam-rim);}',
      // 叶片中段的窄高光：竹片是弧的，光落在偏上处
      '.bc-lam:after{content:"";position:absolute;left:2px;right:2px;top:24%;height:22%;' +
        'border-radius:1px;background:linear-gradient(90deg,rgba(255,255,255,0),rgba(255,255,255,.34),' +
        'rgba(255,255,255,0));}',
      // 帘面左右压暗 + 包边：竹帘两缘有收边，收边同时把帘「框」成一件东西
      '.bc-curtain:after{content:"";position:absolute;left:0;top:0;right:0;bottom:0;pointer-events:none;' +
        'background:' +
        'linear-gradient(90deg,rgba(9,58,50,.16) 0,rgba(9,58,50,.06) 3px,' +
        'rgba(9,58,50,0) 7px,rgba(9,58,50,0) calc(100% - 7px),' +
        'rgba(9,58,50,.06) calc(100% - 3px),rgba(9,58,50,.15) 100%),' +
        'linear-gradient(90deg,rgba(9,58,50,.12) 0%,rgba(9,58,50,.03) 14%,' +
        'rgba(255,255,255,.08) 46%,rgba(9,58,50,.03) 86%,rgba(9,58,50,.11) 100%);}',
      // 帘顶：贴着卷筒那一段必然最暗（光被筒挡住）
      '.bc-curtain:before{content:"";position:absolute;left:0;top:0;right:0;height:12px;z-index:4;' +
        'pointer-events:none;background:linear-gradient(180deg,rgba(6,40,36,.3),rgba(6,40,36,0));}',
      // 提绳：百叶是被两根绳串起来的，少了纵向的绳就只剩一堆横片
      '.bc-twine{position:absolute;top:0;bottom:0;width:1.5px;z-index:3;' +
        'background:linear-gradient(90deg,rgba(10,52,45,.4),rgba(232,246,238,.4),rgba(10,52,45,.38));}',

      // 配重横杆：细竹条，两端略出头。卷帘的识别度有一半靠它 ——
      // 少了这根杆，帘子只是一片贴在窗上的席；有它，才是一挂「能卷起来」的帘。
      '.bc-bar{position:absolute;left:-3px;right:-3px;bottom:-6px;height:11px;border-radius:5px;z-index:4;' +
        'background:linear-gradient(180deg,' +
        'var(--bc-l3) 0%,var(--bc-l1) 22%,var(--bc-l2) 48%,var(--bc-l4) 82%,var(--bc-line) 100%);' +
        'box-shadow:0 4px 11px var(--bc-shadow),inset 0 1px 0 rgba(255,255,255,.44);}',
      '.bc-bar:before,.bc-bar:after{content:"";position:absolute;top:1px;bottom:1px;width:2px;border-radius:1px;' +
        'background:linear-gradient(90deg,rgba(255,255,255,.34),rgba(0,0,0,.24));}',
      '.bc-bar:before{left:16%;}',
      '.bc-bar:after{right:16%;}',

      // —— 拉珠链：玉珠。垂到约 2/3 处，比整窗矮一截，免得像晾衣绳拖到窗台
      // 拉珠链：关帘时常显（开帘状态才隐藏，见 .bc-open）。
      // 开帘后整条链隐去，鼠标悬停模块（或触摸/拖拽中）才浮现，免得挡风景。
      '.bc-chain{position:absolute;right:11px;top:' + (ROLLER_H + 8) + 'px;width:18px;' +
        'height:' + CHAIN_H + 'px;z-index:5;opacity:1;transition:opacity .25s ease;' +
        'pointer-events:auto;}',
      // 开帘状态：链隐藏。只收 opacity，不收 pointer-events ——
      // 收了 pointer-events，触屏就永远点不到链（无 hover 可救），开帘即再也关不回去。
      '.bc-wrap.bc-open .bc-chain{opacity:0;}',
      // 开帘 + 悬停才浮现（桌面）；触屏按住模块（:active）即浮现，松手再隐。
      // 不能用 .touched —— 它是「拉过一次」的永久标记，会让开帘后链永远可见，正是上一版的 bug。
      '.bc-wrap.bc-open:hover .bc-chain,.bc-wrap.bc-open:active .bc-chain,' +
        '.bc-wrap.bc-open.is-dragging .bc-chain{opacity:1;}',
      // 无 hover 的设备（触屏）：没有悬停可用，开帘后一律显形，否则无从抓握
      '@media (hover:none){.bc-wrap.bc-open .bc-chain{opacity:1;}}',
      '.bc-rail{position:absolute;left:50%;top:0;bottom:0;width:1px;margin-left:-.5px;' +
        'background:rgba(255,255,255,.3);}',
      '.bc-beads{position:absolute;left:50%;top:0;margin-left:-3.75px;width:7.5px;' +
        'transform:translateY(0);transition:transform .42s cubic-bezier(.22,.9,.24,1);}',
      '.bc-beads i{display:block;width:7.5px;height:7.5px;margin-bottom:6.5px;border-radius:50%;' +
        'background:radial-gradient(circle at 34% 28%,#fffdf4 0%,hsl(var(--bc-hue),20%,84%) 36%,' +
        'hsl(var(--bc-hue),16%,64%) 74%,hsl(var(--bc-hue),14%,46%) 100%);' +
        'box-shadow:0 1px 1.5px rgba(18,30,24,.34);}',
      '.bc-grip{position:absolute;left:-8px;top:0;width:34px;height:100%;cursor:grab;' +
        'touch-action:none;-webkit-tap-highlight-color:transparent;}',
      '.bc-grip:active{cursor:grabbing;}',
      '.bc-grip:focus-visible{outline:2px solid var(--bc-l3);outline-offset:2px;border-radius:6px;}',

      // 拖中：跟手优先，关掉过场，否则帘会「黏」在指针后面半拍
      '.bc-wrap.is-dragging .bc-curtain,.bc-wrap.is-dragging .bc-roller,' +
      '.bc-wrap.is-dragging .bc-beads{transition:none;}',

      // —— 提示：没拉过才出现，拉过一次就隐去。居中一行，不带箭头
      '.bc-tip{position:absolute;left:0;right:0;bottom:0;z-index:6;text-align:center;' +
        'font-size:10.5px;color:var(--text-muted,#8b8b8b);letter-spacing:.4px;white-space:nowrap;' +
        'pointer-events:none;transition:opacity .3s ease;}',
      '.bc-wrap.is-dragging .bc-tip,.bc-wrap.touched .bc-tip{opacity:0;}'
    ].join('\n');
    document.head.appendChild(st);
  }

  /* ────────────────────────────── 结构 ────────────────────────────── */

  // 叶片不做随机明暗：百叶是「工业制品」，整齐才对；竹丝才要参差。
  // 上一版把竹丝的随机明暗照搬过来，反而把它弄成了「拼布」。
  function lamsHtml() {
    var n = Math.ceil((FRAME_H - GAP) / (LAM_H + LAM_GAP)) + 1;
    var s = '';
    for (var i = 0; i < n; i++) s += '<div class="bc-lam"></div>';
    return s;
  }

  // 珠串按链高铺满，并给「被拉下 26px」的行程留 28px 余量：
  // 拉到顶时链整体下移，末珠也不会掉出链底。
  function beadsHtml() {
    var n = Math.floor((CHAIN_H - 28) / 14);
    var s = '';
    for (var i = 0; i < n; i++) s += '<i></i>';
    return s;
  }

  function render() {
    if (!root) return;
    root.innerHTML =
      '<div class="bc-wrap">' +
      '<div class="bc-stage">' +
      '<div class="bc-win">' +
      '<div class="bc-roller">' +
      '<div class="bc-bracket l"></div><div class="bc-bracket r"></div>' +
      '<div class="bc-roll-body"></div>' +
      '</div>' +
      '<div class="bc-frame">' +
      '<div class="bc-insert"></div>' +
      '<div class="bc-curtain">' +
      '<div class="bc-inner">' +
      '<div class="bc-veil"></div>' +
      lamsHtml() +
      '<div class="bc-twine" style="left:24%"></div>' +
      '<div class="bc-twine" style="left:76%"></div>' +
      '</div>' +
      '<div class="bc-bar"></div>' +
      '</div>' +
      '</div>' +
      '<div class="bc-sill"></div>' +
      '<div class="bc-chain">' +
      '<div class="bc-rail"></div>' +
      '<div class="bc-beads">' + beadsHtml() + '</div>' +
      '<div class="bc-grip" role="button" tabindex="0" aria-label="拉动百叶，露出窗外远山"></div>' +
      '</div>' +
      '</div>' +
      '</div>' +
      '<div class="bc-tip">拽玉珠，看山色</div>' +
      '</div>';

    el.wrap = root.querySelector('.bc-wrap');
    el.stage = root.querySelector('.bc-stage');
    el.win = root.querySelector('.bc-win');
    el.insert = root.querySelector('.bc-insert');
    el.curtain = root.querySelector('.bc-curtain');
    el.roller = root.querySelector('.bc-roller');
    el.beads = root.querySelector('.bc-beads');
    el.grip = root.querySelector('.bc-grip');

    paintLand();
    bindDrag();
    fitStage();
    applyPull(false);
  }

  /* ───────────────────── 缩放：宽高双向取小，且允许放大 ───────────────────── */

  function fitStage() {
    if (!el.stage || !el.win) return;
    var w = el.stage.clientWidth;
    if (!w) return;
    // 稿子只是比例尺。宽度撑满，高度不超过视口的 82%（给上下留出呼吸）。
    // v0.1 只按宽度算且上限锁死 1，侧栏一窄就缩成角落里一小块 —— 那正是「占比太小」的成因。
    var availH = (window.innerHeight || 760) * 0.92;
    var k = Math.min((w - 6) / BASE_W, availH / TOTAL_H);
    k = clamp(k, 0.5, 1.8);
    // 写前比对：fitStage 由 ResizeObserver 驱动，而它自己又在改 stage 的高度 ——
    // 无脑写会把 RO 再触发一轮（还会刷 "ResizeObserver loop" 警告）。值没变就不写。
    if (k === _lastK) return;
    _lastK = k;
    el.win.style.transform = 'translateX(-50%) scale(' + k.toFixed(4) + ')';
    el.stage.style.height = Math.round(TOTAL_H * k) + 'px';
  }

  /* ────────────────────────────── 主题 ────────────────────────────── */

  function applyTheme() {
    if (!el.wrap) return;
    el.wrap.style.setProperty('--bc-hue', String(Math.round(THEME.hue)));
    el.wrap.classList.toggle('bc-dark', !!THEME.isDark);
  }

  var _repaintRaf = 0;

  // 重绘只排一帧：主题切换动画期间宿主会连发 theme:changed，
  // 每条都重建整幅 SVG（5 层高斯模糊 + 72 星点）会明显掉帧。
  function scheduleRepaint() {
    if (_repaintRaf) return;
    _repaintRaf = requestAnimationFrame(function () {
      _repaintRaf = 0;
      applyTheme();
      paintLand();
    });
  }

  // 宿主推主题：payload = { isDark, hue, bg, textNormal, textMuted }
  // hue 由宿主从 --interactive-accent 里抽取 —— 帘子的「竹」因此与全站强调色同源。
  // 注：这里无法校验消息来源 —— 沙箱审计禁止模块代码出现 window.parent（写了就拒绝加载），
  // 只能依赖 iframe 自身的隔离。危害仅限配色，已记为宿主侧事项。
  function onThemeMessage(e) {
    var d = e && e.data;
    if (!d || d.type !== 'theme:changed' || !d.payload) return;
    var p = d.payload;
    var hue = (typeof p.hue === 'number' && isFinite(p.hue)) ? p.hue : THEME.hue;
    var isDark = (typeof p.isDark === 'boolean') ? p.isDark : THEME.isDark;
    if (hue === THEME.hue && isDark === THEME.isDark) return; // 没变就别重画
    THEME.hue = hue;
    THEME.isDark = isDark;
    scheduleRepaint();
  }

  // 宿主也走 documentElement 的 class 兜底（推主题有延迟，首帧不能闪回默认色）。
  // 返回「明暗是否发生变化」：变了必须由调用方触发重绘 ——
  // 上一版只改 THEME.isDark 不重画，于是只改 class 的切主题方式完全不生效。
  function readDocClass() {
    var de = document.documentElement;
    if (!de || !de.classList) return false;
    var dk;
    if (de.classList.contains('theme-dark')) dk = true;
    else if (de.classList.contains('theme-light')) dk = false;
    else return false;
    if (THEME.isDark === dk) return false;
    THEME.isDark = dk;
    return true;
  }

  /* ────────────────────────────── 拉动 ────────────────────────────── */

  function applyPull() {
    if (!el.curtain) return;
    var p = state.pull;
    // 开帘状态：拉开一点就挂上 bc-open，链改为隐藏（悬停才出）；关帘归零即常显
    if (el.wrap) el.wrap.classList.toggle('bc-open', p > 0.04);
    // 帘整体上移：贴筒的上缘被卷进去，下沿随之抬高
    el.curtain.style.transform = 'translateY(' + -(p * 100).toFixed(2) + '%)';
    // 卷筒变粗：帘绕上去一层，外径就大一分
    el.roller.style.transform = 'scaleY(' + (1 + p * 0.08).toFixed(3) + ')';
    // 只有珠子走 —— 闭环拉绳本身不动
    el.beads.style.transform = 'translateY(' + (p * 26).toFixed(1) + 'px)';
  }

  function setPull(v) {
    state.pull = clamp(v, 0, 1);
    applyPull();
  }

  // 松手：过半卷到底，否则落回原位（由 CSS 过场收尾）。
  // 「开没开」只认 state.pull 一处真相（bc-open 类由 applyPull 据它切换），
  // 不再另存一份 state.opened —— 两份真相迟早对不上。
  function settle(target) {
    setPull(target);
    if (target >= 1 && el.wrap) el.wrap.classList.add('touched'); // 首次开窗后收掉「↓」
  }

  var _drag = { y: 0, p: 0, moved: 0, id: null };
  var _raf = 0;    // 拖动写入的合流帧
  var _pending = 0; // 待写入的 pull 目标值

  function onDown(e) {
    if (!el.grip || e.target !== el.grip) return;
    _drag.y = e.clientY;
    _drag.p = state.pull;
    _drag.moved = 0;
    _drag.id = e.pointerId;
    state.dragging = true;
    if (el.wrap) el.wrap.classList.add('is-dragging');
    try {
      el.grip.setPointerCapture(e.pointerId);
    } catch (err) {}
    e.preventDefault();
  }

  // 拖动只记目标值，真正的写入合流到一帧：高刷屏上 pointermove 可达 120Hz+，
  // 每个事件都去写三处 inline 样式是白烧 CPU。
  function onMove(e) {
    if (!state.dragging) return;
    var dy = e.clientY - _drag.y;
    if (Math.abs(dy) > _drag.moved) _drag.moved = Math.abs(dy);
    _pending = _drag.p + dy / TRAVEL;
    if (!_raf) _raf = requestAnimationFrame(flushPull);
    e.preventDefault();
  }

  function flushPull() {
    _raf = 0;
    setPull(_pending);
  }

  function onUp() {
    if (!state.dragging) return;
    state.dragging = false;
    if (_raf) {
      cancelAnimationFrame(_raf);
      _raf = 0;
      setPull(_pending); // 补上最后一段没来得及写入的位移
    }
    if (el.wrap) el.wrap.classList.remove('is-dragging');
    try {
      if (_drag.id !== null && el.grip) el.grip.releasePointerCapture(_drag.id);
    } catch (err) {}
    settle(state.pull >= SNAP ? 1 : 0);
  }

  // 点一下（没拖动过）= 直接开/合，不必每次都真去拖
  function onTap(e) {
    if (e.target !== el.grip) return;
    if (_drag.moved > 4) return;
    settle(state.pull >= SNAP ? 0 : 1);
  }

  function onKey(e) {
    if (e.target !== el.grip) return;
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    settle(state.pull >= SNAP ? 0 : 1);
  }

  function bindDrag() {
    if (!el.grip || !el.wrap) return;
    el.grip.addEventListener('pointerdown', onDown);
    el.wrap.addEventListener('pointermove', onMove);
    el.wrap.addEventListener('pointerup', onUp);
    el.wrap.addEventListener('pointercancel', onUp);
    // 兜底：指针捕获失败、或在窗口外松手时 wrap 收不到 up，state.dragging 会卡在 true，
    // 之后鼠标不按键划过模块也会拖着帘子跑。window 级补一道（onUp 自带幂等守卫）。
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    window.addEventListener('blur', onUp);
    el.grip.addEventListener('click', onTap);
    el.grip.addEventListener('keydown', onKey);
  }

  function unbindDrag() {
    if (!el.grip || !el.wrap) return;
    el.grip.removeEventListener('pointerdown', onDown);
    el.wrap.removeEventListener('pointermove', onMove);
    el.wrap.removeEventListener('pointerup', onUp);
    el.wrap.removeEventListener('pointercancel', onUp);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
    window.removeEventListener('blur', onUp);
    el.grip.removeEventListener('click', onTap);
    el.grip.removeEventListener('keydown', onKey);
  }

  function onReflow() {
    fitStage();
    // 主题也可能是只改了 documentElement 的 class 而没推 theme:changed，这里补一次同步
    if (readDocClass()) scheduleRepaint();
  }

  /* ────────────────────────────── 出口 ────────────────────────────── */

  // 卸载：解绑一切、清 DOM、并把状态归零。
  // 状态不归零的话，卸载后重挂会继承上次的 pull —— 新实例一挂上就是开帘态。
  function teardown() {
    unbindDrag();
    window.removeEventListener('message', onThemeMessage);
    window.removeEventListener('resize', onReflow);
    document.removeEventListener('visibilitychange', onReflow);
    if (_raf) {
      cancelAnimationFrame(_raf);
      _raf = 0;
    }
    if (_repaintRaf) {
      cancelAnimationFrame(_repaintRaf);
      _repaintRaf = 0;
    }
    if (_ro) {
      _ro.disconnect();
      _ro = null;
    }
    var st = document.getElementById(STYLE_ID);
    if (st && st.parentNode) st.parentNode.removeChild(st);
    if (root) root.innerHTML = '';
    el = {};
    root = null;
    api = null;
    _lastK = -1; // 重挂时让 fitStage 重新写一次，否则 stage 高度永远是 0
    state.pull = 0;
    state.dragging = false;
    _drag.y = 0;
    _drag.p = 0;
    _drag.moved = 0;
    _drag.id = null;
  }

  return {
    name: '竹林卷帘窗',
    mount: function (container, a) {
      // 幂等：宿主可能重复 initModuleView（它的 _waitForModuleContext 缓存了 promise），
      // 不先销毁就双挂 —— 监听器翻倍、ResizeObserver 泄漏、两份 SVG 抢同一批 id。
      if (root) teardown();
      api = a;
      root = container;
      readDocClass();
      ensureStyle();
      render();
      applyTheme();
      window.addEventListener('message', onThemeMessage);
      window.addEventListener('resize', onReflow);
      document.addEventListener('visibilitychange', onReflow);
      if (typeof ResizeObserver !== 'undefined') {
        _ro = new ResizeObserver(onReflow);
        _ro.observe(root);
      }
    },
    destroy: teardown,
  };
})();
