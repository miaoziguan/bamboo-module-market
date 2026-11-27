/* __bamboo_module_ {"id":"coffee","name":"来杯咖啡","version":"0.1.0","fab":{"icon":"flame","label":"喝咖啡"},"location":"left"} */
/**
 * 来杯咖啡 · 竹林模块（单文件自包含 · 手写 WebGL · 零依赖）
 *
 * 继承「不如吃茶去」与「将进酒杯莫停」的体系：器物实时三维渲染、正交相机、
 * 相机锁定光源、程序化纹理、三态自转、GPU 拾取、柜子/分类抽选与瓷器音效合成。
 * 当前阶段只完成骨架与内容表；器物为主视觉确定的「单节竹节长杯」，杯中呈咖啡液。
 *
 * 核心问题：解决「喝什么咖啡」——按范围与分类随机抽一杯，附风味语与萃取参数，
 * 可收藏、可排除、可避免连续重复。零外部资源，不联网、不读写 vault。
 */
(function () {
  'use strict';

  var ID = 'coffee';
  var TITLE = '来杯咖啡';
  var VERSION = '0.1.0';

  /* ══════════════════════ 渲染器（原稿数值 · 手写 WebGL） ══════════════════════ */


  /* ══ 资产 ══════════════════════════════════════════════════════ */
  /* 单节竹节长杯剖面（[半径 r, 高度 y]）。
     参考图造型：低矮圈足 → 足上外鼓 → 中腰微收 → 上段再外撇 → 薄口沿；
     整体按参考图加长约 35%，仍保留下腹最宽、腰部内收的轮廓。
     coffee liquid 是独立浅碟，杯口开放，杯中呈咖啡液。 */
  var PROFILES = {
    cup: [[0, -.860], [.30, -.858], [.42, -.850], [.48, -.828], [.50, -.760],
          [.50, -.640], [.53, -.585], [.62, -.520], [.70, -.440], [.76, -.330],
          [.80, -.180], [.82, 0.000], [.82, 0.240], [.80, 0.560], [.78, 0.920],
          [.77, 1.260], [.78, 1.560], [.81, 1.820], [.84, 2.010], [.84, 2.070],
          [.80, 2.090],
          [.73, 2.080], [.69, 2.030], [.67, 1.880], [.66, 1.560], [.66, 1.180],
          [.67, 0.780], [.68, 0.360], [.68, 0.020], [.66, -.220], [.60, -.390],
          [.50, -.490], [.42, -.540], [.30, -.565], [0, -.580]],
    liquid: [[0, 1.780], [.30, 1.782], [.55, 1.785], [.66, 1.788],
             [.66, 1.808], [.55, 1.810], [.30, 1.808], [0, 1.806]]
  };

  var ROT_SPEED = 0.15;          // 原地自转：绕器物竖轴（回转体，靠开片/窗光可见）
  /* 环绕自转：相机绕器物巡视，真正「多角度」。方位角匀速 + 俯仰角正弦摆动。 */
  var AZIM_SPEED = 0.12;                       // 方位角匀速 rad/s（整圈约 52s）
  var POLAR_MID = 51 * Math.PI / 180;          // 俯仰摆动中值
  var POLAR_AMP = 17 * Math.PI / 180;          // 俯仰摆动幅度（34°↔68°）
  var POLAR_FREQ = 2 * Math.PI / 36;           // 俯仰摆动频率（周期约 36s）
  /* 青玉四色（线性色）：沿用吃茶模块碧玉盖碗的实机标定值。 */
  var GLASS_DEEP = [0.02, 0.06, 0.02];
  var GLASS_MID  = [0.10, 0.30, 0.06];
  var GLASS_LITE = [0.42, 0.62, 0.20];
  var GLASS_COOL = [0.12, 0.32, 0.34];
  var JADE_GAIN = 1.34;
  /* P2/P3 釉面系数（与吃茶模块逐值对齐）：spec = GGX 基础镜面、coat = 透明釉第二层
     窄高光、sss = 薄胎背光透射、env = 窗光环境反射强度。
     全部是 ACES 之前的线性加性量，uFx=0 时整块跳过、回到原稿。
     env 从 .16 提到 .42：器身已改环绕对称（不刮暗面），相机坐标柔光箱可以放心提亮，
     让 clearcoat 窄高光与掠射亮边读得出「流光」；世界三窗窄条会在长杯上并成竖向亮带，不用。 */
  var FX_PBR = { spec: 0.08, coat: 0.28, sss: 0.10, env: 0.42 };
  /* 硬边法线阈值：只保留真正尖锐的折角（薄口沿 108°、盖/塞边）。
     提到 70° 是为了放过葫芦的「腰」——腰的折角约 67°，是一只吹出来的葫芦该有的圆滑过渡，
     若按 50° 判成硬边，腰上会插一道亮线，读起来像上下两节拼起来的（实测）。 */
  var HARD_EDGE_COS = Math.cos(70 * Math.PI / 180);

  /* ══ 曲线：Catmull-Rom(0.1) + 弧长均匀重采样（轮廓不变，环分布更合理） ══ */
  function crAxis(x0, x1, x2, x3, tension, t) {
    var ta = tension * (x2 - x0), tb = tension * (x3 - x1);
    var c0 = x1, c1 = ta;
    var c2 = -3 * x1 + 3 * x2 - 2 * ta - tb;
    var c3 = 2 * x1 - 2 * x2 + ta + tb;
    return ((c3 * t + c2) * t + c1) * t + c0;
  }
  function sampleProfile(pts, divisions, tension) {
    var l = pts.length;
    var ex0 = [pts[0][0] * 2 - pts[1][0], pts[0][1] * 2 - pts[1][1]];
    var exN = [pts[l - 1][0] * 2 - pts[l - 2][0], pts[l - 1][1] * 2 - pts[l - 2][1]];
    /* 先在参数域密采样，再按弧长等距重采样：控制点密的地方（底/腰）不再挤满环，
       控制点疏的地方（上肚）也不再被拉出大段稀环。曲线本身不变，只是环的分布更均匀。 */
    var denseN = Math.max(900, divisions * 8), raw = [];
    for (var i = 0; i <= denseN; i++) {
      var p = (l - 1) * (i / denseN);
      var k = Math.floor(p), w = p - k;
      if (w === 0 && k === l - 1) { k = l - 2; w = 1; }
      var p0 = k > 0 ? pts[k - 1] : ex0;
      var p1 = pts[k % l], p2 = pts[(k + 1) % l];
      var p3 = k + 2 < l ? pts[(k + 2) % l] : exN;
      raw.push([crAxis(p0[0], p1[0], p2[0], p3[0], tension, w), crAxis(p0[1], p1[1], p2[1], p3[1], tension, w)]);
    }
    var cum = [0];
    for (var a = 1; a < raw.length; a++) {
      cum.push(cum[a - 1] + Math.hypot(raw[a][0] - raw[a - 1][0], raw[a][1] - raw[a - 1][1]));
    }
    var total = cum[cum.length - 1] || 1, out = [], j = 0;
    for (var b = 0; b <= divisions; b++) {
      var target = total * (b / divisions);
      while (j < cum.length - 2 && cum[j + 1] < target) j++;
      var seg = cum[j + 1] - cum[j] || 1;
      var s = (target - cum[j]) / seg;
      out.push([raw[j][0] + (raw[j + 1][0] - raw[j][0]) * s,
                raw[j][1] + (raw[j + 1][1] - raw[j][1]) * s]);
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

  /* ══ 如意竖柄：短颈上的三瓣云头 ══
     云头用扁球做底，再按 3θ 做轻微三瓣起伏；从任何环绕角度都能读出「如意」，
     又不做成薄片——回转巡视时不会消失。几何与瓶塞合并进同一网格，绘制/拾取/避让都不增加条目。 */
  function buildRuyiKnob(cx, cy, cz, rx, ry, rz, su, sv) {
    var pos = [], nrm = [], nrmHard = [], idx = [], row = su + 1;
    for (var v = 0; v <= sv; v++) {
      var phi = v / sv * Math.PI, sp = Math.sin(phi), cp = Math.cos(phi);
      for (var u = 0; u <= su; u++) {
        var th = u / su * Math.PI * 2;
        var lobe = 1 + 0.17 * Math.cos(3 * th) + 0.045 * Math.cos(6 * th);
        var x = cx + rx * sp * lobe * Math.cos(th);
        var y = cy + ry * cp;
        var z = cz + rz * sp * lobe * Math.sin(th);
        pos.push(x, y, z);
        var nx = (x - cx) / (rx * rx), ny = (y - cy) / (ry * ry), nz = (z - cz) / (rz * rz);
        var l = Math.hypot(nx, ny, nz) || 1;
        nrm.push(nx / l, ny / l, nz / l);
        nrmHard.push(nx / l, ny / l, nz / l);
      }
    }
    for (var v2 = 0; v2 < sv; v2++) {
      for (var u2 = 0; u2 < su; u2++) {
        var A = v2 * row + u2, B = A + 1, C = A + row, D = C + 1;
        idx.push(A, B, C, B, D, C);
      }
    }
    return {
      pos: new Float32Array(pos), nrm: new Float32Array(nrm),
      nrmHard: new Float32Array(nrmHard), idx: new Uint16Array(idx), uv: new Float32Array(0)
    };
  }

  function mergeGeom(parts) {
    var pos = [], nrm = [], nrmHard = [], uv = [], idx = [], off = 0;
    function push(dst, src) { for (var i = 0; i < src.length; i++) dst.push(src[i]); }
    for (var k = 0; k < parts.length; k++) {
      var m = parts[k];
      push(pos, m.pos); push(nrm, m.nrm);
      if (m.nrmHard && m.nrmHard.length) push(nrmHard, m.nrmHard);
      else for (var z = 0; z < m.pos.length; z++) nrmHard.push(0);
      if (m.uv && m.uv.length) push(uv, m.uv);
      for (var j = 0; j < m.idx.length; j++) idx.push(m.idx[j] + off);
      off += m.pos.length / 3;
    }
    return {
      pos: new Float32Array(pos), nrm: new Float32Array(nrm),
      nrmHard: new Float32Array(nrmHard), idx: new Uint16Array(idx), uv: new Float32Array(uv)
    };
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
    /* 单面宽柔光：σ=.32 的一片柔反射，环境只提供水头、不负责造形。
       三窗窄条（σ=.045）映到细长杯上会并成竖向亮带（酒模块 v0.3.19 实测），
       而 shader 现用相机坐标柔光箱采样，这里保持宽柔光避免任何方位性条纹。 */
    for (var y = 0; y < ENV_H; y++) {
      var vy = y / (ENV_H - 1);
      var sky = 1.0 - 0.42 * vy;                  // 上亮下暗（差也收小）
      for (var x = 0; x < ENV_W; x++) {
        var u = x / ENV_W;
        var dx = Math.abs(u - 0.5);
        dx = Math.min(dx, 1 - dx);                 // 环面距离，首尾无缝
        var win = Math.exp(-Math.pow(dx / 0.32, 2));
        var bamboo = 0.012 * Math.sin(u * 6.2831853 * 7.0) + 0.008 * Math.sin(u * 6.2831853 * 13.0 + 1.1);
        var v = Math.min(1, Math.max(0, (win * 0.62 + 0.24 + bamboo) * sky));
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
          // 抖动 0.7：给到 0.86 会造出薄片状细胞，两条边界并在一起就成一条粗带
          sx[gy * nx + gx] = (gx + 0.5) * cw + (rndNext() - 0.5) * cw * 0.70;
          sy[gy * nx + gx] = (gy + 0.5) * ch + (rndNext() - 0.5) * ch * 0.70;
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

    // 主裂：格子大、线粗、深
    layer(9, 5, 1.3, 1.0);
    // 次裂：格子小、线细、浅 —— 大格里被细分的感觉就来自这一层
    layer(30, 15, 0.75, 0.78);

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
    'uniform vec3 uAlbedo; uniform vec3 uCrema; uniform vec3 uKeyDir; uniform vec3 uFillDir;',
    'uniform vec3 uSky; uniform vec3 uGround; uniform float uAmbient;',
    'uniform float uRough; uniform vec3 uEye; uniform float uOpacity;',
    'uniform float uKeyK; uniform float uGlow; uniform float uBodyDim; uniform float uLineGlow; uniform float uNightK;',
    'uniform float uFx; uniform float uFxKind; uniform float uTime;',
    'uniform vec3 uFxPbr;',
    'uniform sampler2D uEnvTex; uniform float uEnvK;',
    'uniform sampler2D uPattern; uniform float uPatternOn;',
    'uniform vec3 uGlassDeep; uniform vec3 uGlassMid; uniform vec3 uGlassLite; uniform vec3 uGlassCool;',
    'uniform float uGlassGain;',
    'uniform float uGlassJade;',
    'const float RPI = 0.3183098861837907;',
    'float pow2(float x){ return x*x; }',
    'float sat(float x){ return clamp(x,0.0,1.0); }',
    'vec3 F_Schlick(vec3 f0, float f90, float d){ return f0 + (f90-f0)*pow(clamp(1.0-d,0.0,1.0),5.0); }',
    'vec3 RRT(vec3 v){ vec3 a=v*(v+0.0245786)-0.000090537; vec3 b=v*(0.983729*v+0.4329510)+0.238081; return a/b; }',
    'vec3 aces(vec3 c){',
    '  const mat3 IN = mat3(vec3(0.59719,0.07600,0.02840), vec3(0.35458,0.90834,0.13383), vec3(0.04823,0.01566,0.83777));',
    '  const mat3 OUT = mat3(vec3(1.60475,-0.10208,-0.00327), vec3(-0.53108,1.10834,-0.07276), vec3(-0.07367,-0.00605,1.07602));',
    '  c *= 4.3667; c = IN*c; c = RRT(c); c = OUT*c; return clamp(c,0.0,1.0);',
    '}',
    'vec3 lin2srgb(vec3 c){ return mix(c*12.92, 1.055*pow(max(c,vec3(0.0)),vec3(1.0/2.4))-0.055, step(vec3(0.0031308),c)); }',
    'vec3 srgb2lin(vec3 c){ return mix(c/12.92, pow((c+0.055)/1.055, vec3(2.4)), step(vec3(0.04045),c)); }',
    'vec4 pattern3(vec3 p, vec3 ln){',
    '  vec3 b = abs(ln); b = b*b*b*b; b /= max(b.x+b.y+b.z,0.0001);',
    '  vec2 sc = vec2(0.28,0.56);',
    '  vec4 px = texture2D(uPattern, vec2(p.z,p.y)*sc);',
    '  vec4 py = texture2D(uPattern, vec2(p.x,p.z)*sc);',
    '  vec4 pz = texture2D(uPattern, vec2(p.x,p.y)*sc);',
    '  return px*b.x + py*b.y + pz*b.z;',
    '}',
    /* 青玉档器身：环绕对称着色（与酒模块 v0.3.20 收敛方案一致）。
       明暗只随高度 n.y 与轮廓 nv 变化，不随方位角变化——细长杯外鼓/收腰处法线急转，
       用吃茶盖碗那种世界固定主光 sat(dot(n,L)) 会在杯身切出明暗色块（酒模块 v0.3.16~18 踩过）。
       「流光溢彩」靠后面的相机锁定高光、clearcoat、透光与双层轮廓光承担，不靠方位性主光。 */
    'vec3 celadonBody(vec3 n, vec3 V, vec3 wp, out float a){',
    '  float ny = sat(n.y), nv = sat(dot(n,V));',
    '  float under = smoothstep(0.02,-0.38,wp.y);   // 杯底 y=-0.86，阈值按长杯标定',
    '  vec3 base = uGlassMid * (0.94 + 0.14*ny);',
    '  base = mix(base, uGlassLite, pow(ny,2.0)*0.42);',
    '  base = mix(base, uGlassCool, under*0.18);',
    /* 光感三件套全部环绕对称：顶部天光、视角中心柔釉、双层 Fresnel 轮廓。 */
    '  base += uGlassLite * pow(ny,6.0) * 0.18;',
    '  base += mix(uGlassLite,vec3(1.0),0.45) * pow(nv,5.0) * 0.10;',
    '  float rimK = mix(1.0,0.55,smoothstep(0.90,1.0,uBodyDim));',
    '  vec3 cc = normalize(uEye);',
    '  vec3 cr = normalize(cross(vec3(0.0,1.0,0.0),cc));',
    '  vec3 cu = normalize(cross(cc,cr));',
    '  float rimUp = 0.85 + 0.25*dot(n,cu);',
    '  base += mix(uGlassLite,vec3(1.0),0.45) * pow(1.0-nv,2.6) * 0.26 * rimK * rimUp;',
    '  base += mix(uGlassLite,vec3(1.0),0.82) * pow(1.0-nv,8.0) * 0.75 * rimK * rimUp;',
    '  a = uOpacity;',
    '  return base;',
    '}',
    'vec3 toneCeladon(vec3 c){ c = max(c,vec3(0.0)); return c/(1.0+0.55*c); }',
    'void main(){',
    '  vec3 n = normalize(vN);',
    '  vec3 V = normalize(uEye-vW);',
    '  if (dot(n,V) < 0.0) n = -n;',
    '  float nv = sat(dot(n,V));',
    '  vec3 camC = normalize(uEye);',
    '  vec3 camRx = normalize(cross(vec3(0.0,1.0,0.0),camC));',
    '  vec3 camUy = normalize(cross(camC,camRx));',
    '  vec3 camL = normalize(-0.45*camRx + 0.65*camUy + 0.85*camC);',
    '  vec3 col;',
    '  float alpha = uOpacity;',
    '  vec4 pat = vec4(0.0);',
    '  if (uPatternOn > 0.5) pat = pattern3(vP,vLN);',
    '  float crackA = pat.a;',
    '  vec3 dc = uAlbedo;',
    '  if (uFxKind < 0.5) {',
    '    if (uGlassJade > 0.5) {',
    '      col = celadonBody(n,V,vW,alpha) * uGlassGain;',
    '      col *= mix(1.0,0.30,crackA);',
    '      dc = mix(uGlassMid,uGlassLite,0.25);',
    '    } else {',
    '      float ink = clamp(crackA*1.28,0.0,1.0);',
    '      if (ink > 0.0) dc = mix(dc, srgb2lin(pat.rgb), ink);',
    /* 白瓷档环绕对称（酒模块 v0.3.20 收敛方案）：只留高度渐变 + 天光 + 中心柔釉 + 双层轮廓。
       吃茶盖碗那条 irr×dc×RPI + 方位性弱主光 sat(dot(n,uKeyDir)) 搬到细长杯上，
       外鼓/收腰的法线急转处会被切成明暗色块——这正是要避免的。
       光感由轴对称项 + 后面的相机锁定 P2 提供，不靠方位性主光。 */
    '      float ny = sat(n.y);',
    '      float vertical = 0.92 + 0.16*(0.5+0.5*ny);',
    '      col = dc * vertical * 0.75;',
    '      col += mix(dc,vec3(1.0),0.50) * pow(ny,6.0) * 0.10;',
    '      col += mix(dc,vec3(1.0),0.65) * pow(nv,5.0) * 0.12;',
    '      float rimK = mix(1.0,0.55,smoothstep(0.90,1.0,uBodyDim));',
    '      float rimUp = 0.85 + 0.25*dot(n,camUy);',
    '      col += mix(dc,vec3(1.0),0.40) * pow(1.0-nv,2.6) * 0.18 * rimK * rimUp;',
    '      col += mix(dc,vec3(1.0),0.78) * pow(1.0-nv,8.0) * 0.55 * rimK * rimUp;',
    '      col *= mix(1.0,0.62,smoothstep(0.90,1.0,uBodyDim));',
    '    }',
    '    col *= uBodyDim;',
    '    if (uFx > 0.5) {',
    /* 相机锁定主光 camL：高光固定在画面左上前方，只做加性反光、不刮暗面。
       世界固定主光在细长杯上会把外鼓/收腰处切成明暗色块（见器身注释）；
       相机锁定则无论怎么拖视角都不会出现方位性暗带。 */
    '      vec3 H = normalize(camL+V);',
    '      float dnl = sat(dot(n,camL)), dnh = sat(dot(n,H)), dvh = sat(dot(V,H));',
    '      float a2 = pow2(uRough);',
    '      float dd = pow2(dnh)*(a2-1.0)+1.0;',
    '      float gv = dnl*sqrt(a2+(1.0-a2)*pow2(nv));',
    '      float gl = nv*sqrt(a2+(1.0-a2)*pow2(dnl));',
    '      float spec = (RPI*a2/pow2(dd)) * (0.5/max(gv+gl,1e-6)) * F_Schlick(vec3(0.04),1.0,dvh).r;',
    '      float jadeK = (uGlassJade > 0.5) ? 0.45 : 1.0;',
    '      col += vec3(spec) * uFxPbr.x * min(1.0,dnl*1.4) * jadeK;',
    '      vec3 cf = F_Schlick(vec3(0.04),1.0,dvh);',
    '      vec3 coatTint = (uGlassJade > 0.5) ? mix(vec3(1.0),uGlassLite,0.4) : vec3(1.0);',
    '      col += coatTint * pow(dnh,180.0) * cf * uFxPbr.y * jadeK;',
    '      vec3 trans = (uGlassJade > 0.5) ? uGlassLite : (dc*vec3(1.0,0.72,0.48));',
    '      col += trans * pow(1.0-dnl,2.0) * uFxPbr.z * jadeK;',
    '      col += trans * pow(1.0-nv,5.0) * uFxPbr.y * 0.30 * jadeK;',
    /* 相机坐标柔光箱：反射向量投到相机基，光斑固定在画面同一侧。
       世界三窗条带映到细长杯上会并成竖向亮带（酒模块 v0.3.19 实测），
       相机基柔光只提供水头，不负责造形——「流光」由 clearcoat 窄高光与双层轮廓光读出来。 */
    '      vec3 R = reflect(-V,n);',
    '      vec3 Rcam = vec3(dot(R,camRx),dot(R,camUy),dot(R,camC));',
    '      float soft = exp(-pow((Rcam.x+0.35)/0.45,2.0)) * exp(-pow((Rcam.y-0.35)/0.55,2.0));',
    '      col += mix(uGlassLite,vec3(1.0),0.70) * soft * uEnvK * 0.35 * jadeK;',
    '    }',
    '  } else {',
    '    float r = length(vP.xz);',
    '    float top = smoothstep(0.35,0.75,n.y);',
    '    float ny = sat(n.y), nv = sat(dot(n,V));',
    '    col = uAlbedo * (0.82 + 0.18*ny);',
    '    float ring = smoothstep(0.50,0.60,r) * (1.0-smoothstep(0.63,0.66,r)) * top;',
    '    col = mix(col, uCrema, ring*0.85);',
    '    col *= 0.98 + 0.02*sin(r*18.0-uTime*1.4)*top;',
    '    vec3 H = normalize(camL+V);',
    '    col += vec3(1.0) * pow(sat(dot(n,H)),60.0) * 0.20 * top;',
    '    col += mix(uCrema,vec3(1.0),0.55) * pow(1.0-nv,5.0) * 0.18;',
    '    alpha = uOpacity;',
    '  }',
    '  float rim = pow(1.0-nv,2.2);',
    '  col += uGlow * mix(uGlassMid,uAlbedo,0.5) * (0.45+1.35*rim) * uNightK;',
    '  float shimmer = 0.9 + 0.1*pow(sat(dot(n,normalize(camL+V))),16.0);',
    '  col += uLineGlow * crackA * dc * uNightK * shimmer;',
    '  col = (uFxKind < 0.5 && uGlassJade > 0.5) ? toneCeladon(col) : aces(col);',
    '  gl_FragColor = vec4(lin2srgb(col)*alpha, alpha);',
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
      cup: mesh(buildLathe(PROFILES.cup, SEG, 1, true)),
      liquid: mesh(buildLathe(PROFILES.liquid, SEG, 1, false))
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
    ['uMVP', 'uModel', 'uAlbedo', 'uCrema', 'uKeyDir', 'uFillDir', 'uSky', 'uGround', 'uAmbient', 'uRough', 'uEye',
      'uOpacity', 'uKeyK', 'uGlow', 'uBodyDim', 'uLineGlow', 'uNightK',
      'uFx', 'uFxKind', 'uTime', 'uFxPbr', 'uEnvTex', 'uEnvK', 'uPattern', 'uPatternOn',
      'uGlassDeep', 'uGlassMid', 'uGlassLite', 'uGlassCool', 'uGlassGain', 'uGlassJade'].forEach(function (k) {
      U[k] = gl.getUniformLocation(progMain, k);
    });

    /* 轨道相机：与原稿 OrbitControls 同一组约束
       （target(0,1.4,0)、polar 30°..84°、zoom .5..3、dampingFactor .05、enablePan=false） */
    /* 取景目标点：葫芦可见范围 y = -0.52（加深后的底）~ 3.236（如意云头顶），几何中心约 1.36。
       底弧加深后目标下移一档，保持上下题字留白均衡。 */
    var AT = [0, 0.62, 0];
    var CAM_R = 7.20;

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
    /* 主光沿用青玉链路原方向（左上前方），补光用旧 KEY 的右上前方：两条材质分支从此共用同一组方向。 */
    /* v0.3.18：主光从侧前方改到近正面。旧方向 x=-0.28 在窄栏小尺寸下把葫芦切成左暗右亮两块；
       收到 x=-0.10 后左右差只剩轻微体积感，雨/雪/台灯等意境仍靠背景层表达。 */
    var KEY = norm([-0.10, 0.55, 0.90]), FILL = norm([5, 10, 7]);

    var state = {
      w: 0, h: 0, dpr: Math.min(window.devicePixelRatio || 1, 2),
      yaw: 0, lift: 0, bob: 0, pattern: 'crackle', elapsed: 0,
      spinMode: (opts.spinMode === 'yaw' || opts.spinMode === 'orbit') ? opts.spinMode : 'off',
      polarPhase: 0, autoPaused: false,
      /* 酒液颜色只用于详情卡的色点，不参与渲染（葫芦是实心观感的瓷器，看不见内里） */
      coffeeColor: [0.10, 0.045, 0.020], cremaColor: [0.42, 0.24, 0.10],
      glassColor: [1, 1, 1], glow: 0, bodyDim: 1, lineGlow: 0, last: 0, raf: 0, alive: true,
      /* 釉面档：'porcelain' 白瓷 / 'jade' 青玉（沿用 mat 键以复用 UI 通道）。
         与吃茶模块一致：首帧即按存档档位与派生增益渲染，青玉档不闪一帧硬编码绿。 */
      mat: opts.mat === 'jade' ? 'jade' : 'porcelain',
      glass: { deep: GLASS_DEEP, mid: GLASS_MID, lite: GLASS_LITE, cool: GLASS_COOL },
      glassGain: (typeof opts.jadeGain === 'number' && opts.jadeGain > 0) ? opts.jadeGain : 1,
      /* 质感档：false 时气泡上升/酒面增强归零 */
      enhance: opts.enhance !== false
    };

    /** 包围球取景：轨道转到任何角度都不裁（用球而不是盒，避免转动时画面忽大忽小）。
     *  葫芦最大半径 1.0；底弧加深后总高约 3.76，包围球 ≈ 2.09，仍小于 2.5；
     *  hh 小幅放大到 2.70，给上下题字留白，不让器物一下子缩太多。 */
    var BOX = { hw: 2.10, hh: 2.45 };
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

    function render() {
      resize();
      var yawM = rotY(state.yaw);

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
      gl.uniform3fv(U.uFillDir, FILL);
      /* 与茶模块逐值对齐：茶模块实机标定过这组数（天/地差约 28% 连续渐变），
         改掉原先偏亮的 0.86/0.42/0.32/0.40 —— 那是玻璃档留下来的，套到瓷器上会冲淡釉面。 */
      gl.uniform3f(U.uSky, 0.80, 0.80, 0.80);
      gl.uniform3f(U.uGround, 0.45, 0.45, 0.45);
      gl.uniform1f(U.uAmbient, 0.33);
      /* 器身已改环绕对称 + 相机锁定主光，uKeyDir/uKeyK 不再参与明暗；
       保留 0.12 避免万一有旧分支读到时突然冒出方位性主光。 */
      gl.uniform1f(U.uKeyK, 0.12);
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
      /* [网格, 模型矩阵, 反照率, 可见, uFxKind, uOpacity, uNightK] */
      var drawList = [
        [M.cup, yawM, state.glassColor, 1, 0, 1, 1],
        [M.liquid, yawM, state.coffeeColor, 1, 1, 1, 0]
      ];

      for (var i = 0; i < drawList.length; i++) {
        var pc = drawList[i];
        if (pc[3] === 0) continue;
        gl.uniformMatrix4fv(U.uMVP, false, mul(vp, pc[1]));
        gl.uniformMatrix4fv(U.uModel, false, pc[1]);
        gl.uniform3fv(U.uAlbedo, pc[2]);
        gl.uniform3fv(U.uCrema, state.cremaColor);
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
    /* 题字锚定逐式对齐吃茶模块（用户要求向喝茶看齐）：
       上联固定舞台 17%，下联挂器物下方 60px 并封顶 85.5%（0.89-0.035），
       器物贴上联（GAP 14），矮画幅装不下时退回两句居中。 */
    var VERSE_TOP = 0.17, VERSE_BOT = 0.89;
    var VERSE_BOT_LIFT = 0.035;
    var GAIWAN_GAP = 14;
    var VERSE_GAP2 = 60;
    /* 器物单独下移量（px）：只调整器物，文案位置保持不变。
       下联挂器物下方，故同步减掉这个量来抵消器物下移带来的联动。 */
    var VESSEL_DROP = 16;
    function placeVerse(vp) {
      if (!state.w || !state.h) return;
      /* 题字是舞台的子节点；GaiwanMount 拿到的 el 就是舞台本身，故在此取一次并缓存 */
      if (!vTopEl) {
        vTopEl = el.querySelector('.coffee-verse.v-top');
        vBotEl = el.querySelector('.coffee-verse.v-bot');
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
      scanMesh(M.cup, true); scanMesh(M.liquid);
      /* 布局只在「器物屏幕边界 / 画布尺寸」变化时重算：
         下面要读 offsetHeight 强制重排，不能在自转的每一帧都做。 */
      var lk = Math.round(top) + ':' + Math.round(bot) + ':' + state.w + 'x' + state.h + ':' + (opts.tyRef ? opts.tyRef.v.toFixed(4) : '0');
      if (el._vKey === lk) return;
      el._vKey = lk;
      /* 落地暗部跟着投影出来的瓶底走：不写死 bottom，窄栏/不同字号下都不会掉到题字下面。 */
      if (el.stage) el.stage.style.setProperty('--coffee-ground-y', Math.round(bot - 2) + 'px');

      /* 酒气锚点：器物顶缘（点杯后即瓶口）在舞台内的 y → viewBox 单位（0~100）。
         气缕的局部原点就在瓶口，故整组只做 translate；值只在布局变化时重算。 */
      if (!el.aromaG) el.aromaG = el.querySelector('.coffee-aroma');
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
      /* yBot = 老锚点（舞台 85.5%）：录豆列/卡片等下游布局仍挂它，位置不变 */
      var yBot = Math.round(state.h * (VERSE_BOT - VERSE_BOT_LIFT));
      /* 下联视觉位：挂器物正下方，封顶老锚点（与吃茶模块逐式一致） */
      var yBotV = Math.min(Math.round(bot + VERSE_GAP2 + vhB / 2 - VESSEL_DROP), yBot);

      if (el._vTop !== yTop) { el._vTop = yTop; vTopEl.style.top = yTop + 'px'; }
      if (el._vBot !== yBotV) { el._vBot = yBotV; vBotEl.style.top = yBotV + 'px'; }

      /* 盖碗位置校正：屏幕位移与 ty 线性（Δpx = -Δty × state.h / 2），
         一次闭式修正即可命中；ty 变化后失效缓存，下一帧复测确认。 */
      if (opts.tyRef) {
        /* 器物挂在「告别是非」正下方：目标中心 = 上联底 + GAP + 半个器物高。
           与吃茶模块逐式一致；矮画幅两句间装不下时退回两句居中，避免压字。 */
        var gH = bot - top;
        var want = yTop + vhT / 2 + GAIWAN_GAP + gH / 2 + VESSEL_DROP;
        var cap = yBotV - vhB / 2 - 8 - gH / 2;
        var mid = cap >= want ? want : (yTop + yBotV) / 2, vc = (top + bot) / 2;
        if (Math.abs(mid - vc) > 0.5) {
          opts.tyRef.v = Math.max(-0.25, Math.min(0.25, opts.tyRef.v - 2 * (mid - vc) / state.h));
          el._vKey = '';
        }
      }

      if (!vTipEl) vTipEl = el.parentNode && el.parentNode.querySelector('.coffee-tip');
      if (!vCountEl) vCountEl = el.querySelector('.coffee-count');
      var vR = vBotEl.getBoundingClientRect();
      if (!vTipEl) vTipEl = el.parentNode && el.parentNode.querySelector('.coffee-tip');
      var tipTop = vTipEl ? (vTipEl.getBoundingClientRect().top - stR.top) : state.h;
      /* 数量列挂「吃茶去」当前视觉位（yBotV）：居中于题字与工具行之间的空白（用户红框位） */
      var from = yBotV + vhB / 2 + 24;

      /* 「录豆七十三」与设置按钮同处下题字与页脚之间，单独给谁一个固定偏移都会互相压。
         所以把两者当成一组：总高 = 数量 + 间距 + 按钮，整体在这段空白里居中。 */
      if (!vGearEl) vGearEl = el.querySelector('.coffee-tools');
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

      if (!vCardEl) vCardEl = el.parentNode && el.parentNode.querySelector('.coffee-card');
      if (vCardEl) {
        /* 一次性算出目标位置再写入，不做「先写后量再改」——那种写法在小画幅下会读到旧值。
           基准：卡片与录豆列共用同一条带（吃茶去↔工具行空白），且**带心对齐**——
           卡片中心 = 带心（录豆列居中处），这样它落在「录豆七十三所在区域」而非带顶。
           CARD_DROP（默认 0）：在带心基础上再下压的量（正 = 更靠下）。
           上限：文案最后一行不能压到页脚，留 8px。 */
        var cR = vCardEl.getBoundingClientRect();
        var curOff = parseFloat(vCardEl.style.top || '0') || 0;
        var flowTop = cR.top - curOff;                       // 不受 top 影响的布局位置
        var tipEl = vTipEl;
        /* 居中要用卡片「盒子实际高度」而非文案内容高度：开盖前卡片空、内容高≈0，
           但盒子有 min-height，单凭内容高居中会算飞。开盖后内容填满，盒子高即内容高。 */
        var boxH = vCardEl.offsetHeight || 0;

        /* 与录豆列同带：带顶 = 吃茶去底 + 24，带底 = 工具行顶 - 8；卡片中心对齐带心 */
        var bandTopC = yBotV + vhB / 2 + 24;
        var bandBotC = toolsTop - 8;
        var bandCenter = (bandTopC + bandBotC) / 2;
        var want = Math.round(stR.top + bandCenter - boxH / 2 + CARD_DROP);   // 期望的视觉顶（中心对齐录豆列带心）
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
      return Math.max(8, Math.min(16, (gap - 8) / (n * 1.18)));
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
      /** 设置纹样：'none' 素瓷 | 'crackle' 冰裂 */
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
        var yawM = rotY(state.yaw);

        gl.bindFramebuffer(gl.FRAMEBUFFER, pickFb);
        gl.viewport(0, 0, 1, 1);
        gl.disable(gl.BLEND);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.enable(gl.DEPTH_TEST);
        gl.disable(gl.CULL_FACE);
        gl.useProgram(progPick);
        /* id 沿用茶模块语义：2=葫芦身（拖动/轨道） 3=瓶塞（点杯换酒） */
        var list = [[M.cup, yawM, 2], [M.liquid, yawM, 3]];
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
      /** 咖啡色：随咖啡变，瓶内酒液实时换色 */
      /** 咖啡色：只用于详情卡的色点，**不参与渲染** —— 葫芦是实心观感的青瓷，看不见内里。
       *  保留 API 以免 UI 侧改动；刻意不触发重绘（换酒时画面不该有任何变化）。 */
      setCoffeeColor: function (hex) {
        state.coffeeColor = hex2linArray(hex);
      },
      /** 气泡已不建模（酒体不可见），保留空实现兼容既有调用点 */
      setBubbleColor: function (hex) { state.cremaColor = hex2linArray(hex); render(); },
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

      /** 釉面四色：由主题派生，deep/mid/lite/cool 四个 hex。
       *  mode = 'porcelain' 白瓷（默认） / 'jade' 青玉（环绕对称着色，见 celadonBody）。 */
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

  /* ══════════════════════ 咖啡 ══════════════════════ */
  /* 字段沿用茶酒十字段：n 咖啡名 / t 类别 / o 产地或品牌 / s 一句风味语 / c 咖啡液色 /
     lf crema或奶泡色 / w 水温℃ / d 萃取时间 / l 风味或处理法
     共 48 款：意式6 / 手冲6 / 浸泡6 / 冷萃6 / 风味6 / 低因6 / 拼配6 / 即饮6 */
  /* ══════════════════════ 咖啡 · 四维分类数据 ══════════════════════
     权威口径（2026-11 核对，按维度归属，不存在覆盖全维度的官方法典）：
     - 杯型 t：浓缩/卡布奇诺取 INEI 意大利国家规范；其余（美式/拿铁/澳白/玛奇朵/
       冷萃/手冲/浸泡/即饮）为行业惯例，无官方定义，条目里标「惯例」。
     - 处理法 pr：水洗 Washed / 日晒 Natural / 蜜处理 Honey / 湿刨 Wet-hulled /
       厌氧 Anaerobic 为行业通用大类（COE 按传统水洗·传统蜜日晒·实验三组竞赛）；
       蜜处理颜色分级无统一技术定义，此处不细分。
     - 品种 vr：以 WCR《Coffee Varieties Catalog》为准（铁皮卡/波旁/卡杜拉/卡杜艾/
       瑰夏/SL28/帕卡马拉/罗布斯塔）；拼配不是品种，标「拼配」，基底未知标「未标注」。
     - 烘焙度 rt：Agtron/SCA 8 色卡（95 浅 / 85 肉桂 / 75 中 / 65 High / 55 City /
       45 Full City / 35 法式 / 25 意式）；此处归浅(95-75)/中(65-55)/深(45-25)三档。
     - 风味词 l 取 SCA×WCR 风味轮词汇；水温 w 与萃取 d 是 SCA 金杯/INEI 的
       建议值或行业惯例，非每款豆的实测值，条目里用 src 标明来源等级。
     字段：n 名 / t 杯型 / pr 处理法 / vr 品种 / rt 烘焙 / o 产地 / s 风味语 /
     c 汤色 / lf 奶泡色 / w 水温℃ / d 萃取时间 / l 风味轮词 / src 来源。 */

  var SOURCES = {
    inei: 'INEI 意大利国家规范', sca: 'SCA 金杯建议', wcr: 'WCR 品种目录',
    coe: 'COE 处理法分组', agtron: 'Agtron/SCA 烘焙色卡', wheel: 'SCA×WCR 风味轮',
    custom: '行业惯例·无官方定义'
  };

  var TYPES = ['浓缩', '美式', '卡布奇诺', '拿铁', '澳白', '玛奇朵', '手冲', '浸泡', '冷萃', '即饮'];
  /* 脱因是采后处理（Decaffeination），归处理法维度；与 COE 的竞赛分组不同但同属 post-harvest */
  var PROCESS_TYPES = ['水洗', '日晒', '蜜处理', '湿刨', '厌氧', '脱因', '未标注'];
  var VARIETY_TYPES = ['铁皮卡', '波旁', '卡杜拉', '卡杜艾', '瑰夏', 'SL28', '帕卡马拉', '罗布斯塔', '拼配', '未标注'];
  var ROAST_TYPES = ['浅烘', '中烘', '深烘'];

  var TEAS = [
    { id: 'c01', n: '意式浓缩', t: '浓缩', pr: '水洗', vr: '拼配', rt: '深烘', o: '意大利', s: '一小杯，把早晨叫醒。', c: '#3b1f12', lf: '#c68a4a', w: 90, d: '25s', l: '焦糖·坚果', src: 'inei' },
    { id: 'c02', n: '短萃浓缩', t: '浓缩', pr: '水洗', vr: '拼配', rt: '深烘', o: '意大利', s: '少一点水，多一点浓。', c: '#341a0e', lf: '#cf9250', w: 90, d: '20s', l: '焦糖·可可', src: 'inei' },
    { id: 'c03', n: '长萃浓缩', t: '浓缩', pr: '水洗', vr: '拼配', rt: '中烘', o: '意大利', s: '多一丝水，拉长尾韵。', c: '#452617', lf: '#c1874c', w: 90, d: '30s', l: '烘焙·焦糖', src: 'inei' },
    { id: 'c04', n: '双份浓缩', t: '浓缩', pr: '水洗', vr: '拼配', rt: '深烘', o: '通用', s: '两份粉，一份清醒。', c: '#321a0f', lf: '#c88e4e', w: 90, d: '25s', l: '黑巧·坚果', src: 'inei' },
    { id: 'c05', n: '水洗浓缩', t: '浓缩', pr: '水洗', vr: '铁皮卡', rt: '浅烘', o: '埃塞俄比亚', s: '水洗的明亮，压进三十毫升。', c: '#5a3018', lf: '#d69b58', w: 90, d: '25s', l: '柑橘·花香', src: 'inei' },
    { id: 'c06', n: '日晒浓缩', t: '浓缩', pr: '日晒', vr: '波旁', rt: '中烘', o: '巴西', s: '日晒的甜，在短杯里更清楚。', c: '#4d2916', lf: '#d29a58', w: 90, d: '25s', l: '莓果·巧克力', src: 'inei' },
    { id: 'c07', n: '美式', t: '美式', pr: '未标注', vr: '拼配', rt: '中烘', o: '美国', s: '热水一冲，清醒变得很长。', c: '#4a2a18', lf: '#b98048', w: 90, d: '30s', l: '清爽·烘焙', src: 'custom' },
    { id: 'c08', n: '冰美式', t: '美式', pr: '水洗', vr: '拼配', rt: '中烘', o: '通用', s: '冰块把苦味收得更干净。', c: '#472817', lf: '#b5804c', w: 90, d: '30s', l: '清爽·低酸', src: 'custom' },
    { id: 'c09', n: '长黑', t: '美式', pr: '水洗', vr: '拼配', rt: '中烘', o: '澳新', s: '先水后酒，浮着一层金。', c: '#4d2c19', lf: '#d0a369', w: 90, d: '25s', l: '清爽·油脂', src: 'custom' },
    { id: 'c10', n: '冷萃美式', t: '美式', pr: '水洗', vr: '拼配', rt: '中烘', o: '通用', s: '冷萃兑水，清爽但不薄。', c: '#4b2a1a', lf: '#b88a5e', w: 20, d: '12h', l: '清爽·低酸', src: 'custom' },
    { id: 'c11', n: '燕麦美式', t: '美式', pr: '水洗', vr: '拼配', rt: '中烘', o: '通用', s: '燕麦把水也变得温顺。', c: '#563520', lf: '#d8bb93', w: 90, d: '30s', l: '谷物·柔滑', src: 'custom' },
    { id: 'c12', n: '低因美式', t: '美式', pr: '脱因', vr: '拼配', rt: '中烘', o: '通用', s: '少一点因，多一点晚上的自由。', c: '#4a2b1a', lf: '#b88758', w: 90, d: '30s', l: '低因·清淡', src: 'custom' },
    { id: 'c13', n: '卡布奇诺', t: '卡布奇诺', pr: '未标注', vr: '拼配', rt: '中烘', o: '意大利', s: '奶沫托着咖啡，像一座小桥。', c: '#5a321d', lf: '#e4c49a', w: 55, d: '28s', l: '均衡·奶香', src: 'inei' },
    { id: 'c14', n: '干卡布', t: '卡布奇诺', pr: '水洗', vr: '拼配', rt: '中烘', o: '意大利', s: '奶少泡多，喝得到咖啡的骨。', c: '#54301c', lf: '#eed6b0', w: 55, d: '28s', l: '浓郁·奶泡', src: 'inei' },
    { id: 'c15', n: '湿卡布', t: '卡布奇诺', pr: '水洗', vr: '拼配', rt: '中烘', o: '意大利', s: '奶多泡薄，顺口得像一句安慰。', c: '#5e361f', lf: '#e7c79c', w: 55, d: '28s', l: '柔滑·甜感', src: 'inei' },
    { id: 'c16', n: '低因卡布', t: '卡布奇诺', pr: '脱因', vr: '拼配', rt: '中烘', o: '通用', s: '少一点刺激，不少一点仪式。', c: '#5c361f', lf: '#e0c298', w: 55, d: '28s', l: '低因·均衡', src: 'inei' },
    { id: 'c17', n: '焦糖卡布', t: '卡布奇诺', pr: '未标注', vr: '拼配', rt: '中烘', o: '通用', s: '焦糖在奶沫上画了一道边。', c: '#5a321c', lf: '#e9c893', w: 55, d: '28s', l: '焦糖·牛奶', src: 'inei' },
    { id: 'c18', n: '肉桂卡布', t: '卡布奇诺', pr: '未标注', vr: '拼配', rt: '中烘', o: '通用', s: '一点肉桂，像冬天的窗。', c: '#5b331d', lf: '#dfbd90', w: 55, d: '28s', l: '肉桂·香料', src: 'inei' },
    { id: 'c19', n: '拿铁', t: '拿铁', pr: '未标注', vr: '拼配', rt: '中烘', o: '意大利', s: '牛奶把锋芒磨圆。', c: '#5a331f', lf: '#e8cba5', w: 55, d: '30s', l: '柔滑·甜感', src: 'custom' },
    { id: 'c20', n: '冰拿铁', t: '拿铁', pr: '水洗', vr: '拼配', rt: '中烘', o: '通用', s: '冰块化开时，甜也跟着醒。', c: '#583220', lf: '#e5c79f', w: 55, d: '30s', l: '冰甜·奶香', src: 'custom' },
    { id: 'c21', n: '榛果拿铁', t: '拿铁', pr: '未标注', vr: '拼配', rt: '中烘', o: '通用', s: '坚果香一出来，心就软了。', c: '#60391f', lf: '#e0bd94', w: 55, d: '30s', l: '榛果·奶香', src: 'custom' },
    { id: 'c22', n: '香草拿铁', t: '拿铁', pr: '未标注', vr: '拼配', rt: '中烘', o: '通用', s: '温柔得有点不像咖啡。', c: '#5d3821', lf: '#e5c8a4', w: 55, d: '30s', l: '香草·甜感', src: 'custom' },
    { id: 'c23', n: '桂花拿铁', t: '拿铁', pr: '未标注', vr: '拼配', rt: '中烘', o: '中国', s: '桂花开在奶泡上。', c: '#614028', lf: '#e6c79b', w: 55, d: '30s', l: '桂花·奶香', src: 'custom' },
    { id: 'c24', n: '抹茶拿铁', t: '拿铁', pr: '未标注', vr: '拼配', rt: '中烘', o: '日本', s: '茶与咖啡，各退半步。', c: '#4d4326', lf: '#d2c99a', w: 55, d: '30s', l: '抹茶·奶香', src: 'custom' },
    { id: 'c25', n: '燕麦拿铁', t: '拿铁', pr: '未标注', vr: '拼配', rt: '中烘', o: '通用', s: '燕麦把奶香换成谷物的暖。', c: '#5c3b25', lf: '#ddc19d', w: 55, d: '30s', l: '谷物·柔滑', src: 'custom' },
    { id: 'c26', n: '低因拿铁', t: '拿铁', pr: '未标注', vr: '拼配', rt: '中烘', o: '通用', s: '睡前也能有一杯热的。', c: '#5a3620', lf: '#dfc19b', w: 55, d: '30s', l: '低因·奶香', src: 'custom' },
    { id: 'c27', n: '澳白', t: '澳白', pr: '未标注', vr: '拼配', rt: '中烘', o: '新西兰', s: '薄奶与浓咖，彼此不让。', c: '#4d2a18', lf: '#d8b58c', w: 55, d: '26s', l: '醇厚·微甜', src: 'custom' },
    { id: 'c28', n: '冰澳白', t: '澳白', pr: '未标注', vr: '拼配', rt: '中烘', o: '澳新', s: '微泡在冰里散成一层雾。', c: '#4b2a18', lf: '#d4b389', w: 55, d: '26s', l: '清爽·醇厚', src: 'custom' },
    { id: 'c29', n: '燕麦澳白', t: '澳白', pr: '未标注', vr: '拼配', rt: '中烘', o: '澳新', s: '燕麦与短萃，都爱小而浓。', c: '#523018', lf: '#d9bb94', w: 55, d: '26s', l: '谷物·醇厚', src: 'custom' },
    { id: 'c30', n: '低因澳白', t: '澳白', pr: '未标注', vr: '拼配', rt: '中烘', o: '通用', s: '短奶，长夜，也可以。', c: '#4f2c1a', lf: '#d6b48d', w: 55, d: '26s', l: '低因·醇厚', src: 'custom' },
    { id: 'c31', n: '玛奇朵', t: '玛奇朵', pr: '未标注', vr: '拼配', rt: '深烘', o: '意大利', s: '一点奶，点上临界的好看。', c: '#432315', lf: '#d6a268', w: 90, d: '25s', l: '浓烈·焦糖', src: 'custom' },
    { id: 'c32', n: '焦糖玛奇朵', t: '玛奇朵', pr: '未标注', vr: '拼配', rt: '中烘', o: '星巴克式', s: '甜在表面，咖啡在下面。', c: '#5a321c', lf: '#e3b77c', w: 55, d: '30s', l: '焦糖·牛奶', src: 'custom' },
    { id: 'c33', n: '可塔朵', t: '玛奇朵', pr: '未标注', vr: '拼配', rt: '深烘', o: '西班牙', s: '等量牛奶，把浓拉回中间。', c: '#4a2818', lf: '#dcb088', w: 90, d: '25s', l: '均衡·奶香', src: 'custom' },
    { id: 'c34', n: '康宝蓝', t: '玛奇朵', pr: '未标注', vr: '拼配', rt: '深烘', o: '意大利', s: '一勺奶油，浮在浓上。', c: '#3e2114', lf: '#f0dcc0', w: 90, d: '25s', l: '奶油·可可', src: 'custom' },
    { id: 'c35', n: '耶加雪菲', t: '手冲', pr: '水洗', vr: '未标注', rt: '浅烘', o: '埃塞俄比亚', s: '花香先到，柑橘随后。', c: '#6a3a1f', lf: '#d59a5a', w: 93, d: '2:30', l: '花香·柑橘', src: 'sca' },
    { id: 'c36', n: '西达摩', t: '手冲', pr: '水洗', vr: '未标注', rt: '浅烘', o: '埃塞俄比亚', s: '莓果在杯里慢慢化开。', c: '#68351f', lf: '#cf8f55', w: 93, d: '2:30', l: '莓果·红茶', src: 'sca' },
    { id: 'c37', n: '古吉', t: '手冲', pr: '日晒', vr: '未标注', rt: '浅烘', o: '埃塞俄比亚', s: '日晒把花香烘成蜜。', c: '#704020', lf: '#d9a566', w: 93, d: '2:35', l: '花香·蜜桃', src: 'sca' },
    { id: 'c38', n: '慧兰', t: '手冲', pr: '水洗', vr: '卡杜拉', rt: '中烘', o: '哥伦比亚', s: '焦糖与坚果，最稳的陪伴。', c: '#5f321c', lf: '#c98c52', w: 93, d: '2:40', l: '焦糖·坚果', src: 'sca' },
    { id: 'c39', n: '蕙兰蜜处理', t: '手冲', pr: '蜜处理', vr: '卡杜拉', rt: '中烘', o: '哥伦比亚', s: '果胶留下的甜，比水洗厚。', c: '#63361e', lf: '#d09a60', w: 93, d: '2:35', l: '蜜甜·柑橘', src: 'sca' },
    { id: 'c40', n: '翡翠庄园', t: '手冲', pr: '日晒', vr: '瑰夏', rt: '浅烘', o: '巴拿马', s: '一杯里有一整座山的雾。', c: '#704020', lf: '#d9a566', w: 93, d: '2:30', l: '茉莉·蜜桃', src: 'wcr' },
    { id: 'c41', n: '肯尼亚AA', t: '手冲', pr: '水洗', vr: 'SL28', rt: '浅烘', o: '肯尼亚', s: '黑加仑的酸，亮得像清晨。', c: '#5a2c1a', lf: '#c47f46', w: 93, d: '2:20', l: '黑加仑·番茄', src: 'wcr' },
    { id: 'c42', n: '涅里', t: '手冲', pr: '水洗', vr: 'SL28', rt: '浅烘', o: '肯尼亚', s: '酸质像线条，清楚到底。', c: '#5b2d1b', lf: '#c58148', w: 93, d: '2:25', l: '柑橘·黑加仑', src: 'wcr' },
    { id: 'c43', n: '安提瓜', t: '手冲', pr: '水洗', vr: '波旁', rt: '中烘', o: '危地马拉', s: '巧克力收尾，稳妥而长。', c: '#62391f', lf: '#ca9157', w: 93, d: '2:40', l: '可可·香料', src: 'wcr' },
    { id: 'c44', n: '薇薇特南果', t: '手冲', pr: '水洗', vr: '卡杜艾', rt: '中烘', o: '危地马拉', s: '高山的凉，留在尾韵里。', c: '#603820', lf: '#c7965c', w: 93, d: '2:40', l: '可可·坚果', src: 'wcr' },
    { id: 'c45', n: '塔拉珠', t: '手冲', pr: '蜜处理', vr: '卡杜拉', rt: '中烘', o: '哥斯达黎加', s: '蜜处理把甜铺成一层。', c: '#653a20', lf: '#d29c62', w: 93, d: '2:35', l: '蜜甜·苹果', src: 'sca' },
    { id: 'c46', n: '喜拉多', t: '手冲', pr: '日晒', vr: '波旁', rt: '中烘', o: '巴西', s: '日晒的果香，落在坚果上。', c: '#5d341e', lf: '#c9945c', w: 93, d: '2:40', l: '坚果·巧克力', src: 'wcr' },
    { id: 'c47', n: '曼特宁', t: '手冲', pr: '湿刨', vr: '铁皮卡', rt: '深烘', o: '印度尼西亚', s: '湿刨的低酸，厚得像夜。', c: '#432519', lf: '#a87343', w: 93, d: '2:45', l: '草本·雪松', src: 'coe' },
    { id: 'c48', n: '蓝山', t: '手冲', pr: '水洗', vr: '铁皮卡', rt: '浅烘', o: '牙买加', s: '干净、平衡，不抢话。', c: '#6a3c21', lf: '#d5a065', w: 93, d: '2:35', l: '坚果·奶油', src: 'wcr' },
    { id: 'c49', n: '帕卡马拉', t: '手冲', pr: '蜜处理', vr: '帕卡马拉', rt: '浅烘', o: '萨尔瓦多', s: '大粒的甜，带着熟果。', c: '#6d3d1f', lf: '#d8a163', w: 93, d: '2:30', l: '荔枝·花香', src: 'wcr' },
    { id: 'c50', n: '耶加雪菲厌氧', t: '手冲', pr: '厌氧', vr: '未标注', rt: '浅烘', o: '埃塞俄比亚', s: '厌氧把果香推到边上。', c: '#713c1e', lf: '#dc9f60', w: 93, d: '2:30', l: '发酵·莓果', src: 'coe' },
    { id: 'c51', n: '法压壶', t: '浸泡', pr: '未标注', vr: '拼配', rt: '中烘', o: '法国', s: '粗一点，反而更坦白。', c: '#52301d', lf: '#b78355', w: 93, d: '4:00', l: '醇厚·油脂', src: 'sca' },
    { id: 'c52', n: '爱乐压', t: '浸泡', pr: '未标注', vr: '拼配', rt: '中烘', o: '美国', s: '干净与浓厚之间的中间态。', c: '#5d341e', lf: '#c9945c', w: 93, d: '2:00', l: '干净·甜感', src: 'custom' },
    { id: 'c53', n: '摩卡壶', t: '浸泡', pr: '未标注', vr: '拼配', rt: '深烘', o: '意大利', s: '灶上的小壶，煮出家常的浓。', c: '#452414', lf: '#b87a3f', w: 93, d: '5:00', l: '浓烈·焦香', src: 'custom' },
    { id: 'c54', n: '土耳其咖啡', t: '浸泡', pr: '未标注', vr: '未标注', rt: '深烘', o: '土耳其', s: '粉不滤，喝到最后才懂。', c: '#3c2013', lf: '#a96e3b', w: 92, d: '6:00', l: '浓郁·香料', src: 'custom' },
    { id: 'c55', n: '虹吸壶', t: '浸泡', pr: '未标注', vr: '拼配', rt: '浅烘', o: '日本', s: '看它上升，也看它落下。', c: '#603720', lf: '#d09a60', w: 93, d: '2:30', l: '清亮·层次', src: 'custom' },
    { id: 'c56', n: '杯测', t: '浸泡', pr: '未标注', vr: '未标注', rt: '中烘', o: '通用', s: '先闻，再破渣，最后才喝。', c: '#64401f', lf: '#cf9d5d', w: 93, d: '4:00', l: '标准·评估', src: 'sca' },
    { id: 'c57', n: '冷泡法压', t: '浸泡', pr: '未标注', vr: '拼配', rt: '中烘', o: '通用', s: '冷一点，慢一点，柔一点。', c: '#4f2d1b', lf: '#b88758', w: 20, d: '12h', l: '低酸·醇厚', src: 'custom' },
    { id: 'c58', n: '越南滴滤', t: '浸泡', pr: '未标注', vr: '罗布斯塔', rt: '深烘', o: '越南', s: '滴得慢，浓得扎实。', c: '#3f2113', lf: '#a86d3a', w: 93, d: '5:00', l: '浓烈·巧克力', src: 'wcr' },
    { id: 'c59', n: '冷萃', t: '冷萃', pr: '未标注', vr: '拼配', rt: '中烘', o: '美国', s: '慢冷十二小时，苦味变温柔。', c: '#4a2b1a', lf: '#b98657', w: 20, d: '12h', l: '低酸·甜感', src: 'custom' },
    { id: 'c60', n: '氮气冷萃', t: '冷萃', pr: '未标注', vr: '拼配', rt: '中烘', o: '美国', s: '细泡像雾，入口像奶油。', c: '#4d2c1b', lf: '#d8b690', w: 20, d: '12h', l: '绵密·低酸', src: 'custom' },
    { id: 'c61', n: '冰滴', t: '冷萃', pr: '未标注', vr: '拼配', rt: '浅烘', o: '荷兰', s: '一滴一滴，把时间滤进去。', c: '#52311d', lf: '#c4935f', w: 20, d: '8h', l: '清甜·干净', src: 'custom' },
    { id: 'c62', n: '冰酿拿铁', t: '冷萃', pr: '未标注', vr: '拼配', rt: '中烘', o: '通用', s: '冰块化开时，甜也跟着醒。', c: '#5c3822', lf: '#e0bd94', w: 20, d: '12h', l: '冰甜·奶香', src: 'custom' },
    { id: 'c63', n: '燕麦冷萃', t: '冷萃', pr: '未标注', vr: '拼配', rt: '中烘', o: '通用', s: '燕麦把冷萃托得更圆。', c: '#5a3923', lf: '#dcc29e', w: 20, d: '12h', l: '谷物·柔滑', src: 'custom' },
    { id: 'c64', n: '海盐奶盖冷萃', t: '冷萃', pr: '未标注', vr: '拼配', rt: '中烘', o: '台湾', s: '一口咸，后面的甜更清楚。', c: '#56331f', lf: '#e7c99f', w: 20, d: '12h', l: '海盐·奶盖', src: 'custom' },
    { id: 'c65', n: '低因冷萃', t: '冷萃', pr: '未标注', vr: '拼配', rt: '中烘', o: '美国', s: '冰过之后，更温顺。', c: '#4c2d1b', lf: '#bd8f61', w: 20, d: '12h', l: '低因·低酸', src: 'custom' },
    { id: 'c66', n: '冷萃咖啡液', t: '冷萃', pr: '未标注', vr: '拼配', rt: '中烘', o: '家庭', s: '兑什么，都像一杯正经咖啡。', c: '#4d2d1b', lf: '#bd8d5e', w: 20, d: '12h', l: '浓缩·低酸', src: 'custom' },
    { id: 'c67', n: '罐装黑咖', t: '即饮', pr: '未标注', vr: '拼配', rt: '中烘', o: '便利店', s: '赶时间时，也算认真喝了。', c: '#4a2b1a', lf: '#b88758', w: 20, d: '即饮', l: '便利·清爽', src: 'custom' },
    { id: 'c68', n: '瓶装拿铁', t: '即饮', pr: '未标注', vr: '拼配', rt: '中烘', o: '便利店', s: '甜得直接，不装复杂。', c: '#5a3822', lf: '#dec09b', w: 20, d: '即饮', l: '奶香·甜感', src: 'custom' },
    { id: 'c69', n: '冻干美式', t: '即饮', pr: '未标注', vr: '拼配', rt: '中烘', o: '便携', s: '热水一冲，旅途也有底。', c: '#4b2c1b', lf: '#bb8c5f', w: 85, d: '15s', l: '便携·烘焙', src: 'custom' },
    { id: 'c70', n: '即饮燕麦拿铁', t: '即饮', pr: '未标注', vr: '拼配', rt: '中烘', o: '便利店', s: '燕麦味先到，咖啡随后。', c: '#5c3b25', lf: '#ddc19d', w: 20, d: '即饮', l: '谷物·奶香', src: 'custom' },
    { id: 'c71', n: '浓缩咖啡液', t: '即饮', pr: '未标注', vr: '拼配', rt: '深烘', o: '家庭', s: '一小瓶，把早晨随身带着。', c: '#3f2113', lf: '#a86d3a', w: 20, d: '开瓶即饮', l: '浓烈·便携', src: 'custom' },
    { id: 'c72', n: '挂耳咖啡', t: '即饮', pr: '未标注', vr: '拼配', rt: '中烘', o: '家庭', s: '撕开挂上，手冲就少了一步。', c: '#5c341e', lf: '#c9945c', w: 93, d: '2:00', l: '便利·坚果', src: 'custom' },
    { id: 'c73', n: '胶囊咖啡', t: '即饮', pr: '未标注', vr: '拼配', rt: '深烘', o: '家庭', s: '一按就出，浓得很有分寸。', c: '#422315', lf: '#b98048', w: 90, d: '25s', l: '便利·烘焙', src: 'custom' }
  ];

  var PATTERNS = ['none', 'crackle'];
  var PATTERN_NAMES = { none: '素瓷', crackle: '冰裂' };
  var MAT_NAMES = { porcelain: '白瓷', jade: '青玉' };
  var SPIN_NAMES = { off: '自转已关', yaw: '原地自转', orbit: '环绕自转' };

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  /* 阿拉伯数字转中文（0~999），供「录豆七十三」这类竖排题字用 */
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
  /* 白瓷反照率（与吃茶模块同源标定）：供 porcelainHex() 从主题色相派生杯身底色。
     缺失会让白瓷档的 setPorcelain() 每次抛 ReferenceError，杯身永远停在纯白。 */
  var PORC_SAT = 55;
  var PORC_L = 80;
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
     deep 器壁厚处吸收 / mid 常态 / lite 受光水头 / cool 背光冷青。
     器物跟随主题配色，切换主题色相时釉色一起走，不再是一只「永远绿」的瓶子。 */
  function glassHex(hue, lo, isDark) {
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
    // 明度偏移只按 0.6 折算：滑杆是给界面用的，器物跟着全幅摆会失真
    var l = PORC_L + (lo || 0) * 0.6 - (isDark ? 6 : 0);
    /* 暗色下略提饱和：瓷面本身压深一点，才有「自己发光」的对比 */
    return hslToHex(hue, PORC_SAT + (isDark ? 5 : 0), clamp(l, 68, 92));
  }



  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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
      open: false, lift: 0, tea: null, types: [], procs: [], vars: [], roasts: [], steam: true, pattern: 'crackle', night: 'crackle', nightFx: { body: 0.5, crackle: 0.64 }, cabinet: [],
      /* 抽豆范围：默认全库——咖啡柜只是收藏，不该偷偷缩小随机范围；true = 只喝柜内的 */
      cabOnly: false,
      /* 自转三态：off / yaw（原地，绕竖轴，几乎看不见）/ orbit（环绕，相机巡视，真正多角度）。
         默认 orbit：因为只有它让回转体「转起来」看得见；reduced-motion 下关。 */
      spinMode: reduceMotion ? 'off' : 'orbit', spinUserSet: false,
      /* 釉色：'porcelain' 白瓷（默认）/ 'jade' 青玉（参考稿的碧玉盖碗） */
      mat: 'porcelain',
      /* P0 质感档：默认开。关掉 = 原稿对照档（热气脉冲/液面增强全退，逐像素回基线） */
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
    var _liftRaf = 0;
    var _snapCfg = null;
    var _themeRaf = 0;
    var _darkObs = null;
    var _drag = { active: false, y0: 0, base: 0, moved: 0, pid: null };
    var M = { pxPerWorldY: 1, lid: null };
    var THEME = { hue: 120, lo: 0, isDark: false };

    root.innerHTML = '';
    ensureStyle(root);

    var wrap = document.createElement('div');
    wrap.className = 'coffee-wrap' + (reduceMotion ? ' coffee-reduce' : '');
    wrap.innerHTML =
      '<div class="coffee-stage">' +
        '<svg class="coffee-steam" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">' +
          '<defs><filter id="coffee-steam-blur" x="-60%" y="-60%" width="220%" height="220%">' +
            '<feGaussianBlur stdDeviation="0.8"/></filter></defs>' +
          /* 局部原点 = 瓶口：placeVerse 量出瓶身顶缘后整组 translate，别处不写死百分比 */
          '<g class="coffee-aroma" transform="translate(50 41)">' +
            '<ellipse class="coffee-aroma-glow" cx="0" cy="-1" rx="4.2" ry="2"/>' +
            '<path class="coffee-wisp" filter="url(#coffee-steam-blur)" d="M.4 0c-2.2-3.6 2.6-6-.4-9.4s2-5 0-7.4"/>' +
          '</g>' +
        '</svg>' +
        '<button type="button" class="coffee-kbd" aria-label="拔出或塞回瓶塞；按 P 切换瓶身纹样"></button>' +
        '<div class="coffee-verse v-top"><span>告别是非</span></div>' +
        '<div class="coffee-verse v-bot"><span>来杯咖啡</span></div>' +
        '<div class="coffee-count"><span class="t-num"></span><span class="t-cab">我的咖啡柜</span></div>' +
'<div class="coffee-tools">' +
                '<button class="coffee-gear" type="button" aria-label="咖啡设置">' +
        '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.6" ' +
        'stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/>' +
        '<path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>' +
      '</button>' +
      '</div>' +
      '</div>' +
      '<div class="coffee-card" aria-live="polite">' +
        '<div class="coffee-name"></div><div class="coffee-meta"></div>' +
        '<div class="coffee-note"></div><div class="coffee-brew"></div>' +
        '<button type="button" class="coffee-save"></button>' +
      '</div>' +
      '<div class="coffee-tip">点杯换咖啡 · 拖动可转</div>' +
            '<div class="coffee-mask">' +
        '<div class="coffee-cab-panel" role="dialog" aria-modal="true" aria-label="咖啡柜与咖啡库">' +
          '<div class="coffee-cab-head">' +
            '<div class="coffee-title coffee-cab-title">咖啡柜</div>' +
            '<button type="button" class="coffee-x" data-act="cab-close" aria-label="关闭">×</button>' +
          '</div>' +
          '<input type="search" class="coffee-find" placeholder="搜咖啡名 · 杯型 · 豆性" aria-label="搜索咖啡" />' +
          '<div class="coffee-seg">' +
            '<button type="button" class="coffee-seg-btn" data-seg="all">全部</button>' +
            '<button type="button" class="coffee-seg-btn" data-seg="cab">我的咖啡柜</button>' +
          '</div>' +
          '<div class="coffee-seg coffee-seg-types">' + buildTypeSegs() + '</div>' +
          '<div class="coffee-cab-list"></div>' +
          '<div class="coffee-pager">' +
            '<button type="button" class="coffee-pg" data-pg="-1" aria-label="上一页">‹</button>' +
            '<span class="coffee-pg-i"></span>' +
            '<button type="button" class="coffee-pg" data-pg="1" aria-label="下一页">›</button>' +
          '</div>' +
        '</div>' +
        '<div class="coffee-dialog" role="dialog" aria-modal="true" aria-label="咖啡设置">' +
          /* 页头：一级信息（这盏茶抽什么），说明独占一行，不与控件混排 */
          '<div class="coffee-head">' +
            '<div class="coffee-title">今天想喝点什么</div>' +
            '<div class="coffee-hint">咖啡类不选就整个范围都算，选了就只从这几类里抽</div>' +
          '</div>' +
          /* 分组 1：抽豆范围 */
          '<section class="coffee-sec">' +
            '<div class="coffee-sec-h">咖啡类</div>' +
            /* 范围在上、咖啡类在下：先定「从哪抽」，再定「抽哪几类」 */
            '<div class="coffee-field">' +
              '<span class="coffee-field-label">抽豆范围</span>' +
              '<div class="coffee-chips" data-row="scope">' +
                '<button type="button" class="coffee-chip scope" data-scope="all">全库</button>' +
                '<button type="button" class="coffee-chip scope" data-scope="cab">只喝柜内</button>' +
              '</div>' +
            '</div>' +
            /* 四维分类共用一个 chips 区：顶部 seg 切换维度（复用咖啡柜面板的既有语言），
               一次只显示一行的选项，避免 20+ 个 chip 同时铺开造成信息压力。
               已选维度在 seg 上留一个小圆点，切走也看得见。 */
            '<div class="coffee-seg coffee-seg-facet">' +
              '<button type="button" class="coffee-seg-btn" data-facet="t">杯型</button>' +
              '<button type="button" class="coffee-seg-btn" data-facet="pr">处理法</button>' +
              '<button type="button" class="coffee-seg-btn" data-facet="vr">品种</button>' +
              '<button type="button" class="coffee-seg-btn" data-facet="rt">烘焙度</button>' +
            '</div>' +
            '<div class="coffee-chips coffee-chips-types coffee-facet-list"></div>' +
            '<div class="coffee-note-src coffee-facet-src"></div>' +
          '</section>' +
          /* 分组 2：器物外观 —— 每行「字段名 + 控件」走同一套两列网格 */
          '<section class="coffee-sec">' +
            '<div class="coffee-sec-h">器物外观</div>' +
            '<div class="coffee-field">' +
              '<span class="coffee-field-label">杯身纹样</span>' +
              '<div class="coffee-chips" data-row="pattern">' +
                '<button type="button" class="coffee-chip pat" data-p="none">素瓷</button>' +
                '<button type="button" class="coffee-chip pat" data-p="crackle">冰裂</button>' +
              '</div>' +
            '</div>' +
            '<div class="coffee-field">' +
              '<span class="coffee-field-label">釉色</span>' +
              '<div class="coffee-chips" data-row="mat">' +
                '<button type="button" class="coffee-chip mat" data-m="porcelain">白瓷</button>' +
                '<button type="button" class="coffee-chip mat" data-m="jade">青玉</button>' +
              '</div>' +
            '</div>' +
            '<div class="coffee-field">' +
              '<span class="coffee-field-label">夜色效果</span>' +
              '<div class="coffee-chips" data-row="night">' +
                '<button type="button" class="coffee-chip night" data-n="body">微光</button>' +
                '<button type="button" class="coffee-chip night" data-n="crackle">裂纹</button>' +
              '</div>' +
            '</div>' +
            /* 强度是「夜色效果」的从属参数，不再是平级字段 */
            '<div class="coffee-field coffee-field-sub">' +
              '<span class="coffee-field-label">强度</span>' +
              '<div class="coffee-range-wrap">' +
                '<input type="range" class="coffee-range" min="0" max="100" step="1" aria-label="夜色效果强度" />' +
                '<span class="coffee-range-val"></span>' +
              '</div>' +
            '</div>' +
            /* 亮色主题下 gl.setNightFx 全被 isDark 压成 0，两档与强度都无视觉效果；
               这里明说，避免用户判定「开关坏了」 */
            '<div class="coffee-night-note">夜色效果只在暗色主题下可见</div>' +
            /* 开关与上面的「选哪项」不是同类，用一道淡线隔开 */
            '<label class="coffee-field coffee-switch coffee-field-divider" title="关闭后回到与 three 原稿逐像素一致的对照画面">' +
              '<span class="coffee-field-label">质感增强</span>' +
              '<input type="checkbox" class="coffee-enhance-input" aria-label="质感增强（关闭为原稿对照档）" />' +
              '<span class="track" aria-hidden="true"></span></label>' +
          '</section>' +
          /* 分组 3：动效与声音 */
          '<section class="coffee-sec">' +
            '<div class="coffee-sec-h">动效与声音</div>' +
            '<label class="coffee-field coffee-switch"><span class="coffee-field-label">热气</span>' +
              '<input type="checkbox" class="coffee-steam-input" /><span class="track" aria-hidden="true"></span></label>' +
            /* 自转三态：关 / 原地 / 环绕。与纹样/釉色/夜色同款 chips（data-row），沿用现有视觉语言 */
            '<div class="coffee-field">' +
              '<span class="coffee-field-label">自转</span>' +
              '<div class="coffee-chips" data-row="spin">' +
                '<button type="button" class="coffee-chip spin" data-s="off">关</button>' +
                '<button type="button" class="coffee-chip spin" data-s="yaw">原地</button>' +
                '<button type="button" class="coffee-chip spin" data-s="orbit">环绕</button>' +
              '</div>' +
            '</div>' +
          '</section>' +
          '<button type="button" class="coffee-link" data-act="open-cab">' +
            '<span class="coffee-link-text">我的咖啡柜</span><span class="coffee-link-arrow">›</span>' +
          '</button>' +
        '</div>' +
      '</div>';
    root.appendChild(wrap);

    el.wrap = wrap;
    el.stage = wrap.querySelector('.coffee-stage');
    el.kbd = wrap.querySelector('.coffee-kbd');
    el.verseTop = wrap.querySelector('.coffee-verse.v-top');
    el.verseBot = wrap.querySelector('.coffee-verse.v-bot');
    el.card = wrap.querySelector('.coffee-card');
    el.name = wrap.querySelector('.coffee-name');
    el.meta = wrap.querySelector('.coffee-meta');
    el.note = wrap.querySelector('.coffee-note');
    el.brew = wrap.querySelector('.coffee-brew');
    el.save = wrap.querySelector('.coffee-save');
    el.cabLink = wrap.querySelector('.coffee-link');
    el.dialog = wrap.querySelector('.coffee-dialog');
    el.cabPanel = wrap.querySelector('.coffee-cab-panel');
    el.cabList = wrap.querySelector('.coffee-cab-list');
    el.cabTitle = wrap.querySelector('.coffee-cab-title');
    el.find = wrap.querySelector('.coffee-find');
    var countStr = wrap.querySelector('.coffee-count .t-num');
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
    el.tip = wrap.querySelector('.coffee-tip');
    el.gear = wrap.querySelector('.coffee-gear');
    el.maskEl = wrap.querySelector('.coffee-mask');
    el.chips = wrap.querySelector('.coffee-facet-list');
    el.facetSeg = wrap.querySelector('.coffee-seg-facet');
    el.facetSrc = wrap.querySelector('.coffee-facet-src');
    el.scopeChips = wrap.querySelector('.coffee-chips[data-row="scope"]');
    el.patChips = wrap.querySelector('.coffee-chips[data-row="pattern"]');
    el.matChips = wrap.querySelector('.coffee-chips[data-row="mat"]');
    el.nightChips = wrap.querySelector('.coffee-chips[data-row="night"]');
    el.range = wrap.querySelector('.coffee-range');
    el.rangeVal = wrap.querySelector('.coffee-range-val');
    el.enhanceInput = wrap.querySelector('.coffee-enhance-input');
    el.steamInput = wrap.querySelector('.coffee-steam-input');
    el.spinChips = wrap.querySelector('.coffee-chips[data-row="spin"]');

    loadConfig();

    /* ── 渲染器 ── */
    try {
      gl = GaiwanMount(el.stage, { spinMode: state.spinMode, tyRef: _tyRef, mat: state.mat, jadeGain: JADE_GAIN, enhance: state.enhance,
        /* 环绕时相机移动会让盖子命中区过期：每帧把最新的 metrics 写回 M（只算投影，不读布局，零成本）。
           这同时修掉了此前「手动拖拽后盖子命中区错位」的隐患。 */
        onView: function (m) { if (m) M = m; } });
    } catch (e) {
      LOG.warn('[' + ID + '] WebGL 初始化失败', e);
      gl = null;
    }
    if (!gl) {
      wrap.classList.add('coffee-nogl');
      if (el.tip) el.tip.textContent = '这台设备开不了 WebGL';
      return makeApi();
    }
    wrap.classList.add('coffee-gl');
    setEnhance(state.enhance);   // 质感档初值：写入热气浓度变量

    /* ── P0 质感档 ──
       一处开关同时收拢两处增强：WebGL 液面增益（uFx）、热气浓度/脉冲。
       关掉时全部退回 v0.9.2 的形态，合盖逐像素与 three 原稿一致（茶汤本来只在开盖出现）。
       注：v0.9.3 的案上柔影已按作者意见移除（视觉价值不足、反而添乱），不再有 DOM 地面层。 */
    function setEnhance(on) {
      state.enhance = !!on;
      wrap.classList.toggle('coffee-reference', !state.enhance);
      if (state.enhance) {
        wrap.style.setProperty('--coffee-steam-a', '.42');
        wrap.style.setProperty('--coffee-steam-a-dark', '.32');
      } else {
        wrap.style.removeProperty('--coffee-steam-a');
        wrap.style.removeProperty('--coffee-steam-a-dark');
        wrap.classList.remove('coffee-puff');
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
      wrap.classList.toggle('coffee-narrow', narrow);
      if (el.find) el.find.setAttribute('placeholder', narrow ? '搜咖啡名' : '搜咖啡名 · 杯型 · 豆性');
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
      wrap.classList.toggle('coffee-dark', !!THEME.isDark);
      /* 夜色效果只在暗色下生效：亮色时把两档 chip 与强度滑块置灰，并显示说明 */
      wrap.classList.toggle('coffee-nofx', !THEME.isDark);
      wrap.classList.toggle('coffee-no-steam', !state.steam);
      if (gl) {
        try { gl.setPorcelain(porcelainHex(THEME.hue, THEME.lo, THEME.isDark)); } catch (e) { LOG.warn('[' + ID + '] 釉色更新失败', e); }
        try { gl.setMaterial(state.mat, glassHex(THEME.hue, THEME.lo, THEME.isDark), JADE_GAIN * (THEME.isDark ? 0.82 : 1)); } catch (e) { LOG.warn('[' + ID + '] 釉色更新失败', e); }
        try {
          var t = clamp(state.nightFx[state.night], 0, 1);
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
      /* 四维筛选：杯型为旧字段 types（沿用老存档），其余三维新增并各自校验合法性。
         空数组=全选；旧存档缺字段时保持全选，不会突然收窄抽选池。 */
      var types = (raw && raw.types) || [];
      state.types = types.filter(function (t) { return TYPES.indexOf(t) >= 0; });
      state.procs = ((raw && raw.procs) || []).filter(function (t) { return PROCESS_TYPES.indexOf(t) >= 0; });
      state.vars = ((raw && raw.vars) || []).filter(function (t) { return VARIETY_TYPES.indexOf(t) >= 0; });
      state.roasts = ((raw && raw.roasts) || []).filter(function (t) { return ROAST_TYPES.indexOf(t) >= 0; });
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
          crackle: isFinite(+raw.nightFx.crackle) ? clamp(+raw.nightFx.crackle, 0, 1) : 0.64
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
      /* 质感档默认开；老配置没有该字段时保持增强（不会莫名退回旧画面） */
      state.enhance = !(raw && raw.enhance === false);
      /* 老配置没有该字段：默认全库，保持「咖啡柜只是收藏」的语义 */
      state.cabOnly = !!(raw && raw.cabOnly);
      wrap.classList.toggle('coffee-no-steam', !state.steam);
      /* 异步到达时 UI 已按默认值画过一遍：各处按真值补刷 */
      setPattern(state.pattern, false);
      renderNightChips(); syncRange(); applyTheme();
      renderChips(); renderScopeChips(); renderSpinChips();
      setEnhance(state.enhance);
      if (el.steamInput) el.steamInput.checked = state.steam;
      if (gl) gl.setSpinMode(state.spinMode);
      paintCount(); paintSaveBtn();
    }
    function saveConfig() {
      try {
        if (api.saveData) api.saveData({ types: state.types.slice(), procs: state.procs.slice(), vars: state.vars.slice(), roasts: state.roasts.slice(), steam: !!state.steam, spinMode: state.spinMode, mat: state.mat, pattern: state.pattern, night: state.night, nightFx: { body: state.nightFx.body, crackle: state.nightFx.crackle }, cabinet: state.cabinet.slice(), enhance: !!state.enhance, cabOnly: !!state.cabOnly });
      } catch (e) { LOG.warn('[' + ID + '] 保存设置失败', e); }
    }

    /* ── 抽豆 ── */
    /* 抽豆池：咖啡柜默认只是收藏，不缩小随机范围；cabOnly 显式开启时才只喝柜内。
       类型筛选是强意图：柜内没有选中类型 → 放宽到全库该类型，并记一句提示。 */
    var _poolNote = '';
    var _lastPoolLen = 0;
    function pool() {
      _poolNote = '';
      var base = TEAS;
      if (state.cabOnly) {
        var inCab = TEAS.filter(function (t) { return state.cabinet.indexOf(t.id) >= 0; });
        if (inCab.length) base = inCab;
        else _poolNote = '咖啡柜还是空的，已从全库抽';
      }
      /* 四维交集：杯型 ∩ 处理法 ∩ 品种 ∩ 烘焙度；任一维留空即该维不限。
         放宽顺序与单维时一致：先在柜内求交集，柜内没有就到全库求交集，
         再没有才退回 range 的池（不静默抽到全库而不说明）。 */
      function match(t) {
        return (!state.types.length || state.types.indexOf(t.t) >= 0) &&
               (!state.procs.length || state.procs.indexOf(t.pr) >= 0) &&
               (!state.vars.length || state.vars.indexOf(t.vr) >= 0) &&
               (!state.roasts.length || state.roasts.indexOf(t.rt) >= 0);
      }
      var list = base.filter(match);
      if (list.length) return list;
      var global = TEAS.filter(match);
      if (global.length) {
        if (state.cabOnly) _poolNote = '咖啡柜里没有这类，已从全库抽';
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
      el.save.textContent = inCabinet(t.id) ? '已入柜 · 移出' : '存入咖啡柜';
    }
    /* 竖向题字双态：默认「录豆N」= 库统计；悬停/聚焦换成「我的咖啡柜」= 入口名。
       两个状态各有各的语义，不混用。 */
    var _countHover = false;
    function paintCount() {
      var n = state.cabinet.length;
      if (countStr) {
        countStr.textContent = '录豆' + cnNum(TEAS.length);
        var box = countStr.parentNode;
        if (box) box.classList.toggle('has-cab', n > 0);
      }
      if (el.cabLink) {
        var txt = el.cabLink.querySelector('.coffee-link-text');
        if (txt) txt.textContent = '我的咖啡柜 · ' + cnNum(n);
      }
    }
    var cabMode = 'all', cabType = '', cabPage = 0, cabQ = '';
    var CAB_PER = 8;   // 单列每页上限 8 款（矮视口按容器高度自适应缩减）
    function buildTypeSegs() {
      var out = '<button type="button" class="coffee-seg-btn" data-type="">全类</button>';
      for (var i = 0; i < TYPES.length; i++) {
        out += '<button type="button" class="coffee-seg-btn" data-type="' + TYPES[i] + '">' + TYPES[i] + '</button>';
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
          /* 四维都可搜：名称/杯型/处理法/品种/烘焙度/产区/风味词/来源名 */
          return (t.n + ' ' + t.t + ' ' + t.pr + ' ' + t.vr + ' ' + t.rt + ' ' +
                  t.o + ' ' + t.l + ' ' + (SOURCES[t.src] || '')).toLowerCase().indexOf(q) >= 0;
        });
      }
      if (el.cabTitle) {
        /* 标题跟着筛选走：搜索→找到 N；柜中→咖啡柜 N；分类→该分类 N；否则全库。
           窄面板放不下「名称 · 数字」，只留两字标题（数量由分页与列表体现）。 */
        var head = cabQ ? '找到' : (cabMode === 'cab' ? '咖啡柜' : (cabType || '录豆'));
        el.cabTitle.textContent = _narrow ? head : (head + ' · ' + cnNum(items.length));
      }
      var segs = el.cabPanel.querySelectorAll('.coffee-seg-btn');
      for (var i = 0; i < segs.length; i++) {
        var b = segs[i];
        if (b.hasAttribute('data-seg')) b.classList.toggle('on', b.getAttribute('data-seg') === cabMode);
        else b.classList.toggle('on', (b.getAttribute('data-type') || '') === cabType);
      }

      if (!items.length) {
        var pg0 = el.cabPanel.querySelector('.coffee-pager');
        if (pg0) pg0.classList.remove('show');
        /* SPEC E1>E2>E4：柜空优先于类型空态——移走最后一件茶后，
           「换分类」解决不了柜子空了的事实，文案必须指向收酒 */
        el.cabList.innerHTML = cabQ
          ? '<div class="coffee-cab-empty">没有找到「' + esc(cabQ) + '」<br />换个词试试</div>'
          : (cabMode === 'cab'
            ? '<div class="coffee-cab-empty">我的咖啡柜还是空的<br />在「全部」里点右侧的 ＋ 收进来</div>'
            : '<div class="coffee-cab-empty">这一类没有咖啡<br />换个分类看看</div>');
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
        return '<div class="coffee-row" title="' + esc(t.n + ' · ' + t.t) + '">' +
               '<button type="button" class="coffee-row-n" data-brew="' + t.id + '">' + esc(t.n) + '</button>' +
               '<button type="button" class="coffee-row-t' + (on ? ' on' : '') + '" data-id="' + t.id +
               '" aria-label="' + (on ? '移出咖啡柜' : '存入咖啡柜') + '">' + (on ? '✓' : '＋') + '</button></div>';
      }).join('');
      var pager = el.cabPanel.querySelector('.coffee-pager');
      if (pager) {
        pager.classList.toggle('show', pages > 1);
        var idxEl = pager.querySelector('.coffee-pg-i');
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
        btn.setAttribute('aria-label', on ? '移出咖啡柜' : '存入咖啡柜');
        if (el.cabTitle) {
          el.cabTitle.textContent = cabMode === 'cab'
            ? ('咖啡柜 · ' + cnNum(state.cabinet.length))
            : ('录豆 · ' + cnNum(TEAS.length));
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
      if (i >= 0) { state.cabinet.splice(i, 1); flashTip('已移出咖啡柜'); }
      else { state.cabinet.push(t.id); flashTip('已存入咖啡柜'); }
      paintSaveBtn();
      paintCount();
      saveConfig();
    }
    function paintText(t) {
      if (el.name) el.name.textContent = t.n;
      if (el.meta) {
        /* 四维分类直接可读；title 给出产区与来源等级，窄面板省下的横向空间不牺牲信息 */
        el.meta.textContent = t.t + ' · ' + t.pr + ' · ' + t.vr + ' · ' + t.rt;
        el.meta.title = t.o + ' · ' + (SOURCES[t.src] || t.src) + ' · ' + t.l;
      }
      if (el.note) el.note.textContent = '「' + t.s + '」';
      if (el.brew) {
        el.brew.innerHTML = t.w + '°<span class="coffee-dot"></span>' + t.d +
          '<span class="coffee-dot"></span>' + esc(t.l);
      }
    }
    function paintTea(t) {
      if (gl) { gl.setCoffeeColor(t.c); if (t.lf) gl.setBubbleColor(t.lf); }
      /* 热气跟水温走，但只做「有没有」的细微差别（3%vol≈.86 / 53%vol≈1.07）：
         一缕本身已经够轻，若再按度数放大浓度，高水温又会糊回一片。
         只改 --coffee-aroma-k（乘颜色 alpha），形态与节奏不动。 */
      if (wrap) {
        var ak = 0.85 + Math.min(1, Math.max(0, (t.w || 12) / 60)) * 0.25;
        wrap.style.setProperty('--coffee-aroma-k', ak.toFixed(2));
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
    function setLiftImmediate(v, dropOverride) {
      var prev = state.lift;
      state.lift = clamp(v, 0, 1);
      if (gl) gl.setLift(state.lift);
    }

    function applyLift(v, animate) {
      var target = clamp(v, 0, 1);
      if (_liftRaf) { cancelAnimationFrame(_liftRaf); _liftRaf = 0; }
      if (!animate || reduceMotion || Math.abs(target - state.lift) < 0.01) {
        setLiftImmediate(target);
        return;
      }
      var from = state.lift, t0 = null, dur = 220, drop = Math.abs(target - from);
      function step(now) {
        if (t0 === null) t0 = now;
        var p = Math.min(1, (now - t0) / dur);
        var e = 1 - Math.pow(1 - p, 3);   // ease-out：起手快、落位稳，云头轻轻回正
        setLiftImmediate(from + (target - from) * e, drop);
        if (p < 1) _liftRaf = requestAnimationFrame(step);
        else _liftRaf = 0;
      }
      _liftRaf = requestAnimationFrame(step);
    }
    var _tipTimer = null;
    function flashTip(text) {
      if (!el.tip) return;
      if (_tipTimer) clearTimeout(_tipTimer);
      el.tip.textContent = text;
      _tipTimer = setTimeout(function () {
        _tipTimer = null;
        if (el.tip) el.tip.textContent = state.open ? '再点一次，换一杯' : '点杯换咖啡 · 拖动可转';
      }, 1000);
    }

    function renderPatChips() {
      if (!el.patChips) return;
      var list = el.patChips.querySelectorAll('.coffee-chip');
      for (var i = 0; i < list.length; i++) {
        list[i].classList.toggle('on', list[i].getAttribute('data-p') === state.pattern);
      }
    }
    function renderScopeChips() {
      if (!el.scopeChips) return;
      var list = el.scopeChips.querySelectorAll('.coffee-chip');
      var want = state.cabOnly ? 'cab' : 'all';
      for (var i = 0; i < list.length; i++) {
        list[i].classList.toggle('on', list[i].getAttribute('data-scope') === want);
      }
    }
    function renderMatChips() {
      if (!el.matChips) return;
      var list = el.matChips.querySelectorAll('.coffee-chip');
      for (var i = 0; i < list.length; i++) {
        list[i].classList.toggle('on', list[i].getAttribute('data-m') === state.mat);
      }
    }
    function renderNightChips() {
      if (!el.nightChips) return;
      var list = el.nightChips.querySelectorAll('.coffee-chip');
      for (var i = 0; i < list.length; i++) {
        list[i].classList.toggle('on', list[i].getAttribute('data-n') === state.night);
      }
    }
    function renderSpinChips() {
      if (!el.spinChips) return;
      var list = el.spinChips.querySelectorAll('.coffee-chip');
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
      el.range.value = String(Math.round(v * 100));
      if (el.rangeVal) el.rangeVal.textContent = Math.round(v * 100) + '%';
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
    /* 釉色：白瓷（半球光 × 反照率）/ 青玉（环绕对称着色，见 celadonBody） */
    function setMaterial(kind, announce) {
      /* 釉色两档：白瓷（默认）/ 青玉。深浅在派生时就算好，不再事后压暗 ——
         事后压暗会把高光一起压没（实测：整只杯子会糊进背景）。 */
      state.mat = kind === 'jade' ? 'jade' : 'porcelain';
      wrap.dataset.mat = state.mat;
      if (gl) gl.setMaterial(state.mat, glassHex(THEME.hue, THEME.lo, THEME.isDark), JADE_GAIN * (THEME.isDark ? 0.82 : 1));
      renderMatChips();
      if (announce) flashTip(MAT_NAMES[state.mat]);
    }
    function cyclePattern() {
      var i = PATTERNS.indexOf(state.pattern);
      setPattern(PATTERNS[(i + 1) % PATTERNS.length], true);
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
      /* 点杯那一下「一股酒气扑出来」：只给质感档 + 热气开启时，.6s 后自动摘掉（CSS .55s），
         五条气缕自身的 coffee-aroma 错峰照常（脉冲只动容器，不改各条的动画）。 */
      if (state.enhance && state.steam) {
        wrap.classList.add('coffee-puff');
        if (_puffTimer) clearTimeout(_puffTimer);
        _puffTimer = setTimeout(function () { wrap.classList.remove('coffee-puff'); _puffTimer = null; }, 600);
      }
      applyLift(1, true);
      syncSpin();
      if (el.tip) {
        if (!forced && _poolNote) el.tip.textContent = _poolNote;
        else if (!forced && _lastPoolLen <= 1) el.tip.textContent = '只此一款，换不了';
        else el.tip.textContent = '再点一次，换一杯';
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
      wrap.classList.remove('coffee-puff');
      if (el.card) el.card.classList.remove('is-live');
      if (el.tip) el.tip.textContent = '点杯换咖啡 · 拖动可转';
      applyLift(0, true);
      syncSpin();
      if (_revealTimer) { clearTimeout(_revealTimer); _revealTimer = null; }
    }
    function toggle() { if (state.open) close(); else open(); }

    /* ── 手势 ──
       按下时先拾取部件（1×1 离屏渲染，逐像素准确）：
         葫芦塞 → 点杯/塞回（点按）/ 起塞（拖动）
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
      /* 底部工具行（咖啡柜 / 设置）在舞台内：一旦被 setPointerCapture 捕获，
         后续 click 会被重定向到舞台，按钮自己的 click 永远收不到。整行放行。 */
      if (e.target && e.target.closest && e.target.closest('.coffee-tools, .coffee-count')) return;
      var p = stagePoint(e), part = 0;
      try { part = gl ? gl.pick(p.x, p.y) : 0; } catch (err) { part = 0; }
      _g.active = true;
      _g.kind = part === 3 ? 'lid' : 'orbit';
      _g.x = e.clientX; _g.y = e.clientY; _g.moved = 0;
      _pan = panOf(e);
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
      } else {
        gl.orbitBy(dx, dy);
      }
      if (e.cancelable) e.preventDefault();
    }
    function onPointerUp() {
      if (!_g.active) return;
      _g.active = false;
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
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') { e.preventDefault(); toggle(); }
        else if (e.key === 'p' || e.key === 'P') { e.preventDefault(); cyclePattern(); }
      });
      el.kbd.addEventListener('click', function () { toggle(); });
    }

    /* ── 设置 ── */
    /* 四维切换：定义表把维度名、取值、状态键、来源说明收在一起，
       渲染只按当前维度重画一组 chips，风格与杯型原本的轻量文本完全一致。 */
    var FACETS = [
      { key: 't',  label: '杯型',   vals: TYPES,         field: 'types',  src: '浓缩·卡布依 INEI 规范，余为行业惯例' },
      { key: 'pr', label: '处理法', vals: PROCESS_TYPES, field: 'procs',  src: '依 COE 分组与行业通用大类' },
      { key: 'vr', label: '品种',   vals: VARIETY_TYPES, field: 'vars',   src: '依 WCR 品种目录，拼配单列' },
      { key: 'rt', label: '烘焙度', vals: ROAST_TYPES,   field: 'roasts', src: '依 Agtron/SCA 八色卡归档' }
    ];
    var facetTab = 't';
    function facetOf(key) {
      for (var i = 0; i < FACETS.length; i++) if (FACETS[i].key === key) return FACETS[i];
      return FACETS[0];
    }
    function renderChips() {
      var f = facetOf(facetTab), pool = state[f.field];
      if (el.facetSeg) {
        var segs = el.facetSeg.querySelectorAll('.coffee-seg-btn');
        for (var i = 0; i < segs.length; i++) {
          var s = segs[i], k = s.getAttribute('data-facet');
          s.classList.toggle('on', k === facetTab);
          /* 已选维度留小圆点：切到别的维度也知道这里筛过 */
          var sf = facetOf(k);
          s.classList.toggle('has-filter', state[sf.field].length > 0);
        }
      }
      if (el.chips) {
        el.chips.innerHTML = f.vals.map(function (v) {
          return '<button type="button" class="coffee-chip" data-fv="' + esc(v) + '">' + esc(v) + '</button>';
        }).join('');
        var list = el.chips.querySelectorAll('.coffee-chip');
        for (var j = 0; j < list.length; j++) {
          list[j].classList.toggle('on', pool.indexOf(list[j].getAttribute('data-fv')) >= 0);
        }
      }
      if (el.facetSrc) el.facetSrc.textContent = f.src;
    }
    function openSettings() {
      _snapCfg = {
        types: state.types.slice(), procs: state.procs.slice(), vars: state.vars.slice(), roasts: state.roasts.slice(),
        steam: !!state.steam, spinMode: state.spinMode,
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
        state.procs = (_snapCfg.procs || []).slice();
        state.vars = (_snapCfg.vars || []).slice();
        state.roasts = (_snapCfg.roasts || []).slice();
        renderChips();
        state.night = _snapCfg.night || 'body';
        if (_snapCfg.nightFx) state.nightFx = { body: _snapCfg.nightFx.body, crackle: _snapCfg.nightFx.crackle };
        state.cabOnly = !!_snapCfg.cabOnly;
        renderNightChips();
        renderScopeChips();
        syncRange();
        state.steam = _snapCfg.steam;
        state.spinMode = _snapCfg.spinMode;
        wrap.classList.toggle('coffee-no-steam', !state.steam);
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
      var groups = [
        [snap.types || [], state.types], [snap.procs || [], state.procs],
        [snap.vars || [], state.vars], [snap.roasts || [], state.roasts]
      ];
      for (var g = 0; g < groups.length; g++) {
        var a = groups[g][0], b = groups[g][1];
        if (a.length !== b.length) return true;
        for (var i = 0; i < b.length; i++) if (a.indexOf(b[i]) < 0) return true;
      }
      return false;
    }
    if (el.gear) el.gear.addEventListener('click', openSettings);
    /* 维度 seg：切换当前显示的那一组 chips */
    if (el.facetSeg) {
      el.facetSeg.addEventListener('click', function (e) {
        var b = e.target && e.target.closest ? e.target.closest('.coffee-seg-btn') : null;
        if (!b) return;
        facetTab = b.getAttribute('data-facet');
        renderChips();
      });
    }
    /* 当前维度的 chips：点选即切换（值属于当前维度，写到对应状态数组） */
    if (el.chips) {
      el.chips.addEventListener('click', function (e) {
        var chip = e.target && e.target.closest ? e.target.closest('.coffee-chip') : null;
        if (!chip) return;
        var v = chip.getAttribute('data-fv'), pool = state[facetOf(facetTab).field];
        var i = pool.indexOf(v);
        if (i >= 0) pool.splice(i, 1); else pool.push(v);
        chip.classList.toggle('on', i < 0);
        renderChips();
        scheduleSave();
      });
    }
    if (el.scopeChips) {
      el.scopeChips.addEventListener('click', function (e) {
        var chip = e.target && e.target.closest ? e.target.closest('.coffee-chip') : null;
        if (!chip) return;
        state.cabOnly = chip.getAttribute('data-scope') === 'cab';
        renderScopeChips();
        scheduleSave();
      });
    }
    if (el.patChips) {
      el.patChips.addEventListener('click', function (e) {
        var chip = e.target && e.target.closest ? e.target.closest('.coffee-chip') : null;
        if (!chip) return;
        setPattern(chip.getAttribute('data-p'), false);
        scheduleSave();
      });
    }
    if (el.matChips) {
      el.matChips.addEventListener('click', function (e) {
        var chip = e.target && e.target.closest ? e.target.closest('.coffee-chip') : null;
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
        var tg = t && t.closest ? t.closest('.coffee-row-t') : null;
        if (tg) { toggleFromList(tg); return; }
        var br = t && t.closest ? t.closest('.coffee-row-n') : null;
        if (br) brewFromList(br.getAttribute('data-brew'));
      });
    }
    var countBox = wrap.querySelector('.coffee-count');
    if (countBox) {
      countBox.setAttribute('role', 'button');
      countBox.setAttribute('tabindex', '0');
      countBox.setAttribute('aria-label', '打开我的咖啡柜');
      countBox.addEventListener('mouseenter', function () { _countHover = true; countBox.classList.add('is-hover'); paintCount(); });
      countBox.addEventListener('mouseleave', function () { _countHover = false; countBox.classList.remove('is-hover'); paintCount(); });
      countBox.addEventListener('focus', function () { _countHover = true; countBox.classList.add('is-hover'); paintCount(); });
      countBox.addEventListener('blur', function () { _countHover = false; countBox.classList.remove('is-hover'); paintCount(); });
      /* 默认文案是「录豆N」（库），点击开「全部」段——用户明确要求过：点它看完整列表再挑进柜 */
      countBox.addEventListener('click', function () { openCabinet('all'); });
      countBox.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openCabinet('all'); }
      });
    }
    /* 悬停检测改走舞台 mousemove 几何命中，绕过可能盖住 .coffee-count 的透明层
       （WebGL 画布 / 拖动手柄等）；只认几何位置不认元素自身事件，稳定显示「我的咖啡柜」 */
    if (el.stage) {
      /* 用本作用域的 countBox，不能引用 vCountEl —— 那是 GaiwanMount 闭包里的局部变量，
         跨函数访问会抛 ReferenceError（鼠标一进舞台就报错，悬停切换「我的咖啡柜」失效）。 */
      var coffeeCountHit = function (x, y) {
        if (!countBox) return false;
        var r = countBox.getBoundingClientRect();
        return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
      };
      el.stage.addEventListener('mousemove', function (e) {
        if (el.wrap && el.wrap.classList.contains('is-dragging')) {
          if (_countHover) { _countHover = false; if (countBox) countBox.classList.remove('is-hover'); }
          return;
        }
        var inside = coffeeCountHit(e.clientX, e.clientY);
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
        var chip = e.target && e.target.closest ? e.target.closest('.coffee-chip') : null;
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
        wrap.classList.toggle('coffee-no-steam', !state.steam);
        scheduleSave();
      });
    }
    if (el.spinChips) {
      el.spinChips.addEventListener('click', function (e) {
        var chip = e.target && e.target.closest ? e.target.closest('.coffee-chip') : null;
        if (!chip) return;
        setSpinMode(chip.getAttribute('data-s'), false);
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
      if (_liftRaf) { cancelAnimationFrame(_liftRaf); _liftRaf = 0; }
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
    '.coffee-wrap{' +
      '--lo:var(--accent-lightness-offset,0%);' +
      'position:relative;height:100%;min-height:0;display:flex;flex-direction:column;' +
      'font-family:var(--font-family,-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif);' +
      'color:hsl(var(--th),18%,22%);overflow:hidden;user-select:none;-webkit-user-select:none;' +
      'background:linear-gradient(165deg,' +
        'var(--bg-gradient-start,#f7faf5) 0%,var(--bg-gradient-mid1,#f2f8f0) 20%,' +
        'var(--bg-gradient-mid2,#eef6eb) 40%,var(--bg-gradient-mid1,#f2f8f0) 60%,' +
        'var(--bg-gradient-end,#f6faf4) 80%,var(--bg-gradient-start,#f7faf5) 100%);' +
    '}' +
    '.coffee-wrap.coffee-dark{' +
      'color:hsl(var(--th),10%,92%);' +
    '}' +
    /* 【设置面板 / 咖啡柜的明暗适配】
       模块 iframe 是普通文档、没有 Shadow DOM：宿主 variables.css 的暗色令牌全部写在
       :host(.dark) 里，在这里永远不生效（上面 :root.dark 只补了 4 个背景渐变令牌）。
       弹窗吃的是 --overlay-surface / --text-* 这套语义变量，若不在模块侧补暗色值，
       暗色主题下仍取 :root 的亮色令牌 —— 近白底 + 深字，一块刺眼的白板，即「没有明暗适配」。
       这里按宿主 :host(.dark) 的明度公式逐条对齐，改用模块自己的 --th / --lo 跟随色相与
       明度滑块；作用域只落在 .coffee-wrap.coffee-dark 内，不越权改全局。.coffee-dark 由
       applyTheme() 响应 html class 与 theme:changed 双向切换，切主题即时生效。 */
    '.coffee-wrap.coffee-dark{' +
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

    /* z-index:0 让舞台自成层叠上下文：热气才能用负层压到画布（器物）后面，
       同时不影响工具行、命中区这些 z-index:auto 的定位子元素（它们仍在画布之上） */
    '.coffee-stage{position:relative;z-index:0;flex:1 1 auto;min-height:0;touch-action:none;}' +
    /* 极淡落地暗部：不是投影网格，只给葫芦一点「坐在案上」的重量。z-index -1 压在画布下。 */
    '.coffee-stage::after{content:"";position:absolute;z-index:-1;left:50%;' +
      'top:var(--coffee-ground-y,60%);width:38%;height:5%;' +
      'transform:translate(-50%,-50%);border-radius:50%;pointer-events:none;' +
      'background:radial-gradient(ellipse at center,hsla(var(--th),22%,28%,.16),transparent 72%);' +
      'filter:blur(6px);}' +
    '.coffee-wrap.coffee-dark .coffee-stage::after{' +
      'background:radial-gradient(ellipse at center,rgba(0,0,0,.30),transparent 72%);}' +
    /* 命中区：盖子在视口里的投影（相机固定 → 比例固定） */
    '.coffee-kbd{position:absolute;left:0;top:0;width:100%;height:100%;padding:0;border:0;background:transparent;' +
      'opacity:0;pointer-events:none;}' +
    '.coffee-kbd:focus-visible{opacity:1;outline:2px dashed hsl(var(--th),32%,52%);outline-offset:-6px;' +
      'border-radius:var(--radius-md,14px);}' +
    /* 设置面板的字段 / 分组 / 选项栅格统一定义在下方「设置面板」段：
       这里不再散落 .coffee-sub 与 .coffee-chips[data-row] 的重复覆盖，避免同一属性两处打架。
       注意：注释不能带 `+`，否则下一行字符串会被一元加号转成 NaN，样式串里出现 "NaN"。 */
    /* 热气只留「一缕」：酒不像茶那样成团成柱地冒，开塞后是丝丝一线往上散。
       所以只画一条细缕（1.6），去掉成排雾珠与成组气缕——浓度靠「细而长」与
       比茶更快的节奏（4.2s / 开塞 .45s）表达，不靠条数与粗细堆出来。 */
    '.coffee-steam{position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:-1;' +
      'opacity:0;transition:opacity var(--duration-slow) var(--ease-cn);}' +
    '.coffee-wrap.is-open .coffee-steam{opacity:1;transition-delay:var(--duration-normal);}' +
    '.coffee-wrap.coffee-no-steam .coffee-steam{display:none;}' +
    /* --coffee-aroma-k 由水温派生（3%vol≈.86 / 53%vol≈1.07），只乘颜色 alpha，不动形态节奏 */
    '.coffee-wisp{fill:none;stroke:hsla(var(--th),18%,57%,calc(var(--coffee-steam-a,.34) * var(--coffee-aroma-k,1)));' +
      'stroke-width:1.6;stroke-linecap:round;transform-box:fill-box;transform-origin:50% 100%;}' +
    /* 瓶口一丝暖光：不呼吸、不放大，只让「刚点杯」的瓶口有温度 */
    '.coffee-aroma-glow{fill:hsla(38,42%,64%,.11);filter:blur(3px);' +
      'transform-box:fill-box;transform-origin:50% 50%;}' +
    '.coffee-dark .coffee-wisp{stroke:hsla(var(--th),26%,96%,calc(var(--coffee-steam-a-dark,.26) * var(--coffee-aroma-k,1)));}' +
    '.coffee-dark .coffee-aroma-glow{fill:hsla(38,40%,88%,.08);}' +
    '.coffee-wrap.is-open .coffee-wisp{animation:coffee-aroma 4.2s ease-out infinite;}' +
    '@keyframes coffee-aroma{' +
      '0%{opacity:0;transform:translateY(1.4px) scale(.94,.9);}' +
      '18%{opacity:1;}' +
      '62%{opacity:.38;}' +
      '100%{opacity:0;transform:translate(-1.2px,-6.4px) scale(1,1.1);}' +
    '}' +
    /* 点杯那一下：一缕轻烟被带动，.45s 就收住（茶是 .9s 的大股热气） */
    '.coffee-wrap.coffee-puff .coffee-steam{animation:coffee-aroma-puff .45s ease-out both;}' +
    '@keyframes coffee-aroma-puff{' +
      '0%{opacity:0;transform:translateY(1px) scale(.94,1);}' +
      '40%{opacity:1;transform:translateY(-1px) scale(1.05,1);}' +
      '100%{opacity:1;transform:none;}' +
    '}' +
    '.coffee-wrap.coffee-reference .coffee-steam{animation:none;}' +
    /* 上下两行题字：位置由 placeVerse() 按器物在屏幕上的实际边界算，不写死百分比 */
    /* 竖排：外层满宽只负责水平居中，内层 span 用 vertical-rl 把字竖着叠；
       高度随字数变化，故用 translateY(-50%) 以自身中心对齐 placeVerse() 给出的 y */
    '.coffee-verse{position:absolute;left:0;right:0;text-align:center;pointer-events:none;' +
      'font-size:15px;line-height:1;opacity:.74;font-weight:500;transform:translateY(-50%);' +
      'white-space:nowrap;transition:opacity var(--duration-slow) var(--ease-cn);}' +
    /* 收录数量：竖排、默认显示（未开盖），开盖后让位给茶样文案 */
    /* 这一列本身就是「柜 / 库」的状态显示，点击直达咖啡柜 —— 比另加图标更省地方 */
    /* 计数列常显 .55（PATCH-49 的隐藏是误读：用户当时要的是改名不是隐藏）；
       悬停自身提亮到 .85 提示可点，开盖后让位给茶样文案 */
    '.coffee-count{position:absolute;z-index:4;left:0;right:0;display:grid;justify-content:center;justify-items:center;' +
      'align-items:center;pointer-events:auto;cursor:pointer;' +
      'font-size:15px;line-height:1;opacity:.55;transform:translateY(-50%);' +
      'white-space:nowrap;transition:opacity var(--duration-slow) var(--ease-cn);}' +
    '.coffee-count:focus-visible{opacity:.85;}' +
    /* 同级特异性：否则悬停自身被下面的开盖规则之外的因素压住 */
    '.coffee-wrap:not(.is-open) .coffee-count:hover{opacity:.85;}' +
    /* 颜色不写死：继承 .coffee-wrap 的主题色（浅底 hsl(--th,18%,22%)、深底 hsl(--th,10%,92%)），
       与两列题字同源，只是透明度更低一档。 */
    '.coffee-count>span{grid-area:1/1;display:inline-block;writing-mode:vertical-rl;text-orientation:mixed;' +
      'letter-spacing:.30em;margin-inline-end:-.30em;transition:opacity var(--duration-fast) var(--ease-cn);}' +
    '.coffee-count .t-cab{opacity:0;}' +
    '.coffee-count:hover .t-num,.coffee-count.is-hover .t-num,.coffee-count:focus-within .t-num{opacity:0;}' +
    '.coffee-count:hover .t-cab,.coffee-count.is-hover .t-cab,.coffee-count:focus-within .t-cab{opacity:1;}' +
    /* 开盖后这段纵向空间交给茶样文案：数量是未开盖态的信息，工具行也不必在喝茶中途出现
       （要开咖啡柜/设置，合盖即可）。不隐藏的话三者会叠在一起、按钮被盖住点不到。 */
    /* 竖排里 text-decoration:underline 会沿文字方向画一条竖线，看着像多出来的一根线，
       所以悬停只换颜色，不加下划线 */
    '.coffee-count:hover>span,.coffee-count:focus-visible>span{color:var(--bm-primary,#3a7a3a);opacity:1;}' +
    '.coffee-wrap.is-open .coffee-count{opacity:0;pointer-events:none;}' +
    /* 设置入口不随开盖让位：brewFromList 已能先合上再揭盖，且工具行只有齿轮，禁用等于点杯后打不开设置 */
    /* 亮色主题下夜色两档与强度无视觉效果，置灰并说明；暗色恢复 */
    '.coffee-nofx .coffee-chip.night{opacity:.4;pointer-events:none;}' +
    '.coffee-nofx .coffee-field-sub{opacity:.4;pointer-events:none;}' +
    '.coffee-night-note{display:none;margin-top:4px;font-size:11px;line-height:1.45;opacity:.5;}' +
    '.coffee-nofx .coffee-night-note{display:block;}' +
    /* ── 窄面板（<210px）：单列列表、分类三列、留白收紧 ── */
    '.coffee-narrow .coffee-dialog,.coffee-narrow .coffee-cab-panel{padding:12px;' +
      'max-width:none;width:calc(100% - 8px);}' +
    '.coffee-narrow .coffee-dialog{padding:12px 11px 11px;}' +
    '.coffee-narrow .coffee-cab-list{grid-template-columns:1fr;column-gap:0;row-gap:0;}' +
    '.coffee-narrow .coffee-seg-types{grid-template-columns:repeat(3,1fr);gap:0 6px;}' +
    '.coffee-narrow .coffee-seg-btn{font-size:11px;}' +
    '.coffee-narrow .coffee-row{padding:4px 4px;margin:0 -4px;}' +
    '.coffee-narrow .coffee-find{height:24px;line-height:24px;font-size:11px;margin-top:8px;}' +
    '.coffee-narrow .coffee-title{font-size:14px;}' +
    /* 特异性需高于 .coffee-dialog .coffee-title，否则窄面板会被拉回 15px */
    '.coffee-narrow .coffee-dialog .coffee-title{font-size:14px;letter-spacing:.06em;text-indent:.06em;}' +
    '.coffee-narrow .coffee-actions{padding-top:8px;margin-top:10px;}' +
    /* 窄面板：字段名列再收 6px，茶类仍保持 4 列（2 字标签在 ~43px 列宽里放得下） */
    '.coffee-narrow .coffee-field{grid-template-columns:58px minmax(0,1fr);column-gap:6px;}' +
    '.coffee-narrow .coffee-chips-types{gap:2px 4px;}' +
    '.coffee-narrow .coffee-seg-facet{gap:0 4px;}' +
    '.coffee-narrow .coffee-facet-list{gap:4px 3px;}' +
    '.coffee-narrow .coffee-chips[data-row]{gap:2px 4px;}' +
    '.coffee-narrow .coffee-sec{margin-top:10px;}' +
    '.coffee-narrow .coffee-sec+.coffee-sec{padding-top:10px;}' +
    '.coffee-narrow .coffee-sec-h{letter-spacing:.08em;text-indent:.08em;}' +
    '.coffee-narrow .coffee-field-sub .coffee-field-label{padding-left:8px;}' +
    '' +
    '.coffee-verse>span{display:inline-block;writing-mode:vertical-rl;text-orientation:mixed;' +
      'letter-spacing:.18em;margin-inline-end:-.18em;}' +
    '.coffee-wrap:hover .coffee-verse{opacity:.92;}' +
    /* 滑块行已并入 .coffee-field 两列网格（见设置面板段），此处只补栅格内的宽度。
       同上：注释行不带 `+`，否则下一行字符串会被一元加号吞成 NaN。 */
    '.coffee-range-wrap{display:flex;align-items:center;gap:8px;width:100%;}' +
    '.coffee-range-wrap .coffee-range{width:auto;flex:1 1 auto;}' +
    '.coffee-range-val{flex:0 0 auto;min-width:34px;text-align:right;font-size:11px;' +
      'color:var(--text-tertiary,currentColor);font-variant-numeric:tabular-nums;}' +
    /* 滑块沿用 curtain 模块 .bc-range 的组件写法（轨道 4px / 拇指 14px），
       并保留那条必须的 min-height:0 —— base.css 有全局 :where(input) 触控地板，
       不显式清零会被撑到 44px 高，把面板顶变形。 */
    '.coffee-range{flex:1 1 auto;min-width:0;display:block;height:18px;min-height:0;margin:0;' +
      '-webkit-appearance:none;appearance:none;background:transparent;cursor:pointer;' +
      '-webkit-tap-highlight-color:transparent;}' +
    '.coffee-range::-webkit-slider-runnable-track{height:4px;border-radius:2px;background:hsla(var(--th),20%,46%,.28);}' +
    '.coffee-range::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:14px;height:14px;margin-top:-5px;' +
      'border-radius:50%;background:hsl(var(--th),36%,40%);box-shadow:0 1px 2px rgba(0,0,0,.3);}' +
    '.coffee-range::-moz-range-track{height:4px;border-radius:2px;background:hsla(var(--th),20%,46%,.28);}' +
    '.coffee-range::-moz-range-thumb{width:14px;height:14px;border:none;border-radius:50%;' +
      'background:hsl(var(--th),36%,40%);box-shadow:0 1px 2px rgba(0,0,0,.3);}' +
    '.coffee-range:focus-visible{outline:2px solid hsl(var(--th),40%,46%);outline-offset:2px;}' +
    '.coffee-stage{cursor:grab;}' +
    '.gaiwan-canvas{position:absolute;inset:0;pointer-events:none;}' +
    '.coffee-wrap.is-orbiting .coffee-stage{cursor:grabbing;}' +
    '.coffee-wrap.coffee-nogl .coffee-stage{display:none;}' +

    /* 文案整体上提：用 relative+top 而不是 margin/transform ——
       margin 会改变舞台高度（器物跟着缩放），transform 与 is-live 的淡入位移冲突。 */
    '.coffee-card{position:relative;padding:0 var(--space-20) var(--space-8);text-align:center;opacity:0;' +
      'transform:translateY(10px);transition:opacity var(--duration-slow) var(--ease-cn),' +
      'transform var(--duration-slow) var(--ease-cn);}' +
    '.coffee-card.is-live{opacity:1;transform:none;}' +
    '.coffee-save{margin-top:8px;padding:2px 0;border:0;background:none;cursor:pointer;' +
      'font-family:inherit;font-size:11px;letter-spacing:.06em;color:var(--bm-primary,#3a7a3a);opacity:.8;' +
      'transition:opacity var(--duration-fast) var(--ease-cn);}' +
    '.coffee-save:hover{opacity:1;text-decoration:underline;text-underline-offset:3px;}' +
    '.coffee-name{font-size:var(--type-xl);font-weight:500;letter-spacing:.12em;line-height:1.3;' +
      'font-family:"Songti SC","Noto Serif CJK SC",Georgia,serif;}' +
    '.coffee-meta{margin-top:var(--space-5);font-size:var(--type-xs);opacity:.62;letter-spacing:.08em;}' +
    '.coffee-note{margin-top:var(--space-12);font-size:var(--type-sm);opacity:.8;line-height:1.7;letter-spacing:.04em;}' +
    '.coffee-brew{margin-top:var(--space-10);font-size:var(--type-xs);opacity:.5;letter-spacing:.08em;' +
      'display:flex;align-items:center;justify-content:center;gap:var(--space-8);}' +
    '.coffee-dot{width:2px;height:2px;border-radius:50%;background:currentColor;opacity:.55;}' +
    /* 提示行默认隐藏，悬停整个模块时淡入；触摸设备没有 hover，保持常显。
       只改透明度不改 display —— 它仍占位，底部布局与卡片位置不受影响。 */
    '.coffee-tip{position:relative;flex:0 0 auto;text-align:center;font-size:var(--type-xs);letter-spacing:.22em;' +
      'opacity:0;padding:0 var(--space-8) 0;transition:opacity var(--duration-slow) var(--ease-cn);}' +
    '.coffee-wrap:hover .coffee-tip,.coffee-wrap:focus-within .coffee-tip{opacity:.34;}' +
    '@media (hover:none){.coffee-tip{opacity:.34;}}' +

    /* 设置按钮放到底部居中、提示行上方：原来在右上角，侧栏里离器物太远，
       且和「录豆七十三 / 吃茶去。」那几列字抢右上角的空白。 */
    /* z-index 必须高于画布：齿轮在 .coffee-stage 里，而画布由渲染器后插入 stage，会盖住它 */
    /* 底部工具行：咖啡柜 + 设置，两个图标并列。容器负责水平居中（margin auto 不依赖宽度），
       按钮常显但很淡 —— 一个图标可以靠 hover 藏，两个就不容易被发现了。 */
    '.coffee-tools{position:absolute;z-index:2;left:0;right:0;margin:0 auto;top:0;width:max-content;' +
      'display:flex;flex-direction:column;align-items:center;gap:10px;}' +
    '.coffee-tools button{width:22px;height:22px;display:flex;align-items:center;justify-content:center;' +
      'padding:0;border:0;background:transparent;color:inherit;opacity:.22;cursor:pointer;' +
      'transition:opacity var(--duration-normal) var(--ease-cn),transform var(--duration-normal) var(--ease-cn);}' +
    '.coffee-wrap:hover .coffee-tools button{opacity:.42;}' +
    '.coffee-tools button:hover,.coffee-tools button:focus-visible{opacity:.85;}' +
    '.coffee-tools button:focus-visible{outline:2px solid hsl(var(--th),32%,52%);outline-offset:2px;}' +
    '.coffee-gear:hover{transform:rotate(30deg);}' +
    '@media (hover:none){.coffee-tools button{opacity:.42;}}' +

    /* 面板贴底：居中会正好盖住盖碗，调参时看不到器物 */
    '.coffee-mask{position:absolute;inset:0;display:none;align-items:flex-end;justify-content:center;' +
      'background:transparent;padding:12px;z-index:var(--z-layer-overlay,10000);pointer-events:auto;}' +
    '.coffee-wrap.is-set .coffee-mask,.coffee-wrap.is-cab .coffee-mask{display:flex;}' +
    /* ── 设置面板：尺寸全部写死像素，不再吃宿主的 --space-* ——
       那套令牌是给正文排版的，用在弹窗里会把每行都撑大，整体显笨。 */
    '.coffee-dialog,.coffee-cab-panel{display:none;width:100%;max-width:296px;max-height:80%;overflow-y:auto;' +
      'scrollbar-width:none;-ms-overflow-style:none;' +
      'background:var(--overlay-surface,#fff);' +
      'border:var(--overlay-border,1px solid rgba(0,0,0,.08));border-radius:14px;' +
      'box-shadow:var(--overlay-shadow,0 12px 32px rgba(0,0,0,.18));padding:16px;' +
      'color:var(--text-primary,inherit);}' +
    /* 设置面板对齐博客表单：圆角 12 / padding 14·13。仅作用于 .coffee-dialog，
       咖啡柜面板继续用共享外壳的 14 / 16，不受本次对齐影响。 */
    '.coffee-dialog{border-radius:12px;padding:14px 13px;}' +
    /* 底色与文字色都取宿主语义变量（--overlay-surface / --text-*），二者必须配套翻转。
       宿主在 Shadow DOM 下靠 :host(.dark) 翻转，但模块 iframe 没有 shadow host、翻不到，
       故暗色值由上方 .coffee-wrap.coffee-dark 在模块作用域内补齐（不越权改全局）。
       对比度核查按此口径执行（16/16 通过，见 PATCHES.md PATCH-44）。 */
    '.coffee-cab-panel::-webkit-scrollbar,.coffee-dialog::-webkit-scrollbar{display:none;}' +
    '.coffee-wrap.is-set .coffee-dialog,.coffee-wrap.is-cab .coffee-cab-panel{display:block;}' +
    '.coffee-title{font-size:14px;font-weight:600;line-height:1.3;letter-spacing:.02em;}' +
    /* 底部入口独立成一级：与最后一组之间拉出更明确的间隔与分隔线 */
    '.coffee-link{display:flex;align-items:center;justify-content:space-between;width:100%;gap:8px;' +
      'margin-top:14px;padding:10px 0 0;border:0;border-top:1px solid var(--bamboo-border,rgba(0,0,0,.12));' +
      'background:none;cursor:pointer;font-family:inherit;font-size:12px;' +
      'color:var(--text-tertiary,currentColor);opacity:.85;}' +
    '.coffee-link:hover{opacity:1;color:var(--bm-primary,#3a7a3a);}' +
    '.coffee-link-arrow{opacity:.6;}' +
    /* 搜索框：左右内边距归零，让占位文字与标题/分类/茶名共用同一条左边线。
       （原来用填充底色 + 9px 内边距，文字比其它内容右移了 9px，是唯一没对齐的元素）
       高度写死并 min-height:0，否则被宿主的表单触控地板撑高。 */
    '.coffee-find{display:block;width:100%;box-sizing:border-box;height:26px;min-height:0;margin:8px 0 8px;' +
      'padding:0;border:0;border-bottom:1px solid hsla(var(--th),18%,46%,.16);border-radius:0;' +
      'background:none;color:inherit;font-family:inherit;font-size:12px;line-height:26px;outline:none;' +
      '-webkit-appearance:none;appearance:none;}' +
    '.coffee-find::placeholder{color:var(--text-tertiary,currentColor);opacity:.5;}' +
    '.coffee-find:focus{border-bottom-color:var(--bm-primary,#3a7a3a);}' +
    '.coffee-find::-webkit-search-cancel-button{-webkit-appearance:none;display:none;}' +
    '.coffee-seg{display:flex;gap:16px;margin-top:4px;padding-bottom:3px;' +
      'border-bottom:1px solid hsla(var(--th),18%,46%,.14);}' +
    /* 行高压到 1.1、上下内边距 1px：胶囊去掉后按钮仍被行高撑出留白 */
    '.coffee-seg-btn{padding:2px 0;min-height:0;line-height:1.1;white-space:nowrap;text-align:left;border:0;background:none;cursor:pointer;' +
      'font-family:inherit;font-size:11px;color:var(--text-tertiary,currentColor);opacity:.8;}' +
    '.coffee-seg-btn.on{color:var(--bm-primary,#3a7a3a);opacity:1;font-weight:600;}' +
    /* 暗色底上主色回退值对比度只有 3.1（实测 #3a7a3a on #1d231d），选中色按主题双向定明暗保 AA。
       弹窗里所有用 --bm-primary 作 hover / focus 色的元素一并抬到亮一档，否则暗底上看不清。 */
    '.coffee-wrap.coffee-dark .coffee-seg-btn.on,.coffee-wrap.coffee-dark .coffee-chip.on,.coffee-wrap.coffee-dark .coffee-row-t.on,' +
    '.coffee-wrap.coffee-dark .coffee-row-n:hover,.coffee-wrap.coffee-dark .coffee-save,' +
    '.coffee-wrap.coffee-dark .coffee-link:hover,.coffee-wrap.coffee-dark .coffee-x:hover,' +
    '.coffee-wrap.coffee-dark .coffee-row-t:hover,.coffee-wrap.coffee-dark .coffee-cab-del:hover{color:hsl(var(--th),42%,68%);}' +
    '.coffee-wrap.coffee-dark .coffee-find:focus{border-bottom-color:hsl(var(--th),42%,68%);}' +
    '.coffee-wrap.coffee-dark .coffee-chip:focus-visible,.coffee-wrap.coffee-dark .coffee-btn:focus-visible,' +
    '.coffee-wrap.coffee-dark .coffee-switch input:focus-visible ~ .track{outline-color:hsl(var(--th),42%,68%);}' +
    '.coffee-wrap.coffee-dark .coffee-switch input:checked ~ .track{background:hsl(var(--th),42%,68%);}' +
    '.coffee-wrap:not(.coffee-dark) .coffee-seg-btn.on,.coffee-wrap:not(.coffee-dark) .coffee-chip.on,' +
    '.coffee-wrap:not(.coffee-dark) .coffee-row-t.on,.coffee-wrap:not(.coffee-dark) .coffee-row-n:hover,' +
    '.coffee-wrap:not(.coffee-dark) .coffee-save{color:hsl(var(--th),42%,30%);}' +
    /* 类型段必须写在这之后，否则 margin/padding 会被上面的 .coffee-seg 覆盖（之前就是这样） */
    '.coffee-seg-types{display:grid;grid-template-columns:repeat(5,1fr);gap:0 8px;margin-top:5px;' +
      'padding-bottom:2px;border-bottom:0;overflow:visible;}' +
    '.coffee-seg-types .coffee-seg-btn{flex:0 0 auto;font-size:11px;}' +
    /* 两列网格 + 分页取代滚动：72 行竖排要 2400px，两列分页后一屏放得下 */
    '.coffee-cab-head{display:flex;align-items:center;justify-content:space-between;gap:8px;}' +
    '.coffee-cab-title{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}' +
    '.coffee-x{width:22px;height:22px;display:flex;align-items:center;justify-content:center;padding:0;' +
      'border:0;background:none;color:inherit;opacity:.45;font-size:17px;line-height:1;cursor:pointer;' +
      'transition:opacity var(--duration-fast) var(--ease-cn),color var(--duration-fast) var(--ease-cn);}' +
    '.coffee-x:hover{opacity:1;color:var(--bm-primary,#3a7a3a);}' +
    /* 单列：茶名有完整宽度，＋/✓ 归位行尾，扫读更快；每页 8 款保证面板高度不涨 */
    '.coffee-cab-list{display:grid;grid-template-columns:minmax(0,1fr);margin-top:8px;}' +
    '.coffee-pager{display:none;align-items:center;justify-content:center;gap:16px;margin-top:8px;padding-top:9px;white-space:nowrap;' +
      'border-top:1px solid hsla(var(--th),18%,46%,.12);' +
      'font-size:11px;color:var(--text-tertiary,currentColor);opacity:.75;}' +
    '.coffee-pager.show{display:flex;}' +
    '.coffee-pg{padding:0 6px;border:0;background:none;cursor:pointer;font-family:inherit;font-size:13px;' +
      'line-height:1;color:inherit;opacity:.7;}' +
    '.coffee-pg:hover{opacity:1;}' +
    '.coffee-pg:disabled{opacity:.25;cursor:default;}' +
    /* content-visibility: 屏幕外的行跳过布局与绘制，72 行列表打开时不再全量排版 */
    '.coffee-row{display:flex;align-items:center;justify-content:space-between;gap:6px;' +
      'padding:2px 6px;margin:0 -6px;border-radius:6px;' +
      'transition:background-color var(--duration-fast) var(--ease-cn);' +
      'cursor:default;' +
      'font-size:12px;color:var(--text-secondary,inherit);' +
      'content-visibility:auto;contain-intrinsic-size:auto 28px;contain:content;}' +
    '.coffee-row:hover{background:hsla(var(--th),18%,50%,.08);}' +
    /* 茶名是「泡」的按钮（J3）：虚线暗示可点，hover 实线主色——可供性不许撒谎（P2） */
    '.coffee-row-n{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;' +
      'padding:0;border:0;background:none;cursor:pointer;font-family:inherit;font-size:12px;' +
      'color:var(--text-secondary,inherit);text-align:left;' +
      'text-decoration:underline dashed hsla(var(--th),18%,46%,.30);text-underline-offset:3px;' +
      'text-decoration-thickness:1px;transition:color var(--duration-fast) var(--ease-cn);}' +
    '.coffee-row-n:hover{color:var(--bm-primary,#3a7a3a);text-decoration-style:solid;}' +
    '.coffee-row-n:focus-visible{outline:2px solid hsl(var(--th),32%,52%);outline-offset:2px;border-radius:3px;}' +
    '.coffee-row-t{flex:0 0 auto;width:24px;height:24px;display:flex;align-items:center;justify-content:flex-end;' +
      'padding:0;border:0;background:none;cursor:pointer;font-family:inherit;font-size:13px;line-height:1;' +
      'color:var(--text-tertiary,currentColor);opacity:.6;}' +
    '.coffee-row-t:hover{opacity:1;color:var(--bm-primary,#3a7a3a);}' +
    '.coffee-row-t.on{color:var(--bm-primary,#3a7a3a);opacity:1;}' +
    '.coffee-cab-item{display:flex;align-items:center;justify-content:space-between;gap:8px;' +
      'padding:5px 0;border-bottom:1px solid hsla(var(--th),18%,46%,.14);' +
      'font-size:12px;color:var(--text-secondary,inherit);}' +
    '.coffee-cab-item:last-child{border-bottom:0;}' +
    '.coffee-cab-del{padding:1px 0;border:0;background:none;cursor:pointer;font-family:inherit;' +
      'font-size:11px;color:var(--text-tertiary,currentColor);opacity:.7;}' +
    '.coffee-cab-del:hover{opacity:1;color:var(--bm-primary,#3a7a3a);}' +
    /* 空状态要跨两列，否则在网格里只占半行、文字被挤断 */
    '.coffee-cab-empty{grid-column:1 / -1;padding:12px 0;text-align:center;font-size:11px;line-height:1.6;' +
      'color:var(--text-tertiary,currentColor);opacity:.75;}' +
    /* ── 设置面板信息层级 ──
       三级：页头（主标题 + 说明，居中）→ 3 个分组（标题居中，两侧对称细线）→
       每条字段走同一套两列栅格 [58px 字段名 | 1fr 控件]，开关统一右对齐。
       字段名是「行标签」不是标题，必须保持左对齐，否则栅格左边界会散掉。
       另两处从属关系：强度缩进弱化、归属夜色效果；开关区与属性区用淡线隔开。
       尺寸仍全部写死像素，不吃宿主的 --space-*。 */
    '.coffee-head{text-align:center;padding-bottom:14px;}' +
    /* .coffee-title 同时被咖啡柜面板复用，居中必须限定在 .coffee-dialog 内 */
    '.coffee-dialog .coffee-title{text-align:center;font-size:15px;letter-spacing:.08em;text-indent:.08em;}' +
    '.coffee-hint{margin-top:5px;font-size:11px;line-height:1.45;text-align:center;' +
      'color:var(--text-tertiary,currentColor);opacity:.85;}' +
    '.coffee-sec{margin-top:15px;}' +
    '.coffee-sec+.coffee-sec{padding-top:15px;border-top:1px solid var(--bamboo-border,rgba(0,0,0,.14));}' +
    '.coffee-sec-h{display:block;margin:0 0 8px;text-align:center;font-size:10.5px;font-weight:600;' +
      'line-height:1.2;letter-spacing:.08em;text-indent:.08em;color:var(--text-secondary,inherit);}' +
    /* 组标题改为博客式纯居中短标签，停用原来的两侧细线伪元素。
       颜色沿用 --text-secondary（提一级），不碰暗色语义变量，保住对比度核查。 */
    '.coffee-sec-h::before,.coffee-sec-h::after{content:none;}' +
    '.coffee-field{display:grid;grid-template-columns:64px minmax(0,1fr);align-items:center;' +
      'column-gap:8px;min-height:22px;margin-top:9px;}' +
    '.coffee-field-label{font-size:12px;font-weight:500;line-height:1.3;color:var(--text-secondary,inherit);white-space:nowrap;}' +
    /* 从属项与分区：让「选哪项」和「开不开」不再挤在同一视觉层 */
    '.coffee-field-sub{margin-top:2px;}' +
    '.coffee-field-sub .coffee-field-label{padding-left:10px;font-size:10px;opacity:.72;}' +
    '.coffee-field.coffee-field-divider{border-top:1px solid var(--bamboo-border,rgba(0,0,0,.12));' +
      'padding-top:9px;margin-top:12px;}' +
    /* 选项改成栅格列：茶类 4 列、器物 2 列，列首对齐，不再 flex-wrap 随机散开 */
    '.coffee-chips{display:grid;gap:6px 8px;margin:0;min-width:0;}' +
    '.coffee-chips-types{grid-template-columns:repeat(4,minmax(0,1fr));margin-top:2px;}' +
    '.coffee-chips-types .coffee-chip{text-align:center;}' +
    /* 四维分类：seg 切换维度（复用咖啡柜面板已有一套 seg 语言），下方 chips 沿用
       杯型原本的轻量文本风格（颜色+字重选中），一次只显示一行的选项。
       已选维度在 seg 上留一个小圆点，切走也看得见。 */
    '.coffee-seg-facet{display:flex;justify-content:space-between;gap:0;' +
      'margin-top:9px;overflow:visible;}' +
    '.coffee-seg-facet .coffee-seg-btn{position:relative;font-size:11px;}' +
    /* 四个维度名长短不一，两端对齐后首尾贴边；圆点跟随按钮右缘 */
    '.coffee-seg-facet .coffee-seg-btn:last-child{text-align:right;}' +
    '.coffee-seg-facet .coffee-seg-btn.has-filter::after{content:"";position:absolute;' +
      'top:-2px;right:-3px;width:4px;height:4px;border-radius:50%;' +
      'background:var(--bm-primary,#3a7a3a);}' +
    /* 维度 chips：胶囊按钮 + 4 列 grid，每行首尾贴边、列宽一致；
       末行不满时保持列对齐靠左，不被 space-between 推散到两端。 */
    '.coffee-facet-list{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));' +
      'gap:5px 4px;margin-top:5px;}' +
    '.coffee-facet-list .coffee-chip{box-sizing:border-box;' +
      'padding:3px 2px;text-align:center;border:1px solid var(--bamboo-border,rgba(0,0,0,.16));' +
      'border-radius:999px;background:transparent;}' +
    '.coffee-facet-list .coffee-chip.on{border-color:var(--bm-primary,#3a7a3a);' +
      'background:hsla(var(--th),42%,50%,.10);color:var(--bm-primary,#3a7a3a);}' +
    /* 来源说明：一行小字，随维度切换内容 */
    '.coffee-note-src{margin-top:5px;font-size:9px;line-height:1.3;text-align:center;' +
      'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;' +
      'color:var(--text-tertiary,currentColor);opacity:.55;}' +
    '.coffee-chips[data-row]{display:inline-flex;gap:0;justify-self:end;' +
      'border:1px solid var(--bamboo-border,rgba(0,0,0,.16));border-radius:999px;overflow:hidden;vertical-align:middle;}' +
    '.coffee-chips[data-row] .coffee-chip{padding:3px 13px;text-align:center;' +
      'border-right:1px solid var(--bamboo-border,rgba(0,0,0,.16));}' +
    '.coffee-chips[data-row] .coffee-chip:last-child{border-right:0;}' +
    '.coffee-chips[data-row] .coffee-chip.on{background:var(--bm-primary,#3a7a3a);color:#fff;opacity:1;}' +
    /* min-height:0 同 .coffee-range —— 宿主 base.css 对表单控件有全局触控地板 */
    '.coffee-chip{padding:2px 0;min-height:0;border:0;background:none;border-radius:0;text-align:left;' +
      'color:var(--text-tertiary,currentColor);font-size:11px;line-height:1.4;' +
      'cursor:pointer;white-space:nowrap;opacity:.85;' +
      'transition:color var(--duration-fast) var(--ease-cn),opacity var(--duration-fast) var(--ease-cn);}' +
    /* 选中：改用颜色 + 字重，并在下方加一道 2px 短横，代替原来的描边胶囊 */
    '.coffee-chip.on{color:var(--bm-primary,#3a7a3a);opacity:1;font-weight:600;}' +
    '.coffee-chip:hover{opacity:1;}' +
    '.coffee-chip:focus-visible,.coffee-btn:focus-visible{outline:2px solid var(--bm-primary,#3a7a3a);outline-offset:2px;}' +
    /* .coffee-switch 同时带 .coffee-field：栅格由后者提供，这里只补语义与间距，
       并把 track 推到第二列右端，让四个开关与上方所有控件共用同一条右边界。 */
    '.coffee-switch{margin-top:9px;font-size:11px;color:var(--text-secondary,inherit);cursor:pointer;position:relative;}' +
    '.coffee-field.coffee-switch > .coffee-switch{margin-top:0;}' +
    '.coffee-switch input{position:absolute;opacity:0;width:0;height:0;pointer-events:none;}' +
    '.coffee-switch .track{width:32px;height:18px;border-radius:999px;flex:0 0 auto;justify-self:end;' +
      'background:var(--bamboo-border,rgba(0,0,0,.16));position:relative;' +
      'transition:background-color var(--duration-fast) var(--ease-cn);}' +
    '.coffee-switch .track::after{content:"";position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;' +
      'background:#fff;transition:transform var(--duration-fast) var(--ease-cn);box-shadow:0 1px 2px rgba(0,0,0,.22);}' +
    '.coffee-switch input:checked ~ .track{background:var(--bm-primary,#3a7a3a);}' +
    '.coffee-switch input:checked ~ .track::after{transform:translateX(14px);}' +
    '.coffee-switch input:focus-visible ~ .track{outline:2px solid var(--bm-primary,#3a7a3a);outline-offset:2px;}' +
    /* 按钮固定在面板底部：72 行的列表很长，否则要滚到底才能关闭 */
    '.coffee-actions{position:sticky;bottom:0;display:flex;gap:8px;margin-top:12px;padding-top:10px;' +
      'background:inherit;border-top:1px solid var(--bamboo-border,rgba(0,0,0,.1));}' +
    '.coffee-btn{flex:1;padding:6px 10px;border-radius:8px;font-size:11px;cursor:pointer;' +
      'transition:background-color var(--duration-fast) var(--ease-cn),opacity var(--duration-fast) var(--ease-cn);}' +
    '.coffee-btn.ghost{background:transparent;border:1px solid var(--bamboo-border,rgba(0,0,0,.14));' +
      'color:var(--text-secondary,inherit);}' +
    '.coffee-btn.primary{background:var(--bm-primary,#3a7a3a);border:1px solid transparent;' +
      'color:var(--text-on-accent,#fff);}' +
    '.coffee-btn.ghost:hover{opacity:.8;}' +
    '.coffee-btn.primary:hover{opacity:.9;}' +

    /* 减弱动效：模块标记与系统偏好都关掉热气动画，卡片/题字不再缓动；JS 自转在 mount 时已关。 */
    '.coffee-wrap.coffee-reduce .coffee-wisp,' +
    '.coffee-wrap.coffee-reduce .coffee-steam,' +
    '.coffee-wrap.coffee-reduce.coffee-puff .coffee-steam{animation:none !important;}' +
    '.coffee-wrap.coffee-reduce .coffee-card,' +
    '.coffee-wrap.coffee-reduce .coffee-verse,' +
    '.coffee-wrap.coffee-reduce .coffee-count{transition-duration:.01ms !important;}' +
    '@media (prefers-reduced-motion:reduce){' +
      '.coffee-card,.coffee-verse,.coffee-count{transition-duration:.01ms !important;}' +
    '}';
  }

  var _styleReady = false;
  function ensureStyle(root) {
    if (_styleReady || document.getElementById('coffee-module-style')) return;
    var s = document.createElement('style');
    s.id = 'coffee-module-style';
    s.textContent = css();
    (document.head || root).appendChild(s);
    _styleReady = true;
  }

  window.__bamboo_module_coffee = {
    id: ID,
    name: TITLE,
    version: VERSION,
    mount: mount,
    unmount: function () { if (instance) instance.destroy(); },
    destroy: function () { if (instance) instance.destroy(); }
  };
})();
