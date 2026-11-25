/* __bamboo_module_ {"id":"wine","name":"将进酒杯莫停","version":"0.3.12","fab":{"icon":"gourd","label":"饮酒"},"location":"left"} */
/**
 * 将进酒 · 竹林模块（单文件自包含 · 手写 WebGL · 零依赖）
 *
 * 与「不如吃茶去」同构：器物由手写 WebGL 实时渲染，正交相机 + 半球环境光 + 弱主光，
 * 共享那套矩阵库、PBR 窗光、ACES 色调映射、自转三态、拾取与音效合成。
 * 差别在器物与题材：盖碗 → 透明绿玻璃酒瓶（瓶身半透、瓶内酒液随酒款变色、缓慢气泡），
 * 揭盖 → 拔塞，28 款茶 → 28 款酒。
 *
 * 透明瓶身做法：酒液先画成实心车削体（写深度），瓶身用「菲涅尔边缘 + 中心透射」的
 * alpha 混合着色（中心 alpha 低可透视酒液、边缘 alpha 高现玻璃质感），配窗光反射。
 * 不做真折射（沙箱内无场景 backbuffer，代价高且易翻车），这层伪透明稳定且可读。
 *
 * 为什么不用 three：模块沙箱禁止 import/fetch，three 全量 465KB 里 99% 用不到。
 */
(function () {
  'use strict';

  var ID = 'wine';
  var TITLE = '将进酒杯莫停';
  var VERSION = '0.3.12';

  /* ══════════════════════ 渲染器（原稿数值 · 手写 WebGL） ══════════════════════ */


  /* ══ 资产 ══════════════════════════════════════════════════════ */
  /* 青瓷葫芦瓶剖面（[半径 r, 高度 y]，Catmull-Rom 采样成车削壳）。
     比例照参考图量：总高 3.32、下肚最大半径 1.0、上肚 0.73、腰 0.47、口径 0.145。
     两处圆润是这次的重点（初版底太平、下肚像截开的球）：
       · 下肚从「底心 → 最宽点」按椭圆弧逐点采（r = sinθ、y 按 cosθ），
         底部只留 r=0.10 的极小平面坐地，其余全是连续球面 —— 不再是「平底 + 硬折角」。
       · 底心到外壁、内壁回到底心都不在轴上骤然收口，避免底部出现一圈硬边亮线。
     腰仍保持「短而深」三点（铺开会抹成胖梨），由 HARD_EDGE_COS=70° 放行不插亮线。
     闭合剖面：底心 → 外壁 → 口沿 → 内壁 → 内底心；口径仅 0.29，塞着塞子看不见内腔。 */
  var PROFILES = {
    /* 下肚 = 两段真椭圆弧（这是「底部太平」的根治）：
       下半 ry=0.64、中心 y=0.22，从底心 y=-0.42 一路球面张开到最宽 r=1.00；
       底部只留 r≈0.07 的极小平面坐地，其余全是连续球面，不再是「平底 + 硬折角」。
       上半 ry=1.0 的缓椭圆收到腰（y≈1.10 处 r≈0.47），让下肚读作饱满的球而不是桶。 */
    vessel: [[0, -.418], [.07, -.417], [.13, -.412], [.20, -.404], [.28, -.390],
             [.36, -.371], [.45, -.345], [.55, -.310], [.65, -.265], [.74, -.212],
             [.82, -.150], [.885, -.080], [.935, -.002], [.968, .080], [.988, .163],
             [1.00, .250], [.995, .340], [.985, .394], [.968, .474], [.940, .562],
             [.902, .646], [.866, .720], [.820, .796], [.766, .858], [.707, .927],
             [.643, .986], [.575, 1.042], [.506, 1.088], [.470, 1.120],
             /* 腰后进入上肚（短而深的三点，靠 HARD_EDGE_COS=70° 放行不插亮线） */
             [.478, 1.198], [.530, 1.288], [.600, 1.378], [.668, 1.470], [.712, 1.566],
             [.730, 1.664], [.728, 1.762], [.706, 1.856], [.664, 1.944], [.606, 2.026],
             [.532, 2.098], [.446, 2.160], [.352, 2.212], [.262, 2.258], [.200, 2.300],
             [.182, 2.400], [.175, 2.520], [.168, 2.640], [.160, 2.760], [.150, 2.844],
             [.145, 2.900],
             /* 内壁：口沿内唇 → 颈 → 上肚 → 内腰 → 内下肚 → 内底。
                与外壁同心的两条小椭圆（ry=0.95 / 0.58，rx 各减 0.06~0.10），
                保证全器壁厚 0.04~0.09 —— 内底必须高于外底，否则会穿出瓶底。 */
             [.115, 2.885], [.101, 2.810], [.096, 2.700], [.104, 2.560], [.126, 2.450],
             [.160, 2.352], [.208, 2.262], [.286, 2.206], [.380, 2.148], [.470, 2.082],
             [.548, 2.006], [.612, 1.918], [.652, 1.822], [.664, 1.722], [.650, 1.622],
             [.612, 1.532], [.552, 1.452], [.478, 1.376], [.414, 1.300], [.380, 1.230],
             [.380, 1.160], [.430, 1.080], [.508, 1.000], [.596, .918], [.680, .832],
             [.760, .742], [.828, .648], [.884, .550], [.926, .448], [.950, .344],
             [.956, .240], [.944, .140], [.914, .048], [.862, -.036], [.790, -.112],
             [.700, -.178], [.588, -.232], [.450, -.272], [.290, -.296], [0, -.312]],
    /* 瓶塞 = 深青釉瓷塞 + v0.3.12 小喇叭口。
       剖面按「底心 → 外壁 → 细颈 → 外翻口沿 → 内壁 → 杯底心」闭合：
       顶部是一只浅杯，斜视下自然呈椭圆口（就是参考图的样子），不需要额外网格；
       下段 y≈2.72~2.88 仍是原入孔锥度，与瓶颈内腔匹配；
       y=2.932~2.953 仍留给 shader 画极细暗金/铜色口沿。 */
    stopper: [[0, 2.715], [.075, 2.720], [.115, 2.735], [.130, 2.780], [.140, 2.885],
              [.146, 2.925], [.146, 2.950], [.136, 2.978], [.115, 3.012], [.090, 3.036],
              [.070, 3.060], [.052, 3.090], [.050, 3.120], [.058, 3.150], [.085, 3.180],
              [.130, 3.205], [.160, 3.220], [.150, 3.230], [.130, 3.220], [.100, 3.190],
              [.070, 3.160], [0, 3.150]]
  };
  var ROT_SPEED = 0.15;          // 原地自转：绕器物竖轴（回转体，靠开片/窗光可见）
  /* 环绕自转：相机绕器物巡视，真正「多角度」。方位角匀速 + 俯仰角正弦摆动。 */
  var AZIM_SPEED = 0.12;                       // 方位角匀速 rad/s（整圈约 52s）
  var POLAR_MID = 51 * Math.PI / 180;          // 俯仰摆动中值
  var POLAR_AMP = 17 * Math.PI / 180;          // 俯仰摆动幅度（34°↔68°）
  var POLAR_FREQ = 2 * Math.PI / 36;           // 俯仰摆动频率（周期约 36s）
  /* 青瓷四色（线性色）：深=背光暗部，中=常态，浅=受光水头，冷=远侧薄青。
     取自参考图那只粉青葫芦：淡青绿、明度偏高、几乎不带黄。 */
  var GLASS_DEEP = [0.10, 0.20, 0.17];
  var GLASS_MID  = [0.34, 0.50, 0.44];
  var GLASS_LITE = [0.72, 0.85, 0.80];
  var GLASS_COOL = [0.22, 0.42, 0.42];
  /* 釉面系数（沿用茶模块瓷器的实机标定值）：spec = GGX 基础镜面、coat = 透明釉第二层
     窄高光、sss = 薄胎背光透射、env = 窗光环境反射。玻璃那套（更重的镜面与环境）已弃用 ——
     瓷器靠「宽高光 + 边缘光」读形，不靠环境反射。 */
  var FX_PBR = { spec: 0.08, coat: 0.28, sss: 0.10, env: 0.42 };
  /* 硬边法线阈值：只保留真正尖锐的折角（薄口沿 108°、盖/塞边）。
     提到 70° 是为了放过葫芦的「腰」——腰的折角约 67°，是一只吹出来的葫芦该有的圆滑过渡，
     若按 50° 判成硬边，腰上会插一道亮线，读起来像上下两节拼起来的（实测）。 */
  var HARD_EDGE_COS = Math.cos(70 * Math.PI / 180);

  /* ══ 曲线：逐字复刻 five 的 CatmullRomCurve3(...,'catmullrom',0.1).getPoints(150) ══ */
  function crAxis(x0, x1, x2, x3, tension, t) {
    var ta = tension * (x2 - x0), tb = tension * (x3 - x1);
    var c0 = x1, c1 = ta;
    var c2 = -3 * x1 + 3 * x2 - 2 * ta - tb;
    var c3 = 2 * x1 - 2 * x2 + ta + tb;
    return ((c3 * t + c2) * t + c1) * t + c0;
  }
  function sampleProfile(pts, divisions, tension) {
    var l = pts.length, out = [];
    var ex0 = [pts[0][0] * 2 - pts[1][0], pts[0][1] * 2 - pts[1][1]];
    var exN = [pts[l - 1][0] * 2 - pts[l - 2][0], pts[l - 1][1] * 2 - pts[l - 2][1]];
    for (var i = 0; i <= divisions; i++) {
      var p = (l - 1) * (i / divisions);
      var k = Math.floor(p), w = p - k;
      if (w === 0 && k === l - 1) { k = l - 2; w = 1; }
      var p0 = k > 0 ? pts[k - 1] : ex0;
      var p1 = pts[k % l], p2 = pts[(k + 1) % l];
      var p3 = k + 2 < l ? pts[(k + 2) % l] : exN;
      out.push([crAxis(p0[0], p1[0], p2[0], p3[0], tension, w), crAxis(p0[1], p1[1], p2[1], p3[1], tension, w)]);
    }
    return out;
  }

  /* ══ 车削网格 ══ */
  function buildLathe(profile, segments, radialScale, withUV, uvCfg) {
    var P = sampleProfile(profile, 150, 0.1), n = P.length;
    var sc = radialScale || 1;
    var cfg = uvCfg || {};
    var pos = [], nrm = [], nrmHard = [], idx = [], uv = [];
    /* 「外表面」到哪一点结束：默认取剖面最高点（碗口、盘沿）；
       茶盖的剖面从盖钮最高处往下盘，外表面终点是最低点（盖裙下沿），故可切 min。 */
    var rim = 0, ext = cfg.rim === 'min' ? 1e9 : -1e9;
    for (var q = 0; q < n; q++) {
      if (cfg.rim === 'min' ? P[q][1] < ext : P[q][1] > ext) { ext = P[q][1]; rim = q; }
    }
    /* v 用弧长而不是剖面索引：Catmull-Rom 的控制点疏密不均，按索引取 v 会把纹样全挤到碗底。
       葫芦的开片已经改用物体空间三平面映射（见 pattern3），这里的 vUv 只作备用，
       不再承担「把整张贴图绕瓶身铺一圈」的任务。 */
    var cum = [0];
    for (var q2 = 1; q2 < n; q2++) {
      cum.push(cum[q2 - 1] + Math.hypot(P[q2][0] - P[q2 - 1][0], P[q2][1] - P[q2 - 1][1]));
    }
    /* 再把 v 归一到「看得见的墙面」：从圈足最低点到口沿，贴图的整幅高度正好铺满这段墙。
       归一后**不钳位**：口沿之后继续按弧长累加（v>1），由贴图在 v 方向无缝平铺接住。
       早先这里把 i>rim 一律钳到 1，整段口沿+内壁因此挤在贴图最后一行 —— 既拉成横条，
       又逼得 shader 用「朝外程度」把纹样挡掉（口沿顶面法线朝上，会被误判成内壁），
       结果就是杯口那一圈没有冰裂。 */
    /* v 的起点：默认取剖面最低点（碗足、盘心），把足底的圆盘排除在纹样之外；
       茶盖的外表面从盖钮顶端起算，故可切 start。 */
    var foot = 0, minY = 1e9;
    if (cfg.foot !== 'start') {
      for (var q3 = 0; q3 <= rim; q3++) { if (P[q3][1] < minY) { minY = P[q3][1]; foot = q3; } }
    }
    var cumFoot = cum[foot] || 0;
    var wallLen = (cum[rim] - cumFoot) || 1;

    /* ── P4 硬边法线（质感档专用，原稿档仍用下面的平滑 nrm）──
       Catmull-Rom 把剖面控制点之间的折角全抹成了连续切线，于是口沿、圈足、盖裙
       读起来像吹出来的圆润玻璃，没有瓷的挺括。这里不改拓扑（顶点/索引完全共用），
       只在「原始控制点的大折角」对应的采样索引上，把前一点换成入段切线、
       折角点换成出段切线 —— 相邻两个采样点法线骤变，光栅化时在这一个 quad 上
       插值出一道极窄的亮边。151 点采样很密，视觉上就是一条硬折线。
       控制点 k 对应采样索引 k*150/(l-1)（sampleProfile 的等参数采样）。 */
    var tanHard = [];
    for (var hq = 0; hq < n; hq++) {
      var ha = P[Math.max(0, hq - 1)], hb = P[Math.min(n - 1, hq + 1)];
      var htx = hb[0] - ha[0], hty = hb[1] - ha[1], htl = Math.hypot(htx, hty) || 1;
      tanHard.push([htx / htl, hty / htl]);
    }
    var hlp = profile.length;
    for (var hk = 1; hk < hlp - 1; hk++) {
      var hax = profile[hk][0] - profile[hk - 1][0], hay = profile[hk][1] - profile[hk - 1][1];
      var hbx = profile[hk + 1][0] - profile[hk][0], hby = profile[hk + 1][1] - profile[hk][1];
      var hla = Math.hypot(hax, hay) || 1, hlb = Math.hypot(hbx, hby) || 1;
      if ((hax * hbx + hay * hby) / (hla * hlb) < HARD_EDGE_COS) {
        var hi = Math.round(hk * 150 / (hlp - 1));
        if (hi > 0 && hi - 1 < n) tanHard[hi - 1] = [hax / hla, hay / hla];
        if (hi < n) tanHard[hi] = [hbx / hlb, hby / hlb];
      }
    }

    for (var i = 0; i < n; i++) {
      var r = P[i][0] * sc, y = sc === 1 ? P[i][1] : (0.02 + (P[i][1] - 0.02) * sc);
      var a = P[Math.max(0, i - 1)], b = P[Math.min(n - 1, i + 1)];
      var tr = b[0] - a[0], ty = b[1] - a[1];
      var tl = Math.hypot(tr, ty) || 1; tr /= tl; ty /= tl;
      var htr = tanHard[i][0], hty = tanHard[i][1];
      for (var j = 0; j <= segments; j++) {
        var ang = j / segments * Math.PI * 2, s = Math.sin(ang), c = Math.cos(ang);
        pos.push(r * s, y, r * c);
        nrm.push(ty * s, -tr, ty * c);
        nrmHard.push(hty * s, -htr, hty * c);
        /* cfg.full：闭合壳体（茶托、茶盖）按整条剖面弧长归一，v 连续铺满上下两面。
           默认只在「足底→口沿」这段墙面上归一，口沿之后的弧长继续累加（v>1）——
           贴图在 v 方向也是无缝平铺的（见 paintCrackle），多出来的部分自然接住，
           不会像钳到 1 那样把口沿与碗内拉成一圈横条。 */
        if (withUV) uv.push(j / segments, cfg.full ? cum[i] / (cum[n - 1] || 1)
          : (cum[i] - cumFoot) / wallLen);
      }
    }
    var row = segments + 1;
    for (var i2 = 0; i2 < n - 1; i2++) {
      for (var j2 = 0; j2 < segments; j2++) {
        var A = i2 * row + j2, B = A + 1, C = A + row, D = C + 1;
        idx.push(A, C, B, B, C, D);
      }
    }
    return { pos: new Float32Array(pos), nrm: new Float32Array(nrm), nrmHard: new Float32Array(nrmHard), idx: new Uint16Array(idx), uv: new Float32Array(uv) };
  }

  /* ══ 纹样：画在 2D 画布上再上传成贴图 ══
     u 是环向（左右循环），v 是剖面弧长（0=足底/盖钮，1=口沿/盖沿，越过口沿后继续累加而不是钳住）。
     三件瓷整器都印；越界的那一段靠贴图在两个方向都无缝平铺来消化（见 paintCrackle）。
     冰裂非轴对称 —— 这也让自转第一次「看得见」。 */
  /* 512×256 而不是 1024×512：碗在屏幕上横向只有约 300px，
     贴图再大也会被缩小采样，1px 的开片线平均完就看不见了。 */
  var PAT_W = 512, PAT_H = 256;
  var PATTERNS = ['none', 'crackle'];

  /* ── P3 窗光环境（釉面映出的那排窗棂）──
     512×32 的横向条带：u = 反射向量的方位角 0..1（GL_REPEAT 环绕），
     v = 反射向量高度（上=天光、下=案面）。三扇柔边窗格 + 两道低频「竹影」扰动，
     纯 2D canvas 逐像素现算，不加载任何外部贴图（模块沙箱禁 fetch/import）。
     用世界反射向量采样：相机绕器物走（水平拖）时 V 变 → R 变 → 窗光沿釉面游走，
     这才是「映环境」的物理正确做法；贴到 vUv 上会变成环境跟着杯子转，是错的。 */
  var ENV_W = 512, ENV_H = 32;
  function makeEnvCanvas() {
    var c = document.createElement('canvas');
    c.width = ENV_W; c.height = ENV_H;
    var ctx = c.getContext('2d');
    var img = ctx.createImageData(ENV_W, ENV_H);
    var d = img.data;
    var centers = [0.12, 0.46, 0.80];
    for (var y = 0; y < ENV_H; y++) {
      var vy = y / (ENV_H - 1);
      var sky = 1.0 - 0.55 * vy;                  // 上亮下暗
      for (var x = 0; x < ENV_W; x++) {
        var u = x / ENV_W, win = 0;
        for (var i = 0; i < centers.length; i++) {
          var dx = Math.abs(u - centers[i]);
          dx = Math.min(dx, 1 - dx);             // 环面距离，首尾无缝
          win += Math.exp(-Math.pow(dx / 0.045, 2));
        }
        var bamboo = 0.06 * Math.sin(u * 6.2831853 * 7.0) + 0.04 * Math.sin(u * 6.2831853 * 13.0 + 1.1);
        var v = Math.min(1, Math.max(0, (win * 0.92 + 0.06 + bamboo) * sky));
        var k = (y * ENV_W + x) * 4;
        d[k] = Math.round(255 * v);
        d[k + 1] = Math.round(250 * v);
        d[k + 2] = Math.round(235 * v);
        d[k + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }

  function patCanvas() {
    var c = document.createElement('canvas');
    c.width = PAT_W; c.height = PAT_H;
    return c;
  }

  /* 冰裂（开片）。
     参考真品：这是 Voronoi 多边形，三叉交汇（三条缝以约 120° 相交）、格子大小不一、
     大格里再细分出小格。之前两版都是「四边网格」，骨架天生不对，抖得再厉害也像渔网。

     做法：距离场。每个像素只查 3×3 邻域里的种子（不是全部种子，所以够快），
     取最近距离 d1 与次近距离 d2，d2−d1 落在带宽内即裂纹 ——
     三叉交汇、宽窄变化都是这个算法的自然产物，不用手画。
     两个方向都按环面算（种子按模数环绕 + 距离走近路），所以整张图是四方连续的 ——
     贴图在 u 上绕一圈、在 v 上可以越过 1 继续铺（口沿之后的弧长就靠它接住）。 */
  var CRACK_COLOR = [50, 64, 68];     // 墨色（偏青的深灰，参考图里就是这条色）

  function paintCrackle(ctx) {
    var W = PAT_W, H = PAT_H;
    var acc = new Float32Array(W * H);   // 逐像素裂纹强度 0..1
    var rnd = 20261030;
    function rndNext() { rnd = (rnd * 16807) % 2147483647; return rnd / 2147483647; }

    /** 叠一层 Voronoi 裂纹：nx×ny 个种子，线宽 w（像素），强度 gain */
    function layer(nx, ny, w, gain) {
      var cw = W / nx, ch = H / ny;
      var sx = new Float32Array(nx * ny), sy = new Float32Array(nx * ny);
      for (var gy = 0; gy < ny; gy++) {
        for (var gx = 0; gx < nx; gx++) {
          /* 三平面映射下格子在物体空间是等大的方形，不必再靠压低抖动来对抗环向压缩。
             回到接近茶模块的 0.66，保留自然的不规则开片；0.86 才会造出薄片状细胞。 */
          sx[gy * nx + gx] = (gx + 0.5) * cw + (rndNext() - 0.5) * cw * 0.66;
          sy[gy * nx + gx] = (gy + 0.5) * ch + (rndNext() - 0.5) * ch * 0.66;
        }
      }
      for (var y = 0; y < H; y++) {
        var cy = Math.min(ny - 1, (y / ch) | 0);
        var rowBase = y * W;
        for (var x = 0; x < W; x++) {
          var cx = Math.min(nx - 1, (x / cw) | 0);
          var d1 = 1e18, d2 = 1e18;
          for (var oy = -1; oy <= 1; oy++) {
            var jy = ((cy + oy) % ny + ny) % ny;    // 纵向环绕 → v 也无缝（贴图 WRAP_T=REPEAT）
            for (var ox = -1; ox <= 1; ox++) {
              var jx = cx + ox;
              jx = ((jx % nx) + nx) % nx;           // 横向环绕 → u 无缝
              var si = jy * nx + jx;
              /* 距离按环面算（跨到画布另一侧的种子走近路）：
                 少了这一步，即使种子按模数环绕，u=0 / v=0 两条接缝上的裂纹仍会断开 */
              var ddx = sx[si] - x, ddy = sy[si] - y;
              if (ddx > W * 0.5) ddx -= W; else if (ddx < -W * 0.5) ddx += W;
              if (ddy > H * 0.5) ddy -= H; else if (ddy < -H * 0.5) ddy += H;
              var dd = ddx * ddx + ddy * ddy;
              if (dd < d1) { d2 = d1; d1 = dd; }
              else if (dd < d2) { d2 = dd; }
            }
          }
          var e = Math.sqrt(d2) - Math.sqrt(d1);     // 到两条边界的距离差
          if (e < w) {
            var k = 1 - e / w;                       // 越贴边越实
            var v = k * k * gain;                    // 平方一下：线心实、边缘软，接近笔触
            var idx = rowBase + x;
            if (v > acc[idx]) acc[idx] = v;
          }
        }
      }
    }

    /* 密度比茶模块（9×5 + 30×15）**再密一档**：葫芦在屏幕上的可见宽度只有茶碗的三分之二
       （2.0 vs 4.0 世界单位），同样 9 格的主裂映到屏上明显更大更粗，读起来是「大块粗纹」
       而不是「细密开片」。这里提到 14×7 / 44×22，并相应收细线宽（1.3→1.1、0.75→0.62）——
       细腻感来自「线宽 ÷ 格子边」这个比值，不是绝对像素数。 */
    // 主裂：格子大、线粗、深
    layer(14, 7, 1.1, 1.0);
    // 次裂：格子小、线细、浅 —— 大格里被细分的感觉就来自这一层
    layer(44, 22, 0.60, 0.95);

    var img = ctx.createImageData(W, H);
    var d = img.data;
    for (var i = 0, n = W * H; i < n; i++) {
      var a = acc[i];
      if (a <= 0.004) continue;                     // 大片留白，透明
      var p = i * 4;
      d[p] = CRACK_COLOR[0];
      d[p + 1] = CRACK_COLOR[1];
      d[p + 2] = CRACK_COLOR[2];
      d[p + 3] = Math.min(255, Math.round(a * 255));
    }
    ctx.putImageData(img, 0, 0);
  }

  function makePatternCanvas(kind) {
    var c = patCanvas();
    var ctx = c.getContext('2d');
    ctx.clearRect(0, 0, PAT_W, PAT_H);
    if (kind === 'crackle') paintCrackle(ctx);
    return c;
  }

  /* ══ 矩阵 ══ */
  function mul(a, b) {
    var o = new Float32Array(16);
    for (var i = 0; i < 4; i++) for (var j = 0; j < 4; j++) {
      var s = 0; for (var k = 0; k < 4; k++) s += a[k * 4 + j] * b[i * 4 + k];
      o[i * 4 + j] = s;
    }
    return o;
  }
  function lookAt(eye, at, up) {
    var zx = eye[0] - at[0], zy = eye[1] - at[1], zz = eye[2] - at[2];
    var zl = Math.hypot(zx, zy, zz); zx /= zl; zy /= zl; zz /= zl;
    var xx = up[1] * zz - up[2] * zy, xy = up[2] * zx - up[0] * zz, xz = up[0] * zy - up[1] * zx;
    var xl = Math.hypot(xx, xy, xz); xx /= xl; xy /= xl; xz /= xl;
    var yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
    return new Float32Array([xx, yx, zx, 0, xy, yy, zy, 0, xz, yz, zz, 0,
      -(xx * eye[0] + xy * eye[1] + xz * eye[2]),
      -(yx * eye[0] + yy * eye[1] + yz * eye[2]),
      -(zx * eye[0] + zy * eye[1] + zz * eye[2]), 1]);
  }
  /* ty：NDC 纵向偏移，用来把整体画面上下挪动而不改变缩放与视角（4 阶矩阵的 m[13]）。
     光照用的 ortho 不传，保持 0。 */
  function ortho(hw, hh, near, far, ty) {
    return new Float32Array([1 / hw, 0, 0, 0, 0, 1 / hh, 0, 0, 0, 0, -2 / (far - near), 0,
      0, ty || 0, -(far + near) / (far - near), 1]);
  }
  function rotY(t) {
    var c = Math.cos(t), s = Math.sin(t);
    return new Float32Array([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]);
  }
  function rotZ(t) {
    var c = Math.cos(t), s = Math.sin(t);
    return new Float32Array([c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  }
  function trans(x, y, z) { return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]); }

  /* ══ 着色器 ══ */
  var VS_MAIN = [
    'attribute vec3 aPos; attribute vec3 aNrm; attribute vec2 aUv;',
    'uniform mat4 uMVP; uniform mat4 uModel;',
    'varying vec3 vN; varying vec3 vW; varying vec2 vUv;',
    /* 【葫芦专用 UV】三平面映射要用**物体局部坐标**：用 vW 的话自转时纹样会「游动」在表面上。 */
    'varying vec3 vP; varying vec3 vLN;',
    'void main(){',
    '  vec4 wp = uModel * vec4(aPos,1.0); vW = wp.xyz;',
    '  vec3 nw = mat3(uModel) * aNrm; vN = nw; vUv = aUv;',
    '  vP = aPos; vLN = aNrm;',
    '  gl_Position = uMVP * vec4(aPos,1.0); }'
  ].join('\n');

  /* 着色器：uFxKind 0=玻璃瓶 1=酒液 2=气泡。玻璃走菲涅尔透射（中心透明见酒液、
     边缘高 alpha 现玻璃），酒液走有色液体 + 顶部弯月面，气泡走自发光小球。 */
  var FS_MAIN = [
    'precision highp float;',
    'varying vec3 vN; varying vec3 vW; varying vec2 vUv;',
    'varying vec3 vP; varying vec3 vLN;',
    'uniform vec3 uAlbedo; uniform vec3 uKeyDir;',
    'uniform vec3 uSky; uniform vec3 uGround; uniform float uAmbient;',
    'uniform float uRough; uniform vec3 uEye; uniform float uOpacity;',
    'uniform float uKeyK; uniform float uGlow; uniform float uBodyDim; uniform float uLineGlow; uniform float uNightK;',
    'uniform float uFx; uniform float uFxKind; uniform float uTime;',
    'uniform vec3 uFxPbr;',
    'uniform sampler2D uEnvTex; uniform float uEnvK;',
    'uniform sampler2D uPattern; uniform float uPatternOn;',
    'uniform vec3 uGlassDeep; uniform vec3 uGlassMid; uniform vec3 uGlassLite; uniform vec3 uGlassCool;',
    'uniform float uGlassGain;',
    /* 0 = 粉青（白瓷链路：irr×反照率×RPI + 弱主光，裂纹**混墨**成深线）
       1 = 深青（青玉链路：celadonBody 五层，裂纹**压暗**） */
    'uniform float uGlassJade;',
    'const float RPI = 0.3183098861837907;',
    'float pow2(float x){ return x*x; }',
    'float sat(float x){ return clamp(x,0.0,1.0); }',
    'vec3 F_Schlick(vec3 f0, float f90, float d){ return f0 + (f90-f0)*pow(clamp(1.0-d,0.0,1.0),5.0); }',
    'vec3 RRT(vec3 v){ vec3 a=v*(v+0.0245786)-0.000090537; vec3 b=v*(0.983729*v+0.4329510)+0.238081; return a/b; }',
    'vec3 aces(vec3 c){',
    '  const mat3 IN = mat3(vec3(0.59719,0.07600,0.02840), vec3(0.35458,0.90834,0.13383), vec3(0.04823,0.01566,0.83777));',
    '  const mat3 OUT = mat3(vec3(1.60475,-0.10208,-0.00327), vec3(-0.53108,1.10813,-0.07276), vec3(-0.07367,-0.00605,1.07602));',
    '  c *= 4.3667; c = IN*c; c = RRT(c); c = OUT*c; return clamp(c,0.0,1.0); }',
    'vec3 lin2srgb(vec3 c){ return mix(c*12.92, 1.055*pow(max(c,vec3(0.0)),vec3(1.0/2.4))-0.055, step(vec3(0.0031308),c)); }',
    /* GLSL 版 srgb→线性：白瓷档要把开片贴图的 sRGB 墨色混进反照率（JS 侧那个同名函数够不着 shader） */
    'vec3 srgb2lin(vec3 c){ return mix(c/12.92, pow((c+0.055)/1.055, vec3(2.4)), step(vec3(0.04045), c)); }',
    /* 【葫芦专用 UV：物体空间三平面映射】
       柱面 UV 的 u 是环向角度，必须 0→1 闭合，于是同样一圈贴图在 r≈1 的下肚和 r≈0.17 的颈部
       被压成 6 倍密度（腰那圈横向亮带就是这么来的）。改成按**物体空间尺寸**采样：三个正交平面
       各采一次、按法线混合。纹样尺寸不再随半径变化，也没有环向接缝。
       贴图是 14×7 格（W:H=2:1），要让格子在世界里是方的，v 方向采样率必须是 u 的 2 倍：
       scale=(0.28,0.56) 对应主裂格子边长约 0.26 世界单位（下肚直径 2，约 8 格）。 */
    'vec4 pattern3(vec3 p, vec3 ln){',
    '  vec3 b = abs(ln); b = b*b*b*b; b /= max(b.x+b.y+b.z, 0.0001);',
    '  vec2 sc = vec2(0.28, 0.56);',
    '  vec4 px = texture2D(uPattern, vec2(p.z, p.y) * sc);',
    '  vec4 py = texture2D(uPattern, vec2(p.x, p.z) * sc);',
    '  vec4 pz = texture2D(uPattern, vec2(p.x, p.y) * sc);',
    '  return px*b.x + py*b.y + pz*b.z;',
    '}',
    /* 【与吃茶模块逐式对齐】青瓷釉面 = 青玉那套经过实机标定的五层着色，一字不改地搬过来：
       ① k 基底（0.92 + 0.45·ndl + 0.12·ny）；
       ② 受光面推浅（水头）pow(ndl,2)·0.55 —— 少了它整器像哑光塑料；
       ③ 背光面 + 贴案底部掺冷青（back^3·0.26 + under·0.24），且底部压暗 22%；
       ④ 双高光：宽 pow(dnh,10)·0.40 + 窄 pow(dnh,90)·0.35；
       ⑤ 边缘光 pow(1-nv,6)·0.85。
       之前这里用的是另写的简化版（irr×albedo 打底、高光指数 14/70、边缘光 0.50），
       加上 ACES 色调映射，结果比茶模块灰、糊、开片看不见 —— 实测对比确认后整体换回。
       器物不透明：alpha 恒为 uOpacity(=1)，葫芦里装什么从外面看不见。 */
    'vec3 celadonBody(vec3 n, vec3 V, vec3 wp, out float a){',
    '  vec3 L = normalize(vec3(-0.28, 0.57, 0.77));',
    '  float ndl = sat(dot(n, L));',
    '  float nv = sat(dot(n, V));',
    '  float ny = sat(n.y);',
    '  float k = 0.92 + 0.45 * ndl + 0.12 * ny;',
    '  vec3 base = uGlassMid * k;',
    '  base = mix(base, uGlassLite, pow(ndl, 2.0) * 0.55);',
    '  float back = pow(1.0 - ndl, 3.0);',
    /* 【必须按葫芦改阈值】茶碗主体在 y>0.4，under 只覆盖托那一圈；
       而葫芦下肚整个在 y<0.4 内，照抄茶的值会把**整块下肚**掺冷并压暗 22% ——
       这正是「比茶模块暗、灰」的直接原因。葫芦坐地，真正的贴案自遮挡只在最底部。 */
    '  float under = smoothstep(0.02, -0.38, wp.y);',
    '  base = mix(base, uGlassCool, clamp(back * 0.26 + under * 0.24, 0.0, 0.50));',
    '  base *= 1.0 - 0.22 * under;',
    '  vec3 H = normalize(L + V);',
    '  float dnh = sat(dot(n, H));',
    '  float spec = pow(dnh, 10.0) * 0.40 + pow(dnh, 90.0) * 0.35;',
    '  base += mix(uGlassLite, vec3(1.0), 0.55) * spec;',
    '  float rim = pow(1.0 - nv, 6.0);',
    '  base += uGlassLite * rim * 0.85;',
    '  a = uOpacity;',
    '  return base;',
    '}',
    /* 与茶模块同款轻压缩：不走 ACES。ACES 的输入矩阵会把「只有绿通道亮」摊到三通道，
       高饱和青瓷一压就变灰橄榄（茶模块实测 mid (48,180,48) → (123,148,61)）。 */
    'vec3 toneCeladon(vec3 c){ c = max(c, vec3(0.0)); return c / (1.0 + 0.55 * c); }',
    'void main(){',
    '  vec3 n = normalize(vN);',
    '  vec3 V = normalize(uEye - vW);',
    '  if (dot(n, V) < 0.0) n = -n;',
    '  float nv = sat(dot(n, V));',
    '  vec3 col;',
    '  float alpha = uOpacity;',
    /* 【提到外层】开片强度与「纹光基准色」：夜色·裂纹档要在压暗之后用它们发光，
       若留在上面的分支里就够不着（这是「裂纹档整只葫芦变全黑剪影」的根因）。
       现在统一走三平面采样：物体空间等尺寸，颈部不再过密，也不需要按半径衰减。 */
    '  vec4 pat = vec4(0.0);',
    '  if (uPatternOn > 0.5) pat = pattern3(vP, vLN);',
    '  float crackA = pat.a;',
    '  vec3 dc = uAlbedo;',
    '  if (uFxKind < 0.5) {',
    '    if (uGlassJade > 0.5) {',
    /* ── 深青档：青玉链路（celadonBody 五层），裂纹压暗成深脉 ── */
    '      col = celadonBody(n, V, vW, alpha) * uGlassGain;',
    '      col *= mix(1.0, 0.30, crackA);',
    /* 与茶青玉同款：纹光基准用玉色（否则玉上会亮出一层白线） */
    '      dc = mix(uGlassMid, uGlassLite, 0.25);',
    '    } else {',
    /* ── 粉青档：**白瓷链路**，与吃茶模块「白瓷」逐式一致 ──
       这是「酒不如茶亮/透」的真正答案：茶截图里那档走的是 irr×反照率×RPI + 弱主光，
       裂纹用「混墨」画成深线；而青玉链路是自求和、裂纹压暗，观感更沉更闷。
       之前两档都做成青玉链路，所以粉青档永远出不来茶那种淡雅通透。 */
    '      if (crackA > 0.0) dc = mix(dc, srgb2lin(pat.rgb), crackA);',
    '      vec3 irr = vec3(uAmbient) + mix(uGround, uSky, 0.5 + 0.5*n.y);',
    '      col = irr * dc * RPI;',
    '      col += sat(dot(n, uKeyDir)) * uKeyK * dc * RPI;',
    '    }',
    /* 器身压暗必须发生在 P2 之前：茶模块就是这个顺序 —— 先把瓷胎压下去，
       釉面的窄高光、掠射亮边与窗光反射最后再叠，暗色下才「胎暗釉亮」。
       放在 P2 之后会把高光一起乘成 15%，裂纹档于是整只葫芦发闷发灰。 */
    '  col *= uBodyDim;',
    /* P2 釉面增强（质感档才跑）：GGX 基础镜面 + clearcoat 窄高光 + 薄胎透射 + 掠射亮边 + 窗光反射 */
    '    if (uFx > 0.0) {',
    '      vec3 L = normalize(uKeyDir);',
    '      vec3 H = normalize(L + V);',
    '      float dnl = sat(dot(n, L));',
    '      float dnh = sat(dot(n, H));',
    '      float dvh = sat(dot(V, H));',
    '      float a2 = pow2(uRough);',
    '      float dd = pow2(dnh)*(a2-1.0)+1.0;',
    '      float gv = dnl*sqrt(a2+(1.0-a2)*pow2(nv));',
    '      float gl = nv*sqrt(a2+(1.0-a2)*pow2(dnl));',
    '      float spec = (RPI*a2/pow2(dd)) * (0.5/max(gv+gl,1e-6)) * F_Schlick(vec3(0.04),1.0,dvh).r;',
    /* 与茶模块同款：青玉档压半档防塑料（jadeK=0.45）；粉青走白瓷档，全量。 */
    '      float jadeK = (uGlassJade > 0.5) ? 0.45 : 1.0;',
    '      col += vec3(spec) * uFxPbr.x * min(1.0, dnl * 1.4) * jadeK;',
    /* ② clearcoat 要乘 Schlick：高光边缘才抬得起来，否则是一块平白斑 */
    '      vec3 cf = F_Schlick(vec3(0.04), 1.0, dvh);',
    '      vec3 coatTint = (uGlassJade > 0.5) ? mix(vec3(1.0), uGlassLite, 0.4) : vec3(1.0);',
    '      col += coatTint * pow(dnh, 180.0) * cf * uFxPbr.y * jadeK;',
    /* ③ 薄胎透射：白瓷用「瓷胎暖色」，不能再拿青玉的 lite（绿），否则白瓷泛菜色 */
    '      vec3 trans = (uGlassJade > 0.5) ? uGlassLite : (dc * vec3(1.0, 0.72, 0.48));',
    '      col += trans * pow(1.0 - dnl, 2.0) * uFxPbr.z * jadeK;',
    /* ④ 掠射角亮边：釉口那一圈，白瓷此前完全没有；暗色下「釉面有光」主要靠它 */
    '      col += trans * pow(1.0 - nv, 5.0) * uFxPbr.y * 0.30 * jadeK;',
    '      vec3 R = reflect(-V, n);',
    '      float phi = atan(R.z, R.x) * 0.1591549431 + 0.5;',
    '      float ev = clamp(R.y * 0.5 + 0.5, 0.0, 1.0);',
    '      vec3 env = texture2D(uEnvTex, vec2(phi, 1.0 - ev)).rgb;',
    '      col += env * F_Schlick(vec3(0.04), 1.0, nv).r * uEnvK * jadeK;',
    '    }',
    '  } else {',
    /* 深釉瓷塞：不透明釉面，半球光 + 主光 + 一道窄釉光。
       这里不用 RPI 的半球漫反射：瓷塞是个很小的独立件，按 RPI 算会被压到只剩四成亮度，
       必须把反照率提到 0.3+ 才能看见，结果亮色主题又艳又亮。改用直接漫反射（约 0.9~1.0 倍反照率），
       反照率用 stopperHex 的低饱和深釉（随主题色相、S 固定 12%），
       既不会像 deep/mid 混色那样在亮色下冲到荧光绿，也不会在暗色下被压成纯黑。
       暗金/铜色口沿不额外建网格（那会多一次拾取与动画同步），直接按物体局部 y 取一圈：
       y=2.936~2.949 是圆肩最外那一线，视觉上正好是“塞帽压住瓶口”的金属细边。 */
    '    vec3 irr = vec3(uAmbient) + mix(uGround, uSky, 0.5 + 0.5*n.y);',
    '    vec3 ceramic = uAlbedo;',
    '    col = irr * ceramic * 0.72 + sat(dot(n, uKeyDir)) * uKeyK * ceramic;',
    '    vec3 H = normalize(uKeyDir + V);',
    '    col += mix(uGlassLite, vec3(1.0), 0.45) * pow(sat(dot(n, H)), 80.0) * 0.14;',
    '    float band = smoothstep(2.932, 2.936, vP.y) * (1.0 - smoothstep(2.949, 2.953, vP.y));',
    '    vec3 gold = vec3(0.332, 0.227, 0.087);',
    '    col = mix(col, irr * gold * 0.72 + sat(dot(n, uKeyDir)) * uKeyK * gold, band);',
    '    alpha = 1.0;',
    '  }',
    /* 夜色三种：① 周身微光（uGlow）② 器身压暗（uBodyDim）③ **裂纹自发光（uLineGlow）**。
       ③ 是「夜色效果 = 裂纹」的全部看点：器身被压到接近黑，只有开片线自己发亮。
       少了这一行，bodyDim 会把整只葫芦压成纯黑剪影（实测：用户截图就是这个现象）。 */
    '  float rim = pow(1.0 - nv, 2.2);',
    '  col += uGlow * mix(uGlassMid, uAlbedo, 0.5) * (0.45 + 1.35 * rim) * uNightK;',
    '  col += uLineGlow * crackA * dc * uNightK;',
    /* 与茶模块同一套分工：青玉档走轻压缩保色相，白瓷 / 瓷塞走 ACES */
    '  col = (uFxKind < 0.5 && uGlassJade > 0.5) ? toneCeladon(col) : aces(col);',
    '  gl_FragColor = vec4(lin2srgb(col) * alpha, alpha);',
    '}'
  ].join('\n');

  var VS_PICK = [
    'attribute vec3 aPos;',
    'uniform mat4 uMVP;',
    'void main(){ gl_Position = uMVP * vec4(aPos,1.0); }'
  ].join('\n');
  var FS_PICK = [
    'precision mediump float;',
    'uniform float uId;',
    'void main(){ gl_FragColor = vec4(uId / 255.0, 0.0, 0.0, 1.0); }'
  ].join('\n');

  function compile(gl, type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) + '\n' + src);
    return s;
  }
  function program(gl, vs, fs) {
    var p = gl.createProgram();
    gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
    gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    return p;
  }
  function buffer(gl, data, target) {
    var b = gl.createBuffer();
    gl.bindBuffer(target || gl.ARRAY_BUFFER, b);
    gl.bufferData(target || gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    return b;
  }

  function srgb2lin(c) { return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  function hex2linArray(hex) {
    var h = String(hex).replace('#', '');
    var n = parseInt(h, 16);
    return [srgb2lin(((n >> 16) & 255) / 255), srgb2lin(((n >> 8) & 255) / 255), srgb2lin((n & 255) / 255)];
  }

  /* ══ 渲染器 ═══════════════════════════════════════════════════ */
  function GaiwanMount(el, opts) {
    opts = opts || {};
    var canvas = document.createElement('canvas');
    canvas.className = 'gaiwan-canvas';
    canvas.style.cssText = 'width:100%;height:100%;display:block';
    el.appendChild(canvas);

    var gl = canvas.getContext('webgl', {
      alpha: true, antialias: true, premultipliedAlpha: true, preserveDrawingBuffer: false,
    }) || canvas.getContext('experimental-webgl');
    if (!gl) { el.removeChild(canvas); return null; }

    var progMain = program(gl, VS_MAIN, FS_MAIN);
    var progPick = program(gl, VS_PICK, FS_PICK);

    /* 纹样贴图 */
    var patTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, patTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);

    /* P3 环境反射贴图：启动时生成一次、上传一次，不参与逐帧开销。
       512×32 均为 2 的幂，u 方向才能用 GL_REPEAT 环绕成 360°。 */
    var envTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, envTex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, makeEnvCanvas());
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    /* 点击拾取：1×1 目标 + 把点击点平移到画面中心的投影 */
    var pickTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, pickTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    var pickFb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, pickFb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, pickTex, 0);
    var pickDepth = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, pickDepth);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, 1, 1);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, pickDepth);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    /* 网格 */
    var SEG = 128;
    function mesh(m) {
      return {
        pos: buffer(gl, m.pos), posArr: m.pos, nrm: buffer(gl, m.nrm),
        /* P4：三件瓷器各多一份硬边法线 buffer；茶汤/叶底没有，回落用平滑 */
        nrmHard: m.nrmHard && m.nrmHard.length ? buffer(gl, m.nrmHard) : null,
        uv: m.uv && m.uv.length ? buffer(gl, m.uv) : null,
        idx: buffer(gl, m.idx, gl.ELEMENT_ARRAY_BUFFER),
        count: m.idx.length
      };
    }
    var M = {
      /* 青瓷葫芦（不透明，含内壁）与深青釉瓷塞。不再是玻璃 —— 没有酒液/气泡网格了。 */
      vessel: mesh(buildLathe(PROFILES.vessel, SEG, 1, true)),
      stopper: mesh(buildLathe(PROFILES.stopper, SEG, 1, false)),
    };

    function bindMesh(prog, m) {
      var aP = gl.getAttribLocation(prog, 'aPos');
      gl.bindBuffer(gl.ARRAY_BUFFER, m.pos);
      gl.enableVertexAttribArray(aP);
      gl.vertexAttribPointer(aP, 3, gl.FLOAT, false, 0, 0);
      var aN = gl.getAttribLocation(prog, 'aNrm');
      if (aN >= 0) {
        /* P4：质感档用硬边法线，原稿档仍绑原来的平滑法线 —— 逐像素回退不靠 shader 分支，
           而是直接换顶点属性 buffer，几何与着色链都不用改。 */
        gl.bindBuffer(gl.ARRAY_BUFFER, (state.enhance && m.nrmHard) ? m.nrmHard : m.nrm);
        gl.enableVertexAttribArray(aN);
        gl.vertexAttribPointer(aN, 3, gl.FLOAT, false, 0, 0);
      }
      var aU = gl.getAttribLocation(prog, 'aUv');
      if (aU >= 0) {
        if (m.uv) {
          gl.bindBuffer(gl.ARRAY_BUFFER, m.uv);
          gl.enableVertexAttribArray(aU);
          gl.vertexAttribPointer(aU, 2, gl.FLOAT, false, 0, 0);
        } else {
          gl.disableVertexAttribArray(aU);
          gl.vertexAttrib2f(aU, 0, 0);
        }
      }
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, m.idx);
    }

    /* 统一量 */
    var U = {};
    ['uMVP', 'uModel', 'uAlbedo', 'uKeyDir', 'uSky', 'uGround', 'uAmbient', 'uRough', 'uEye',
      'uOpacity', 'uKeyK', 'uGlow', 'uBodyDim', 'uLineGlow', 'uNightK',
      'uFx', 'uFxKind', 'uTime', 'uFxPbr', 'uEnvTex', 'uEnvK', 'uPattern', 'uPatternOn',
      'uGlassDeep', 'uGlassMid', 'uGlassLite', 'uGlassCool', 'uGlassGain', 'uGlassJade'].forEach(function (k) {
      U[k] = gl.getUniformLocation(progMain, k);
    });

    /* 轨道相机：与原稿 OrbitControls 同一组约束
       （target(0,1.4,0)、polar 30°..84°、zoom .5..3、dampingFactor .05、enablePan=false） */
    /* 取景目标点：葫芦可见范围 y = -0.35（底）~ 3.230（小喇叭口沿），几何中心约 1.44。
       v0.3.12 改小喇叭口后目标略上移，配合 BOX.hh 小幅放大，给上联留白。 */
    var AT = [0, 1.42, 0];
    var CAM_R = 8.35;

    var POLAR_MIN = Math.PI / 6, POLAR_MAX = Math.PI / 2 - 0.1;
    var ZOOM_MIN = 0.5, ZOOM_MAX = 3;
    var cam = {
      azim: Math.atan2(4, 7), polar: Math.acos(1.8 / 8.35),
      zoom: 1, tAzim: Math.atan2(4, 7), tPolar: Math.acos(1.8 / 8.35), tZoom: 1
    };
    function eyeOf() {
      var sp = Math.sin(cam.polar), cp = Math.cos(cam.polar);
      return [AT[0] + CAM_R * sp * Math.sin(cam.azim), AT[1] + CAM_R * cp, AT[2] + CAM_R * sp * Math.cos(cam.azim)];
    }
    function norm(v) { var l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; }
    var KEY = norm([5, 10, 7]), FILL = norm([-6, 3, 5]);

    var state = {
      w: 0, h: 0, dpr: Math.min(window.devicePixelRatio || 1, 2),
      yaw: 0, lift: 0, bob: 0, pattern: 'crackle', elapsed: 0,
      spinMode: (opts.spinMode === 'yaw' || opts.spinMode === 'orbit') ? opts.spinMode : 'off',
      polarPhase: 0, autoPaused: false,
      /* 酒液颜色只用于详情卡的色点，不参与渲染（葫芦是实心观感的瓷器，看不见内里） */
      wineColor: [0.55, 0.20, 0.10],
      glassColor: [1, 1, 1], glow: 0, bodyDim: 1, lineGlow: 0, last: 0, raf: 0, alive: true,
      /* 釉面档：'porcelain' 浅青 / 'jade' 深青（沿用 mat 键以复用 UI 通道） */
      mat: 'porcelain',
      glass: { deep: GLASS_DEEP, mid: GLASS_MID, lite: GLASS_LITE, cool: GLASS_COOL },
      glassGain: 1.34,
      /* 质感档：false 时气泡上升/酒面增强归零 */
      enhance: opts.enhance !== false
    };

    /** 包围球取景：轨道转到任何角度都不裁（用球而不是盒，避免转动时画面忽大忽小）。
     *  葫芦最大半径 1.0；加小喇叭口后高约 3.58，包围球 ≈ 2.04，仍小于 2.5；
     *  hh 只小幅放大到 2.66，给上联留一档空白，不让器物一下子缩太多。 */
    var BOX = { hw: 2.5, hh: 2.66 };
    function fitView(aspect) {
      if (opts.fixedFrustum) return { hw: 3.9 * aspect, hh: 3.9 };   // 仅用于与原稿做同画幅像素对照
      var hw = BOX.hw, hh = BOX.hh;
      if (aspect > hw / hh) hw = hh * aspect; else hh = hw / aspect;
      return { hw: hw, hh: hh };
    }

    function resize() {
      var r = el.getBoundingClientRect();
      var w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
      if (w === state.w && h === state.h) return;   /* 尺寸没变就不重设，避免打断 rAF */
      state.w = w; state.h = h;
      canvas.width = Math.round(w * state.dpr);
      canvas.height = Math.round(h * state.dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
    }

    /** 瓶塞的局部变换：小喇叭口略歪静置；拔起时向右上让开。 */
    /** 瓶塞：向上拔出 + 向右让开 + 微倾。
     *  **必须侧移**：塞子原先是纯竖直抬起，抬到位时正好顶在上题字「将进酒」那里，
     *  把字盖住（实测）。茶模块的盖子是侧倾抬起，天然让开；塞子拔起也该往边上放。 */
    function stopperMatrix(lift) {
      var t = Math.max(0, Math.min(1, lift || 0));
      /* v0.3.12 小喇叭口：静止时略歪，像随手搁上的塞子；拔起时继续向右上让开上联。 */
      var pivot = 2.95;
      var dx = 0.95 * t;
      var dy = 0.42 * t + (state.bob * 0.5) * (1 - t);
      var ang = 0.09 + 0.20 * t;
      var t0 = trans(0, -pivot, 0);
      var t1 = trans(0, pivot, 0);
      return mul(t1, mul(rotZ(ang), mul(t0, trans(dx, dy, 0))));
    }

    function render() {
      resize();
      var yawM = rotY(state.yaw);
      var stopperM = stopperMatrix(state.lift);

      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST);
      gl.disable(gl.CULL_FACE);
      /* 瓷器不透明：关混合，只靠深度测试遮挡（内壁也因此能被正确挡住）。
         alpha 仍是 uOpacity(=1)，画布本身的 premultipliedAlpha 不受影响。 */
      gl.disable(gl.BLEND);

      var aspect = state.w / Math.max(1, state.h);
      var EYE = eyeOf();
      var view = lookAt(EYE, AT, [0, 1, 0]);
      var f = fitView(aspect);
      var proj = ortho(f.hw / cam.zoom, f.hh / cam.zoom, 1, 100, opts.tyRef ? opts.tyRef.v : 0);
      var vp = mul(proj, view);

      /* ── 器物 ── */
      gl.useProgram(progMain);
      gl.uniform3fv(U.uKeyDir, KEY);
      /* 与茶模块逐值对齐：茶模块实机标定过这组数（天/地差约 28% 连续渐变），
         改掉原先偏亮的 0.86/0.42/0.32/0.40 —— 那是玻璃档留下来的，套到瓷器上会冲淡釉面。 */
      gl.uniform3f(U.uSky, 0.80, 0.80, 0.80);
      gl.uniform3f(U.uGround, 0.45, 0.45, 0.45);
      gl.uniform1f(U.uAmbient, 0.33);
      gl.uniform1f(U.uKeyK, 0.35);
      gl.uniform1f(U.uGlow, state.glow);
      gl.uniform1f(U.uBodyDim, state.bodyDim);
      gl.uniform1f(U.uLineGlow, state.lineGlow);
      gl.uniform1f(U.uNightK, 1);
      /* 与茶模块同标定：0.35（alpha=0.1225）；0.30 的高光更窄更硬，暗色下像一层塑料膜 */
      gl.uniform1f(U.uRough, 0.35);
      /* 玻璃四色（深/中/浅/冷），逐帧上传一次 */
      gl.uniform3fv(U.uGlassDeep, state.glass.deep);
      gl.uniform3fv(U.uGlassMid, state.glass.mid);
      gl.uniform3fv(U.uGlassLite, state.glass.lite);
      gl.uniform3fv(U.uGlassCool, state.glass.cool);
      /* gain 由 setMaterial 下发并存进 state（不能在这里读 THEME —— 那是 mount() 的
         局部变量，render() 在 GaiwanMount 闭包里，跨函数访问会抛 ReferenceError）。 */
      gl.uniform1f(U.uGlassGain, state.glassGain);
      gl.uniform1f(U.uGlassJade, state.mat === 'jade' ? 1 : 0);
      gl.uniform3fv(U.uEye, EYE);
      /* 窗光环境贴图占 TEXTURE2，暗纹贴图占 TEXTURE1 */
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, envTex);
      gl.uniform1i(U.uEnvTex, 2);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, patTex);
      gl.uniform1i(U.uPattern, 1);
      gl.uniform1f(U.uPatternOn, state.pattern && state.pattern !== 'none' ? 1 : 0);
      gl.uniform1f(U.uFx, state.enhance ? 1 : 0);
      gl.uniform1f(U.uTime, state.elapsed || 0);
      gl.uniform3f(U.uFxPbr, FX_PBR.spec, FX_PBR.coat, FX_PBR.sss);
      gl.uniform1f(U.uEnvK, FX_PBR.env);

      /* 两件都是不透明实体，直接写深度、不需要混合/排序。
         元素：[网格, 模型矩阵, 反照率, 可见, uFxKind, uOpacity, uNightK] */
      /* 瓷塞釉色由 applyTheme 下发（stopperHex：低饱和深釉 + 主题色相），
         不再拿青玉的 deep/mid 直接混 —— 那套权重在亮色下会冲到荧光绿。
         尚未下发时按当前主题现算一次，保证首帧也不掉回旧硬编码色。
         暗金细边在 shader 里按局部 y 叠加。 */
      var STOPPER_GLAZE = state.capGlaze || hex2linArray('#607a70');
      var drawList = [
        [M.vessel, yawM, state.glassColor, 1, 0, 1, 1],
        [M.stopper, mul(yawM, stopperM), STOPPER_GLAZE, 1, 1, 1, 0]
      ];
      for (var i = 0; i < drawList.length; i++) {
        var pc = drawList[i];
        if (pc[3] === 0) continue;
        gl.uniformMatrix4fv(U.uMVP, false, mul(vp, pc[1]));
        gl.uniformMatrix4fv(U.uModel, false, pc[1]);
        gl.uniform3fv(U.uAlbedo, pc[2]);
        gl.uniform1f(U.uFxKind, pc[4]);
        gl.uniform1f(U.uOpacity, pc[5]);
        gl.uniform1f(U.uNightK, pc[6]);
        /* 夜色压暗也要作用到瓷塞，但**留 0.78 的地板**：
           器身可以压到 0.30 只剩裂纹线，瓷塞要是跟着压就黑成一坨。
           小件釉面本来就会接住环境光，稍微亮一点也符合器物关系。 */
        gl.uniform1f(U.uBodyDim, pc[4] < 0.5 ? state.bodyDim : Math.max(0.78, state.bodyDim));
        bindMesh(progMain, pc[0]);
        gl.drawElements(gl.TRIANGLES, pc[0].count, gl.UNSIGNED_SHORT, 0);
      }

      placeVerse(vp);
    }

    /* 上下两行题字：按器物在屏幕上的实际边界（盖顶 2.98 / 托底 -0.40 两圈采样）定位，
       再各取所在空白区的中点 —— 改画幅、拖动视角、整体下移都不会压到器物。 */
    var vTopEl = null, vBotEl = null, vCardEl = null, vCountEl = null, vGearEl = null;
    var vCardLift = -1, CARD_DROP = 0, vTipEl = null;
    /* 两列题字锚定舞台固定比例（与器物解耦）：盖碗由投影 ty 校正到两句正中间 */
    var VERSE_TOP = 0.17, VERSE_BOT = 0.89;
    /* 下联上提量（舞台高比例）：只动文字，器物锚点仍用 VERSE_BOT —— 盖碗与其他元素不动 */
    var VERSE_BOT_LIFT = 0.035;
    /* 盖碗与上联的间距（px）：盖碗挂在「将进酒」正下方（用户红框位）。
       ≥12 可保证上联字号钉在 cap（15px）不变——verseSize 的约束式在 GAP=12 处自洽 */
    var GAIWAN_GAP = 14;
    /* 「吃茶去」离盖碗的间距（px）：30 基础上按用户实测三轮各 +10（共 60）。
       上联侧 GAIWAN_GAP 保持 14 不动 */
    var VERSE_GAP2 = 60;
    function placeVerse(vp) {
      if (!state.w || !state.h) return;
      /* 题字是舞台的子节点；GaiwanMount 拿到的 el 就是舞台本身，故在此取一次并缓存 */
      if (!vTopEl) {
        vTopEl = el.querySelector('.wine-verse.v-top');
        vBotEl = el.querySelector('.wine-verse.v-bot');
        if (!vTopEl || !vBotEl) return;
      }
      var top = Infinity, bot = -Infinity, topVessel = Infinity;
      /* 沿真实车削剖面投点（每点 8 方位角）。旧版只投两个虚拟圆圈——
         盖顶那圈 (y=2.98, r=0.55) 在几何上不存在（钮顶是单点，肩部 r≈0.5 处 y≈2.86），
         测出的器物中心比真实渲染偏高 25px，ty 居中校正被它骗偏。 */
      /* 直接投影真实网格顶点——与渲染逐顶点一致，杜绝任何「剖面/样条/圆周近似」误差。
         freeze 态下 yaw=0、bob=0，model 为单位阵，顶点可直接用 vp 投影；
         自转时车削体旋转对称，包围盒 y 范围不变。 */
      function scanMesh(m, isVessel) {
        var p = m.posArr, bad = 0;
        for (var i = 0; i < p.length; i += 3) {
          var cy = vp[1] * p[i] + vp[5] * p[i+1] + vp[9] * p[i+2] + vp[13];
          if (!isFinite(cy)) { bad++; continue; }
          var sy = (1 - (cy * 0.5 + 0.5)) * state.h;
          if (sy < top) top = sy;
          if (isVessel && sy < topVessel) topVessel = sy;
          if (sy > bot) bot = sy;
        }
      }
      scanMesh(M.vessel, true); scanMesh(M.stopper);
      /* 布局只在「器物屏幕边界 / 画布尺寸」变化时重算：
         下面要读 offsetHeight 强制重排，不能在自转的每一帧都做。 */
      var lk = Math.round(top) + ':' + Math.round(bot) + ':' + state.w + 'x' + state.h + ':' + (opts.tyRef ? opts.tyRef.v.toFixed(4) : '0');
      if (el._vKey === lk) return;
      el._vKey = lk;

      /* 酒气锚点：器物顶缘（拔塞后即瓶口）在舞台内的 y → viewBox 单位（0~100）。
         气缕的局部原点就在瓶口，故整组只做 translate；值只在布局变化时重算。 */
      if (!el.aromaG) el.aromaG = el.querySelector('.wine-aroma');
      if (el.aromaG && isFinite(topVessel)) {
        var mouthU = Math.max(8, Math.min(92, topVessel / state.h * 100 - 0.4));
        if (el._mouthU !== Math.round(mouthU * 10)) {
          el._mouthU = Math.round(mouthU * 10);
          el.aromaG.setAttribute('transform', 'translate(50 ' + mouthU.toFixed(1) + ')');
        }
      }

      /* 两列同号，取两者都能容下的较小值。
         列是中心锚定（VERSE_TOP/VERSE_BOT-LIFT），约束是「列底/列顶不越器物 ±8px」：
         上联半高 ≤ 器物顶 - 8 - 0.17H；下联半高 ≤ (VERSE_BOT-LIFT)H - 8 - 器物底。
         verseSize(gap) 的 gap 传「2×可用半高」以复用原公式。 */
      var fs = Math.min(
        verseSize(2 * (top - 8 - state.h * VERSE_TOP), vTopEl),
        verseSize(2 * (state.h * (VERSE_BOT - VERSE_BOT_LIFT) - 8 - bot), vBotEl));
      [vTopEl, vBotEl].forEach(function (nd) { nd.style.fontSize = fs.toFixed(1) + 'px'; });
      vTopEl.style.visibility = top > 24 ? '' : 'hidden';
      vBotEl.style.visibility = (state.h - bot) > 24 ? '' : 'hidden';

      /* 文案与器物解耦（用户要求）：两列题字锚定舞台固定比例、绝不随器物移动；
         盖碗则由投影 ty 偏移校正到两句的正中间（见下方 ty 修正）。
         比例取自长期构图的实际测量（上联中心约 13.5%、下联约 71% 舞台高）。 */
      var stR = el.getBoundingClientRect();
      var vhT = vTopEl.offsetHeight || 0;
      var vhB = vBotEl.offsetHeight || 0;
      var yTop = Math.round(state.h * VERSE_TOP);
      /* yBot = 老锚点（舞台 85.5%）：录茶列/卡片等下游布局仍挂它，位置不变 */
      var yBot = Math.round(state.h * (VERSE_BOT - VERSE_BOT_LIFT));
      /* 「吃茶去」视觉位（黄框）：挂盖碗正下方，封顶老锚点（矮画幅装不下就不上移） */
      var yBotV = Math.min(Math.round(bot + VERSE_GAP2 + vhB / 2), yBot);

      if (el._vTop !== yTop) { el._vTop = yTop; vTopEl.style.top = yTop + 'px'; }
      if (el._vBot !== yBotV) { el._vBot = yBotV; vBotEl.style.top = yBotV + 'px'; }

      /* 盖碗位置校正：屏幕位移与 ty 线性（Δpx = -Δty × state.h / 2），
         一次闭式修正即可命中；ty 变化后失效缓存，下一帧复测确认。 */
      if (opts.tyRef) {
        /* 盖碗挂在「将进酒」正下方：目标中心 = 上联底 + GAP + 半个器物高。
           器物像素高随画布宽（非舞台高）缩放，比例锚定会让它相对上联漂移，
           所以用「贴上联」锚定。矮画幅两句间装不下时退回两句居中，避免压字。 */
        var gH = bot - top;
        var want = yTop + vhT / 2 + GAIWAN_GAP + gH / 2;
        var cap = yBotV - vhB / 2 - 8 - gH / 2;
        var mid = cap >= want ? want : (yTop + yBotV) / 2, vc = (top + bot) / 2;
        if (Math.abs(mid - vc) > 0.5) {
          opts.tyRef.v = Math.max(-0.25, Math.min(0.25, opts.tyRef.v - 2 * (mid - vc) / state.h));
          el._vKey = '';
        }
      }

      if (!vTipEl) vTipEl = el.parentNode && el.parentNode.querySelector('.wine-tip');
      if (!vCountEl) vCountEl = el.querySelector('.wine-count');
      var vR = vBotEl.getBoundingClientRect();
      if (!vTipEl) vTipEl = el.parentNode && el.parentNode.querySelector('.wine-tip');
      var tipTop = vTipEl ? (vTipEl.getBoundingClientRect().top - stR.top) : state.h;
      /* 数量列挂「吃茶去」当前视觉位（yBotV）：居中于题字与工具行之间的空白（用户红框位） */
      var from = yBotV + vhB / 2 + 24;

      /* 「录茶六十」与设置按钮同处下题字与页脚之间，单独给谁一个固定偏移都会互相压。
         所以把两者当成一组：总高 = 数量 + 间距 + 按钮，整体在这段空白里居中。 */
      if (!vGearEl) vGearEl = el.querySelector('.wine-tools');
      var cntH = vCountEl ? vCountEl.offsetHeight : 0;
      var gearH = vGearEl ? vGearEl.offsetHeight : 0;

      /* 工具行锚在页脚之上（竖排后它变高了，不能再和数量挤在一起算整组），
         数量则在上方剩余空间里居中；空间不足就隐藏数量。 */
      var toolsTop = Math.round(tipTop - 8 - gearH);
      if (vGearEl) vGearEl.style.top = toolsTop + 'px';

      if (vCountEl) {
        var bandTop = from, bandBot = toolsTop - 8, bandH = bandBot - bandTop;
        /* 竖排工具行占位变高后，数量列容易放不下 —— 先按可用高度缩字号（9~15px），
           实在不行才隐藏，避免在不该消失的画幅上直接消失。 */
        var cn = (vCountEl.textContent || '').length || 1;
        var fsC = Math.max(9, Math.min(15, (bandH - 6) / (cn * 1.3)));
        vCountEl.style.fontSize = fsC.toFixed(1) + 'px';
        cntH = vCountEl.offsetHeight || 0;
        if (bandH >= cntH + 4) {
          vCountEl.style.visibility = '';
          vCountEl.style.top = Math.round(bandTop + bandH / 2) + 'px';   /* translateY(-50%)：top 是中心 */
        } else vCountEl.style.visibility = 'hidden';
      }

      if (!vCardEl) vCardEl = el.parentNode && el.parentNode.querySelector('.wine-card');
      if (vCardEl) {
        /* 一次性算出目标位置再写入，不做「先写后量再改」——那种写法在小画幅下会读到旧值。
           基准：卡片与录茶列共用同一条带（吃茶去↔工具行空白），且**带心对齐**——
           卡片中心 = 带心（录茶列居中处），这样它落在「录茶七十二所在区域」而非带顶。
           CARD_DROP（默认 0）：在带心基础上再下压的量（正 = 更靠下）。
           上限：文案最后一行不能压到页脚，留 8px。 */
        var cR = vCardEl.getBoundingClientRect();
        var curOff = parseFloat(vCardEl.style.top || '0') || 0;
        var flowTop = cR.top - curOff;                       // 不受 top 影响的布局位置
        var tipEl = vTipEl;
        /* 居中要用卡片「盒子实际高度」而非文案内容高度：开盖前卡片空、内容高≈0，
           但盒子有 min-height，单凭内容高居中会算飞。开盖后内容填满，盒子高即内容高。 */
        var boxH = vCardEl.offsetHeight || 0;

        /* 与录茶列同带：带顶 = 吃茶去底 + 24，带底 = 工具行顶 - 8；卡片中心对齐带心 */
        var bandTopC = yBotV + vhB / 2 + 24;
        var bandBotC = toolsTop - 8;
        var bandCenter = (bandTopC + bandBotC) / 2;
        var want = Math.round(stR.top + bandCenter - boxH / 2 + CARD_DROP);   // 期望的视觉顶（中心对齐录茶列带心）
        if (tipEl && boxH > 0) {
          var cap = Math.round(tipEl.getBoundingClientRect().top - 2 - boxH);
          if (want > cap) want = cap;
        }
        var off = want - Math.round(flowTop);
        if (off !== vCardLift) { vCardLift = off; vCardEl.style.top = off + 'px'; }
      }
    }

    /* 竖排后元素高度 = 字数 × 行距；空白区小时必须缩字号，否则会顶出画布 */
    function verseSize(gap, node) {
      var n = (node.textContent || '').length || 1;
      return Math.max(8, Math.min(15, (gap - 8) / (n * 1.18)));
    }

    function loop(ts) {
      if (!state.alive) return;
      var dt = state.last ? Math.min((ts - state.last) / 1000, 0.05) : 0;
      state.last = ts;
      var k = 1 - Math.pow(0.95, dt * 60);      // 与 OrbitControls dampingFactor .05 等价
      var camMoved = false;
      if (Math.abs(cam.tAzim - cam.azim) > 1e-4) { cam.azim += (cam.tAzim - cam.azim) * k; camMoved = true; }
      if (Math.abs(cam.tPolar - cam.polar) > 1e-4) { cam.polar += (cam.tPolar - cam.polar) * k; camMoved = true; }
      if (Math.abs(cam.tZoom - cam.zoom) > 1e-4) { cam.zoom += (cam.tZoom - cam.zoom) * k; camMoved = true; }
      var spun = false;
      if (state.spinMode !== 'off') {
        state.elapsed = (state.elapsed || 0) + dt;
        if (state.spinMode === 'yaw') {
          // 原地自转：器物绕自身竖轴，仅冰裂纹理与浮叶可见（回转体几何决定）
          state.yaw = state.elapsed * ROT_SPEED;
          state.bob = Math.sin(state.elapsed * 1.5) * 0.010;
          spun = true;
        } else if (!state.autoPaused) {
          // 环绕：相机绕器物巡视，俯仰角正弦摆动（拖拽时暂停，见 setAutoPaused）
          state.polarPhase += dt * POLAR_FREQ;
          cam.tAzim += dt * AZIM_SPEED;
          cam.tPolar = POLAR_MID + Math.sin(state.polarPhase) * POLAR_AMP;
          spun = true;
        }
      }
      if (camMoved || spun) render();
      if (camMoved && opts.onView) {
        try { opts.onView(metrics()); } catch (e) { /* 命中区更新失败不影响画面 */ }
      }
      state.raf = requestAnimationFrame(loop);
    }

    resize();
    render();
    if (state.spinMode !== 'off') state.raf = requestAnimationFrame(loop);

    /** 供 UI 层定位命中区：盖子在画布里的归一化矩形 + 世界单位↔CSS 像素 */
    function metrics() {
      var aspect = state.w / Math.max(1, state.h);
      var f = fitView(aspect);
      var vp = mul(ortho(f.hw / cam.zoom, f.hh / cam.zoom, 1, 100, opts.tyRef ? opts.tyRef.v : 0), lookAt(eyeOf(), AT, [0, 1, 0]));
      /* 盖子是个圆柱（半径 1.92、y 1.84..2.98），要取圆周的极值而不是包围盒的角点 ——
         角点会把横向范围放大 √2 倍。 */
      var xs = [], ys = [];
      for (var i = 0; i < 24; i++) {
        var a = i / 24 * Math.PI * 2;
        for (var k = 0; k < 2; k++) {
          var X = Math.sin(a) * 1.92, Z = Math.cos(a) * 1.92, Y = k ? 2.98 : 1.84;
          var cx = vp[0] * X + vp[4] * Y + vp[8] * Z + vp[12];
          var cy = vp[1] * X + vp[5] * Y + vp[9] * Z + vp[13];
          xs.push(cx * 0.5 + 0.5); ys.push(cy * 0.5 + 0.5);
        }
      }
      var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs);
      var y0 = 1 - Math.max.apply(null, ys), y1 = 1 - Math.min.apply(null, ys);
      return {
        pxPerWorldY: state.h / (2 * f.hh),
        lid: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
      };
    }

    return {
      canvas: canvas,
      render: render,
      metrics: metrics,
      setLift: function (v) { state.lift = Math.max(0, Math.min(1, v)); if (state.spinMode === 'off') render(); },
      /** 设置纹样：'none' | 'bamboo' | 'blue' | 'crackle' */
      setPattern: function (kind) {
        state.pattern = PATTERNS.indexOf(kind) >= 0 ? kind : 'none';
        if (state.pattern !== 'none') {
          var cv = makePatternCanvas(state.pattern);
          gl.bindTexture(gl.TEXTURE_2D, patTex);
          gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cv);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
          // v 方向必须能越过 1 继续铺（口沿之后的弧长），贴图本身就是四方连续的
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
          gl.generateMipmap(gl.TEXTURE_2D);
        }
        render();
      },
      /** 屏幕坐标（CSS px，相对画布左上）拾取：0 空 / 1 茶托 / 2 碗身 / 3 碗盖 / 4 茶汤 */
      pick: function (cssX, cssY) {
        if (!state.w || !state.h) return 0;
        resize();
        var ndcX = (cssX / state.w) * 2 - 1;
        var ndcY = 1 - (cssY / state.h) * 2;
        var aspect = state.w / Math.max(1, state.h);
        var f = fitView(aspect);
        var vp = mul(ortho(f.hw / cam.zoom, f.hh / cam.zoom, 1, 100, opts.tyRef ? opts.tyRef.v : 0), lookAt(eyeOf(), AT, [0, 1, 0]));
        var shift = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -ndcX, -ndcY, 0, 1]);
        var mvp = mul(shift, vp);
        var yawM = rotY(state.yaw), stopperM = stopperMatrix(state.lift);

        gl.bindFramebuffer(gl.FRAMEBUFFER, pickFb);
        gl.viewport(0, 0, 1, 1);
        gl.disable(gl.BLEND);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.enable(gl.DEPTH_TEST);
        gl.disable(gl.CULL_FACE);
        gl.useProgram(progPick);
        /* id 沿用茶模块语义：2=葫芦身（拖动/轨道） 3=瓶塞（拔塞换酒） */
        var list = [[M.vessel, yawM, 2], [M.stopper, mul(yawM, stopperM), 3]];
        for (var i = 0; i < list.length; i++) {
          gl.uniformMatrix4fv(gl.getUniformLocation(progPick, 'uMVP'), false, mul(mvp, list[i][1]));
          gl.uniform1f(gl.getUniformLocation(progPick, 'uId'), list[i][2]);
          bindMesh(progPick, list[i][0]);
          gl.drawElements(gl.TRIANGLES, list[i][0].count, gl.UNSIGNED_SHORT, 0);
        }
        var px = new Uint8Array(4);
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, canvas.width, canvas.height);
        return px[0];
      },
      /* 水平拖 = 方位角（对称体几乎看不见），垂直拖 = 俯仰（这才是「转起来」的观感） */
      orbitBy: function (dxPx, dyPx) {
        cam.tAzim -= dxPx * 0.0060;
        cam.tPolar = Math.max(POLAR_MIN, Math.min(POLAR_MAX, cam.tPolar - dyPx * 0.0060));
      },
      zoomBy: function (factor) {
        cam.tZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, cam.tZoom * factor));
      },
      view: function () { return { azim: cam.azim, polar: cam.polar, zoom: cam.zoom }; },
      /** 酒色：随酒款变，瓶内酒液实时换色 */
      /** 酒色：只用于详情卡的色点，**不参与渲染** —— 葫芦是实心观感的青瓷，看不见内里。
       *  保留 API 以免 UI 侧改动；刻意不触发重绘（换酒时画面不该有任何变化）。 */
      setWineColor: function (hex) {
        state.wineColor = hex2linArray(hex);
      },
      /** 气泡已不建模（酒体不可见），保留空实现兼容既有调用点 */
      setBubbleColor: function () { /* noop */ },
      /* 夜色效果：glow 周身微光 / bodyDim 器身压暗（青瓷没有「裂纹发光」这一档） */
      setNightFx: function (o) {
        o = o || {};
        state.glow = +o.glow || 0;
        state.bodyDim = (o.bodyDim == null) ? 1 : +o.bodyDim;
        /* 裂纹自发光：早先注释误判「青瓷没有这一档」而整条删掉，
           结果夜色=裂纹时器身压暗成纯黑、却没有纹光补偿 → 全黑剪影。 */
        state.lineGlow = +o.lineGlow || 0;
        if (state.spinMode === 'off') render();
      },
      /** 玻璃基色（沿用茶模块 setPorcelain 通道） */
      setPorcelain: function (hex) {
        state.glassColor = hex2linArray(hex);
        render();
      },
      /** 瓷塞釉色：低饱和深釉，随主题色相（见 stopperHex） */
      setStopper: function (hex) {
        state.capGlaze = hex2linArray(hex);
        render();
      },
      /** 釉面四色：由主题派生，deep/mid/lite/cool 四个 hex。
       *  mode = 'porcelain' 粉青（默认） / 'jade' 深青（整体压深一档，高光仍留）。 */
      setMaterial: function (mode, glass, gain) {
        state.mat = mode === 'jade' ? 'jade' : 'porcelain';
        if (glass) {
          state.glass = {
            deep: hex2linArray(glass.deep), mid: hex2linArray(glass.mid),
            lite: hex2linArray(glass.lite), cool: hex2linArray(glass.cool)
          };
        }
        if (typeof gain === 'number' && gain > 0) state.glassGain = gain;
        render();
      },
      /** P0 质感档开关：关掉即把 uFx 归零，瓷器/合盖逐像素回到 three 原稿基线 */
      setEnhance: function (on) { state.enhance = !!on; render(); },
      setSpinMode: function (mode) {
        state.spinMode = (mode === 'yaw' || mode === 'orbit') ? mode : 'off';
        if (state.spinMode !== 'off') { state.last = 0; if (!state.raf) state.raf = requestAnimationFrame(loop); }
        else if (state.raf) { cancelAnimationFrame(state.raf); state.raf = 0; render(); }
      },
      /* 环绕模式下用户按住拖拽时暂停自动巡视（转盘语义：放下即继续），原地/关闭模式忽略 */
      setAutoPaused: function (v) { state.autoPaused = !!v; },
      pause: function () { if (state.raf) { cancelAnimationFrame(state.raf); state.raf = 0; } },
      resume: function () {
        if (state.spinMode !== 'off' && !state.raf && state.alive) { state.last = 0; state.raf = requestAnimationFrame(loop); }
      },
      dispose: function () {
        state.alive = false;
        if (state.raf) cancelAnimationFrame(state.raf);
        Object.keys(M).forEach(function (k) {
          var m = M[k];
          gl.deleteBuffer(m.pos); gl.deleteBuffer(m.nrm); gl.deleteBuffer(m.idx);
          if (m.nrmHard) gl.deleteBuffer(m.nrmHard);
          if (m.uv) gl.deleteBuffer(m.uv);
        });
        gl.deleteTexture(patTex);
        gl.deleteTexture(envTex);
        gl.deleteProgram(progMain);
        var lose = gl.getExtension('WEBGL_lose_context');
        if (lose) lose.loseContext();
        if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
      }
    };
  }

  /* ══════════════════════ 酒 ══════════════════════ */
  /* 字段对齐茶数据：n 酒名 / t 酒类 / o 产地 / s 一句酒语 / c 酒色 /
     lf 气泡色 / w 酒精度 / d 适饮温度 / l 香型或工艺
     共 70 款：白酒 31 / 黄酒 11 / 啤酒 9 / 葡萄酒 5 / 米酒 3 / 果酒 3 / 露酒 3 / 洋酒 5
     w 一律取该款商品标签/官方参数/国抽数据/团体标准的标称值，不取「度」的俗称估值 */
  var TEAS = [
    { id: 'w01', n: '茅台', t: '白酒', o: '贵州·仁怀', s: '酱香一曲，国酒无言。', c: '#f2e6c0', lf: '#fff6d8', w: 53, d: '常温', l: '酱香型' },
    { id: 'w02', n: '五粮液', t: '白酒', o: '四川·宜宾', s: '五粮同酿，香气先至。', c: '#f4ead0', lf: '#fff8e2', w: 52, d: '常温', l: '浓香型' },
    { id: 'w03', n: '国窖1573', t: '白酒', o: '四川·泸州', s: '四百年的窖，一口就懂。', c: '#f0e2ba', lf: '#fdf3d4', w: 52, d: '常温', l: '浓香型' },
    { id: 'w04', n: '汾酒青花20', t: '白酒', o: '山西·汾阳', s: '一清到底，杏花村里。', c: '#f6efd8', lf: '#fffaec', w: 53, d: '常温', l: '清香型' },
    { id: 'w05', n: '剑南春水晶剑', t: '白酒', o: '四川·绵竹', s: '唐时宫廷，今在杯中。', c: '#f3e7c6', lf: '#fef6dc', w: 52, d: '常温', l: '浓香型' },
    { id: 'w06', n: '古井贡古20', t: '白酒', o: '安徽·亳州', s: '井水酿出的桃花香。', c: '#f5ecd2', lf: '#fff8e6', w: 50, d: '常温', l: '浓香型' },
    { id: 'w07', n: '洋河海之蓝', t: '白酒', o: '江苏·宿迁', s: '一片海，装进一杯里。', c: '#eef0da', lf: '#fcfdf0', w: 42, d: '常温', l: '浓香型' },
    { id: 'w08', n: '梦之蓝M6+', t: '白酒', o: '江苏·宿迁', s: '梦是要醉一场才圆的。', c: '#e9eef0', lf: '#f7fbfd', w: 52, d: '常温', l: '浓香型' },
    { id: 'w09', n: '国缘四开', t: '白酒', o: '江苏·淮安', s: '缘起一杯，四开为礼。', c: '#f2e9cd', lf: '#fdf7e2', w: 42, d: '常温', l: '幽雅醇厚型' },
    { id: 'w10', n: '舍得品味', t: '白酒', o: '四川·射洪', s: '舍得之间，酒已三巡。', c: '#f0e5c2', lf: '#fbf3d8', w: 52, d: '常温', l: '浓香型' },
    { id: 'w11', n: '水井坊井台', t: '白酒', o: '四川·成都', s: '井台之上，六百年的水。', c: '#f4e9c9', lf: '#fef8e0', w: 52, d: '常温', l: '浓香型' },
    { id: 'w12', n: '青花郎', t: '白酒', o: '四川·古蔺', s: '赤水河边，青花一坛。', c: '#efe3c0', lf: '#fbf2d6', w: 53, d: '常温', l: '酱香型' },
    { id: 'w13', n: '君品习酒', t: '白酒', o: '贵州·习水', s: '君子之品，赤水之酿。', c: '#f1e6c6', lf: '#fdf6de', w: 53, d: '常温', l: '酱香型' },
    { id: 'w14', n: '国台国标', t: '白酒', o: '贵州·茅台镇', s: '同一条河，另一种酱香。', c: '#efe2bd', lf: '#fcf3d4', w: 53, d: '常温', l: '酱香型' },
    { id: 'w15', n: '珍酒十五', t: '白酒', o: '贵州·遵义', s: '十五年，等一口酱香。', c: '#f2e7c8', lf: '#fdf6dd', w: 53, d: '常温', l: '酱香型' },
    { id: 'w16', n: '红西凤', t: '白酒', o: '陕西·宝鸡', s: '一口三香，凤鸣雍城。', c: '#f1e4bd', lf: '#fdf4d8', w: 52, d: '常温', l: '凤香型' },
    { id: 'w17', n: '董酒佰草香', t: '白酒', o: '贵州·遵义', s: '百草入曲，酒里带药香。', c: '#eee2c2', lf: '#faf2d8', w: 54, d: '常温', l: '董香型' },
    { id: 'w18', n: '酒鬼内参', t: '白酒', o: '湖南·吉首', s: '湘西的野，藏在内参里。', c: '#f3e8ca', lf: '#fef7df', w: 52, d: '常温', l: '馥郁香型' },
    { id: 'w19', n: '老白干古法20', t: '白酒', o: '河北·衡水', s: '六十七度，烈得坦荡。', c: '#f7f1dc', lf: '#fffbf0', w: 67, d: '常温', l: '老白干香型' },
    { id: 'w20', n: '桂林三花', t: '白酒', o: '广西·桂林', s: '三花一嗅，米香温柔。', c: '#f7f0dc', lf: '#fffaf0', w: 52, d: '常温', l: '米香型' },
    { id: 'w21', n: '玉冰烧', t: '白酒', o: '广东·佛山', s: '一块肥肉，酿出清冽。', c: '#f6eeda', lf: '#fff9ee', w: 29, d: '常温', l: '豉香型' },
    { id: 'w22', n: '口子窖兼20', t: '白酒', o: '安徽·淮北', s: '兼得众香，才算口子。', c: '#f2e6c4', lf: '#fdf5dc', w: 50, d: '常温', l: '兼香型' },
    { id: 'w23', n: '四特国韵', t: '白酒', o: '江西·樟树', s: '一口三型，樟树有特。', c: '#f3e8c8', lf: '#fdf6de', w: 52, d: '常温', l: '特香型' },
    { id: 'w24', n: '一品景芝', t: '白酒', o: '山东·安丘', s: '一股芝麻香，山东的偏方。', c: '#f5ecd0', lf: '#fff8e4', w: 53, d: '常温', l: '芝麻香型' },
    { id: 'w25', n: '白云边十五年', t: '白酒', o: '湖北·松滋', s: '买酒白云边，诗里那口。', c: '#f1e5c1', lf: '#fcf4da', w: 42, d: '常温', l: '兼香型' },
    { id: 'w26', n: '牛栏山陈酿', t: '白酒', o: '北京·顺义', s: '便宜的那口，最像日子。', c: '#f6eedb', lf: '#fef9ec', w: 42, d: '常温', l: '浓香型' },
    { id: 'w27', n: '红星二锅头', t: '白酒', o: '北京·怀柔', s: '二锅头一开，北京话就多了。', c: '#f7f1de', lf: '#fffbf2', w: 56, d: '常温', l: '清香型' },
    { id: 'w28', n: '江小白', t: '白酒', o: '重庆·江津', s: '一瓶小酒，把话说明白。', c: '#f5eedc', lf: '#fffaf0', w: 40, d: '常温', l: '小曲清香' },
    { id: 'w29', n: '汾酒玻汾', t: '白酒', o: '山西·汾阳', s: '光瓶无饰，清香有底。', c: '#f6f0da', lf: '#fffaee', w: 53, d: '常温', l: '清香型' },
    { id: 'w30', n: '泸州老窖特曲', t: '白酒', o: '四川·泸州', s: '老窖池边，特曲先香。', c: '#f0e3bc', lf: '#fdf4d5', w: 52, d: '常温', l: '浓香型' },
    { id: 'w31', n: '天之蓝', t: '白酒', o: '江苏·宿迁', s: '天蓝一瓶，席间常见。', c: '#eaf0f4', lf: '#f8fcff', w: 46, d: '常温', l: '浓香型' },
    { id: 'w32', n: '绍兴黄酒', t: '黄酒', o: '浙江·绍兴', s: '温一壶旧时光。', c: '#c98b3c', lf: '#e8bd72', w: 15, d: '温饮', l: '半干型' },
    { id: 'w33', n: '女儿红六年陈', t: '黄酒', o: '浙江·绍兴', s: '埋下那坛，等她出嫁。', c: '#c07a35', lf: '#e2ad66', w: 14, d: '温饮', l: '半干型' },
    { id: 'w34', n: '加饭酒', t: '黄酒', o: '浙江·绍兴', s: '饭加一倍，醇厚一倍。', c: '#b8762e', lf: '#dba55e', w: 16, d: '温饮', l: '半干型' },
    { id: 'w35', n: '善酿酒', t: '黄酒', o: '浙江·绍兴', s: '以酒代水，甜里藏劲。', c: '#b36a30', lf: '#d79f60', w: 15, d: '温饮', l: '半甜型' },
    { id: 'w36', n: '古越龙山花雕', t: '黄酒', o: '浙江·绍兴', s: '三年陈，雕花坛里等。', c: '#c68a3e', lf: '#e6bb74', w: 16, d: '温饮', l: '半干型' },
    { id: 'w37', n: '会稽山五年陈', t: '黄酒', o: '浙江·绍兴', s: '五年光阴，鉴湖水。', c: '#bf8038', lf: '#dfae6a', w: 14, d: '温饮', l: '半干型' },
    { id: 'w38', n: '塔牌手工冬酿', t: '黄酒', o: '浙江·绍兴', s: '冬酿一缸，春天才醒。', c: '#c4863a', lf: '#e3b570', w: 15, d: '温饮', l: '半干型' },
    { id: 'w39', n: '即墨老酒', t: '黄酒', o: '山东·青岛', s: '焦香一缕，北方黄酒。', c: '#8e4326', lf: '#bb7248', w: 11.5, d: '温饮', l: '焦香型' },
    { id: 'w40', n: '和酒大开福', t: '黄酒', o: '上海·金山', s: '上海人家的暖杯。', c: '#c98e42', lf: '#e8c07c', w: 12.5, d: '温饮', l: '半干型' },
    { id: 'w41', n: '沙洲优黄', t: '黄酒', o: '江苏·张家港', s: '江南的甜，半干收尾。', c: '#c48a3a', lf: '#e4b872', w: 12, d: '温饮', l: '半干型' },
    { id: 'w42', n: '福建老酒', t: '黄酒', o: '福建·福州', s: '红曲一坛，闽江的暖。', c: '#a35a2a', lf: '#cf8a58', w: 13, d: '温饮', l: '红曲半干' },
    { id: 'w43', n: '青岛1903', t: '啤酒', o: '山东·青岛', s: '海风里的第一口清爽。', c: '#e8b93c', lf: '#ffe28a', w: 4, d: '8℃', l: '经典拉格' },
    { id: 'w44', n: '雪花勇闯', t: '啤酒', o: '辽宁·沈阳', s: '漫天一白，泡沫如雪。', c: '#edc245', lf: '#ffeb9c', w: 2.5, d: '8℃', l: '淡爽拉格' },
    { id: 'w45', n: '燕京U8', t: '啤酒', o: '北京·顺义', s: '京城夏夜的那一扎。', c: '#e6b235', lf: '#fde480', w: 2.5, d: '8℃', l: '小度特酿' },
    { id: 'w46', n: '哈尔滨冰纯', t: '啤酒', o: '黑龙江·哈尔滨', s: '百年冰城，麦香不冻。', c: '#e9b840', lf: '#ffe690', w: 3.6, d: '8℃', l: '淡爽拉格' },
    { id: 'w47', n: '珠江纯生', t: '啤酒', o: '广东·广州', s: '岭南湿热，全靠这一杯。', c: '#e7b63e', lf: '#ffe488', w: 3.6, d: '8℃', l: '纯生拉格' },
    { id: 'w48', n: '红乌苏', t: '啤酒', o: '新疆·乌鲁木齐', s: '大乌苏一瓶，话就多了。', c: '#dfa933', lf: '#f9d97e', w: 4, d: '8℃', l: '烈性拉格' },
    { id: 'w49', n: '百威', t: '啤酒', o: '湖北·武汉', s: '百威一开，夜才开场。', c: '#e4b13a', lf: '#fbdf86', w: 3.6, d: '8℃', l: '美式拉格' },
    { id: 'w50', n: '喜力经典', t: '啤酒', o: '浙江·嘉善', s: '绿瓶一开，苦得干脆。', c: '#e0ae36', lf: '#f7d97f', w: 5, d: '8℃', l: '全麦拉格' },
    { id: 'w51', n: '科罗娜', t: '啤酒', o: '墨西哥·墨西哥城', s: '塞一角青柠，海就到了。', c: '#eed07a', lf: '#faeda8', w: 4.5, d: '6℃', l: '墨西哥拉格' },
    { id: 'w52', n: '长城五星', t: '葡萄酒', o: '河北·沙城', s: '东方的坡地，西方的酿法。', c: '#7a2434', lf: '#b8626c', w: 13.5, d: '16℃', l: '干红' },
    { id: 'w53', n: '张裕解百纳', t: '葡萄酒', o: '山东·烟台', s: '百年老窖，葡萄的东方。', c: '#6e1f2e', lf: '#a85460', w: 13, d: '16℃', l: '干红' },
    { id: 'w54', n: '王朝干白', t: '葡萄酒', o: '天津·滨海', s: '浅金一杯，海风微酸。', c: '#d9c169', lf: '#f2e39a', w: 12, d: '10℃', l: '半干白' },
    { id: 'w55', n: '宁夏贺兰红', t: '葡萄酒', o: '宁夏·贺兰山东麓', s: '戈壁日照，酿出中国味。', c: '#73202f', lf: '#ac525f', w: 15, d: '16℃', l: '干红' },
    { id: 'w56', n: '黄金冰谷冰酒', t: '葡萄酒', o: '辽宁·本溪', s: '冻过葡萄，甜得更清醒。', c: '#d9a344', lf: '#f2cd80', w: 11, d: '8℃', l: '冰酒' },
    { id: 'w57', n: '孝感米酒', t: '米酒', o: '湖北·孝感', s: '一碗甜，暖到心口。', c: '#f4ecd4', lf: '#fff9e8', w: 0.5, d: '温饮', l: '米酒饮品' },
    { id: 'w58', n: '客家娘酒', t: '米酒', o: '广东·梅州', s: '火炙过的娘酒，最暖。', c: '#a5522a', lf: '#cd8352', w: 16, d: '温饮', l: '甜型黄酒' },
    { id: 'w59', n: '苏州冬酿酒', t: '米酒', o: '江苏·苏州', s: '冬至那夜，只饮这一口。', c: '#e8cf82', lf: '#f9e9ac', w: 3, d: '常温', l: '桂花酿' },
    { id: 'w60', n: '梅见青梅酒', t: '果酒', o: '重庆·江津', s: '青梅煮酒，等一场雨。', c: '#c8a648', lf: '#e8cf7c', w: 12, d: '10℃', l: '浸泡型' },
    { id: 'w61', n: '荔枝酒', t: '果酒', o: '广东·茂名', s: '一颗荔枝，醉了一季。', c: '#d99a68', lf: '#f0c39c', w: 12, d: '10℃', l: '发酵型' },
    { id: 'w62', n: 'RIO微醺', t: '果酒', o: '上海', s: '三度的微醺，刚够说话。', c: '#e8b0b8', lf: '#f8d6dc', w: 3, d: '6℃', l: '预调酒' },
    { id: 'w63', n: '竹叶青', t: '露酒', o: '山西·汾阳', s: '竹叶入酒，绿到杯底。', c: '#d6cc86', lf: '#f0ebc0', w: 38, d: '常温', l: '配制露酒' },
    { id: 'w64', n: '劲酒', t: '露酒', o: '湖北·大冶', s: '一小杯，敬身子。', c: '#a8452c', lf: '#cd7f5c', w: 35, d: '常温', l: '配制露酒' },
    { id: 'w65', n: '桂花陈酒', t: '露酒', o: '北京', s: '桂花落在旧年的酒里。', c: '#d4a63f', lf: '#f0cd8a', w: 15, d: '常温', l: '加香葡萄酒' },
    { id: 'w66', n: '尊尼获加黑牌', t: '洋酒', o: '英国·苏格兰', s: '黑牌一倒，烟熏先到。', c: '#b06a2a', lf: '#d6994f', w: 40, d: '常温', l: '调和威士忌' },
    { id: 'w67', n: '芝华士12年', t: '洋酒', o: '英国·苏格兰', s: '十二年，换一杯柔。', c: '#c07a2e', lf: '#e0a662', w: 40, d: '常温', l: '调和威士忌' },
    { id: 'w68', n: '轩尼诗VSOP', t: '洋酒', o: '法国·干邑', s: '干邑一滴，饭局升格。', c: '#8a4a1e', lf: '#bf8147', w: 40, d: '常温', l: '干邑白兰地' },
    { id: 'w69', n: '绝对伏特加', t: '洋酒', o: '瑞典·奥胡斯', s: '透明到没有脾气。', c: '#eef2f4', lf: '#fbfdfe', w: 40, d: '冰镇', l: '伏特加' },
    { id: 'w70', n: '獭祭45', t: '洋酒', o: '日本·山口', s: '精米四成五，清得见底。', c: '#f2f0e2', lf: '#fdfcf4', w: 16, d: '10℃', l: '纯米大吟酿' }
  ];
  var TYPES = ['白酒', '黄酒', '啤酒', '葡萄酒', '米酒', '果酒', '露酒', '洋酒'];
  var PATTERNS = ['none', 'crackle'];
  var PATTERN_NAMES = { none: '素瓷', crackle: '冰裂' };
  var MAT_NAMES = { porcelain: '粉青', jade: '深青' };
  var SPIN_NAMES = { off: '自转已关', yaw: '原地自转', orbit: '环绕自转' };

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  /* 阿拉伯数字转中文（0~999），供「录茶六十」这类竖排题字用 */
  function cnNum(n) {
    var d = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
    if (n < 10) return d[n];
    if (n < 20) return '十' + (n % 10 ? d[n % 10] : '');
    if (n < 100) return d[Math.floor(n / 10)] + '十' + (n % 10 ? d[n % 10] : '');
    if (n < 1000) {
      var h = Math.floor(n / 100), r = n % 100;
      return d[h] + '百' + (r === 0 ? '' : (r < 10 ? '零' + d[r] : cnNum(r)));
    }
    return String(n);
  }

  /* 夜色效果上限：强度滑杆 × 上限。玻璃没有裂纹，只留周身微光与器身压暗。 */
  var GLOW_MAX = 0.18;
  var DIM_MAX = 0.30;
  /* 裂纹自发光上限（与茶模块同值）：夜色=裂纹、强度 100% 时纹线能亮到 1.70，
     压过被压暗的器身，才读得出「满身开片在发光」。 */
  var LINE_MAX = 1.70;
  var GEAR_GAP = 14;      // 数量列底边到设置按钮顶边的间距

  /** h∈[0,360) s,l∈[0,100] → #rrggbb */
  function hslToHex(h, s, l) {
    h = ((h % 360) + 360) % 360;
    s = clamp(s, 0, 100) / 100;
    l = clamp(l, 0, 100) / 100;
    var c = (1 - Math.abs(2 * l - 1)) * s;
    var x = c * (1 - Math.abs((h / 60) % 2 - 1));
    var m = l - c / 2, r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; } else if (h < 120) { r = x; g = c; }
    else if (h < 180) { g = c; b = x; } else if (h < 240) { g = x; b = c; }
    else if (h < 300) { r = x; b = c; } else { r = c; b = x; }
    function q(v) { return Math.round(clamp((v + m) * 255, 0, 255)); }
    return '#' + ((1 << 24) + (q(r) << 16) + (q(g) << 8) + q(b)).toString(16).slice(1);
  }

  /* 注意：这里不能用 mount() 内部的 THEME —— 本函数在模块顶层，够不着。
     按参数取色，调用方把当前主题传进来。 */
  function mixHue(a, b, t) {
    var d = ((b - a) % 360 + 540) % 360 - 180;
    return ((a + d * t) % 360 + 360) % 360;
  }
  /* 青玉四色：与茶模块 jadeHex 同一套派生 —— 四个端点全部从主题色相出发，
     deep 瓶壁厚处吸收 / mid 常态 / lite 受光水头 / cool 背光冷青。
     器物跟随主题配色，切换主题色相时釉色一起走，不再是一只「永远绿」的瓶子。 */
  function glassHex(hue, lo, isDark, deep) {
    /* 【与茶模块 jadeHex 逐式对齐】色相、偏移、饱和度、明度全部照抄；
       key 是 mixHue(h,h-22) 的偏黄绿，这是粉青雅致的来源（148° 纯青绿会成「惨绿塑料」）。 */
    var h = ((hue % 360) + 360) % 360;
    var l = (lo || 0) * 0.6;
    var dk = isDark ? 1 : 0;
    /* 四色与茶模块 jadeHex **逐值一致**（55/56/80/38、34/52/66/70）。
       真正的暗/灰来自着色器里被照抄的 under 阈值（把整个下肚压暗）+ 裂纹密度过高，
       不是釉色本身；不要靠降饱和去治「艳绿」，那会把玉压成灰陶。 */
    return {
      deep: hslToHex(mixHue(h, h - 6, 1), 55, clamp(34 + l * 0.6 - dk * 8, 20, 44)),
      mid: hslToHex(mixHue(h, h - 22, 1), 56 - dk * 4, clamp(52 + l * 0.6 - dk * 8, 36, 62)),
      lite: hslToHex(mixHue(h, h - 38, 1), 80, clamp(66 + l * 0.5 - dk * 14, 48, 78)),
      cool: hslToHex(mixHue(h, h + 52, 1), 38, clamp(70 + l * 0.4 - dk * 10, 54, 78))
    };
  }
  /* 白瓷档的反照率（白瓷链路的 dc）：与吃茶模块 porcelainHex 同口径 ——
     PORC_SAT=55 / PORC_L=80，色相取主题（跟随配色），暗色再压 6 点明度、加 5 点饱和。
     这一档走 irr×dc×RPI 的通用链路，所以必须给「淡雅」的底色，
     不能拿青玉的 mid（暗饱和绿），否则又回到发暗发灰的老样子。 */
  function porcelainHex(hue, lo, isDark) {
    var h = ((hue % 360) + 360) % 360;
    var l = 80 + (lo || 0) * 0.6 - (isDark ? 6 : 0);
    return hslToHex(h, 55 + (isDark ? 5 : 0), clamp(l, 68, 92));
  }
  /* 瓷塞：低饱和深釉，同样跟随主题色相。+36° 让默认 120° 主题仍落在原来的青灰 #607a70；
     饱和度锁 12%（不取主题 sat）—— 塞子面积小，高饱和主题会把它染成荧光。
     明度只随主题明度微调，保持「深釉小盖」与器身的明度差。 */
  function stopperHex(hue, lo, isDark) {
    var h = ((hue + 36) % 360 + 360) % 360;
    var l = 43 + (lo || 0) * 0.25 - (isDark ? 3 : 0);
    return hslToHex(h, 12, clamp(l, 34, 50));
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* ══════════════════════ 瓷器音效（模态合成 · 零素材） ══════════════════════
   *
   * 为什么不用录音：模块沙箱禁 fetch、单文件自包含，一段 1 秒的瓷声采样
   * base64 后就是 100KB 级的体积，且只能有「那一下」；而盖碗要响的是
   * 开、合、擦、扣四种力度不同的接触。所以按模态合成（modal synthesis）现算：
   *
   *   ① 接触瞬态：白噪声过带通，1.2ms 起振、20~30ms 收干净
   *      —— 瓷与瓷相碰那一下的「叮」的起音，缺了它后续模态就像风铃不像瓷。
   *   ② 器体模态：3~5 个**非整数比**正弦，各自指数衰减
   *      —— 瓷件的振动模态天生不成谐波列（这是它不像玻璃/金属/陶的关键）；
   *      高频衰减快、低频拖得久，「先亮后暗」的听感就来自这个斜率差。
   *   ③ 拍频：每个模态拆成两只相差 0.15% 的振荡器
   *      —— 真实瓷件因椭圆度与壁厚不均，同一模态是劈开的两个邻近频率，
   *      合起来是 4~8Hz 的强弱起伏；少了这层就像电子琴。
   *   ④ 轻叩：小瓷塞本身的高频模态 + 极弱低频接触，不再给「碗身压茶托」那种闷笃，
   *      所以听感是「叮」而不是木塞「啵」。
   *   ⑤ 湿声：程序化 IR（0.3s 指数衰减噪声）走 13% —— 只给一点空气，不做大厅。
   *
   * 频点按「口径越小、音越高」定：瓷塞 Ø0.3 世界单位，落在 2.65~6.2kHz，
   * 衰减比盖碗短一半、总电平只有它的三分之二——它是小塞子，不是整只盖碗。
   * 每次触发的频点与瞬态再叠 ±1.5% 的随机偏移 —— 手工轻叩从不两次一样。
   */

  function createPorcelainAudio(LOG) {
    var AC = window.AudioContext || window.webkitAudioContext;
    var ctx = null, master = null, room = null, wet = null, noiseBuf = null;
    var enabled = true, broken = false;
    var rub = null, rubGain = null, rubBp = null;

    function makeNoise(sec) {
      var n = Math.max(1, Math.floor(ctx.sampleRate * sec));
      var b = ctx.createBuffer(1, n, ctx.sampleRate);
      var d = b.getChannelData(0);
      for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      return b;
    }
    /* 程序化 IR：0.3s 指数衰减噪声，等效一间三四十平米的屋子；不做大厅 */
    function makeIR() {
      var n = Math.max(1, Math.floor(ctx.sampleRate * 0.30));
      var b = ctx.createBuffer(2, n, ctx.sampleRate);
      for (var c = 0; c < 2; c++) {
        var d = b.getChannelData(c);
        for (var i = 0; i < n; i++) {
          var k = 1 - i / n;
          d[i] = (Math.random() * 2 - 1) * k * k * k * k * k * 0.7;
        }
      }
      return b;
    }
    function ensure() {
      if (ctx || broken) return ctx;
      if (!AC) { broken = true; return null; }
      try {
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = 0.85;
        master.connect(ctx.destination);
        room = ctx.createConvolver();
        room.buffer = makeIR();
        wet = ctx.createGain();
        wet.gain.value = 0.13;
        room.connect(wet);
        wet.connect(master);
        noiseBuf = makeNoise(0.6);
      } catch (e) {
        broken = true;
        ctx = null;
        LOG.warn('[' + ID + '] 音效初始化失败', e);
      }
      return ctx;
    }
    /* 浏览器要求音频上下文在用户手势里解锁：pointerdown / keydown 先过这里 */
    function start() {
      if (!enabled) return null;
      var c = ensure();
      if (!c) return null;
      if (c.state === 'suspended') { try { c.resume(); } catch (e) { /* 忽略 */ } }
      return c;
    }
    function unlock() {
      var c = ensure();
      if (!c) return;
      if (c.state === 'suspended') { try { c.resume(); } catch (e) { /* 忽略 */ } }
    }
    /* 每条声音一根总线：总电平 + 声像；干湿并联 */
    function bus(level, pan) {
      var g = ctx.createGain();
      g.gain.value = level;
      if (ctx.createStereoPanner) {
        var p = ctx.createStereoPanner();
        p.pan.value = clamp(pan || 0, -0.6, 0.6);
        g.connect(p);
        p.connect(master);
        p.connect(room);
      } else {
        g.connect(master);
        g.connect(room);
      }
      return g;
    }
    function mode(out, t0, f, amp, decay, detune) {
      var dt = detune == null ? 0.0015 : detune;
      for (var i = 0; i < 2; i++) {
        var k = i ? 1 + dt : 1 - dt;
        var o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.setValueAtTime(f * k, t0);
        /* 音尾的轻微下沉：受迫振动衰减时刚度回弹，真实瓷件的延音不是平直的 */
        o.frequency.exponentialRampToValueAtTime(f * k * 0.995, t0 + Math.min(0.12, decay * 0.6));
        var g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(amp * (i ? 0.55 : 1), t0 + 0.0025);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + decay);
        o.connect(g);
        g.connect(out);
        o.start(t0);
        o.stop(t0 + decay + 0.02);
      }
    }
    function transient(out, t0, fc, amp, decay, q) {
      if (!noiseBuf) return;
      var s = ctx.createBufferSource();
      s.buffer = noiseBuf;
      var bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = fc;
      bp.Q.value = q == null ? 1 : q;
      var g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(amp, t0 + 0.0012);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + decay);
      s.connect(bp);
      bp.connect(g);
      g.connect(out);
      /* 每次从噪声里随机取一段：同一个索引反复触发，十几下之后耳朵就能听出「同一记」 */
      s.start(t0, Math.random() * 0.5);
      s.stop(t0 + decay + 0.02);
    }
    function thump(out, t0, f, amp, decay) {
      var o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(f * 1.12, t0);
      o.frequency.exponentialRampToValueAtTime(f * 0.86, t0 + decay * 0.7);
      var g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(amp, t0 + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + decay);
      o.connect(g);
      g.connect(out);
      o.start(t0);
      o.stop(t0 + decay + 0.02);
    }

    /* 瓷塞落口：三个短高频模态 + 极弱低频接触 + 20ms 后塞肩回弹的第二记。
       strength 仍由「这一下掉了多远」决定；整体电平/衰减都按小瓷件压下来了。 */
    function seat(pan, strength) {
      var c = start();
      if (!c) return;
      var t0 = c.currentTime + 0.002;
      var s = clamp(strength == null ? 1 : strength, 0.3, 1.1);
      var d = 1 + (Math.random() - 0.5) * 0.035;
      var out = bus(0.62, pan);
      transient(out, t0, 4200 * d, 0.050 * s, 0.018, 1.1);
      thump(out, t0, 760 * d, 0.010 * s, 0.045);
      var plug = [[2650, 0.018, 0.16], [3820, 0.012, 0.11], [5160, 0.007, 0.075]];
      for (var i = 0; i < plug.length; i++) {
        mode(out, t0, plug[i][0] * d, plug[i][1] * s, plug[i][2], 0.0026);
      }
      transient(out, t0 + 0.020, 3400 * d, 0.014 * s, 0.012, 1.2);
    }

    /* 拔塞：分离比落口更轻，只留一记高频细响和口沿相擦的极短毛刺 */
    function unseat(pan) {
      var c = start();
      if (!c) return;
      var t0 = c.currentTime + 0.001;
      var d = 1 + (Math.random() - 0.5) * 0.03;
      var out = bus(0.48, pan);
      transient(out, t0, 5600 * d, 0.045, 0.012, 1.3);
      transient(out, t0 + 0.008, 7200, 0.010, 0.028, 0.9);
      var m = [[3400, 0.016, 0.055], [4700, 0.010, 0.040], [6200, 0.005, 0.030]];
      for (var i = 0; i < m.length; i++) mode(out, t0, m[i][0] * d, m[i][1], m[i][2], 0.0028);
    }

    /* 扣茶托（换纹样）：口径最大、垫在案上，阻尼最大 —— 最闷的那一声 */
    function tap(pan) {
      var c = start();
      if (!c) return;
      var t0 = c.currentTime + 0.001;
      var d = 1 + (Math.random() - 0.5) * 0.03;
      var out = bus(0.72, pan);
      transient(out, t0, 2400 * d, 0.10, 0.020, 1.0);
      thump(out, t0, 900 * d, 0.028, 0.05);
      var m = [[1420, 0.048, 0.13], [2080, 0.034, 0.11], [2960, 0.020, 0.08]];
      for (var i = 0; i < m.length; i++) mode(out, t0, m[i][0] * d, m[i][1], m[i][2], 0.0014);
    }

    /* 拖动摩擦：只在瓷塞还贴着瓶口（lift 很低）时成立 —— 塞一离口，
       手里就是空气，再出声就是假的。釉面对釉面的摩擦比软木更细更轻，中心频率也更高。 */
    function rubStart() {
      var c = start();
      if (!c || rub) return;
      rub = c.createBufferSource();
      rub.buffer = noiseBuf;
      rub.loop = true;
      rubBp = c.createBiquadFilter();
      rubBp.type = 'bandpass';
      rubBp.frequency.value = 3200;
      rubBp.Q.value = 0.9;
      rubGain = c.createGain();
      rubGain.gain.value = 0.0001;
      rub.connect(rubBp);
      rubBp.connect(rubGain);
      rubGain.connect(master);
      try { rub.start(); } catch (e) { rub = null; }   // 旧内核不给 start() 时就当没有
    }
    function rubMove(speed, nearRim) {
      if (!rubGain || !rubBp || !ctx) return;
      var t = ctx.currentTime;
      var v = nearRim ? clamp(speed * 0.0010, 0.0001, 0.018) : 0.0001;
      rubGain.gain.setTargetAtTime(v, t, 0.02);
      rubBp.frequency.setTargetAtTime(2900 + Math.min(2500, speed * 12), t, 0.04);
    }
    function rubStop() {
      if (!rub) return;
      var s = rub;
      rub = null;
      if (rubGain && ctx) { try { rubGain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.015); } catch (e) { /* 忽略 */ } }
      rubGain = null;
      rubBp = null;
      setTimeout(function () { try { s.stop(); } catch (e) { /* 已停 */ } }, 90);
    }

    function setEnabled(v) {
      enabled = !!v;
      if (!enabled) rubStop();
    }
    function destroy() {
      rubStop();
      if (ctx) { try { ctx.close(); } catch (e) { /* 已关闭 */ } }
      ctx = null; master = null; room = null; wet = null; noiseBuf = null;
    }
    return {
      unlock: unlock, seat: seat, unseat: unseat, tap: tap,
      rubStart: rubStart, rubMove: rubMove, rubStop: rubStop,
      setEnabled: setEnabled, destroy: destroy
    };
  }

  /* ══════════════════════ 模块 ══════════════════════ */
  var instance = null;

  function mount(root, api) {
    if (instance) instance.destroy();
    api = api || {};
    var THEME_API = api.THEME || {};
    var LOG = api.LOG || { warn: function () {} };
    var reduceMotion = false;
    try { reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { /* 无 matchMedia */ }

    /* 渲染器与 placeVerse 共享的取景偏移（NDC）：盖碗居中校正写这里，三处 ortho 读它 */
    var _tyRef = { v: 0 };
    /* 默认外观三件套：冰裂纹样 + 白瓷釉色 + 裂纹夜色（裂纹只在暗色主题下点亮，强度 50%）。
       读档兜底与此保持一致：缺字段或非法值都落到这三项。 */
    var state = {
      open: false, lift: 0, tea: null, types: [], steam: true, pattern: 'crackle', night: 'crackle', nightFx: { body: 0.5, crackle: 0.5 }, cabinet: [],
      /* 抽酒范围：默认全库——酒柜只是收藏，不该偷偷缩小随机范围；true = 只喝柜内的 */
      cabOnly: false,
      /* 自转三态：off / yaw（原地，绕竖轴，几乎看不见）/ orbit（环绕，相机巡视，真正多角度）。
         默认 orbit：因为只有它让回转体「转起来」看得见；reduced-motion 下关。 */
      spinMode: reduceMotion ? 'off' : 'orbit', spinUserSet: false, sound: true,
      /* 釉色：'porcelain' 白瓷（默认）/ 'jade' 青玉（参考稿的碧玉盖碗） */
      mat: 'porcelain',
      /* P0 质感档：默认开。关掉 = 原稿对照档（酒香脉冲/液面增强全退，逐像素回基线） */
      enhance: true
    };
    var el = {};
    var gl = null;
    /* 揭盖音效的两块状态必须与 state 同时就位：syncMetrics() 在 mount 早期就会调 applyLift()，
       那时若 _lidSeated 还是 undefined，会被判成「盖未贴合」而凭空响一记合盖声。 */
    var _lidSeated = true;   // 盖沿是否贴在口沿上（初始：盖着）
    var _pan = 0;            // 当前声音的声像，按指针横向位置取
    var _revealTimer = null;
    var _puffTimer = null;
    var _snapCfg = null;
    var _themeRaf = 0;
    var _darkObs = null;
    var _drag = { active: false, y0: 0, base: 0, moved: 0, pid: null };
    var M = { pxPerWorldY: 1, lid: null };
    var THEME = { hue: 120, lo: 0, isDark: false };

    root.innerHTML = '';
    ensureStyle(root);

    var wrap = document.createElement('div');
    wrap.className = 'wine-wrap';
    wrap.innerHTML =
      '<div class="wine-stage">' +
        '<svg class="wine-steam" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">' +
          '<defs><filter id="wine-steam-blur" x="-60%" y="-60%" width="220%" height="220%">' +
            '<feGaussianBlur stdDeviation="0.8"/></filter></defs>' +
          /* 局部原点 = 瓶口：placeVerse 量出瓶身顶缘后整组 translate，别处不写死百分比 */
          '<g class="wine-aroma" transform="translate(50 41)">' +
            '<ellipse class="wine-aroma-glow" cx="0" cy="-1" rx="4.2" ry="2"/>' +
            '<path class="wine-wisp" filter="url(#wine-steam-blur)" d="M.4 0c-2.2-3.6 2.6-6-.4-9.4s2-5 0-7.4"/>' +
          '</g>' +
        '</svg>' +
        '<button type="button" class="wine-kbd" aria-label="拔出或塞回瓶塞；按 P 切换瓶身纹样"></button>' +
        '<div class="wine-verse v-top"><span>将进酒</span></div>' +
        '<div class="wine-verse v-bot"><span>杯莫停</span></div>' +
        '<div class="wine-count"><span class="t-num"></span><span class="t-cab">我的酒柜</span></div>' +
'<div class="wine-tools">' +
                '<button class="wine-gear" type="button" aria-label="喝酒设置">' +
        '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.6" ' +
        'stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/>' +
        '<path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>' +
      '</button>' +
      '</div>' +
      '</div>' +
      '<div class="wine-card" aria-live="polite">' +
        '<div class="wine-name"></div><div class="wine-meta"></div>' +
        '<div class="wine-note"></div><div class="wine-brew"></div>' +
        '<button type="button" class="wine-save"></button>' +
      '</div>' +
      '<div class="wine-tip">拔塞喝酒 · 拖动可转</div>' +
            '<div class="wine-mask">' +
        '<div class="wine-cab-panel" role="dialog" aria-modal="true" aria-label="酒柜与酒库">' +
          '<div class="wine-cab-head">' +
            '<div class="wine-title wine-cab-title">酒柜</div>' +
            '<button type="button" class="wine-x" data-act="cab-close" aria-label="关闭">×</button>' +
          '</div>' +
          '<input type="search" class="wine-find" placeholder="搜酒名 · 分类" aria-label="搜索酒款" />' +
          '<div class="wine-seg">' +
            '<button type="button" class="wine-seg-btn" data-seg="all">全部</button>' +
            '<button type="button" class="wine-seg-btn" data-seg="cab">我的酒柜</button>' +
          '</div>' +
          '<div class="wine-seg wine-seg-types">' + buildTypeSegs() + '</div>' +
          '<div class="wine-cab-list"></div>' +
          '<div class="wine-pager">' +
            '<button type="button" class="wine-pg" data-pg="-1" aria-label="上一页">‹</button>' +
            '<span class="wine-pg-i"></span>' +
            '<button type="button" class="wine-pg" data-pg="1" aria-label="下一页">›</button>' +
          '</div>' +
        '</div>' +
        '<div class="wine-dialog" role="dialog" aria-modal="true" aria-label="喝酒设置">' +
          /* 页头：一级信息（这盏茶抽什么），说明独占一行，不与控件混排 */
          '<div class="wine-head">' +
            '<div class="wine-title">今天想喝点什么</div>' +
            '<div class="wine-hint">酒类不选就整个范围都算，选了就只从这几类里抽</div>' +
          '</div>' +
          /* 分组 1：抽茶范围 */
          '<section class="wine-sec">' +
            '<div class="wine-sec-h">酒类</div>' +
            /* 范围在上、酒类在下：先定「从哪抽」，再定「抽哪几类」 */
            '<div class="wine-field">' +
              '<span class="wine-field-label">抽酒范围</span>' +
              '<div class="wine-chips" data-row="scope">' +
                '<button type="button" class="wine-chip scope" data-scope="all">全库</button>' +
                '<button type="button" class="wine-chip scope" data-scope="cab">只喝柜内</button>' +
              '</div>' +
            '</div>' +
            '<div class="wine-chips wine-chips-types">' +
              TYPES.map(function (t) { return '<button type="button" class="wine-chip" data-t="' + t + '">' + t + '</button>'; }).join('') +
            '</div>' +
          '</section>' +
          /* 分组 2：器物外观 —— 每行「字段名 + 控件」走同一套两列网格 */
          '<section class="wine-sec">' +
            '<div class="wine-sec-h">器物外观</div>' +
            '<div class="wine-field">' +
              '<span class="wine-field-label">瓶身纹样</span>' +
              '<div class="wine-chips" data-row="pattern">' +
                '<button type="button" class="wine-chip pat" data-p="none">素瓷</button>' +
                '<button type="button" class="wine-chip pat" data-p="crackle">冰裂</button>' +
              '</div>' +
            '</div>' +
            '<div class="wine-field">' +
              '<span class="wine-field-label">釉色</span>' +
              '<div class="wine-chips" data-row="mat">' +
                '<button type="button" class="wine-chip mat" data-m="porcelain">白瓷</button>' +
                '<button type="button" class="wine-chip mat" data-m="jade">青玉</button>' +
              '</div>' +
            '</div>' +
            '<div class="wine-field">' +
              '<span class="wine-field-label">夜色效果</span>' +
              '<div class="wine-chips" data-row="night">' +
                '<button type="button" class="wine-chip night" data-n="body">微光</button>' +
                '<button type="button" class="wine-chip night" data-n="crackle">裂纹</button>' +
              '</div>' +
            '</div>' +
            /* 强度是「夜色效果」的从属参数，不再是平级字段 */
            '<div class="wine-field wine-field-sub">' +
              '<span class="wine-field-label">强度</span>' +
              '<div class="wine-range-wrap">' +
                '<input type="range" class="wine-range" min="0" max="100" step="1" aria-label="夜色效果强度" />' +
                '<span class="wine-range-val"></span>' +
              '</div>' +
            '</div>' +
            /* 亮色主题下 gl.setNightFx 全被 isDark 压成 0，两档与强度都无视觉效果；
               这里明说，避免用户判定「开关坏了」 */
            '<div class="wine-night-note">夜色效果只在暗色主题下可见</div>' +
            /* 开关与上面的「选哪项」不是同类，用一道淡线隔开 */
            '<label class="wine-field wine-switch wine-field-divider" title="关闭后回到与 three 原稿逐像素一致的对照画面">' +
              '<span class="wine-field-label">质感增强</span>' +
              '<input type="checkbox" class="wine-enhance-input" aria-label="质感增强（关闭为原稿对照档）" />' +
              '<span class="track" aria-hidden="true"></span></label>' +
          '</section>' +
          /* 分组 3：动效与声音 */
          '<section class="wine-sec">' +
            '<div class="wine-sec-h">动效与声音</div>' +
            '<label class="wine-field wine-switch"><span class="wine-field-label">酒香</span>' +
              '<input type="checkbox" class="wine-steam-input" /><span class="track" aria-hidden="true"></span></label>' +
            /* 自转三态：关 / 原地 / 环绕。与纹样/釉色/夜色同款 chips（data-row），沿用现有视觉语言 */
            '<div class="wine-field">' +
              '<span class="wine-field-label">自转</span>' +
              '<div class="wine-chips" data-row="spin">' +
                '<button type="button" class="wine-chip spin" data-s="off">关</button>' +
                '<button type="button" class="wine-chip spin" data-s="yaw">原地</button>' +
                '<button type="button" class="wine-chip spin" data-s="orbit">环绕</button>' +
              '</div>' +
            '</div>' +
            '<label class="wine-field wine-switch"><span class="wine-field-label">瓷器音效</span>' +
              '<input type="checkbox" class="wine-sound-input" /><span class="track" aria-hidden="true"></span></label>' +
          '</section>' +
          '<button type="button" class="wine-link" data-act="open-cab">' +
            '<span class="wine-link-text">我的酒柜</span><span class="wine-link-arrow">›</span>' +
          '</button>' +
        '</div>' +
      '</div>';
    root.appendChild(wrap);

    el.wrap = wrap;
    el.stage = wrap.querySelector('.wine-stage');
    el.kbd = wrap.querySelector('.wine-kbd');
    el.verseTop = wrap.querySelector('.wine-verse.v-top');
    el.verseBot = wrap.querySelector('.wine-verse.v-bot');
    el.card = wrap.querySelector('.wine-card');
    el.name = wrap.querySelector('.wine-name');
    el.meta = wrap.querySelector('.wine-meta');
    el.note = wrap.querySelector('.wine-note');
    el.brew = wrap.querySelector('.wine-brew');
    el.save = wrap.querySelector('.wine-save');
    el.cabLink = wrap.querySelector('.wine-link');
    el.dialog = wrap.querySelector('.wine-dialog');
    el.cabPanel = wrap.querySelector('.wine-cab-panel');
    el.cabList = wrap.querySelector('.wine-cab-list');
    el.cabTitle = wrap.querySelector('.wine-cab-title');
    el.find = wrap.querySelector('.wine-find');
    var countStr = wrap.querySelector('.wine-count .t-num');
    paintCount();

    /* 详情卡是开盖后才填内容的，而它在竖向 flex 里与舞台抢高度：
       空卡 20px、满卡可达 127px（380×720 实测），一开盖舞台就矮 107px，
       画布随之重新取景，整只盖碗会跳一下——这就是「第一次开盖位置变化」的根因。
       这里在挂载时把所有茶样各填一遍，取最高值写成 min-height，开盖就不再改动布局。
       同时用 max-height 兜住极窄面板：卡再高也只占 40%，不会把舞台压没。 */
    var _cardW = -1;
    function lockCardHeight() {
      if (!el.card || !el.name || !TEAS || !TEAS.length) return;
      var w = el.card.clientWidth || 0;
      if (w === _cardW) return;
      _cardW = w;
      var kn = el.name.textContent, km = el.meta ? el.meta.textContent : '', kt = el.note ? el.note.textContent : '', kb = el.brew ? el.brew.innerHTML : '';
      el.card.style.minHeight = '0px';
      var max = 0;
      for (var i = 0; i < TEAS.length; i++) {
        paintText(TEAS[i]);
        if (el.card.offsetHeight > max) max = el.card.offsetHeight;
      }
      var wrapH = wrap.clientHeight || 0;
      var cap = wrapH ? Math.round(wrapH * 0.40) : 0;
      if (cap && max > cap) { max = cap; el.card.style.overflow = 'hidden'; }
      el.card.style.minHeight = max + 'px';
      if (cap) el.card.style.maxHeight = cap + 'px';
      el.name.textContent = kn;
      if (el.meta) el.meta.textContent = km;
      if (el.note) el.note.textContent = kt;
      if (el.brew) el.brew.innerHTML = kb;
    }
    lockCardHeight();
    el.tip = wrap.querySelector('.wine-tip');
    el.gear = wrap.querySelector('.wine-gear');
    el.maskEl = wrap.querySelector('.wine-mask');
    el.chips = wrap.querySelector('.wine-chips:not([data-row])');
    el.scopeChips = wrap.querySelector('.wine-chips[data-row="scope"]');
    el.patChips = wrap.querySelector('.wine-chips[data-row="pattern"]');
    el.matChips = wrap.querySelector('.wine-chips[data-row="mat"]');
    el.nightChips = wrap.querySelector('.wine-chips[data-row="night"]');
    el.range = wrap.querySelector('.wine-range');
    el.rangeVal = wrap.querySelector('.wine-range-val');
    el.enhanceInput = wrap.querySelector('.wine-enhance-input');
    el.steamInput = wrap.querySelector('.wine-steam-input');
    el.spinChips = wrap.querySelector('.wine-chips[data-row="spin"]');
    el.soundInput = wrap.querySelector('.wine-sound-input');

    loadConfig();

    /* ── 渲染器 ── */
    try {
      gl = GaiwanMount(el.stage, { spinMode: state.spinMode, tyRef: _tyRef, mat: state.mat, enhance: state.enhance,
        /* 环绕时相机移动会让盖子命中区过期：每帧把最新的 metrics 写回 M（只算投影，不读布局，零成本）。
           这同时修掉了此前「手动拖拽后盖子命中区错位」的隐患。 */
        onView: function (m) { if (m) M = m; } });
    } catch (e) {
      LOG.warn('[' + ID + '] WebGL 初始化失败', e);
      gl = null;
    }
    if (!gl) {
      wrap.classList.add('wine-nogl');
      if (el.tip) el.tip.textContent = '这台设备开不了 WebGL';
      return makeApi();
    }
    wrap.classList.add('wine-gl');
    setEnhance(state.enhance);   // 质感档初值：写入酒香浓度变量

    /* 音效引擎是懒初始化的：AudioContext 只在第一次真实接触（pointerdown/keydown）时才建，
       否则每次打开侧栏都凭空起一条音频线程、还要吃一次浏览器的自动播放告警。 */
    var audio = createPorcelainAudio(LOG);
    audio.setEnabled(state.sound);

    /* ── P0 质感档 ──
       一处开关同时收拢两处增强：WebGL 液面增益（uFx）、酒香浓度/脉冲。
       关掉时全部退回 v0.9.2 的形态，合盖逐像素与 three 原稿一致（茶汤本来只在开盖出现）。
       注：v0.9.3 的案上柔影已按作者意见移除（视觉价值不足、反而添乱），不再有 DOM 地面层。 */
    function setEnhance(on) {
      state.enhance = !!on;
      wrap.classList.toggle('wine-reference', !state.enhance);
      if (state.enhance) {
        wrap.style.setProperty('--wine-steam-a', '.42');
        wrap.style.setProperty('--wine-steam-a-dark', '.32');
      } else {
        wrap.style.removeProperty('--wine-steam-a');
        wrap.style.removeProperty('--wine-steam-a-dark');
        wrap.classList.remove('wine-puff');
      }
      if (el.enhanceInput) el.enhanceInput.checked = state.enhance;
      if (gl && gl.setEnhance) gl.setEnhance(state.enhance);
    }

    function syncMetrics() {
      if (!gl) return;
      try { var m = gl.metrics(); if (m) M = m; } catch (e) { return; }
      applyLift(state.lift);
      syncNarrow();
    }
    /* 侧栏可以窄到 100px 出头，两列列表在那种宽度下必然挤成一团 —— 降到单列 */
    var _narrow = null;
    function syncNarrow() {
      var w = (el.stage && el.stage.clientWidth) || 0;
      var narrow = w > 0 && w < 210;
      if (narrow === _narrow) return;
      _narrow = narrow;
      wrap.classList.toggle('wine-narrow', narrow);
      if (el.find) el.find.setAttribute('placeholder', narrow ? '搜酒名' : '搜酒名 · 分类');
    }
    syncMetrics();
    setPattern(state.pattern, false);
    /* 滚出视野 / 侧栏折叠时停渲染 */
    var _io = null;
    try {
      if (typeof IntersectionObserver !== 'undefined' && el.stage) {
        _io = new IntersectionObserver(function (list) {
          var it = list && list[0];
          _vis = !!(it && (it.isIntersecting || it.intersectionRatio > 0));
          syncSpinState();
        }, { threshold: 0.02 });
        _io.observe(el.stage);
      }
    } catch (e) { /* 忽略 */ }

    var _ro = null;
    try {
      if (typeof ResizeObserver !== 'undefined') {
        _ro = new ResizeObserver(function () { lockCardHeight(); syncMetrics(); });
        _ro.observe(el.stage);
      }
    } catch (e) { /* 忽略 */ }

    /* ── 主题 ── */
    function readVar(name) {
      var v = getComputedStyle(document.documentElement).getPropertyValue(name);
      return (v || '').trim();
    }
    function readDocClass() {
      var de = document.documentElement, b = document.body;
      var dk = (de && de.classList && (de.classList.contains('dark') || de.classList.contains('theme-dark'))) ||
               (b && b.classList && (b.classList.contains('dark') || b.classList.contains('theme-dark')));
      if (typeof dk !== 'boolean' || THEME.isDark === dk) return false;
      THEME.isDark = dk;
      return true;
    }
    function applyTheme() {
      wrap.style.setProperty('--th', String(Math.round(THEME.hue)));
      wrap.style.setProperty('--lo', THEME.lo + '%');
      wrap.classList.toggle('wine-dark', !!THEME.isDark);
      /* 夜色效果只在暗色下生效：亮色时把两档 chip 与强度滑块置灰，并显示说明 */
      wrap.classList.toggle('wine-nofx', !THEME.isDark);
      wrap.classList.toggle('wine-no-steam', !state.steam);
      if (gl) {
        try { gl.setPorcelain(porcelainHex(THEME.hue, THEME.lo, THEME.isDark)); } catch (e) { LOG.warn('[' + ID + '] 釉色更新失败', e); }
        try { gl.setStopper(stopperHex(THEME.hue, THEME.lo, THEME.isDark)); } catch (e) { LOG.warn('[' + ID + '] 塞釉更新失败', e); }
        try { gl.setMaterial(state.mat, glassHex(THEME.hue, THEME.lo, THEME.isDark, state.mat === 'jade'), 1.34 * (THEME.isDark ? 0.82 : 1)); } catch (e) { LOG.warn('[' + ID + '] 釉色更新失败', e); }
        try {
          var t = clamp(state.nightFx[state.night] == null ? 0.5 : state.nightFx[state.night], 0, 1);
          gl.setNightFx({
            glow: (THEME.isDark && state.night !== 'crackle') ? t * GLOW_MAX : 0,
            bodyDim: (THEME.isDark && state.night === 'crackle') ? DIM_MAX * (1 - t) : 1,
            /* 与茶模块逐式一致：裂纹档把纹线点亮到 t*LINE_MAX */
            lineGlow: (THEME.isDark && state.night === 'crackle') ? t * LINE_MAX : 0
          });
        } catch (e) { LOG.warn('[' + ID + '] 夜色效果更新失败', e); }
      }
      if (gl) gl.render();   /* 主题色/夜色/强度变更后即时重绘，无需等面板关闭 */
    }
    (function initTheme() {
      var h = parseFloat(readVar('--accent-hue'));
      if (isFinite(h)) THEME.hue = h;
      var lo = parseFloat(readVar('--accent-lightness-offset'));
      if (isFinite(lo)) THEME.lo = lo;
      readDocClass();
      applyTheme();
    })();

    function scheduleTheme() {
      if (_themeRaf) return;
      _themeRaf = requestAnimationFrame(function () { _themeRaf = 0; applyTheme(); });
    }
    function onThemeMessage(e) {
      var d = e && e.data;
      if (!d || d.type !== 'theme:changed' || !d.payload) return;
      var p = d.payload, changed = false;
      if (typeof p.hue === 'number' && isFinite(p.hue) && p.hue !== THEME.hue) { THEME.hue = p.hue; changed = true; }
      if (typeof p.lightnessOffset === 'number' && isFinite(p.lightnessOffset) && p.lightnessOffset !== THEME.lo) {
        THEME.lo = p.lightnessOffset; changed = true;
      }
      if (typeof p.isDark === 'boolean' && p.isDark !== THEME.isDark) { THEME.isDark = p.isDark; changed = true; }
      if (changed) scheduleTheme();
    }
    window.addEventListener('message', onThemeMessage);
    try {
      _darkObs = new MutationObserver(function () { if (readDocClass()) scheduleTheme(); });
      if (document.documentElement) _darkObs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
      if (document.body) _darkObs.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    } catch (e) { LOG.warn('[' + ID + '] 明暗监听不可用', e); }

    /* ── 可见性：不可见就停 rAF（侧栏常驻也不能一直算） ── */
    var _visObs = null;
    var _visible = true;
    function syncSpin() {
      if (!gl) return;
      /* 不可见时停 rAF（省电）；可见时按当前三态恢复（orbit/yaw 重启循环，off 停） */
      gl.setSpinMode(_visible ? state.spinMode : 'off');
    }
    function onVisibility() {
      _visible = !document.hidden;
      syncSpin();
    }
    document.addEventListener('visibilitychange', onVisibility);
    try {
      if (typeof IntersectionObserver !== 'undefined') {
        _visObs = new IntersectionObserver(function (list) {
          _visible = !!(list[0] && list[0].isIntersecting);
          syncSpin();
        }, { threshold: 0.05 });
        _visObs.observe(wrap);
      }
    } catch (e) { /* 老内核忽略 */ }

    /* ── 配置 ── */
    /* api.loadData 是异步 RPC：桥的 loadModuleData 返回 Promise（curtain/blog 均按 await 用）。
       旧实现同步调用，拿到的是 Promise 本体——truthy 但所有字段 undefined，
       每次启动都静默回默认值；用户一操作又把默认写盘，表现即「重启后自选全部丢失」。 */
    function loadConfig() {
      var p = null;
      try { p = api.loadData ? api.loadData() : null; } catch (e) { LOG.warn('[' + ID + '] 读取设置失败', e); }
      Promise.resolve(p).then(applyConfig)
        .catch(function (e) { LOG.warn('[' + ID + '] 读取设置失败', e); });
    }
    function applyConfig(raw) {
      var types = (raw && raw.types) || [];
      state.types = types.filter(function (t) { return TYPES.indexOf(t) >= 0; });
      state.steam = !(raw && raw.steam === false);
      state.mat = (raw && raw.mat === 'jade') ? 'jade' : 'porcelain';
      state.pattern = (raw && PATTERNS.indexOf(raw.pattern) >= 0) ? raw.pattern : 'crackle';
      state.night = (raw && (raw.night === 'body' || raw.night === 'crackle')) ? raw.night : 'crackle';
      if (raw && raw.cabinet && raw.cabinet.length) {
        var ids = {};
        TEAS.forEach(function (t) { ids[t.id] = 1; });
        state.cabinet = raw.cabinet.filter(function (id) { return ids[id]; });
      }
      if (raw && raw.nightFx) {
        state.nightFx = {
          /* 缺键/非法值才回默认 0.5；0 是用户拉到底的合法值，不能被兜掉 */
          body: isFinite(+raw.nightFx.body) ? clamp(+raw.nightFx.body, 0, 1) : 0.5,
          crackle: isFinite(+raw.nightFx.crackle) ? clamp(+raw.nightFx.crackle, 0, 1) : 0.5
        };
      }
      /* 自转三态迁移：新字段 spinMode 优先；旧字段 spin(boolean) 映射为 关→off / 开→orbit（开=用户想看动，环绕才看得见） */
      if (raw && typeof raw.spinMode === 'string') {
        state.spinMode = (raw.spinMode === 'yaw' || raw.spinMode === 'orbit') ? raw.spinMode : 'off';
        state.spinUserSet = true;
      } else if (raw && typeof raw.spin === 'boolean') {
        state.spinMode = raw.spin ? 'orbit' : 'off';
        state.spinUserSet = true;
      }
      /* 音效默认开：老配置里没有这个字段，不能因为 undefined 就判成关 */
      state.sound = !(raw && raw.sound === false);
      /* 质感档默认开；老配置没有该字段时保持增强（不会莫名退回旧画面） */
      state.enhance = !(raw && raw.enhance === false);
      /* 老配置没有该字段：默认全库，保持「酒柜只是收藏」的语义 */
      state.cabOnly = !!(raw && raw.cabOnly);
      wrap.classList.toggle('wine-no-steam', !state.steam);
      /* 异步到达时 UI 已按默认值画过一遍：各处按真值补刷 */
      setPattern(state.pattern, false);
      renderNightChips(); syncRange(); applyTheme();
      renderChips(); renderScopeChips(); renderSpinChips();
      setEnhance(state.enhance);
      if (el.steamInput) el.steamInput.checked = state.steam;
      if (el.soundInput) el.soundInput.checked = state.sound;
      if (audio) audio.setEnabled(state.sound);
      if (gl) gl.setSpinMode(state.spinMode);
      paintCount(); paintSaveBtn();
    }
    function saveConfig() {
      try {
        if (api.saveData) api.saveData({ types: state.types.slice(), steam: !!state.steam, spinMode: state.spinMode, sound: !!state.sound, mat: state.mat, pattern: state.pattern, night: state.night, nightFx: { body: state.nightFx.body, crackle: state.nightFx.crackle }, cabinet: state.cabinet.slice(), enhance: !!state.enhance, cabOnly: !!state.cabOnly });
      } catch (e) { LOG.warn('[' + ID + '] 保存设置失败', e); }
    }

    /* ── 抽酒 ── */
    /* 抽酒池：酒柜默认只是收藏，不缩小随机范围；cabOnly 显式开启时才只喝柜内。
       类型筛选是强意图：柜内没有选中类型 → 放宽到全库该类型，并记一句提示。 */
    var _poolNote = '';
    var _lastPoolLen = 0;
    function pool() {
      _poolNote = '';
      var base = TEAS;
      if (state.cabOnly) {
        var inCab = TEAS.filter(function (t) { return state.cabinet.indexOf(t.id) >= 0; });
        if (inCab.length) base = inCab;
        else _poolNote = '酒柜还是空的，已从全库抽';
      }
      if (!state.types.length) return base;
      var list = base.filter(function (t) { return state.types.indexOf(t.t) >= 0; });
      if (list.length) return list;
      var global = TEAS.filter(function (t) { return state.types.indexOf(t.t) >= 0; });
      if (global.length) {
        if (state.cabOnly) _poolNote = '酒柜里没有这类，已从全库抽';
        return global;
      }
      return base;
    }
    function pickTea() {
      var list = pool();
      _lastPoolLen = list.length;
      if (list.length === 1) return list[0];
      var t = list[Math.floor(Math.random() * list.length)];
      if (state.tea && t.n === state.tea.n) {
        t = list[(list.indexOf(t) + 1 + Math.floor(Math.random() * (list.length - 1))) % list.length];
      }
      return t;
    }
    function inCabinet(id) { return state.cabinet.indexOf(id) >= 0; }
    function paintSaveBtn() {
      if (!el.save) return;
      var t = state.tea;
      /* 无茶时保留空按钮而不是 display:none —— 卡片高度是在挂载时按「空状态」预留的，
         按钮若此时不占位，开盖后内容会溢出卡片盒，被页脚压住点不到。 */
      if (!t) { el.save.style.display = ''; el.save.style.visibility = 'hidden'; el.save.textContent = ''; return; }
      el.save.style.display = '';
      el.save.style.visibility = '';
      el.save.textContent = inCabinet(t.id) ? '已入柜 · 移出' : '存入酒柜';
    }
    /* 竖向题字双态：默认「录茶N」= 库统计；悬停/聚焦换成「我的酒柜」= 入口名。
       两个状态各有各的语义，不混用。 */
    var _countHover = false;
    function paintCount() {
      var n = state.cabinet.length;
      if (countStr) {
        countStr.textContent = '录酒' + cnNum(TEAS.length);
        var box = countStr.parentNode;
        if (box) box.classList.toggle('has-cab', n > 0);
      }
      if (el.cabLink) {
        var txt = el.cabLink.querySelector('.wine-link-text');
        if (txt) txt.textContent = '我的酒柜 · ' + cnNum(n);
      }
    }
    var cabMode = 'all', cabType = '', cabPage = 0, cabQ = '';
    var CAB_PER = 8;   // 单列每页上限 8 款（矮视口按容器高度自适应缩减）
    function buildTypeSegs() {
      var out = '<button type="button" class="wine-seg-btn" data-type="">全类</button>';
      for (var i = 0; i < TYPES.length; i++) {
        out += '<button type="button" class="wine-seg-btn" data-type="' + TYPES[i] + '">' + TYPES[i] + '</button>';
      }
      return out;
    }
    function renderCabPanel(mode) {
      if (!el.cabList) return;
      if (mode) cabMode = mode;
      var items = cabMode === 'cab' ? TEAS.filter(function (t) { return inCabinet(t.id); }) : TEAS;
      if (cabType) items = items.filter(function (t) { return t.t === cabType; });
      if (cabQ) {
        var q = cabQ.toLowerCase();
        items = items.filter(function (t) {
          return (t.n + ' ' + t.t).toLowerCase().indexOf(q) >= 0;
        });
      }
      if (el.cabTitle) {
        /* 标题跟着筛选走：搜索→找到 N；柜中→茶柜 N；分类→该分类 N；否则全库。
           窄面板放不下「名称 · 数字」，只留两字标题（数量由分页与列表体现）。 */
        var head = cabQ ? '找到' : (cabMode === 'cab' ? '酒柜' : (cabType || '录酒'));
        el.cabTitle.textContent = _narrow ? head : (head + ' · ' + cnNum(items.length));
      }
      var segs = el.cabPanel.querySelectorAll('.wine-seg-btn');
      for (var i = 0; i < segs.length; i++) {
        var b = segs[i];
        if (b.hasAttribute('data-seg')) b.classList.toggle('on', b.getAttribute('data-seg') === cabMode);
        else b.classList.toggle('on', (b.getAttribute('data-type') || '') === cabType);
      }

      if (!items.length) {
        var pg0 = el.cabPanel.querySelector('.wine-pager');
        if (pg0) pg0.classList.remove('show');
        /* SPEC E1>E2>E4：柜空优先于类型空态——移走最后一件茶后，
           「换分类」解决不了柜子空了的事实，文案必须指向收酒 */
        el.cabList.innerHTML = cabQ
          ? '<div class="wine-cab-empty">没有找到「' + esc(cabQ) + '」<br />换个词试试</div>'
          : (cabMode === 'cab'
            ? '<div class="wine-cab-empty">我的酒柜还是空的<br />在「全部」里点右侧的 ＋ 收进来</div>'
            : '<div class="wine-cab-empty">这一类没有酒<br />换个分类看看</div>');
        return;
      }
      /* 分页取代滚动：每页上限 CAB_PER=8 款（两列 × 4 行），矮视口再按容器高度往下缩 */
      /* 每页行数按容器实际高度自适应（上限 CAB_PER）：固定页容量在矮视口下会把面板
         撑到内部滚动（300×420 实测），违背「面板不需要滚动」的承诺。
         行高 30 + 面板骨架约 244px 为实测值（行高 28 + 呼吸 2）。 */
      /* mount 作用域的 el 是元素字典不是舞台（PATCH-11/36 同类坑），取 stage 的父容器 */
      var wrapEl = el.stage ? el.stage.parentNode : null;
      var wrapH = (wrapEl && wrapEl.clientHeight) || state.h || 600;
      var per = Math.max(4, Math.min(CAB_PER, Math.floor((wrapH - 240) / 28)));
      var pages = Math.max(1, Math.ceil(items.length / per));
      if (cabPage > pages - 1) cabPage = pages - 1;
      var pageItems = items.slice(cabPage * per, cabPage * per + per);
      el.cabList.innerHTML = pageItems.map(function (t) {
        var on = inCabinet(t.id);
        return '<div class="wine-row" title="' + esc(t.n + ' · ' + t.t) + '">' +
               '<button type="button" class="wine-row-n" data-brew="' + t.id + '">' + esc(t.n) + '</button>' +
               '<button type="button" class="wine-row-t' + (on ? ' on' : '') + '" data-id="' + t.id +
               '" aria-label="' + (on ? '移出酒柜' : '存入酒柜') + '">' + (on ? '✓' : '＋') + '</button></div>';
      }).join('');
      var pager = el.cabPanel.querySelector('.wine-pager');
      if (pager) {
        pager.classList.toggle('show', pages > 1);
        var idxEl = pager.querySelector('.wine-pg-i');
        if (idxEl) idxEl.textContent = (cabPage + 1) + ' / ' + pages;
        var prevB = pager.querySelector('[data-pg="-1"]'), nextB = pager.querySelector('[data-pg="1"]');
        if (prevB) prevB.disabled = cabPage <= 0;
        if (nextB) nextB.disabled = cabPage >= pages - 1;
      }
    }
    var _cabOpener = null;
    function openCabinet(mode) {
      _cabOpener = document.activeElement;
      /* 面板一开，题字的悬停态即失效（关闭后由浏览器按真实鼠标位置重新判定） */
      _countHover = false;
      paintCount();
      cabPage = 0;
      cabQ = '';
      if (el.find) el.find.value = '';
      renderCabPanel(mode || 'all');
      wrap.classList.remove('is-set');
      wrap.classList.add('is-cab');
      syncSpinState();
    }
    /* 点某一行右侧的 ＋/✓：只更新该行与计数，不整表重绘（避免列表滚动位置跳回顶部） */
    function toggleFromList(btn) {
      var id = btn.getAttribute('data-id'), i = state.cabinet.indexOf(id);
      if (i >= 0) state.cabinet.splice(i, 1); else state.cabinet.push(id);
      var on = i < 0;
      if (cabMode === 'cab' && !on) { renderCabPanel(); }
      else {
        btn.classList.toggle('on', on);
        btn.textContent = on ? '✓' : '＋';
        btn.setAttribute('aria-label', on ? '移出酒柜' : '存入酒柜');
        if (el.cabTitle) {
          el.cabTitle.textContent = cabMode === 'cab'
            ? ('酒柜 · ' + cnNum(state.cabinet.length))
            : ('录酒 · ' + cnNum(TEAS.length));
        }
      }
      paintCount(); paintSaveBtn(); saveConfig();
    }
    function closeCabinet() {
      wrap.classList.remove('is-cab');
      syncSpinState();
      /* 焦点归还打开者：Esc/关闭后不落回 body，键盘用户不迷路 */
      if (_cabOpener && _cabOpener.focus) { try { _cabOpener.focus(); } catch (e) {} }
      _cabOpener = null;
    }
    function toggleCabinet() {
      var t = state.tea;
      if (!t) return;
      var i = state.cabinet.indexOf(t.id);
      if (i >= 0) { state.cabinet.splice(i, 1); flashTip('已移出酒柜'); }
      else { state.cabinet.push(t.id); flashTip('已存入酒柜'); }
      paintSaveBtn();
      paintCount();
      saveConfig();
    }
    function paintText(t) {
      if (el.name) el.name.textContent = t.n;
      if (el.meta) el.meta.textContent = t.t + ' · ' + t.o;
      if (el.note) el.note.textContent = '「' + t.s + '」';
      if (el.brew) {
        el.brew.innerHTML = t.w + '°<span class="wine-dot"></span>' + t.d +
          '<span class="wine-dot"></span>' + esc(t.l);
      }
    }
    function paintTea(t) {
      if (gl) { gl.setWineColor(t.c); if (t.lf) gl.setBubbleColor(t.lf); }
      /* 酒香跟酒精度走，但只做「有没有」的细微差别（3%vol≈.86 / 53%vol≈1.07）：
         一缕本身已经够轻，若再按度数放大浓度，高酒精度又会糊回一片。
         只改 --wine-aroma-k（乘颜色 alpha），形态与节奏不动。 */
      if (wrap) {
        var ak = 0.85 + Math.min(1, Math.max(0, (t.w || 12) / 60)) * 0.25;
        wrap.style.setProperty('--wine-aroma-k', ak.toFixed(2));
      }
      paintText(t);
      paintSaveBtn();
      /* 文案高度是在这一步才定下来的：排版缓存必须失效，否则（尤其长文案）
         题字/卡片的位置还按「空卡」算，末行会压到页脚。 */
      if (el.stage) el.stage._vKey = '';
      if (gl) gl.render();
    }

    /* ── 揭盖 ── */
    /* 声像：按指针在画布里的横向位置摆，器物在左就声在左 —— 一毫米的定位感，成本为零 */
    function panOf(e) {
      if (!gl || !gl.canvas || !e || e.clientX == null) return 0;
      var r = gl.canvas.getBoundingClientRect();
      if (!r.width) return 0;
      return clamp(((e.clientX - r.left) / r.width - 0.5) * 0.9, -0.45, 0.45);
    }
    /* 盖沿接触状态机：声音跟「盖沿到底贴没贴住口沿」走，而不是跟 open/close 这两个动作走——
       拖到一半又拖回去，该响的两声一声不少；拖到 0.5 停住不撒手，也不会凭空多响。
       迟滞 0.04（0.02 判合、0.06 判开）吃掉手抖与触控板的亚像素噪声。
       _lidSeated 在 mount 顶部随 state 一起初始化（见那里的注释）。 */
    function applyLift(v) {
      var prev = state.lift;
      state.lift = clamp(v, 0, 1);
      if (gl) gl.setLift(state.lift);
      /* 命中区跟着盖走：与渲染器同一套投影，位移 1.30 / 1.02 世界单位 */
      if (el.hitArea && M.pxPerWorldY) {
        el.hitArea.style.transform = 'translate(' + (1.05 * state.lift * M.pxPerWorldY).toFixed(1) +
          'px,' + (-0.95 * state.lift * M.pxPerWorldY).toFixed(1) + 'px)';
      }
      if (!audio) return;
      /* 落塞的响度由「这一帧掉了多远」决定：拖到一半松手是轻轻放回，点按开合是整只塞落口 */
      var drop = Math.abs(state.lift - prev);
      if (_lidSeated && state.lift > 0.06) {
        _lidSeated = false;
        audio.unseat(_pan);
      } else if (!_lidSeated && state.lift <= 0.02) {
        _lidSeated = true;
        audio.seat(_pan, clamp(drop * 1.6, 0.35, 1.1));
      }
    }
    var _tipTimer = null;
    function flashTip(text) {
      if (!el.tip) return;
      if (_tipTimer) clearTimeout(_tipTimer);
      el.tip.textContent = text;
      _tipTimer = setTimeout(function () {
        _tipTimer = null;
        if (el.tip) el.tip.textContent = state.open ? '再拔一次，换一杯' : '拔塞喝酒 · 拖动可转';
      }, 1000);
    }

    function renderPatChips() {
      if (!el.patChips) return;
      var list = el.patChips.querySelectorAll('.wine-chip');
      for (var i = 0; i < list.length; i++) {
        list[i].classList.toggle('on', list[i].getAttribute('data-p') === state.pattern);
      }
    }
    function renderScopeChips() {
      if (!el.scopeChips) return;
      var list = el.scopeChips.querySelectorAll('.wine-chip');
      var want = state.cabOnly ? 'cab' : 'all';
      for (var i = 0; i < list.length; i++) {
        list[i].classList.toggle('on', list[i].getAttribute('data-scope') === want);
      }
    }
    function renderMatChips() {
      if (!el.matChips) return;
      var list = el.matChips.querySelectorAll('.wine-chip');
      for (var i = 0; i < list.length; i++) {
        list[i].classList.toggle('on', list[i].getAttribute('data-m') === state.mat);
      }
    }
    function renderNightChips() {
      if (!el.nightChips) return;
      var list = el.nightChips.querySelectorAll('.wine-chip');
      for (var i = 0; i < list.length; i++) {
        list[i].classList.toggle('on', list[i].getAttribute('data-n') === state.night);
      }
    }
    function renderSpinChips() {
      if (!el.spinChips) return;
      var list = el.spinChips.querySelectorAll('.wine-chip');
      for (var i = 0; i < list.length; i++) {
        list[i].classList.toggle('on', list[i].getAttribute('data-s') === state.spinMode);
      }
    }
    /* 渲染开关：面板打开时、或模块滚出视野时停掉渲染循环。
       模块是常驻 DOM，之前无论看不看得见都在每帧画，笔记本上就是持续耗电与卡顿来源。 */
    var _vis = true;
    function syncSpinState() {
      if (!gl) return;
      var panel = wrap.classList.contains('is-set') || wrap.classList.contains('is-cab');
      if (_vis && !panel) gl.resume(); else gl.pause();
    }
    function syncRange() {
      if (!el.range) return;
      var v = state.nightFx[state.night];
      el.range.value = String(Math.round((v == null ? 0.5 : v) * 100));
      if (el.rangeVal) el.rangeVal.textContent = Math.round((v == null ? 0.5 : v) * 100) + '%';
    }
    function setNight(mode) {
      state.night = (mode === 'crackle') ? 'crackle' : 'body';
      renderNightChips();
      syncRange();
      applyTheme();
    }
    function setPattern(kind, announce) {
      state.pattern = PATTERNS.indexOf(kind) >= 0 ? kind : 'none';
      wrap.dataset.pattern = state.pattern;
      if (gl) gl.setPattern(state.pattern);
      renderPatChips();
      if (announce) flashTip(PATTERN_NAMES[state.pattern]);
    }
    /* 自转三态切换：关 / 原地 / 环绕。改运行态并即时写盘（与纹样/釉色同口径） */
    function setSpinMode(mode, announce) {
      state.spinMode = (mode === 'yaw' || mode === 'orbit') ? mode : 'off';
      state.spinUserSet = true;
      renderSpinChips();
      syncSpin();
      if (announce) flashTip(SPIN_NAMES[state.spinMode]);
    }
    /* 釉色：白瓷（半球光 × 反照率）/ 青玉（四段结构单独着色，见 jadeBody） */
    function setMaterial(kind, announce) {
      /* 釉色两档：粉青（默认）/ 深青。深浅在派生时就算好，不再事后压暗 ——
         事后压暗会把高光一起压没（实测：整只葫芦糊进背景）。 */
      state.mat = kind === 'jade' ? 'jade' : 'porcelain';
      wrap.dataset.mat = state.mat;
      if (gl) gl.setMaterial(state.mat, glassHex(THEME.hue, THEME.lo, THEME.isDark, state.mat === 'jade'), 1.34 * (THEME.isDark ? 0.82 : 1));
      renderMatChips();
      if (announce) flashTip(MAT_NAMES[state.mat]);
    }
    function cyclePattern() {
      var i = PATTERNS.indexOf(state.pattern);
      setPattern(PATTERNS[(i + 1) % PATTERNS.length], true);
      /* 换纹样是「指尖扣了一下茶托」这个动作：给它一声最闷的扣响 */
      if (audio) { audio.unlock(); audio.tap(_pan); }
      saveConfig();
    }

    /* J3 核心流程：从面板指定泡哪款。收/移改柜子，泡改器物——动作不共用（原则 P2）。 */
    function brewFromList(id) {
      var t = null;
      for (var i = 0; i < TEAS.length; i++) if (TEAS[i].id === id) { t = TEAS[i]; break; }
      if (!t) return;
      closeCabinet();
      /* 开盖状态下点名换酒：先合上再揭，保证器物真的换了，提示不落空 */
      if (state.open) close();
      open(t);
      flashTip('换酒 ' + t.n);
    }
    function open(forced) {
      if (state.open) return;
      state.open = true;
      state.tea = forced || pickTea();
      wrap.classList.add('is-open');
      /* 拔塞那一下「一股酒气扑出来」：只给质感档 + 酒香开启时，.6s 后自动摘掉（CSS .55s），
         五条气缕自身的 wine-aroma 错峰照常（脉冲只动容器，不改各条的动画）。 */
      if (state.enhance && state.steam) {
        wrap.classList.add('wine-puff');
        if (_puffTimer) clearTimeout(_puffTimer);
        _puffTimer = setTimeout(function () { wrap.classList.remove('wine-puff'); _puffTimer = null; }, 600);
      }
      applyLift(1);
      syncSpin();
      if (el.tip) {
        if (!forced && _poolNote) el.tip.textContent = _poolNote;
        else if (!forced && _lastPoolLen <= 1) el.tip.textContent = '只此一款，换不了';
        else el.tip.textContent = '再拔一次，换一杯';
      }
      if (_revealTimer) clearTimeout(_revealTimer);
      _revealTimer = setTimeout(function () {
        paintTea(state.tea);
        if (el.card) el.card.classList.add('is-live');
      }, 210);
    }
    function close() {
      if (!state.open) return;
      state.open = false;
      wrap.classList.remove('is-open');
      if (_puffTimer) { clearTimeout(_puffTimer); _puffTimer = null; }
      wrap.classList.remove('wine-puff');
      if (el.card) el.card.classList.remove('is-live');
      if (el.tip) el.tip.textContent = '拔塞喝酒 · 拖动可转';
      applyLift(0);
      syncSpin();
      if (_revealTimer) { clearTimeout(_revealTimer); _revealTimer = null; }
    }
    function toggle() { if (state.open) close(); else open(); }

    /* ── 手势 ──
       按下时先拾取部件（1×1 离屏渲染，逐像素准确）：
         葫芦塞 → 拔塞/塞回（点按）/ 起塞（拖动）
         其余 → 轨道绕转（拖动）；**葫芦身点按不再绑定动作**（纹样只在设置面板切）
       这样不再需要一块 DOM 命中区跟着相机跑。 */
    var _g = { active: false, kind: 'orbit', x: 0, y: 0, moved: 0 };

    /* 必须用画布的 rect，不是 stage 的：stage 有内边距，画布是内缩的 */
    function stagePoint(e) {
      var r = (gl && gl.canvas ? gl.canvas : el.stage).getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    }
    function onPointerDown(e) {
      if (e.button !== undefined && e.button !== 0) return;
      /* 底部工具行（茶柜 / 设置）在舞台内：一旦被 setPointerCapture 捕获，
         后续 click 会被重定向到舞台，按钮自己的 click 永远收不到。整行放行。 */
      if (e.target && e.target.closest && e.target.closest('.wine-tools, .wine-count')) return;
      var p = stagePoint(e), part = 0;
      try { part = gl ? gl.pick(p.x, p.y) : 0; } catch (err) { part = 0; }
      _g.active = true;
      _g.kind = part === 3 ? 'lid' : 'orbit';
      _g.x = e.clientX; _g.y = e.clientY; _g.moved = 0;
      _pan = panOf(e);
      if (audio) {
        audio.unlock();                                  // 手势里解锁音频上下文
        if (_g.kind === 'lid') audio.rubStart();          // 摩擦底噪只在按住盖子期间存在
      }
      wrap.classList.add(_g.kind === 'lid' ? 'is-dragging' : 'is-orbiting');
      /* 环绕自转时按住拖拽 → 暂停自动巡视（转盘语义：放下即继续），让用户定格观察 */
      if (gl && _g.kind === 'orbit') gl.setAutoPaused(true);
      try { if (el.stage.setPointerCapture) el.stage.setPointerCapture(e.pointerId); } catch (err) { /* 忽略 */ }
    }
    function onPointerMove(e) {
      if (!_g.active || !gl) return;
      var dx = e.clientX - _g.x, dy = e.clientY - _g.y;
      if (!dx && !dy) return;
      _g.x = e.clientX; _g.y = e.clientY;
      _g.moved += Math.abs(dx) + Math.abs(dy);
      if (_g.kind === 'lid') {
        applyLift(state.lift - (dy / Math.max(0.001, M.pxPerWorldY)) / 0.95);
        if (audio) audio.rubMove(Math.abs(dy), state.lift < 0.16);
      } else {
        gl.orbitBy(dx, dy);
      }
      if (e.cancelable) e.preventDefault();
    }
    function onPointerUp() {
      if (!_g.active) return;
      _g.active = false;
      if (audio) audio.rubStop();
      if (gl) gl.setAutoPaused(false);
      wrap.classList.remove('is-dragging', 'is-orbiting');
      var tap = _g.moved <= 4;
      if (_g.kind === 'lid') {
        if (tap) toggle();
        else if (state.open) { if (state.lift < 0.66) close(); else applyLift(1); }
        else { if (state.lift > 0.34) open(); else applyLift(0); }
      }
    }
    function onWheel(e) {
      if (!gl) return;
      e.preventDefault();
      gl.zoomBy(e.deltaY < 0 ? 1.08 : 1 / 1.08);
    }
    if (el.stage) {
      el.stage.addEventListener('pointerdown', onPointerDown);
      el.stage.addEventListener('wheel', onWheel, { passive: false });
    }
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);

    /* 键盘：Enter/空格 开合，P 换纹样 */
    if (el.kbd) {
      el.kbd.addEventListener('keydown', function (e) {
        if (audio) audio.unlock();
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') { e.preventDefault(); toggle(); }
        else if (e.key === 'p' || e.key === 'P') { e.preventDefault(); cyclePattern(); }
      });
      el.kbd.addEventListener('click', function () { if (audio) audio.unlock(); toggle(); });
    }

    /* ── 设置 ── */
    function renderChips() {
      var list = el.chips ? el.chips.querySelectorAll('.wine-chip') : [];
      for (var i = 0; i < list.length; i++) {
        list[i].classList.toggle('on', state.types.indexOf(list[i].getAttribute('data-t')) >= 0);
      }
    }
    function openSettings() {
      _snapCfg = {
        types: state.types.slice(), steam: !!state.steam, spinMode: state.spinMode, sound: !!state.sound,
        pattern: state.pattern, mat: state.mat, enhance: !!state.enhance,
        night: state.night, nightFx: { body: state.nightFx.body, crackle: state.nightFx.crackle },
        cabOnly: !!state.cabOnly
      };
      renderNightChips();
      renderChips();
      renderMatChips();
      renderScopeChips();
      renderSpinChips();
      syncRange();
      if (el.enhanceInput) el.enhanceInput.checked = !!state.enhance;
      if (el.steamInput) el.steamInput.checked = !!state.steam;
      if (el.soundInput) el.soundInput.checked = !!state.sound;
      wrap.classList.add('is-set');
      syncSpinState();
    }
    function closeSettings() { wrap.classList.remove('is-set'); syncSpinState(); }
    var _saveT = null;
    function scheduleSave() {
      if (_saveT) clearTimeout(_saveT);
      /* 改动即自动写盘：用户无需点「保存」即可实时看到并被保留 */
      _saveT = setTimeout(function () { _saveT = null; saveConfig(); }, 400);
    }
    function cancelSettings() {
      if (_snapCfg) {
        state.types = _snapCfg.types.slice();
        state.night = _snapCfg.night || 'crackle';
        if (_snapCfg.nightFx) state.nightFx = { body: _snapCfg.nightFx.body, crackle: _snapCfg.nightFx.crackle };
        state.cabOnly = !!_snapCfg.cabOnly;
        renderNightChips();
        renderScopeChips();
        syncRange();
        state.steam = _snapCfg.steam;
        state.spinMode = _snapCfg.spinMode;
        state.sound = _snapCfg.sound;
        if (el.soundInput) el.soundInput.checked = state.sound;
        if (audio) audio.setEnabled(state.sound);
        wrap.classList.toggle('wine-no-steam', !state.steam);
        syncSpin();
        setPattern(_snapCfg.pattern, false);
        setMaterial(_snapCfg.mat || 'porcelain', false);
        setEnhance(_snapCfg.enhance !== false);
        _snapCfg = null;
        if (_saveT) clearTimeout(_saveT);
        saveConfig();
      }
      closeSettings();
    }
    function typesChanged(snap) {
      if (!snap) return true;
      if (snap.types.length !== state.types.length) return true;
      for (var i = 0; i < state.types.length; i++) if (snap.types.indexOf(state.types[i]) < 0) return true;
      return false;
    }
    if (el.gear) el.gear.addEventListener('click', openSettings);
    if (el.chips) {
      el.chips.addEventListener('click', function (e) {
        var chip = e.target && e.target.closest ? e.target.closest('.wine-chip') : null;
        if (!chip) return;
        var t = chip.getAttribute('data-t');
        var i = state.types.indexOf(t);
        if (i >= 0) state.types.splice(i, 1); else state.types.push(t);
        chip.classList.toggle('on', i < 0);
        scheduleSave();
      });
    }
    if (el.scopeChips) {
      el.scopeChips.addEventListener('click', function (e) {
        var chip = e.target && e.target.closest ? e.target.closest('.wine-chip') : null;
        if (!chip) return;
        state.cabOnly = chip.getAttribute('data-scope') === 'cab';
        renderScopeChips();
        scheduleSave();
      });
    }
    if (el.patChips) {
      el.patChips.addEventListener('click', function (e) {
        var chip = e.target && e.target.closest ? e.target.closest('.wine-chip') : null;
        if (!chip) return;
        setPattern(chip.getAttribute('data-p'), false);
        scheduleSave();
      });
    }
    if (el.matChips) {
      el.matChips.addEventListener('click', function (e) {
        var chip = e.target && e.target.closest ? e.target.closest('.wine-chip') : null;
        if (!chip) return;
        setMaterial(chip.getAttribute('data-m'), false);
        scheduleSave();
      });
    }
    if (el.save) el.save.addEventListener('click', toggleCabinet);
    if (el.cabPanel) {
      el.cabPanel.addEventListener('click', function (e) {
        var t = e.target;
        var act = t && t.closest ? t.closest('[data-act]') : null;
        if (act && act.getAttribute('data-act') === 'cab-close') { closeCabinet(); return; }
        var seg = t && t.closest ? t.closest('[data-seg]') : null;
        if (seg) { cabPage = 0; renderCabPanel(seg.getAttribute('data-seg')); return; }
        var ty = t && t.closest ? t.closest('[data-type]') : null;
        if (ty) { cabType = ty.getAttribute('data-type') || ''; cabPage = 0; renderCabPanel(); return; }
        var pg = t && t.closest ? t.closest('[data-pg]') : null;
        if (pg) { cabPage += +pg.getAttribute('data-pg'); renderCabPanel(); return; }
        var tg = t && t.closest ? t.closest('.wine-row-t') : null;
        if (tg) { toggleFromList(tg); return; }
        var br = t && t.closest ? t.closest('.wine-row-n') : null;
        if (br) brewFromList(br.getAttribute('data-brew'));
      });
    }
    var countBox = wrap.querySelector('.wine-count');
    if (countBox) {
      countBox.setAttribute('role', 'button');
      countBox.setAttribute('tabindex', '0');
      countBox.setAttribute('aria-label', '打开我的酒柜');
      countBox.addEventListener('mouseenter', function () { _countHover = true; countBox.classList.add('is-hover'); paintCount(); });
      countBox.addEventListener('mouseleave', function () { _countHover = false; countBox.classList.remove('is-hover'); paintCount(); });
      countBox.addEventListener('focus', function () { _countHover = true; countBox.classList.add('is-hover'); paintCount(); });
      countBox.addEventListener('blur', function () { _countHover = false; countBox.classList.remove('is-hover'); paintCount(); });
      /* 默认文案是「录茶N」（库），点击开「全部」段——用户明确要求过：点它看完整列表再挑进柜 */
      countBox.addEventListener('click', function () { openCabinet('all'); });
      countBox.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openCabinet('all'); }
      });
    }
    /* 悬停检测改走舞台 mousemove 几何命中，绕过可能盖住 .wine-count 的透明层
       （WebGL 画布 / 拖动手柄等）；只认几何位置不认元素自身事件，稳定显示「我的酒柜」 */
    if (el.stage) {
      /* 用本作用域的 countBox，不能引用 vCountEl —— 那是 GaiwanMount 闭包里的局部变量，
         跨函数访问会抛 ReferenceError（鼠标一进舞台就报错，悬停切换「我的酒柜」失效）。 */
      var wineCountHit = function (x, y) {
        if (!countBox) return false;
        var r = countBox.getBoundingClientRect();
        return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
      };
      el.stage.addEventListener('mousemove', function (e) {
        if (el.wrap && el.wrap.classList.contains('is-dragging')) {
          if (_countHover) { _countHover = false; if (countBox) countBox.classList.remove('is-hover'); }
          return;
        }
        var inside = wineCountHit(e.clientX, e.clientY);
        if (inside !== _countHover) {
          _countHover = inside;
          if (countBox) countBox.classList.toggle('is-hover', inside);
        }
      });
      el.stage.addEventListener('mouseleave', function () {
        if (_countHover) { _countHover = false; if (countBox) countBox.classList.remove('is-hover'); }
      });
    }
    if (el.find) {
      el.find.addEventListener('input', function () {
        cabQ = (el.find.value || '').trim();
        cabPage = 0;
        renderCabPanel();
      });
      el.find.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') { el.find.value = ''; cabQ = ''; cabPage = 0; renderCabPanel(); }
      });
    }
    /* T7：Esc 有词先清词，无词关面板；设置面板同规。
       监听必须挂在容器上而不是面板上——鼠标点击打开面板时焦点常在外面，
       挂面板上会导致按 Esc 无反应。 */
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if (wrap.classList.contains('is-cab')) {
        if (cabQ) { cabQ = ''; cabPage = 0; if (el.find) el.find.value = ''; renderCabPanel(); }
        else closeCabinet();
      } else if (wrap.classList.contains('is-set')) {
        closeSettings();
      }
    });
    if (el.cabLink) {
      el.cabLink.addEventListener('click', function () { openCabinet('cab'); });
    }
    if (el.range) {
      el.range.addEventListener('input', function () {
        var v = clamp(parseFloat(el.range.value) / 100 || 0, 0, 1);
        state.nightFx[state.night] = v;
        if (el.rangeVal) el.rangeVal.textContent = Math.round(v * 100) + '%';
        applyTheme();
        scheduleSave();
      });
    }
    if (el.nightChips) {
      el.nightChips.addEventListener('click', function (e) {
        var chip = e.target && e.target.closest ? e.target.closest('.wine-chip') : null;
        if (!chip) return;
        setNight(chip.getAttribute('data-n'));
        scheduleSave();
      });
    }
    if (el.enhanceInput) {
      el.enhanceInput.addEventListener('change', function () {
        /* 与其它开关同口径：只改运行态，点「保存」才写盘；「取消」由 _snapCfg 回退 */
        setEnhance(!!el.enhanceInput.checked);
        scheduleSave();
      });
    }
    if (el.steamInput) {
      el.steamInput.addEventListener('change', function () {
        state.steam = !!el.steamInput.checked;
        wrap.classList.toggle('wine-no-steam', !state.steam);
        scheduleSave();
      });
    }
    if (el.spinChips) {
      el.spinChips.addEventListener('click', function (e) {
        var chip = e.target && e.target.closest ? e.target.closest('.wine-chip') : null;
        if (!chip) return;
        setSpinMode(chip.getAttribute('data-s'), false);
        scheduleSave();
      });
    }
    if (el.soundInput) {
      el.soundInput.addEventListener('change', function () {
        state.sound = !!el.soundInput.checked;
        audio.setEnabled(state.sound);
        /* 打开开关时给一记扣托：让人当场听见「开的是什么声音」，比文字说明省一行 */
        if (state.sound) { audio.unlock(); audio.tap(0); }
        scheduleSave();
      });
    }
    if (el.maskEl) el.maskEl.addEventListener('click', function (e) { if (e.target === el.maskEl) closeSettings(); });

    /* ── 卸载 ── */
    function destroy() {
      if (_revealTimer) { clearTimeout(_revealTimer); _revealTimer = null; }
      if (_saveT) { clearTimeout(_saveT); _saveT = null; }
      if (_tipTimer) { clearTimeout(_tipTimer); _tipTimer = null; }
      if (_puffTimer) { clearTimeout(_puffTimer); _puffTimer = null; }
      if (_themeRaf) { cancelAnimationFrame(_themeRaf); _themeRaf = 0; }
      window.removeEventListener('message', onThemeMessage);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      window.removeEventListener('blur', onPointerUp);
      document.removeEventListener('visibilitychange', onVisibility);
      if (_darkObs) { _darkObs.disconnect(); _darkObs = null; }
      if (_visObs) { _visObs.disconnect(); _visObs = null; }
      if (_ro) { _ro.disconnect(); _ro = null; }
      /* 音频线程要显式关：AudioContext 不会随 DOM 一起回收，
         侧栏反复开关模块时会一路累积（每个都占着一条实时音频线程） */
      if (audio) { try { audio.destroy(); } catch (e) { /* 已关闭 */ } audio = null; }
      if (gl) { try { gl.dispose(); } catch (e) { /* 已销毁 */ } gl = null; }
      if (el.wrap && el.wrap.parentNode) el.wrap.parentNode.removeChild(el.wrap);
      el = {};
      if (instance === self) instance = null;
    }
    var self = { destroy: destroy, version: VERSION };
    instance = self;
    return self;

    function makeApi() {
      var s = { destroy: function () { if (el.wrap && el.wrap.parentNode) el.wrap.parentNode.removeChild(el.wrap); el = {}; if (instance === s) instance = null; }, version: VERSION };
      instance = s;
      return s;
    }
  }

  /* ══════════════════════ 样式 ══════════════════════ */
  /* 尺寸 / 圆角 / 字号 / 时长 / 缓动 一律走 webapp 的 variables.css；
     只有器物自身的配光（色相派生）与茶汤是本地量。 */
  function css() {
    return '' +
    /* 【主题底 · 与画中卷「香道」明暗统一】
       香道的底不在 .scroll-incense（各层 transparent），而在宿主 .scroll-workbench 的
       linear-gradient(165deg, --bg-gradient-start/mid1/mid2/end)，亮暗由 variables.css
       的 :root（亮）/ :host(.dark)（暗）四个令牌切换。
       模块视图是独立 iframe（ModuleView 用 blob URL 加载 module.html）：
       :host 只在 Shadow DOM 生效 → :host::after 的整页渐变不绘制、:host(.dark) 的
       暗色令牌也不切换，iframe 里恒取 :root 的亮色值 —— 看上去就是「没有背景」。
       故这里自己铺同一条渐变，并补一条 :root.dark 覆盖（数值逐条对齐
       obsidian-bamboo-review/webapp/assets/styles/variables.css 的暗色块），
       明暗都与香道一致；宿主日后若修好 iframe 的令牌切换，这条覆盖值相同、无害。 */
    ':root.dark{' +
      '--bg-gradient-start:hsl(calc(var(--accent-hue,120) + 16),min(100%,calc(30% * var(--accent-saturation-ui,1))),min(18%,calc(13% + var(--accent-lightness-offset,0%))));' +
      '--bg-gradient-mid1:hsl(calc(var(--accent-hue,120) + 6),min(100%,calc(34% * var(--accent-saturation-ui,1))),min(12%,calc(7% + var(--accent-lightness-offset,0%))));' +
      '--bg-gradient-mid2:hsl(calc(var(--accent-hue,120) + 28),min(100%,calc(38% * var(--accent-saturation-ui,1))),min(18%,calc(16% + var(--accent-lightness-offset,0%))));' +
      '--bg-gradient-end:hsl(calc(var(--accent-hue,120) + 2),min(100%,calc(30% * var(--accent-saturation-ui,1))),min(15%,calc(9% + var(--accent-lightness-offset,0%))));' +
    '}' +
    '.wine-wrap{' +
      '--lo:var(--accent-lightness-offset,0%);' +
      'position:relative;height:100%;min-height:0;display:flex;flex-direction:column;' +
      'font-family:var(--font-family,-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif);' +
      'color:hsl(var(--th),18%,22%);overflow:hidden;user-select:none;-webkit-user-select:none;' +
      'background:linear-gradient(165deg,' +
        'var(--bg-gradient-start,#f7faf5) 0%,var(--bg-gradient-mid1,#f2f8f0) 20%,' +
        'var(--bg-gradient-mid2,#eef6eb) 40%,var(--bg-gradient-mid1,#f2f8f0) 60%,' +
        'var(--bg-gradient-end,#f6faf4) 80%,var(--bg-gradient-start,#f7faf5) 100%);' +
    '}' +
    '.wine-wrap.wine-dark{' +
      'color:hsl(var(--th),10%,92%);' +
    '}' +
    /* 【设置面板 / 茶柜的明暗适配】
       模块 iframe 是普通文档、没有 Shadow DOM：宿主 variables.css 的暗色令牌全部写在
       :host(.dark) 里，在这里永远不生效（上面 :root.dark 只补了 4 个背景渐变令牌）。
       弹窗吃的是 --overlay-surface / --text-* 这套语义变量，若不在模块侧补暗色值，
       暗色主题下仍取 :root 的亮色令牌 —— 近白底 + 深字，一块刺眼的白板，即「没有明暗适配」。
       这里按宿主 :host(.dark) 的明度公式逐条对齐，改用模块自己的 --th / --lo 跟随色相与
       明度滑块；作用域只落在 .wine-wrap.wine-dark 内，不越权改全局。.wine-dark 由
       applyTheme() 响应 html class 与 theme:changed 双向切换，切主题即时生效。 */
    '.wine-wrap.wine-dark{' +
      /* 面板底封顶 18%：明度滑块 +15% 时若抬到 25%，暗色 tertiary/hover 文字会跌破 AA；
         对齐宿主 --bg-gradient-* 的 min(18%,…) 上限口径。 */
      '--overlay-surface:hsl(var(--th),18%,min(18%,calc(10% + var(--lo,0%))));' +
      '--overlay-border:1px solid hsla(var(--th),18%,60%,.22);' +
      '--overlay-shadow:0 8px 32px rgba(0,0,0,.5);' +
      '--text-primary:hsl(var(--th),18%,calc(91% + var(--lo,0%)));' +
      '--text-secondary:hsl(var(--th),15%,calc(74% + var(--lo,0%)));' +
      '--text-tertiary:hsl(var(--th),11%,calc(66% + var(--lo,0%)));' +
      '--text-on-accent:#fff;' +
      '--bamboo-border:hsla(var(--th),18%,60%,.22);' +
      /* 主色在暗底上同时当「主要按钮」的底（白字）与 hover 文字色：压到 34% 保白字
         在所有色相下都达 AA（黄相 60° 最差，38% 时只有 4.14:1，34% 时 4.99:1）。
         hover / focus 由下面亮一档的 hsl(--th,42%,68%) 规则接管。
         min() 封顶：明度滑块拉到 +15% 时若跟着提亮到 49%，白字对比会掉到 3.4:1。 */
      '--bm-primary:hsl(var(--th),32%,min(34%,calc(34% + var(--lo,0%))));' +
    '}' +

    /* z-index:0 让舞台自成层叠上下文：酒香才能用负层压到画布（器物）后面，
       同时不影响工具行、命中区这些 z-index:auto 的定位子元素（它们仍在画布之上） */
    '.wine-stage{position:relative;z-index:0;flex:1 1 auto;min-height:0;touch-action:none;}' +
    /* 命中区：盖子在视口里的投影（相机固定 → 比例固定） */
    '.wine-kbd{position:absolute;left:0;top:0;width:100%;height:100%;padding:0;border:0;background:transparent;' +
      'opacity:0;pointer-events:none;}' +
    '.wine-kbd:focus-visible{opacity:1;outline:2px dashed hsl(var(--th),32%,52%);outline-offset:-6px;' +
      'border-radius:var(--radius-md,14px);}' +
    /* 设置面板的字段 / 分组 / 选项栅格统一定义在下方「设置面板」段：
       这里不再散落 .wine-sub 与 .wine-chips[data-row] 的重复覆盖，避免同一属性两处打架。
       注意：注释不能带 `+`，否则下一行字符串会被一元加号转成 NaN，样式串里出现 "NaN"。 */
    /* 酒香只留「一缕」：酒不像茶那样成团成柱地冒，开塞后是丝丝一线往上散。
       所以只画一条细缕（1.6），去掉成排雾珠与成组气缕——浓度靠「细而长」与
       比茶更快的节奏（4.2s / 开塞 .45s）表达，不靠条数与粗细堆出来。 */
    '.wine-steam{position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:-1;' +
      'opacity:0;transition:opacity var(--duration-slow) var(--ease-cn);}' +
    '.wine-wrap.is-open .wine-steam{opacity:1;transition-delay:var(--duration-normal);}' +
    '.wine-wrap.wine-no-steam .wine-steam{display:none;}' +
    /* --wine-aroma-k 由酒精度派生（3%vol≈.86 / 53%vol≈1.07），只乘颜色 alpha，不动形态节奏 */
    '.wine-wisp{fill:none;stroke:hsla(var(--th),18%,57%,calc(var(--wine-steam-a,.34) * var(--wine-aroma-k,1)));' +
      'stroke-width:1.6;stroke-linecap:round;transform-box:fill-box;transform-origin:50% 100%;}' +
    /* 瓶口一丝暖光：不呼吸、不放大，只让「刚拔塞」的瓶口有温度 */
    '.wine-aroma-glow{fill:hsla(38,42%,64%,.11);filter:blur(3px);' +
      'transform-box:fill-box;transform-origin:50% 50%;}' +
    '.wine-dark .wine-wisp{stroke:hsla(var(--th),26%,96%,calc(var(--wine-steam-a-dark,.26) * var(--wine-aroma-k,1)));}' +
    '.wine-dark .wine-aroma-glow{fill:hsla(38,40%,88%,.08);}' +
    '.wine-wrap.is-open .wine-wisp{animation:wine-aroma 4.2s ease-out infinite;}' +
    '@keyframes wine-aroma{' +
      '0%{opacity:0;transform:translateY(1.4px) scale(.94,.9);}' +
      '18%{opacity:1;}' +
      '62%{opacity:.38;}' +
      '100%{opacity:0;transform:translate(-1.2px,-6.4px) scale(1,1.1);}' +
    '}' +
    /* 拔塞那一下：一缕轻烟被带动，.45s 就收住（茶是 .9s 的大股热气） */
    '.wine-wrap.wine-puff .wine-steam{animation:wine-aroma-puff .45s ease-out both;}' +
    '@keyframes wine-aroma-puff{' +
      '0%{opacity:0;transform:translateY(1px) scale(.94,1);}' +
      '40%{opacity:1;transform:translateY(-1px) scale(1.05,1);}' +
      '100%{opacity:1;transform:none;}' +
    '}' +
    '.wine-wrap.wine-reference .wine-steam{animation:none;}' +
    /* 上下两行题字：位置由 placeVerse() 按器物在屏幕上的实际边界算，不写死百分比 */
    /* 竖排：外层满宽只负责水平居中，内层 span 用 vertical-rl 把字竖着叠；
       高度随字数变化，故用 translateY(-50%) 以自身中心对齐 placeVerse() 给出的 y */
    '.wine-verse{position:absolute;left:0;right:0;text-align:center;pointer-events:none;' +
      'font-size:15px;line-height:1;opacity:.62;transform:translateY(-50%);' +
      'white-space:nowrap;transition:opacity var(--duration-slow) var(--ease-cn);}' +
    /* 收录数量：竖排、默认显示（未开盖），开盖后让位给茶样文案 */
    /* 这一列本身就是「柜 / 库」的状态显示，点击直达茶柜 —— 比另加图标更省地方 */
    /* 计数列常显 .55（PATCH-49 的隐藏是误读：用户当时要的是改名不是隐藏）；
       悬停自身提亮到 .85 提示可点，开盖后让位给茶样文案 */
    '.wine-count{position:absolute;z-index:4;left:0;right:0;display:grid;justify-content:center;justify-items:center;' +
      'align-items:center;pointer-events:auto;cursor:pointer;' +
      'font-size:15px;line-height:1;opacity:.55;transform:translateY(-50%);' +
      'white-space:nowrap;transition:opacity var(--duration-slow) var(--ease-cn);}' +
    '.wine-count:focus-visible{opacity:.85;}' +
    /* 同级特异性：否则悬停自身被下面的开盖规则之外的因素压住 */
    '.wine-wrap:not(.is-open) .wine-count:hover{opacity:.85;}' +
    /* 颜色不写死：继承 .wine-wrap 的主题色（浅底 hsl(--th,18%,22%)、深底 hsl(--th,10%,92%)），
       与两列题字同源，只是透明度更低一档。 */
    '.wine-count>span{grid-area:1/1;display:inline-block;writing-mode:vertical-rl;text-orientation:mixed;' +
      'letter-spacing:.30em;margin-inline-end:-.30em;transition:opacity var(--duration-fast) var(--ease-cn);}' +
    '.wine-count .t-cab{opacity:0;}' +
    '.wine-count:hover .t-num,.wine-count.is-hover .t-num,.wine-count:focus-within .t-num{opacity:0;}' +
    '.wine-count:hover .t-cab,.wine-count.is-hover .t-cab,.wine-count:focus-within .t-cab{opacity:1;}' +
    /* 开盖后这段纵向空间交给茶样文案：数量是未开盖态的信息，工具行也不必在喝茶中途出现
       （要开茶柜/设置，合盖即可）。不隐藏的话三者会叠在一起、按钮被盖住点不到。 */
    /* 竖排里 text-decoration:underline 会沿文字方向画一条竖线，看着像多出来的一根线，
       所以悬停只换颜色，不加下划线 */
    '.wine-count:hover>span,.wine-count:focus-visible>span{color:var(--bm-primary,#3a7a3a);opacity:1;}' +
    '.wine-wrap.is-open .wine-count{opacity:0;pointer-events:none;}' +
    /* 设置入口不随开盖让位：brewFromList 已能先合上再揭盖，且工具行只有齿轮，禁用等于拔塞后打不开设置 */
    /* 亮色主题下夜色两档与强度无视觉效果，置灰并说明；暗色恢复 */
    '.wine-nofx .wine-chip.night{opacity:.4;pointer-events:none;}' +
    '.wine-nofx .wine-field-sub{opacity:.4;pointer-events:none;}' +
    '.wine-night-note{display:none;margin-top:4px;font-size:11px;line-height:1.45;opacity:.5;}' +
    '.wine-nofx .wine-night-note{display:block;}' +
    /* ── 窄面板（<210px）：单列列表、分类三列、留白收紧 ── */
    '.wine-narrow .wine-dialog,.wine-narrow .wine-cab-panel{padding:12px;' +
      'max-width:none;width:calc(100% - 8px);}' +
    '.wine-narrow .wine-dialog{padding:12px 11px 11px;}' +
    '.wine-narrow .wine-cab-list{grid-template-columns:1fr;column-gap:0;row-gap:0;}' +
    '.wine-narrow .wine-seg-types{grid-template-columns:repeat(3,1fr);gap:0 6px;}' +
    '.wine-narrow .wine-seg-btn{font-size:11px;}' +
    '.wine-narrow .wine-row{padding:4px 4px;margin:0 -4px;}' +
    '.wine-narrow .wine-find{height:24px;line-height:24px;font-size:11px;margin-top:8px;}' +
    '.wine-narrow .wine-title{font-size:14px;}' +
    /* 特异性需高于 .wine-dialog .wine-title，否则窄面板会被拉回 15px */
    '.wine-narrow .wine-dialog .wine-title{font-size:14px;letter-spacing:.06em;text-indent:.06em;}' +
    '.wine-narrow .wine-actions{padding-top:8px;margin-top:10px;}' +
    /* 窄面板：字段名列再收 6px，茶类仍保持 4 列（2 字标签在 ~43px 列宽里放得下） */
    '.wine-narrow .wine-field{grid-template-columns:58px minmax(0,1fr);column-gap:6px;}' +
    '.wine-narrow .wine-chips-types{gap:2px 4px;}' +
    '.wine-narrow .wine-chips[data-row]{gap:2px 4px;}' +
    '.wine-narrow .wine-sec{margin-top:10px;}' +
    '.wine-narrow .wine-sec+.wine-sec{padding-top:10px;}' +
    '.wine-narrow .wine-sec-h{letter-spacing:.08em;text-indent:.08em;}' +
    '.wine-narrow .wine-field-sub .wine-field-label{padding-left:8px;}' +
    '' +
    '.wine-verse>span{display:inline-block;writing-mode:vertical-rl;text-orientation:mixed;' +
      'letter-spacing:.18em;margin-inline-end:-.18em;}' +
    '.wine-wrap:hover .wine-verse{opacity:.78;}' +
    /* 滑块行已并入 .wine-field 两列网格（见设置面板段），此处只补栅格内的宽度。
       同上：注释行不带 `+`，否则下一行字符串会被一元加号吞成 NaN。 */
    '.wine-range-wrap{display:flex;align-items:center;gap:8px;width:100%;}' +
    '.wine-range-wrap .wine-range{width:auto;flex:1 1 auto;}' +
    '.wine-range-val{flex:0 0 auto;min-width:34px;text-align:right;font-size:11px;' +
      'color:var(--text-tertiary,currentColor);font-variant-numeric:tabular-nums;}' +
    /* 滑块沿用 curtain 模块 .bc-range 的组件写法（轨道 4px / 拇指 14px），
       并保留那条必须的 min-height:0 —— base.css 有全局 :where(input) 触控地板，
       不显式清零会被撑到 44px 高，把面板顶变形。 */
    '.wine-range{flex:1 1 auto;min-width:0;display:block;height:18px;min-height:0;margin:0;' +
      '-webkit-appearance:none;appearance:none;background:transparent;cursor:pointer;' +
      '-webkit-tap-highlight-color:transparent;}' +
    '.wine-range::-webkit-slider-runnable-track{height:4px;border-radius:2px;background:hsla(var(--th),20%,46%,.28);}' +
    '.wine-range::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:14px;height:14px;margin-top:-5px;' +
      'border-radius:50%;background:hsl(var(--th),36%,40%);box-shadow:0 1px 2px rgba(0,0,0,.3);}' +
    '.wine-range::-moz-range-track{height:4px;border-radius:2px;background:hsla(var(--th),20%,46%,.28);}' +
    '.wine-range::-moz-range-thumb{width:14px;height:14px;border:none;border-radius:50%;' +
      'background:hsl(var(--th),36%,40%);box-shadow:0 1px 2px rgba(0,0,0,.3);}' +
    '.wine-range:focus-visible{outline:2px solid hsl(var(--th),40%,46%);outline-offset:2px;}' +
    '.wine-hit{position:absolute;left:22%;top:27%;width:56%;height:14%;' +
      'cursor:grab;outline:none;transition:transform var(--duration-slower) cubic-bezier(.2,.8,.2,1);}' +
    '.wine-wrap.is-dragging .wine-hit{cursor:grabbing;transition:none;}' +
    '.wine-stage{cursor:grab;}' +
    '.gaiwan-canvas{position:absolute;inset:0;pointer-events:none;}' +
    '.wine-wrap.is-orbiting .wine-stage{cursor:grabbing;}' +
    '.wine-hit:focus-visible{outline:2px dashed hsl(var(--th),32%,52%);outline-offset:4px;border-radius:50%;}' +
    '.wine-wrap.wine-nogl .wine-stage{display:none;}' +

    /* 文案整体上提：用 relative+top 而不是 margin/transform ——
       margin 会改变舞台高度（器物跟着缩放），transform 与 is-live 的淡入位移冲突。 */
    '.wine-card{position:relative;padding:0 var(--space-20) var(--space-8);text-align:center;opacity:0;' +
      'transform:translateY(10px);transition:opacity var(--duration-slow) var(--ease-cn),' +
      'transform var(--duration-slow) var(--ease-cn);}' +
    '.wine-card.is-live{opacity:1;transform:none;}' +
    '.wine-save{margin-top:8px;padding:2px 0;border:0;background:none;cursor:pointer;' +
      'font-family:inherit;font-size:11px;letter-spacing:.06em;color:var(--bm-primary,#3a7a3a);opacity:.8;' +
      'transition:opacity var(--duration-fast) var(--ease-cn);}' +
    '.wine-save:hover{opacity:1;text-decoration:underline;text-underline-offset:3px;}' +
    '.wine-name{font-size:var(--type-xl);font-weight:500;letter-spacing:.12em;line-height:1.3;' +
      'font-family:"Songti SC","Noto Serif CJK SC",Georgia,serif;}' +
    '.wine-meta{margin-top:var(--space-5);font-size:var(--type-xs);opacity:.62;letter-spacing:.08em;}' +
    '.wine-note{margin-top:var(--space-12);font-size:var(--type-sm);opacity:.8;line-height:1.7;letter-spacing:.04em;}' +
    '.wine-brew{margin-top:var(--space-10);font-size:var(--type-xs);opacity:.5;letter-spacing:.08em;' +
      'display:flex;align-items:center;justify-content:center;gap:var(--space-8);}' +
    '.wine-dot{width:2px;height:2px;border-radius:50%;background:currentColor;opacity:.55;}' +
    /* 提示行默认隐藏，悬停整个模块时淡入；触摸设备没有 hover，保持常显。
       只改透明度不改 display —— 它仍占位，底部布局与卡片位置不受影响。 */
    '.wine-tip{position:relative;flex:0 0 auto;text-align:center;font-size:var(--type-xs);letter-spacing:.22em;' +
      'opacity:0;padding:0 var(--space-8) 0;transition:opacity var(--duration-slow) var(--ease-cn);}' +
    '.wine-wrap:hover .wine-tip,.wine-wrap:focus-within .wine-tip{opacity:.34;}' +
    '@media (hover:none){.wine-tip{opacity:.34;}}' +

    /* 设置按钮放到底部居中、提示行上方：原来在右上角，侧栏里离器物太远，
       且和「录茶六十 / 吃茶去。」那几列字抢右上角的空白。 */
    /* z-index 必须高于画布：齿轮在 .wine-stage 里，而画布由渲染器后插入 stage，会盖住它 */
    /* 底部工具行：茶柜 + 设置，两个图标并列。容器负责水平居中（margin auto 不依赖宽度），
       按钮常显但很淡 —— 一个图标可以靠 hover 藏，两个就不容易被发现了。 */
    '.wine-tools{position:absolute;z-index:2;left:0;right:0;margin:0 auto;top:0;width:max-content;' +
      'display:flex;flex-direction:column;align-items:center;gap:10px;}' +
    '.wine-tools button{width:22px;height:22px;display:flex;align-items:center;justify-content:center;' +
      'padding:0;border:0;background:transparent;color:inherit;opacity:.22;cursor:pointer;' +
      'transition:opacity var(--duration-normal) var(--ease-cn),transform var(--duration-normal) var(--ease-cn);}' +
    '.wine-wrap:hover .wine-tools button{opacity:.42;}' +
    '.wine-tools button:hover,.wine-tools button:focus-visible{opacity:.85;}' +
    '.wine-tools button:focus-visible{outline:2px solid hsl(var(--th),32%,52%);outline-offset:2px;}' +
    '.wine-gear:hover{transform:rotate(30deg);}' +
    '@media (hover:none){.wine-tools button{opacity:.42;}}' +

    /* 面板贴底：居中会正好盖住盖碗，调参时看不到器物 */
    '.wine-mask{position:absolute;inset:0;display:none;align-items:flex-end;justify-content:center;' +
      'background:transparent;padding:12px;z-index:var(--z-layer-overlay,10000);pointer-events:auto;}' +
    '.wine-wrap.is-set .wine-mask,.wine-wrap.is-cab .wine-mask{display:flex;}' +
    /* ── 设置面板：尺寸全部写死像素，不再吃宿主的 --space-* ——
       那套令牌是给正文排版的，用在弹窗里会把每行都撑大，整体显笨。 */
    '.wine-dialog,.wine-cab-panel{display:none;width:100%;max-width:296px;max-height:80%;overflow-y:auto;' +
      'scrollbar-width:none;-ms-overflow-style:none;' +
      'background:var(--overlay-surface,#fff);' +
      'border:var(--overlay-border,1px solid rgba(0,0,0,.08));border-radius:14px;' +
      'box-shadow:var(--overlay-shadow,0 12px 32px rgba(0,0,0,.18));padding:16px;' +
      'color:var(--text-primary,inherit);}' +
    /* 设置面板对齐博客表单：圆角 12 / padding 14·13。仅作用于 .wine-dialog，
       茶柜面板继续用共享外壳的 14 / 16，不受本次对齐影响。 */
    '.wine-dialog{border-radius:12px;padding:14px 13px;}' +
    /* 底色与文字色都取宿主语义变量（--overlay-surface / --text-*），二者必须配套翻转。
       宿主在 Shadow DOM 下靠 :host(.dark) 翻转，但模块 iframe 没有 shadow host、翻不到，
       故暗色值由上方 .wine-wrap.wine-dark 在模块作用域内补齐（不越权改全局）。
       对比度核查按此口径执行（16/16 通过，见 PATCHES.md PATCH-44）。 */
    '.wine-cab-panel::-webkit-scrollbar,.wine-dialog::-webkit-scrollbar{display:none;}' +
    '.wine-wrap.is-set .wine-dialog,.wine-wrap.is-cab .wine-cab-panel{display:block;}' +
    '.wine-title{font-size:14px;font-weight:600;line-height:1.3;letter-spacing:.02em;}' +
    /* 底部入口独立成一级：与最后一组之间拉出更明确的间隔与分隔线 */
    '.wine-link{display:flex;align-items:center;justify-content:space-between;width:100%;gap:8px;' +
      'margin-top:14px;padding:10px 0 0;border:0;border-top:1px solid var(--bamboo-border,rgba(0,0,0,.12));' +
      'background:none;cursor:pointer;font-family:inherit;font-size:12px;' +
      'color:var(--text-tertiary,currentColor);opacity:.85;}' +
    '.wine-link:hover{opacity:1;color:var(--bm-primary,#3a7a3a);}' +
    '.wine-link-arrow{opacity:.6;}' +
    /* 搜索框：左右内边距归零，让占位文字与标题/分类/茶名共用同一条左边线。
       （原来用填充底色 + 9px 内边距，文字比其它内容右移了 9px，是唯一没对齐的元素）
       高度写死并 min-height:0，否则被宿主的表单触控地板撑高。 */
    '.wine-find{display:block;width:100%;box-sizing:border-box;height:26px;min-height:0;margin:8px 0 8px;' +
      'padding:0;border:0;border-bottom:1px solid hsla(var(--th),18%,46%,.16);border-radius:0;' +
      'background:none;color:inherit;font-family:inherit;font-size:12px;line-height:26px;outline:none;' +
      '-webkit-appearance:none;appearance:none;}' +
    '.wine-find::placeholder{color:var(--text-tertiary,currentColor);opacity:.5;}' +
    '.wine-find:focus{border-bottom-color:var(--bm-primary,#3a7a3a);}' +
    '.wine-find::-webkit-search-cancel-button{-webkit-appearance:none;display:none;}' +
    '.wine-seg{display:flex;gap:16px;margin-top:4px;padding-bottom:3px;' +
      'border-bottom:1px solid hsla(var(--th),18%,46%,.14);}' +
    /* 行高压到 1.1、上下内边距 1px：胶囊去掉后按钮仍被行高撑出留白 */
    '.wine-seg-btn{padding:2px 0;min-height:0;line-height:1.1;white-space:nowrap;text-align:left;border:0;background:none;cursor:pointer;' +
      'font-family:inherit;font-size:11px;color:var(--text-tertiary,currentColor);opacity:.8;}' +
    '.wine-seg-btn.on{color:var(--bm-primary,#3a7a3a);opacity:1;font-weight:600;}' +
    /* 暗色底上主色回退值对比度只有 3.1（实测 #3a7a3a on #1d231d），选中色按主题双向定明暗保 AA。
       弹窗里所有用 --bm-primary 作 hover / focus 色的元素一并抬到亮一档，否则暗底上看不清。 */
    '.wine-wrap.wine-dark .wine-seg-btn.on,.wine-wrap.wine-dark .wine-chip.on,.wine-wrap.wine-dark .wine-row-t.on,' +
    '.wine-wrap.wine-dark .wine-row-n:hover,.wine-wrap.wine-dark .wine-save,' +
    '.wine-wrap.wine-dark .wine-link:hover,.wine-wrap.wine-dark .wine-x:hover,' +
    '.wine-wrap.wine-dark .wine-row-t:hover,.wine-wrap.wine-dark .wine-cab-del:hover{color:hsl(var(--th),42%,68%);}' +
    '.wine-wrap.wine-dark .wine-find:focus{border-bottom-color:hsl(var(--th),42%,68%);}' +
    '.wine-wrap.wine-dark .wine-chip:focus-visible,.wine-wrap.wine-dark .wine-btn:focus-visible,' +
    '.wine-wrap.wine-dark .wine-switch input:focus-visible ~ .track{outline-color:hsl(var(--th),42%,68%);}' +
    '.wine-wrap.wine-dark .wine-switch input:checked ~ .track{background:hsl(var(--th),42%,68%);}' +
    '.wine-wrap:not(.wine-dark) .wine-seg-btn.on,.wine-wrap:not(.wine-dark) .wine-chip.on,' +
    '.wine-wrap:not(.wine-dark) .wine-row-t.on,.wine-wrap:not(.wine-dark) .wine-row-n:hover,' +
    '.wine-wrap:not(.wine-dark) .wine-save{color:hsl(var(--th),42%,30%);}' +
    /* 类型段必须写在这之后，否则 margin/padding 会被上面的 .wine-seg 覆盖（之前就是这样） */
    '.wine-seg-types{display:grid;grid-template-columns:repeat(5,1fr);gap:0 8px;margin-top:5px;' +
      'padding-bottom:2px;border-bottom:0;overflow:visible;}' +
    '.wine-seg-types .wine-seg-btn{flex:0 0 auto;font-size:11px;}' +
    /* 两列网格 + 分页取代滚动：72 行竖排要 2400px，两列分页后一屏放得下 */
    '.wine-cab-head{display:flex;align-items:center;justify-content:space-between;gap:8px;}' +
    '.wine-cab-title{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}' +
    '.wine-x{width:22px;height:22px;display:flex;align-items:center;justify-content:center;padding:0;' +
      'border:0;background:none;color:inherit;opacity:.45;font-size:17px;line-height:1;cursor:pointer;' +
      'transition:opacity var(--duration-fast) var(--ease-cn),color var(--duration-fast) var(--ease-cn);}' +
    '.wine-x:hover{opacity:1;color:var(--bm-primary,#3a7a3a);}' +
    /* 单列：茶名有完整宽度，＋/✓ 归位行尾，扫读更快；每页 8 款保证面板高度不涨 */
    '.wine-cab-list{display:grid;grid-template-columns:minmax(0,1fr);margin-top:8px;}' +
    '.wine-pager{display:none;align-items:center;justify-content:center;gap:16px;margin-top:8px;padding-top:9px;white-space:nowrap;' +
      'border-top:1px solid hsla(var(--th),18%,46%,.12);' +
      'font-size:11px;color:var(--text-tertiary,currentColor);opacity:.75;}' +
    '.wine-pager.show{display:flex;}' +
    '.wine-pg{padding:0 6px;border:0;background:none;cursor:pointer;font-family:inherit;font-size:13px;' +
      'line-height:1;color:inherit;opacity:.7;}' +
    '.wine-pg:hover{opacity:1;}' +
    '.wine-pg:disabled{opacity:.25;cursor:default;}' +
    /* content-visibility: 屏幕外的行跳过布局与绘制，72 行列表打开时不再全量排版 */
    '.wine-row{display:flex;align-items:center;justify-content:space-between;gap:6px;' +
      'padding:2px 6px;margin:0 -6px;border-radius:6px;' +
      'transition:background-color var(--duration-fast) var(--ease-cn);' +
      'cursor:default;' +
      'font-size:12px;color:var(--text-secondary,inherit);' +
      'content-visibility:auto;contain-intrinsic-size:auto 28px;contain:content;}' +
    '.wine-row:hover{background:hsla(var(--th),18%,50%,.08);}' +
    /* 茶名是「泡」的按钮（J3）：虚线暗示可点，hover 实线主色——可供性不许撒谎（P2） */
    '.wine-row-n{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;' +
      'padding:0;border:0;background:none;cursor:pointer;font-family:inherit;font-size:12px;' +
      'color:var(--text-secondary,inherit);text-align:left;' +
      'text-decoration:underline dashed hsla(var(--th),18%,46%,.30);text-underline-offset:3px;' +
      'text-decoration-thickness:1px;transition:color var(--duration-fast) var(--ease-cn);}' +
    '.wine-row-n:hover{color:var(--bm-primary,#3a7a3a);text-decoration-style:solid;}' +
    '.wine-row-n:focus-visible{outline:2px solid hsl(var(--th),32%,52%);outline-offset:2px;border-radius:3px;}' +
    '.wine-row-t{flex:0 0 auto;width:24px;height:24px;display:flex;align-items:center;justify-content:flex-end;' +
      'padding:0;border:0;background:none;cursor:pointer;font-family:inherit;font-size:13px;line-height:1;' +
      'color:var(--text-tertiary,currentColor);opacity:.6;}' +
    '.wine-row-t:hover{opacity:1;color:var(--bm-primary,#3a7a3a);}' +
    '.wine-row-t.on{color:var(--bm-primary,#3a7a3a);opacity:1;}' +
    '.wine-cab-item{display:flex;align-items:center;justify-content:space-between;gap:8px;' +
      'padding:5px 0;border-bottom:1px solid hsla(var(--th),18%,46%,.14);' +
      'font-size:12px;color:var(--text-secondary,inherit);}' +
    '.wine-cab-item:last-child{border-bottom:0;}' +
    '.wine-cab-del{padding:1px 0;border:0;background:none;cursor:pointer;font-family:inherit;' +
      'font-size:11px;color:var(--text-tertiary,currentColor);opacity:.7;}' +
    '.wine-cab-del:hover{opacity:1;color:var(--bm-primary,#3a7a3a);}' +
    /* 空状态要跨两列，否则在网格里只占半行、文字被挤断 */
    '.wine-cab-empty{grid-column:1 / -1;padding:12px 0;text-align:center;font-size:11px;line-height:1.6;' +
      'color:var(--text-tertiary,currentColor);opacity:.75;}' +
    /* ── 设置面板信息层级 ──
       三级：页头（主标题 + 说明，居中）→ 3 个分组（标题居中，两侧对称细线）→
       每条字段走同一套两列栅格 [58px 字段名 | 1fr 控件]，开关统一右对齐。
       字段名是「行标签」不是标题，必须保持左对齐，否则栅格左边界会散掉。
       另两处从属关系：强度缩进弱化、归属夜色效果；开关区与属性区用淡线隔开。
       尺寸仍全部写死像素，不吃宿主的 --space-*。 */
    '.wine-head{text-align:center;padding-bottom:14px;}' +
    /* .wine-title 同时被茶柜面板复用，居中必须限定在 .wine-dialog 内 */
    '.wine-dialog .wine-title{text-align:center;font-size:15px;letter-spacing:.08em;text-indent:.08em;}' +
    '.wine-hint{margin-top:5px;font-size:11px;line-height:1.45;text-align:center;' +
      'color:var(--text-tertiary,currentColor);opacity:.85;}' +
    '.wine-sec{margin-top:15px;}' +
    '.wine-sec+.wine-sec{padding-top:15px;border-top:1px solid var(--bamboo-border,rgba(0,0,0,.14));}' +
    '.wine-sec-h{display:block;margin:0 0 8px;text-align:center;font-size:10.5px;font-weight:600;' +
      'line-height:1.2;letter-spacing:.08em;text-indent:.08em;color:var(--text-secondary,inherit);}' +
    /* 组标题改为博客式纯居中短标签，停用原来的两侧细线伪元素。
       颜色沿用 --text-secondary（提一级），不碰暗色语义变量，保住对比度核查。 */
    '.wine-sec-h::before,.wine-sec-h::after{content:none;}' +
    '.wine-field{display:grid;grid-template-columns:64px minmax(0,1fr);align-items:center;' +
      'column-gap:8px;min-height:22px;margin-top:9px;}' +
    '.wine-field-label{font-size:12px;font-weight:500;line-height:1.3;color:var(--text-secondary,inherit);white-space:nowrap;}' +
    /* 从属项与分区：让「选哪项」和「开不开」不再挤在同一视觉层 */
    '.wine-field-sub{margin-top:2px;}' +
    '.wine-field-sub .wine-field-label{padding-left:10px;font-size:10px;opacity:.72;}' +
    '.wine-field.wine-field-divider{border-top:1px solid var(--bamboo-border,rgba(0,0,0,.12));' +
      'padding-top:9px;margin-top:12px;}' +
    /* 选项改成栅格列：茶类 4 列、器物 2 列，列首对齐，不再 flex-wrap 随机散开 */
    '.wine-chips{display:grid;gap:6px 8px;margin:0;min-width:0;}' +
    '.wine-chips-types{grid-template-columns:repeat(4,minmax(0,1fr));margin-top:2px;}' +
    '.wine-chips-types .wine-chip{text-align:center;}' +
    '.wine-chips[data-row]{display:inline-flex;gap:0;justify-self:end;' +
      'border:1px solid var(--bamboo-border,rgba(0,0,0,.16));border-radius:999px;overflow:hidden;vertical-align:middle;}' +
    '.wine-chips[data-row] .wine-chip{padding:3px 13px;text-align:center;' +
      'border-right:1px solid var(--bamboo-border,rgba(0,0,0,.16));}' +
    '.wine-chips[data-row] .wine-chip:last-child{border-right:0;}' +
    '.wine-chips[data-row] .wine-chip.on{background:var(--bm-primary,#3a7a3a);color:#fff;opacity:1;}' +
    /* min-height:0 同 .wine-range —— 宿主 base.css 对表单控件有全局触控地板 */
    '.wine-chip{padding:2px 0;min-height:0;border:0;background:none;border-radius:0;text-align:left;' +
      'color:var(--text-tertiary,currentColor);font-size:11px;line-height:1.4;' +
      'cursor:pointer;white-space:nowrap;opacity:.85;' +
      'transition:color var(--duration-fast) var(--ease-cn),opacity var(--duration-fast) var(--ease-cn);}' +
    /* 选中：改用颜色 + 字重，并在下方加一道 2px 短横，代替原来的描边胶囊 */
    '.wine-chip.on{color:var(--bm-primary,#3a7a3a);opacity:1;font-weight:600;}' +
    '.wine-chip:hover{opacity:1;}' +
    '.wine-chip:focus-visible,.wine-btn:focus-visible{outline:2px solid var(--bm-primary,#3a7a3a);outline-offset:2px;}' +
    /* .wine-switch 同时带 .wine-field：栅格由后者提供，这里只补语义与间距，
       并把 track 推到第二列右端，让四个开关与上方所有控件共用同一条右边界。 */
    '.wine-switch{margin-top:9px;font-size:11px;color:var(--text-secondary,inherit);cursor:pointer;position:relative;}' +
    '.wine-field.wine-switch > .wine-switch{margin-top:0;}' +
    '.wine-switch input{position:absolute;opacity:0;width:0;height:0;pointer-events:none;}' +
    '.wine-switch .track{width:32px;height:18px;border-radius:999px;flex:0 0 auto;justify-self:end;' +
      'background:var(--bamboo-border,rgba(0,0,0,.16));position:relative;' +
      'transition:background-color var(--duration-fast) var(--ease-cn);}' +
    '.wine-switch .track::after{content:"";position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;' +
      'background:#fff;transition:transform var(--duration-fast) var(--ease-cn);box-shadow:0 1px 2px rgba(0,0,0,.22);}' +
    '.wine-switch input:checked ~ .track{background:var(--bm-primary,#3a7a3a);}' +
    '.wine-switch input:checked ~ .track::after{transform:translateX(14px);}' +
    '.wine-switch input:focus-visible ~ .track{outline:2px solid var(--bm-primary,#3a7a3a);outline-offset:2px;}' +
    /* 按钮固定在面板底部：72 行的列表很长，否则要滚到底才能关闭 */
    '.wine-actions{position:sticky;bottom:0;display:flex;gap:8px;margin-top:12px;padding-top:10px;' +
      'background:inherit;border-top:1px solid var(--bamboo-border,rgba(0,0,0,.1));}' +
    '.wine-btn{flex:1;padding:6px 10px;border-radius:8px;font-size:11px;cursor:pointer;' +
      'transition:background-color var(--duration-fast) var(--ease-cn),opacity var(--duration-fast) var(--ease-cn);}' +
    '.wine-btn.ghost{background:transparent;border:1px solid var(--bamboo-border,rgba(0,0,0,.14));' +
      'color:var(--text-secondary,inherit);}' +
    '.wine-btn.primary{background:var(--bm-primary,#3a7a3a);border:1px solid transparent;' +
      'color:var(--text-on-accent,#fff);}' +
    '.wine-btn.ghost:hover{opacity:.8;}' +
    '.wine-btn.primary:hover{opacity:.9;}' +

    '@media (prefers-reduced-motion:reduce){' +
      '.wine-hit,.wine-card{transition-duration:.01ms !important;}' +
    '}';
  }

  var _styleReady = false;
  function ensureStyle(root) {
    if (_styleReady || document.getElementById('wine-module-style')) return;
    var s = document.createElement('style');
    s.id = 'wine-module-style';
    s.textContent = css();
    (document.head || root).appendChild(s);
    _styleReady = true;
  }

  window.__bamboo_module_wine = {
    id: ID,
    name: TITLE,
    version: VERSION,
    mount: mount,
    unmount: function () { if (instance) instance.destroy(); },
    destroy: function () { if (instance) instance.destroy(); }
  };
})();
