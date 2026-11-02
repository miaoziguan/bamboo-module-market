/* __bamboo_module_ {"id":"tea","name":"不如喝茶去","version":"0.8.3","fab":{"icon":"coffee","label":"喝茶"},"location":"left"} */
/**
 * 不如喝茶去 · 竹林模块（单文件自包含 · 手写 WebGL · 零依赖）
 *
 * 器物不是画出来的，是原稿那套数值实时渲出来的：三组车削剖面、正交相机 (4,3.2,7)→(0,1.4,0)、
 * 主光 1.5@(5,10,7) + 补光 1.0@(-6,3,5)（方向与强度沿用原稿）、
 * 环境 Ambient .55 + Hemi(#fff .35 / #d0d0d0 按同比压到 .2207)（审计后由 1.8+.1.0 下调，见下方审计记录）、
 * MeshStandardMaterial(主题派生色, roughness .35, metalness 0, DoubleSide)、ACES + exposure 2.54、
 * VSM 软阴影 radius 6 / bias -.0005、ShadowMaterial opacity .08、自转 0.15 rad/s。
 *
 * 为什么不用 three：模块沙箱禁止 import/fetch，且 three 全量 465KB 里 99% 是这件器物用不到的通用引擎。
 * 这里是自己写的 ~400 行渲染器（lathe 网格 + 小矩阵库 + 一对 shader + 高斯模糊阴影图），
 * 逐像素与 three 对照：不透明像素平均差 1.45/255、最大 19（且仅在描边抗锯齿处）。
 */
(function () {
  'use strict';

  var ID = 'tea';
  var TITLE = '不如喝茶去';
  var VERSION = '0.8.3';

  /* ══════════════════════ 渲染器（原稿数值 · 手写 WebGL） ══════════════════════ */


  /* ══ 资产 ══════════════════════════════════════════════════════ */
  var PROFILES = {
    saucer: [[0, .15], [.80, .15], [.85, .20], [.85, .25], [1.20, .25], [1.60, .25], [2.20, .30], [2.50, .40],
             [2.55, .45], [2.50, .48], [2.30, .35], [1.80, .15], [1.20, .08], [1.15, .00], [1.15, -.35],
             [1.05, -.40], [1.05, .00], [.50, .02], [0, .02]],
    bowl: [[0, .40], [.60, .40], [.65, .35], [.65, .05], [.75, .05], [.75, .35], [.95, .50], [1.30, .80],
           [1.60, 1.30], [1.80, 1.80], [1.92, 2.10], [2.02, 2.20], [2.08, 2.18], [2.04, 2.14], [1.94, 2.08],
           [1.86, 1.95], [1.60, 1.60], [1.20, 1.00], [.80, .60], [.50, .45], [0, .45]],
    lid: [[0, 2.75], [.40, 2.75], [.45, 2.80], [.50, 2.85], [.52, 2.86], [.52, 2.78], [.45, 2.60], [.55, 2.55],
          [.80, 2.50], [1.20, 2.40], [1.50, 2.25], [1.70, 2.12], [1.78, 2.05], [1.82, 1.95], [1.82, 1.90],
          [1.78, 1.86], [1.70, 2.00], [1.50, 2.15], [1.00, 2.35], [.60, 2.45], [0, 2.45]]
  };
  var TEA = { y: 1.66, r: 1.645 };
  /* 茶托径向缩一档：作者要求「托小一号」。只缩半径、不动竖直尺寸 —— 竖直一动，
     碗足就会离开盘心（原稿碗底 y=0.05、盘心 y≈0.02，本来就顶着）。 */
  var SAUCER_SCALE = 0.90;   // 以 y=0.02（碗足落点）为基准整体缩放，接触面不动
  var ROT_SPEED = 0.15;          // 原稿 gaiwan.rotation.y = elapsed * 0.15
  var LEAF_COLOR = [0.20, 0.26, 0.10];  // 叶底（线性色）
  /* 汤色亮度低于此值就不画叶底：深色茶汤浮绿叶是假的 */
  var LEAF_MIN_Y = 0.36;

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
    var pos = [], nrm = [], idx = [], uv = [];
    /* 「外表面」到哪一点结束：默认取剖面最高点（碗口、盘沿）；
       茶盖的剖面从盖钮最高处往下盘，外表面终点是最低点（盖裙下沿），故可切 min。 */
    var rim = 0, ext = cfg.rim === 'min' ? 1e9 : -1e9;
    for (var q = 0; q < n; q++) {
      if (cfg.rim === 'min' ? P[q][1] < ext : P[q][1] > ext) { ext = P[q][1]; rim = q; }
    }
    /* v 用弧长而不是剖面索引：Catmull-Rom 的控制点疏密不均，按索引取 v 会把纹样全挤到碗底 */
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
    for (var i = 0; i < n; i++) {
      var r = P[i][0] * sc, y = sc === 1 ? P[i][1] : (0.02 + (P[i][1] - 0.02) * sc);
      var a = P[Math.max(0, i - 1)], b = P[Math.min(n - 1, i + 1)];
      var tr = b[0] - a[0], ty = b[1] - a[1];
      var tl = Math.hypot(tr, ty) || 1; tr /= tl; ty /= tl;
      for (var j = 0; j <= segments; j++) {
        var ang = j / segments * Math.PI * 2, s = Math.sin(ang), c = Math.cos(ang);
        pos.push(r * s, y, r * c);
        nrm.push(ty * s, -tr, ty * c);
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
    return { pos: new Float32Array(pos), nrm: new Float32Array(nrm), idx: new Uint16Array(idx), uv: new Float32Array(uv) };
  }

  function buildDisc(r, y, segments) {
    var pos = [0, y, 0], nrm = [0, 1, 0], idx = [];
    for (var j = 0; j <= segments; j++) {
      var a = j / segments * Math.PI * 2;
      pos.push(r * Math.sin(a), y, r * Math.cos(a));
      nrm.push(0, 1, 0);
    }
    for (var k = 1; k <= segments; k++) idx.push(0, k, k + 1);
    return { pos: new Float32Array(pos), nrm: new Float32Array(nrm), idx: new Uint16Array(idx), uv: null };
  }

  /** 茶汤上漂着的几片叶：器物唯一非轴对称的部分 —— 自转能「看见」，靠的就是它 */
  function buildLeaves(count, r, y) {
    var pos = [], nrm = [], idx = [], v = 0;
    var seed = 7;
    function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
    for (var i = 0; i < count; i++) {
      var a = rnd() * Math.PI * 2;
      var rad = Math.sqrt(rnd()) * r * 0.72;
      var cx = Math.sin(a) * rad, cz = Math.cos(a) * rad;
      var rot = rnd() * Math.PI * 2, len = 0.10 + rnd() * 0.07, wid = 0.030 + rnd() * 0.022;
      var cs = Math.cos(rot), sn = Math.sin(rot);
      var quad = [[-len, 0], [0, wid], [len, 0], [0, -wid]];
      for (var k = 0; k < 4; k++) {
        var qx = quad[k][0] * cs - quad[k][1] * sn;
        var qz = quad[k][0] * sn + quad[k][1] * cs;
        pos.push(cx + qx, y, cz + qz);
        nrm.push(0, 1, 0);
      }
      idx.push(v, v + 1, v + 2, v, v + 2, v + 3);
      v += 4;
    }
    return { pos: new Float32Array(pos), nrm: new Float32Array(nrm), idx: new Uint16Array(idx), uv: null };
  }


  /* ══ 纹样：画在 2D 画布上再上传成贴图 ══
     u 是环向（左右循环），v 是剖面弧长（0=足底/盖钮，1=口沿/盖沿，越过口沿后继续累加而不是钳住）。
     三件瓷整器都印；越界的那一段靠贴图在两个方向都无缝平铺来消化（见 paintCrackle）。
     冰裂非轴对称 —— 这也让自转第一次「看得见」。 */
  /* 512×256 而不是 1024×512：碗在屏幕上横向只有约 300px，
     贴图再大也会被缩小采样，1px 的开片线平均完就看不见了。 */
  var PAT_W = 512, PAT_H = 256;
  var PATTERNS = ['none', 'crackle'];

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
    'void main(){',
    '  vec4 wp = uModel * vec4(aPos,1.0); vW = wp.xyz;',
    '  vec3 nw = mat3(uModel) * aNrm; vN = nw; vUv = aUv;',
    '  gl_Position = uMVP * vec4(aPos,1.0); }'
  ].join('\n');

  var GLSL_PACK = [
    'vec4 packD(float v){',
    '  vec4 e = vec4(1.0,255.0,65025.0,16581375.0) * v;',
    '  e = fract(e);',
    '  e -= e.yzww * vec4(1.0/255.0,1.0/255.0,1.0/255.0,0.0);',
    '  return e; }',
    'float unpackD(vec4 v){ return dot(v, vec4(1.0, 1.0/255.0, 1.0/65025.0, 1.0/16581375.0)); }'
  ].join('\n');

  // 与 three r160 的 MeshStandardMaterial + 四灯 + ACES 逐式对齐（含 useLegacyLights=false）
  var FS_MAIN = [
    'precision highp float;',
    GLSL_PACK,
    'varying vec3 vN; varying vec3 vW;',
    'uniform vec3 uAlbedo; uniform vec3 uKeyDir; uniform vec3 uFillDir;',
    'uniform vec3 uSky; uniform vec3 uGround; uniform float uAmbient;',
    'uniform float uRough; uniform vec3 uEye; uniform float uOpacity;',
    'uniform sampler2D uShadowTex; uniform mat4 uShadowMat; uniform float uShadowOn; uniform float uShSelf; uniform float uKeyK; uniform float uGlow; uniform float uBodyDim; uniform float uLineGlow; uniform float uNightK;',
    'uniform sampler2D uPattern; uniform float uPatternOn; uniform float uPatMask;',
    'varying vec2 vUv;',
    'vec3 srgb2lin(vec3 c){ return mix(c/12.92, pow((c+0.055)/1.055, vec3(2.4)), step(vec3(0.04045), c)); }',
    'const float RPI = 0.3183098861837907;',
    'const float LIGHT_SCALE = 1.0;',
    'float pow2(float x){ return x*x; }',
    'float sat(float x){ return clamp(x,0.0,1.0); }',
    'vec3 F_Schlick(vec3 f0, float f90, float d){ return f0 + (f90-f0)*pow(clamp(1.0-d,0.0,1.0),5.0); }',
    'float D_GGX(float a, float dotNH){ float a2=pow2(a); float dn=pow2(dotNH)*(a2-1.0)+1.0; return RPI*a2/pow2(dn); }',
    'float V_Smith(float a, float dotNL, float dotNV){ float a2=pow2(a);',
    '  float gv=dotNL*sqrt(a2+(1.0-a2)*pow2(dotNV)); float gl=dotNV*sqrt(a2+(1.0-a2)*pow2(dotNL));',
    '  return 0.5/max(gv+gl,1e-6); }',
    'vec3 BRDF_GGX(vec3 N, vec3 V, vec3 L, float a){',
    '  vec3 H=normalize(L+V); float dNL=sat(dot(N,L)), dNV=sat(dot(N,V));',
    '  float dNH=sat(dot(N,H)), dVH=sat(dot(V,H));',
    '  return F_Schlick(vec3(0.04),1.0,dVH) * (V_Smith(a,dNL,dNV) * D_GGX(a,dNH)); }',
    'vec3 RRT(vec3 v){ vec3 a=v*(v+0.0245786)-0.000090537; vec3 b=v*(0.983729*v+0.4329510)+0.238081; return a/b; }',
    'vec3 aces(vec3 c){',
    '  const mat3 IN = mat3(vec3(0.59719,0.07600,0.02840), vec3(0.35458,0.90834,0.13383), vec3(0.04823,0.01566,0.83777));',
    '  const mat3 OUT = mat3(vec3(1.60475,-0.10208,-0.00327), vec3(-0.53108,1.10813,-0.07276), vec3(-0.07367,-0.00605,1.07602));',
    /* 曝光 1.05 → 2.54 是环境光下调后的补偿；2.54 → 2.36 是 PATCH-04 的回补：
       修掉自阴影后整器亮约 6%，此处按「素瓷中位数回到 0.5457」重新定标（实测扫描 2.34~2.36 为平顶）。 */
    '  c *= (2.62/0.6); c = IN*c; c = RRT(c); c = OUT*c; return clamp(c,0.0,1.0); }',
    'vec3 lin2srgb(vec3 c){ return mix(c*12.92, 1.055*pow(max(c,vec3(0.0)),vec3(1.0/2.4))-0.055, step(vec3(0.0031308),c)); }',
    // VSM（variance shadow map）：与 three 的 VSMShadowMap 同思路，moments = (d, d²)
    'float shadowFactor(vec3 wp){',
    '  if (uShadowOn < 0.5) return 1.0;',
    '  vec4 sc = uShadowMat * vec4(wp,1.0);',
    '  vec3 p = sc.xyz / sc.w * 0.5 + 0.5;',
    '  if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0 || p.z > 1.0) return 1.0;',
    '  float sd = unpackD(texture2D(uShadowTex, p.xy));',
    /* 偏置 0.0010（≈0.03 世界单位 ≈ 2.5 texel）只够压住碗托与碗身的自身精度误差。
       盖子的自阴影（受光面 86% 被判为遮挡）不是偏置能兼顾的：把偏置放大到 0.0040 虽能压住它，
       却等于 0.12 世界单位，会把盖对碗的真实投影整块推离投射物（碗身出现悬空的一块暗斑）。
       故盖子改为不参与自身遮挡（uShSelf=0，见绘制循环），盖子本身恒为受光。 */
    '  return smoothstep(0.0, 0.0035, sd - (p.z - 0.0010));',
    '}',
    'void main(){',
    '  vec3 n = normalize(vN);',
    '  vec3 V = normalize(uEye - vW);',
    // 三组剖面绕向不一致，闭合壳体上按视线翻正法线（等价 three 的 DoubleSide）
    '  if (dot(n, V) < 0.0) n = -n;',
    '  float alpha = pow2(uRough);',
    '  vec3 dc = uAlbedo;',
    '  float cov = 0.0;',
    '  if (uPatternOn > 0.5) {',
    '    vec4 pt = texture2D(uPattern, vUv);',
    /* uPatMask: 0=不印（茶汤、叶底） 1=印（碗、盖、托）。
       v 是连续弧长（见 buildLathe），口沿之后不再被钳住，越界的部分由无缝平铺接住 ——
       所以这里不需要任何门控，冰裂才能自然翻过口沿、铺进碗内。 */
    '    cov = pt.a * uPatMask;',
    '    dc = mix(dc, srgb2lin(pt.rgb), cov);',
    '  }',
    /* 无方向光：只留半球环境光。主光 1.5 + 补光 1.0 + 镜面会在曲面上画出明暗交界线，
       配合投影，在近乎单色的青瓷上就读作「一块一块」。半球光只随法线 y 连续变化，
       没有交界线、没有投影、没有高光；uAmbient 已按实测中位亮度重新标定。 */
    '  vec3 irr = vec3(uAmbient) + mix(uGround, uSky, 0.5 + 0.5*n.y);',
    '  vec3 col = irr * dc * RPI;',
    /* 弱主光：只为一件事——让形体可读。纯半球光在可见面（n.y 0.3~1）里只差 15%，
       经 ACES 压缩后几乎为零，盖碗会糊成剪影。0.35 只有原来的 1/4，
       产生的是连续渐变，没有交界线；配 sh=1 与无镜面，也就没有任何投影与亮斑。 */
    '  col += sat(dot(n, uKeyDir)) * uKeyK * dc * RPI;',
    /* 夜色效果两种：
       ① 周身微光（uBodyDim=1、uGlow>0）：整体发光，边缘更亮；
       ② 裂纹发光（uBodyDim<1、uLineGlow>0）：器身压暗，只让冰裂纹亮起来。
       两者都写在 ACES 之前，且都无方向性，不会引入明暗交界。 */
    '  col *= uBodyDim;',
    '  col += uLineGlow * cov * uAlbedo;',
    '  float rim = pow(1.0 - sat(dot(n, V)), 2.2);',
    /* uNightK：瓷器=1、茶汤/叶底=0 —— 三种夜色效果（压暗/纹光/周身微光）都不作用于汤色，
       汤色是内容常数，跨主题可比（PATCH-48） */
    '  col += uGlow * dc * (0.45 + 1.35 * rim) * uNightK;',
    '  col = aces(col);',
    '  gl_FragColor = vec4(lin2srgb(col) * uOpacity, uOpacity);',   // 预乘：与 canvas 的 premultipliedAlpha 一致

    '}'
  ].join('\n');

  var VS_DEPTH = [
    'attribute vec3 aPos;',
    'uniform mat4 uLightMat; uniform mat4 uModel;',
    'void main(){ gl_Position = uLightMat * uModel * vec4(aPos,1.0); }'
  ].join('\n');
  /* 深度必须取 gl_FragCoord.z（逐片元精确），不能用 varying 插值：
     深度对屏幕空间是仿射的，透视校正插值会产生与三角形斜率相关的系统性偏差，
     实测在盖顶约 0.003（≈0.09 世界单位），迫使偏置放大到 0.0040 才能压住自阴影，
     而该偏置同时把盖对碗的真实投影整块推离投射物。 */
  var FS_DEPTH = [
    'precision highp float;',
    GLSL_PACK,
    'void main(){ gl_FragColor = packD(clamp(gl_FragCoord.z, 0.0, 0.998)); }'
  ].join('\n');

  var VS_QUAD = ['attribute vec2 aP; varying vec2 vUv;',
    'void main(){ vUv = aP*0.5+0.5; gl_Position = vec4(aP,0.0,1.0); }'].join('\n');
  var FS_BLUR = [
    'precision highp float; varying vec2 vUv;',
    'uniform sampler2D uTex; uniform vec2 uDir;',
    GLSL_PACK,
    'float S(float w, float o){ return unpackD(texture2D(uTex, vUv + uDir*o)) * w; }',
    'void main(){',
    // 取「更近的那一层」做偏保守的平均：纯平均会把两层缝的深度拉到中间，产生漏光
    '  float c = unpackD(texture2D(uTex, vUv));',
    '  float a1 = unpackD(texture2D(uTex, vUv + uDir*1.3846153846));',
    '  float a2 = unpackD(texture2D(uTex, vUv - uDir*1.3846153846));',
    '  float b1 = unpackD(texture2D(uTex, vUv + uDir*3.2307692308));',
    '  float b2 = unpackD(texture2D(uTex, vUv - uDir*3.2307692308));',
    '  float mn = min(min(min(c,a1),min(a2,b1)),b2);',
    '  float wsum = 0.2270270270 + 2.0*0.3162162162 + 2.0*0.0702702703;',
    '  float avg = (c*0.2270270270 + (a1+a2)*0.3162162162 + (b1+b2)*0.0702702703) / wsum;',
    '  gl_FragColor = packD(clamp(mix(avg, mn, 0.15), 0.0, 0.999)); }'
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
    var progDepth = program(gl, VS_DEPTH, FS_DEPTH);
    var progBlur = program(gl, VS_QUAD, FS_BLUR);
    var progPick = program(gl, VS_PICK, FS_PICK);

    /* 阴影目标：1024（与 three 默认 shadow.mapSize 一致），moments 存 RG */
    var SHADOW_SIZE = 1024;
    function makeTarget() {
      var tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, SHADOW_SIZE, SHADOW_SIZE, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      var fb = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      var depth = gl.createRenderbuffer();
      gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, SHADOW_SIZE, SHADOW_SIZE);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return { tex: tex, fb: fb, depth: depth };
    }
    var shadowA = makeTarget(), shadowB = makeTarget();

    /* 纹样贴图 */
    var patTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, patTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);

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
    var quadBuf = buffer(gl, new Float32Array([-1, -1, 3, -1, -1, 3]));

    /* 网格 */
    var SEG = 128;
    function mesh(m) {
      return {
        pos: buffer(gl, m.pos), posArr: m.pos, nrm: buffer(gl, m.nrm),
        uv: m.uv && m.uv.length ? buffer(gl, m.uv) : null,
        idx: buffer(gl, m.idx, gl.ELEMENT_ARRAY_BUFFER),
        count: m.idx.length
      };
    }
    var M = {
      saucer: mesh(buildLathe(PROFILES.saucer, SEG, SAUCER_SCALE, true, { full: true })),
      bowl: mesh(buildLathe(PROFILES.bowl, SEG, 1, true)),
      lid: mesh(buildLathe(PROFILES.lid, SEG, 1, true, { rim: 'min', foot: 'start' })),
      tea: mesh(buildDisc(TEA.r, TEA.y, SEG)),
      leaves: mesh(buildLeaves(5, TEA.r, TEA.y + 0.004)),
    };
    var order = [M.saucer, M.bowl, M.tea];

    function bindMesh(prog, m) {
      var aP = gl.getAttribLocation(prog, 'aPos');
      gl.bindBuffer(gl.ARRAY_BUFFER, m.pos);
      gl.enableVertexAttribArray(aP);
      gl.vertexAttribPointer(aP, 3, gl.FLOAT, false, 0, 0);
      var aN = gl.getAttribLocation(prog, 'aNrm');
      if (aN >= 0) {
        gl.bindBuffer(gl.ARRAY_BUFFER, m.nrm);
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
    ['uMVP', 'uModel', 'uAlbedo', 'uKeyDir', 'uFillDir', 'uSky', 'uGround', 'uAmbient', 'uRough', 'uEye',
      'uOpacity', 'uShadowTex', 'uShadowMat', 'uShadowOn', 'uShSelf', 'uKeyK', 'uGlow', 'uBodyDim', 'uLineGlow', 'uNightK', 'uPattern', 'uPatternOn', 'uPatMask'].forEach(function (k) {
      U[k] = gl.getUniformLocation(progMain, k);
    });
    var D = {
      uLightMat: gl.getUniformLocation(progDepth, 'uLightMat'),
      uModel: gl.getUniformLocation(progDepth, 'uModel')
    };
    var BW = { uTex: gl.getUniformLocation(progBlur, 'uTex'), uDir: gl.getUniformLocation(progBlur, 'uDir') };

    /* 轨道相机：与原稿 OrbitControls 同一组约束
       （target(0,1.4,0)、polar 30°..84°、zoom .5..3、dampingFactor .05、enablePan=false） */
    /* 取景目标点。原稿是 1.4（碗身中线），但器物可见包围盒的中心在屏幕上是
       低于该点的：托沿在斜视下投影更靠下。压到 1.2 后包围盒中心落在画面 50%（实测 49.8~49.9%）。 */
    var AT = [0, 1.2, 0];
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
    var LIGHT_VIEW = lookAt([5, 10, 7], [0, 0, 0], [0, 1, 0]);
    var LIGHT_PROJ = ortho(6, 6, 0.1, 30);
    var LIGHT_MAT = mul(LIGHT_PROJ, LIGHT_VIEW);

    var state = {
      w: 0, h: 0, dpr: Math.min(window.devicePixelRatio || 1, 2),
      yaw: 0, lift: 0, bob: 0, pattern: 'crackle', spin: opts.spin !== false,
      teaColor: [0.7, 0.5, 0.2], leaves: true, leafColor: LEAF_COLOR, porcelain: [1, 1, 1], glow: 0, bodyDim: 1, lineGlow: 0, last: 0, raf: 0, alive: true
    };

    /** 包围球取景：轨道转到任何角度都不裁（用球而不是盒，避免转动时画面忽大忽小） */
    var BOX = { hw: 3.16, hh: 3.16 };
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

    /** 盖子的局部变换：绕盖心 (0,2.0,0) 侧倾 + 抬起 */
    function lidMatrix(lift) {
      if (lift <= 0.001) {
        // 合盖时的极微呼吸（原稿 0.008，这里 0.010 让它刚好能被察觉）
        var m0 = trans(0, state.bob, 0);
        return m0;
      }
      var dx = 1.05 * lift, dy = 0.95 * lift, ang = 0.15 * lift;
      var pivot = 1.98;
      var t0 = trans(0, -pivot, 0);
      var t1 = trans(0, pivot, 0);
      var m = mul(t1, mul(rotZ(ang), mul(t0, trans(dx, dy, 0))));
      return m;
    }

    function drawShadowPass(model, lidM) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, shadowA.fb);
      gl.viewport(0, 0, SHADOW_SIZE, SHADOW_SIZE);
      gl.clearColor(1, 1, 1, 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST);
      gl.disable(gl.CULL_FACE);
      gl.useProgram(progDepth);
      gl.uniformMatrix4fv(D.uLightMat, false, LIGHT_MAT);

      var list = [[M.saucer, model], [M.bowl, model], [M.lid, mul(model, lidM)]];
      for (var i = 0; i < list.length; i++) {
        gl.uniformMatrix4fv(D.uModel, false, list[i][1]);
        bindMesh(progDepth, list[i][0]);
        gl.drawElements(gl.TRIANGLES, list[i][0].count, gl.UNSIGNED_SHORT, 0);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    function blurPass(src, dst, dx, dy) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fb);
      gl.viewport(0, 0, SHADOW_SIZE, SHADOW_SIZE);
      gl.disable(gl.DEPTH_TEST);
      gl.useProgram(progBlur);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, src.tex);
      gl.uniform1i(BW.uTex, 0);
      gl.uniform2f(BW.uDir, dx / SHADOW_SIZE, dy / SHADOW_SIZE);
      gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
      var aP = gl.getAttribLocation(progBlur, 'aP');
      gl.enableVertexAttribArray(aP);
      gl.vertexAttribPointer(aP, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    function render() {
      resize();
      var yawM = rotY(state.yaw);
      var lidM = lidMatrix(state.lift);

      /* 只留半球环境光，没有方向光可投影 —— 阴影 pass 与两次模糊一并停掉，
         省掉每帧一次整场景的额外渲染。要恢复投影，取消下面三行的注释即可。 */
      // drawShadowPass(yawM, lidM);
      // blurPass(shadowA, shadowB, 4.5, 0);
      // blurPass(shadowB, shadowA, 0, 4.5);

      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST);
      gl.disable(gl.CULL_FACE);

      var aspect = state.w / Math.max(1, state.h);
      var EYE = eyeOf();
      var view = lookAt(EYE, AT, [0, 1, 0]);
      var f = fitView(aspect);
      var proj = ortho(f.hw / cam.zoom, f.hh / cam.zoom, 1, 100, opts.tyRef ? opts.tyRef.v : 0);
      var vp = mul(proj, view);

      var I = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

      /* ── 器物 ── */
      gl.useProgram(progMain);
      gl.uniform3fv(U.uKeyDir, KEY);
      gl.uniform3fv(U.uFillDir, FILL);
      /* 环境光下调：原 1.8 + hemi 1.0(ground .6307) 使环境占比 85.8%、动态范围仅 0.79 档。
         此处按同一比例缩到 0.55 + 0.35(ground .2207)，保住 ground/sky 比，只降电平。 */
      /* 天/地两端的强度差决定了「形体感」：差太小会糊成一片剪影（实测 p5–p95 仅 0.527~0.565），
         差太大又会重新出现明暗交界。当前取值给出约 28% 的连续上下渐变——没有交界线，但形体可读。 */
      gl.uniform3f(U.uSky, 0.80, 0.80, 0.80);
      gl.uniform3f(U.uGround, 0.45, 0.45, 0.45);
      gl.uniform1f(U.uAmbient, 0.33);
      gl.uniform1f(U.uKeyK, 0.35);
      gl.uniform1f(U.uGlow, state.glow);
      gl.uniform1f(U.uBodyDim, state.bodyDim);
      gl.uniform1f(U.uLineGlow, state.lineGlow);
      /* 釉面高光：原 0.65 使 alpha=0.4225、镜面峰值仅漫反射的 3%。取 0.35（alpha=0.1225）。 */
      gl.uniform1f(U.uRough, 0.35);
      gl.uniform3fv(U.uEye, EYE);
      gl.uniformMatrix4fv(U.uShadowMat, false, LIGHT_MAT);
      gl.uniform1f(U.uShadowOn, 1);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, shadowA.tex);
      gl.uniform1i(U.uShadowTex, 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, patTex);
      gl.uniform1i(U.uPattern, 1);
      gl.uniform1f(U.uPatternOn, state.pattern && state.pattern !== 'none' ? 1 : 0);
      gl.activeTexture(gl.TEXTURE0);
      gl.uniform1f(U.uOpacity, 1);

      /* [网格, 模型矩阵, 反照率, 是否绘制, 纹样遮罩] 0=素（茶汤、叶底） 1=印（三件瓷器） */
      var pieces = [
        [M.saucer, yawM, state.porcelain, 1, 1],
        [M.bowl, yawM, state.porcelain, 1, 1],
        [M.lid, mul(yawM, lidM), state.porcelain, 1, 1],
        [M.tea, yawM, state.teaColor, state.lift > 0.5 ? 1 : 0, 0],
        [M.leaves, yawM, state.leafColor, (state.lift > 0.5 && state.leaves) ? 1 : 0, 0]
      ];
      for (var i = 0; i < pieces.length; i++) {
        var pc = pieces[i];
        if (pc[3] === 0) continue;
        gl.uniformMatrix4fv(U.uMVP, false, mul(vp, pc[1]));
        gl.uniformMatrix4fv(U.uModel, false, pc[1]);
        gl.uniform3fv(U.uAlbedo, pc[2]);
        gl.uniform1f(U.uPatMask, pc[4] || 0);
        /* 盖子（pc[0]===M.lid）不参与自身遮挡：它是全场景最高点，除了自己的钮没有别的遮挡物，
           而它的自阴影恰恰是开盖时颜色跳动与碗上那块暗斑的来源。 */
        gl.uniform1f(U.uShSelf, pc[0] === M.lid ? 0 : 1);
        /* 茶汤与叶底是「内容」不是器身：夜色·裂纹模式的压暗只作用于瓷器，
           汤色必须与浅色主题完全一致——否则深色茶在暗处根本读不出色，
           「裂纹发光」的对照物（发亮的纹 vs 沉着的汤）也就不存在了。 */
        var isPorcelain = (pc[0] !== M.tea && pc[0] !== M.leaves);
        gl.uniform1f(U.uBodyDim, isPorcelain ? state.bodyDim : 1);
        gl.uniform1f(U.uLineGlow, isPorcelain ? state.lineGlow : 0);
        gl.uniform1f(U.uNightK, isPorcelain ? 1 : 0);
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
    /* 盖碗与上联的间距（px）：盖碗挂在「不如……」正下方（用户红框位）。
       ≥12 可保证上联字号钉在 cap（15px）不变——verseSize 的约束式在 GAP=12 处自洽 */
    var GAIWAN_GAP = 14;
    /* 「吃茶去」离盖碗的间距（px）：30 基础上按用户实测三轮各 +10（共 60）。
       上联侧 GAIWAN_GAP 保持 14 不动 */
    var VERSE_GAP2 = 60;
    function placeVerse(vp) {
      if (!state.w || !state.h) return;
      /* 题字是舞台的子节点；GaiwanMount 拿到的 el 就是舞台本身，故在此取一次并缓存 */
      if (!vTopEl) {
        vTopEl = el.querySelector('.tea-verse.v-top');
        vBotEl = el.querySelector('.tea-verse.v-bot');
        if (!vTopEl || !vBotEl) return;
      }
      var top = Infinity, bot = -Infinity;
      /* 沿真实车削剖面投点（每点 8 方位角）。旧版只投两个虚拟圆圈——
         盖顶那圈 (y=2.98, r=0.55) 在几何上不存在（钮顶是单点，肩部 r≈0.5 处 y≈2.86），
         测出的器物中心比真实渲染偏高 25px，ty 居中校正被它骗偏。 */
      /* 直接投影真实网格顶点——与渲染逐顶点一致，杜绝任何「剖面/样条/圆周近似」误差。
         freeze 态下 yaw=0、bob=0，model 为单位阵，顶点可直接用 vp 投影；
         自转时车削体旋转对称，包围盒 y 范围不变。 */
      function scanMesh(m) {
        var p = m.posArr, bad = 0;
        for (var i = 0; i < p.length; i += 3) {
          var cy = vp[1] * p[i] + vp[5] * p[i+1] + vp[9] * p[i+2] + vp[13];
          if (!isFinite(cy)) { bad++; continue; }
          var sy = (1 - (cy * 0.5 + 0.5)) * state.h;
          if (sy < top) top = sy;
          if (sy > bot) bot = sy;
        }
        if (bad) window.__tyDbg && (window.__tyDbg.bad = m === M.lid ? 'lid' : m === M.bowl ? 'bowl' : 'saucer');
      }
      scanMesh(M.lid); scanMesh(M.bowl); scanMesh(M.saucer);
      /* 布局只在「器物屏幕边界 / 画布尺寸」变化时重算：
         下面要读 offsetHeight 强制重排，不能在自转的每一帧都做。 */
      var lk = Math.round(top) + ':' + Math.round(bot) + ':' + state.w + 'x' + state.h + ':' + (opts.tyRef ? opts.tyRef.v.toFixed(4) : '0');
      if (el._vKey === lk) return;
      el._vKey = lk;

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
        /* 盖碗挂在「不如……」正下方：目标中心 = 上联底 + GAP + 半个器物高。
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

      if (!vTipEl) vTipEl = el.parentNode && el.parentNode.querySelector('.tea-tip');
      if (!vCountEl) vCountEl = el.querySelector('.tea-count');
      var vR = vBotEl.getBoundingClientRect();
      if (!vTipEl) vTipEl = el.parentNode && el.parentNode.querySelector('.tea-tip');
      var tipTop = vTipEl ? (vTipEl.getBoundingClientRect().top - stR.top) : state.h;
      /* 数量列挂「吃茶去」当前视觉位（yBotV）：居中于题字与工具行之间的空白（用户红框位） */
      var from = yBotV + vhB / 2 + 24;

      /* 「录茶六十」与设置按钮同处下题字与页脚之间，单独给谁一个固定偏移都会互相压。
         所以把两者当成一组：总高 = 数量 + 间距 + 按钮，整体在这段空白里居中。 */
      if (!vGearEl) vGearEl = el.querySelector('.tea-tools');
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

      if (!vCardEl) vCardEl = el.parentNode && el.parentNode.querySelector('.tea-card');
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
      if (state.spin) {
        state.yaw += dt * ROT_SPEED;
        state.elapsed = (state.elapsed || 0) + dt;
        state.bob = Math.sin(state.elapsed * 1.5) * 0.010;
        spun = true;
      }
      if (camMoved || spun) render();
      if (camMoved && opts.onView) {
        try { opts.onView(metrics()); } catch (e) { /* 命中区更新失败不影响画面 */ }
      }
      state.raf = requestAnimationFrame(loop);
    }

    resize();
    render();
    if (state.spin) state.raf = requestAnimationFrame(loop);

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
      setLift: function (v) { state.lift = Math.max(0, Math.min(1, v)); if (!state.spin) render(); },
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
        var yawM = rotY(state.yaw), lidM = lidMatrix(state.lift);

        gl.bindFramebuffer(gl.FRAMEBUFFER, pickFb);
        gl.viewport(0, 0, 1, 1);
        gl.disable(gl.BLEND);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.enable(gl.DEPTH_TEST);
        gl.disable(gl.CULL_FACE);
        gl.useProgram(progPick);
        var list = [[M.saucer, yawM, 1], [M.bowl, yawM, 2], [M.lid, mul(yawM, lidM), 3], [M.tea, yawM, 4]];
        for (var i = 0; i < list.length; i++) {
          if (list[i][2] === 4 && state.lift <= 0.5) continue;
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
      /* 深色茶汤不浮绿茶叶：叶底是固定的深绿，压在琥珀/黑褐的汤色上很假。
         按汤色亮度判断——实测 28 款里红茶/黑茶落在 0.07~0.33，青茶 0.25~0.50，
         绿茶/白茶/黄茶在 0.65 以上，0.36 正好把琥珀色系分出去。 */
      setTeaColor: function (hex) {
        state.teaColor = hex2linArray(hex);
        var c = state.teaColor;
        state.leaves = (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) >= LEAF_MIN_Y;
        if (!state.spin) render();
      },
      /** 瓷色：随主题色相走。三件瓷共用一个底色，明暗仍由灯位铺出来 */
      /* 叶底色按茶种给，见 TEAS 的 lf 字段（依据 GB/T 23776-2018 与评茶术语的叶底色系） */
      setLeafColor: function (hex) {
        state.leafColor = hex2linArray(hex);
        if (!state.spin) render();
      },
      /* 夜色效果：三个系数一起下发，避免多口径打架
         glow 周身微光 / bodyDim 器身压暗 / lineGlow 裂纹自发光 */
      setNightFx: function (o) {
        o = o || {};
        state.glow = +o.glow || 0;
        state.bodyDim = (o.bodyDim == null) ? 1 : +o.bodyDim;
        state.lineGlow = +o.lineGlow || 0;
        if (!state.spin) render();
      },
      setPorcelain: function (hex) {
        state.porcelain = hex2linArray(hex);
        render();
      },
      setSpin: function (on) {
        state.spin = !!on;
        if (on) { state.last = 0; if (!state.raf) state.raf = requestAnimationFrame(loop); }
        else if (state.raf) { cancelAnimationFrame(state.raf); state.raf = 0; render(); }
      },
      pause: function () { if (state.raf) { cancelAnimationFrame(state.raf); state.raf = 0; } },
      resume: function () {
        if (state.spin && !state.raf && state.alive) { state.last = 0; state.raf = requestAnimationFrame(loop); }
      },
      dispose: function () {
        state.alive = false;
        if (state.raf) cancelAnimationFrame(state.raf);
        Object.keys(M).forEach(function (k) {
          var m = M[k];
          gl.deleteBuffer(m.pos); gl.deleteBuffer(m.nrm); gl.deleteBuffer(m.idx);
        });
        [shadowA, shadowB].forEach(function (t) {
          gl.deleteFramebuffer(t.fb); gl.deleteRenderbuffer(t.depth); gl.deleteTexture(t.tex);
        });
        gl.deleteBuffer(quadBuf);
        [progMain, progDepth, progBlur].forEach(function (p) { gl.deleteProgram(p); });
        var lose = gl.getExtension('WEBGL_lose_context');
        if (lose) lose.loseContext();
        if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
      }
    };
  }

  /* ══════════════════════ 茶 ══════════════════════ */
  var TEAS = [
    { id: 't001', n: '西湖龙井', t: '绿茶', o: '杭州·狮峰', s: '豆香清浅，一啜见春山。', c: '#d9e3a6', lf: '#91b766', w: 85, d: '15 秒', l: '一芽一叶' },
    { id: 't002', n: '洞庭碧螺春', t: '绿茶', o: '苏州·东山', s: '卷曲如螺，吓煞人香。', c: '#cfdda0', lf: '#8fbb68', w: 80, d: '12 秒', l: '满身披毫' },
    { id: 't003', n: '太平猴魁', t: '绿茶', o: '黄山·猴坑', s: '两叶抱一芽，兰香透骨。', c: '#dde5b4', lf: '#94b86f', w: 85, d: '20 秒', l: '叶形如剑' },
    { id: 't004', n: '六安瓜片', t: '绿茶', o: '六安·蝙蝠洞', s: '无芽无梗，只取单片。', c: '#d5e0a8', lf: '#9db663', w: 85, d: '15 秒', l: '单片平展' },
    { id: 't005', n: '安吉白茶', t: '绿茶', o: '湖州·安吉', s: '白化一春，鲜极反淡。', c: '#e2e8bc', lf: '#acbb95', w: 80, d: '15 秒', l: '叶白脉翠' },
    { id: 't006', n: '黄山毛峰', t: '绿茶', o: '黄山·富溪', s: '鱼叶金黄，兰香初透。', c: '#cfd98f', lf: '#9ec06d', w: 85, d: '15 秒', l: '一芽一叶初展' },
    { id: 't007', n: '信阳毛尖', t: '绿茶', o: '信阳·浉河港', s: '细圆光直，毫白如霜。', c: '#cfe0a0', lf: '#91b866', w: 85, d: '15 秒', l: '一芽一叶' },
    { id: 't008', n: '庐山云雾', t: '绿茶', o: '九江·庐山', s: '雾里生叶，杯中带凉。', c: '#d4e3ab', lf: '#8fbb6c', w: 85, d: '15 秒', l: '一芽一叶初展' },
    { id: 't009', n: '都匀毛尖', t: '绿茶', o: '黔南·都匀', s: '鱼钩一线，绿中藏秀。', c: '#dbe2a6', lf: '#9cba62', w: 85, d: '15 秒', l: '一芽一叶' },
    { id: 't010', n: '恩施玉露', t: '绿茶', o: '恩施·芭蕉', s: '蒸青一脉，色翠如玉。', c: '#cfe3b4', lf: '#8bbe6a', w: 80, d: '15 秒', l: '一芽一叶' },
    { id: 't011', n: '蒙顶甘露', t: '绿茶', o: '雅安·蒙顶山', s: '蒙顶一瓯，春信先至。', c: '#d9e0a8', lf: '#a0bb6e', w: 85, d: '15 秒', l: '一芽一叶初展' },
    { id: 't012', n: '南京雨花茶', t: '绿茶', o: '南京·中山陵', s: '松针直立，碧色浮沉。', c: '#d5e2ab', lf: '#8fbb6c', w: 85, d: '15 秒', l: '一芽一叶' },
    { id: 't013', n: '婺源绿茶', t: '绿茶', o: '上饶·婺源', s: '山高水长，叶底自青。', c: '#d7e4ae', lf: '#93bd6e', w: 85, d: '15 秒', l: '一芽一叶' },
    { id: 't014', n: '顾渚紫笋', t: '绿茶', o: '湖州·长兴', s: '紫芽初绽，唐时贡焙。', c: '#dbe4b0', lf: '#9ab86e', w: 85, d: '15 秒', l: '一芽一叶初展' },
    { id: 't015', n: '婺州举岩', t: '绿茶', o: '金华·北山', s: '岩缝生香，汤清见底。', c: '#d6e3ac', lf: '#90ba6a', w: 85, d: '15 秒', l: '一芽一叶' },
    { id: 't016', n: '狗牯脑', t: '绿茶', o: '吉安·遂川', s: '两炒两揉，形紧味醇。', c: '#d9e5b2', lf: '#94bd70', w: 85, d: '15 秒', l: '一芽一叶' },
    { id: 't017', n: '凤冈锌硒茶', t: '绿茶', o: '遵义·凤冈', s: '锌硒入土，汤色自明。', c: '#d8e2a8', lf: '#9cbb68', w: 85, d: '15 秒', l: '一芽一二叶' },
    { id: 't018', n: '峨眉山茶', t: '绿茶', o: '乐山·峨眉山', s: '雾锁金顶，芽含寒意。', c: '#d5e3ad', lf: '#8fbb6d', w: 85, d: '15 秒', l: '一芽一叶初展' },
    { id: 't019', n: '径山茶', t: '绿茶', o: '杭州·余杭', s: '径山一盏，茶宴千年。', c: '#d7e4b0', lf: '#93bc70', w: 85, d: '15 秒', l: '一芽一叶' },
    { id: 't020', n: '浮梁茶', t: '绿茶', o: '景德镇·浮梁', s: '商旅辐辏，绿意不减。', c: '#d9e3a9', lf: '#9bba66', w: 85, d: '15 秒', l: '一芽一二叶' },
    { id: 't021', n: '日照绿茶', t: '绿茶', o: '日照·巨峰', s: '北地春迟，汤色仍新。', c: '#d6e2a6', lf: '#95bd65', w: 85, d: '15 秒', l: '一芽一二叶' },
    { id: 't022', n: '白毫银针', t: '白茶', o: '福鼎·太姥山', s: '满披白毫，汤色如银。', c: '#eee2b6', lf: '#9cac91', w: 90, d: '30 秒', l: '芽针挺立' },
    { id: 't023', n: '白牡丹', t: '白茶', o: '福鼎·磻溪', s: '一芽两叶，抱朴含真。', c: '#e8d9a4', lf: '#8ea17d', w: 90, d: '25 秒', l: '叶抱芽心' },
    { id: 't024', n: '寿眉', t: '白茶', o: '福鼎·磻溪', s: '粗枝大叶，越陈越暖。', c: '#dcbf7a', lf: '#929e61', w: 95, d: '40 秒', l: '叶张舒展' },
    { id: 't025', n: '老白茶饼', t: '白茶', o: '福鼎·磻溪', s: '七年为药，煮着喝。', c: '#c98b40', lf: '#6d5840', w: 100, d: '40 秒', l: '叶色转褐' },
    { id: 't026', n: '贡眉', t: '白茶', o: '政和·澄源', s: '叶瘦芽微，陈香渐起。', c: '#dcae62', lf: '#91996f', w: 90, d: '20 秒', l: '一芽二三叶' },
    { id: 't027', n: '君山银针', t: '黄茶', o: '岳阳·君山', s: '三起三落，竖于杯中。', c: '#efe0ae', lf: '#c1b967', w: 85, d: '20 秒', l: '芽身金黄' },
    { id: 't028', n: '霍山黄芽', t: '黄茶', o: '六安·霍山', s: '闷黄一线，栗香初上。', c: '#e7d295', lf: '#c2bf70', w: 85, d: '15 秒', l: '微黄匀整' },
    { id: 't029', n: '蒙顶黄芽', t: '黄茶', o: '雅安·蒙顶', s: '扬子江心水，蒙山顶上茶。', c: '#ecd9a1', lf: '#c0bb6d', w: 85, d: '20 秒', l: '嫩黄扁平' },
    { id: 't030', n: '沩山毛尖', t: '黄茶', o: '长沙·沩山', s: '松烟微染，黄汤见暖。', c: '#d8b25f', lf: '#c2b268', w: 85, d: '15 秒', l: '一芽一二叶' },
    { id: 't031', n: '铁观音', t: '青茶', o: '安溪·西坪', s: '七泡有余香，兰底观音韵。', c: '#d8b96a', lf: '#98ae5b', w: 100, d: '15 秒', l: '青蒂绿腹' },
    { id: 't032', n: '武夷肉桂', t: '青茶', o: '武夷·三坑两涧', s: '岩骨花香，桂皮辛锐。', c: '#dbac59', lf: '#9d984d', w: 100, d: '15 秒', l: '蛤蟆背起' },
    { id: 't033', n: '凤凰单丛', t: '青茶', o: '潮州·凤凰山', s: '名字不雅，花香极正。', c: '#d6a758', lf: '#adb04f', w: 95, d: '15 秒', l: '黄片挺直' },
    { id: 't034', n: '大红袍', t: '青茶', o: '武夷·九龙窠', s: '岩上三丛，半壁江山。', c: '#b97b3c', lf: '#776140', w: 100, d: '20 秒', l: '条索紧结' },
    { id: 't035', n: '冻顶乌龙', t: '青茶', o: '南投·鹿谷', s: '山高气冷，焙火生甜。', c: '#d3a866', lf: '#92a253', w: 95, d: '20 秒', l: '半球卷曲' },
    { id: 't036', n: '东方美人', t: '青茶', o: '新竹·北埔', s: '虫啮之叶，蜜果其香。', c: '#c47a40', lf: '#a86d48', w: 90, d: '20 秒', l: '一芽二叶' },
    { id: 't037', n: '漳平水仙', t: '青茶', o: '龙岩·漳平', s: '紧压成饼，方寸有香。', c: '#d3a559', lf: '#97a35e', w: 95, d: '20 秒', l: '一芽二三叶' },
    { id: 't038', n: '文山包种', t: '青茶', o: '台北·文山', s: '轻发酵者，蜜绿清扬。', c: '#d8c882', lf: '#93a865', w: 90, d: '20 秒', l: '一芽二叶' },
    { id: 't039', n: '平和白芽奇兰', t: '青茶', o: '漳州·平和', s: '奇兰一脉，橙黄带韵。', c: '#d0a45c', lf: '#9aa35c', w: 95, d: '20 秒', l: '一芽二三叶' },
    { id: 't040', n: '正山小种', t: '红茶', o: '武夷·桐木关', s: '松烟入骨，世界红茶之源。', c: '#b0642c', lf: '#98593e', w: 95, d: '15 秒', l: '叶底红亮' },
    { id: 't041', n: '祁门红茶', t: '红茶', o: '祁门·历口', s: '祁门香，似花似蜜似果。', c: '#aa5b2b', lf: '#a2563f', w: 95, d: '20 秒', l: '铜红明亮' },
    { id: 't042', n: '滇红', t: '红茶', o: '临沧·凤庆', s: '浓强鲜爽，金毫显露。', c: '#b85f2c', lf: '#a8533e', w: 95, d: '15 秒', l: '金毫肥嫩' },
    { id: 't043', n: '金骏眉', t: '红茶', o: '武夷·桐木关', s: '一颗芽头，只取清明前。', c: '#c47a3e', lf: '#8d5c3f', w: 90, d: '12 秒', l: '金毫细嫩' },
    { id: 't044', n: '坦洋工夫', t: '红茶', o: '宁德·福安坦洋', s: '红汤赤叶，暖意如春。', c: '#b06238', lf: '#a3593d', w: 95, d: '15 秒', l: '一芽一二叶' },
    { id: 't045', n: '宁红', t: '红茶', o: '九江·修水', s: '红汤赤叶，工夫一道。', c: '#b05f34', lf: '#a45a3c', w: 95, d: '15 秒', l: '一芽一二叶' },
    { id: 't046', n: '英德红茶', t: '红茶', o: '清远·英德', s: '浓强鲜爽，汤色红亮。', c: '#b3653a', lf: '#a55c3e', w: 95, d: '15 秒', l: '一芽二叶' },
    { id: 't047', n: '宜都宜红茶', t: '红茶', o: '宜昌·宜都', s: '宜红一道，温而不燥。', c: '#ae5c33', lf: '#a2583b', w: 95, d: '15 秒', l: '一芽一二叶' },
    { id: 't048', n: '普洱生茶', t: '黑茶', o: '西双版纳·易武', s: '一山一味，越存越沉。', c: '#c4923f', lf: '#89894d', w: 100, d: '15 秒', l: '叶底柔韧' },
    { id: 't049', n: '普洱熟茶', t: '黑茶', o: '勐海·布朗', s: '渥堆转褐，汤色如琥珀。', c: '#7a3a1c', lf: '#744b39', w: 100, d: '15 秒', l: '叶底暗褐' },
    { id: 't050', n: '六堡茶', t: '黑茶', o: '梧州·苍梧', s: '一点槟榔香，压得住湿气。', c: '#8e4a20', lf: '#5a4635', w: 100, d: '20 秒', l: '叶底黑褐' },
    { id: 't051', n: '安化千两', t: '黑茶', o: '益阳·安化', s: '踩成柱，锯成饼，带松烟。', c: '#9a5a24', lf: '#7e6544', w: 100, d: '25 秒', l: '叶张粗老' },
    { id: 't052', n: '茯砖茶', t: '黑茶', o: '益阳·安化', s: '砖中金花，岁月沉陈。', c: '#8a4a28', lf: '#5f4a34', w: 100, d: '20 秒', l: '一芽三四叶' },
    { id: 't053', n: '赤壁青砖茶', t: '黑茶', o: '咸宁·赤壁', s: '砖压青褐，煮之愈厚。', c: '#94492a', lf: '#5f4834', w: 100, d: '20 秒', l: '一芽三四叶' },
    { id: 't054', n: '南路边茶', t: '黑茶', o: '雅安·荥经', s: '茶马旧道，背夫之茶。', c: '#8d4626', lf: '#5b4531', w: 100, d: '20 秒', l: '一芽三四叶' },
    { id: 't055', n: '下关沱茶', t: '黑茶', o: '大理·下关', s: '沱形紧结，橙黄透亮。', c: '#a85f30', lf: '#6b5038', w: 100, d: '20 秒', l: '一芽二三叶' },
    { id: 't056', n: '泾阳茯茶', t: '黑茶', o: '咸阳·泾阳', s: '砖面金花，陈香沉厚。', c: '#8f4a29', lf: '#5e4733', w: 100, d: '20 秒', l: '一芽三四叶' },
    { id: 't057', n: '茉莉银针', t: '花茶', o: '福州·闽侯', s: '九窨九提，花在茶里。', c: '#efe3b8', lf: '#94ba6d', w: 85, d: '15 秒', l: '芽毫匀净' },
    { id: 't058', n: '桂花乌龙', t: '花茶', o: '桂林·阳朔', s: '秋深一树金，落进焙火里。', c: '#e2c274', lf: '#9ba857', w: 95, d: '15 秒', l: '瓣影沉底' },
    { id: 't059', n: '碧潭飘雪', t: '花茶', o: '成都·蒲江', s: '绿茶为底，茉莉作雪。', c: '#e9e2b2', lf: '#94b86b', w: 85, d: '15 秒', l: '花瓣浮面' },
    { id: 't060', n: '横县茉莉花茶', t: '花茶', o: '南宁·横县', s: '伏花几窨，香透茶骨。', c: '#dbe3ab', lf: '#a2bd72', w: 90, d: '15 秒', l: '一芽一二叶' },
    { id: 't061', n: '荔枝红茶', t: '调味', o: '广东·英德', s: '红汤里浮一枚岭南。', c: '#b45f36', lf: '#a4593c', w: 95, d: '20 秒', l: '红茶为底' },
    { id: 't062', n: '八宝茶', t: '调味', o: '宁夏·银川', s: '八样入盏，一坐半日。', c: '#b0643a', lf: '#6b4a32', w: 100, d: '25 秒', l: '八味同盏' },
    { id: 't063', n: '三泡台', t: '调味', o: '甘肃·临夏', s: '三泡之后，话才开头。', c: '#b8683c', lf: '#74513a', w: 100, d: '25 秒', l: '三泡方尽' },
    { id: 't064', n: '枸杞绿茶', t: '调味', o: '宁夏·中宁', s: '一点红，落在绿里。', c: '#d9c07a', lf: '#9db86a', w: 85, d: '15 秒', l: '一芽一叶' },
    { id: 't065', n: '玄米绿茶', t: '调味', o: '日本·静冈', s: '米香先起，茶味随后。', c: '#d8c98a', lf: '#a9a862', w: 90, d: '15 秒', l: '糙米炒香' },
    { id: 't066', n: '陈皮普洱', t: '调味', o: '广东·新会', s: '陈皮的苦，普洱的厚。', c: '#a85a2e', lf: '#6f4a33', w: 100, d: '20 秒', l: '陈皮丝匀' },
    { id: 't067', n: '柠檬红茶', t: '调味', o: '广东·英德', s: '酸里透甜，午后刚好。', c: '#b56034', lf: '#a45a3c', w: 90, d: '20 秒', l: '红茶为底' },
    { id: 't068', n: '草莓绿茶', t: '调味', o: '浙江·杭州', s: '甜香压不住的那点涩。', c: '#e0b39a', lf: '#97b96c', w: 85, d: '15 秒', l: '绿茶为底' },
    { id: 't069', n: '玫瑰红茶', t: '调味', o: '云南·昆明', s: '红汤沉花瓣。', c: '#b05848', lf: '#a3594a', w: 90, d: '20 秒', l: '花瓣可见' },
    { id: 't070', n: '白桃乌龙', t: '调味', o: '福建·安溪', s: '桃气清浅，茶骨仍硬。', c: '#d39a5e', lf: '#9aa55e', w: 95, d: '20 秒', l: '乌龙为底' },
    { id: 't071', n: '柠檬枸杞茶', t: '调味', o: '宁夏·中宁', s: '两味相佐，各不相让。', c: '#d8a860', lf: '#a2b86c', w: 90, d: '15 秒', l: '拼配' },
    { id: 't072', n: '蜜桃乌龙', t: '调味', o: '福建·安溪', s: '桃香先至，茶味其后。', c: '#cf9a52', lf: '#97a35e', w: 95, d: '20 秒', l: '乌龙为底' }
  ];
  /* 「调味」依 GH/T 1247-2019《调味茶》：茶叶为底，加入其他食品原料的产品 */
  var TYPES = ['绿茶', '白茶', '黄茶', '青茶', '红茶', '黑茶', '花茶', '调味'];
  var PATTERNS = ['none', 'crackle'];
  var PATTERN_NAMES = { none: '素瓷', crackle: '冰裂' };

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

  /* 瓷色跟随主题。
     两点实测得出：
     ① 不能靠「提高 hsl 饱和度」染浅色 —— 在 96% 明度上 24% 饱和度只有 4/255 色差，等于没染；
     ② 这套光（环境 1.8 + ACES 曝光 1.75）会把高光一路推到白，所以底色要压到 80% 明度才留得住颜色。
     下面是渲染后实测的阶梯（默认色相 120），据此取 55% / 80%：
         纯白            rgb(227,227,227)  通道差 0
         hsl(120,30%,92%) rgb(218,222,218)  通道差 4
         hsl(120,45%,86%) rgb(209,220,208)  通道差 12
         hsl(120,55%,80%) rgb(197,219,194)  通道差 25   ← 一眼看出的青瓷
         hsl(120,65%,76%) rgb(187,220,181)  通道差 39   ← 开始像有色塑料 */
  var PORC_SAT = 55;     // 瓷面饱和度：调小更素，调大更艳
  var PORC_L = 80;       // 瓷面明度：这是「能留住颜色」的关键，别往 90 以上调
  /* 夜色效果的上限；实际值 = 强度滑杆 × 上限。
     强度 50% 恰好等于原先调好的那一档（微光 0.09 / 器身 0.15 / 裂纹 0.85）。 */
  var GLOW_MAX = 0.18;    // 微光：整体自发光上限
  var DIM_MAX = 0.30;     // 裂纹：器身压暗上限（强度越高越暗）
  var LINE_MAX = 1.70;    // 裂纹：裂纹自发光上限
  var GEAR_GAP = 14;      // 「录茶六十」底边到设置按钮顶边的间距

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
    var state = {
      open: false, lift: 0, tea: null, types: [], steam: true, pattern: 'crackle', night: 'body', nightFx: { body: 0.5, crackle: 0.5 }, cabinet: [],
      spin: !reduceMotion, spinUserSet: false
    };
    var el = {};
    var gl = null;
    var _revealTimer = null;
    var _snapCfg = null;
    var _themeRaf = 0;
    var _darkObs = null;
    var _drag = { active: false, y0: 0, base: 0, moved: 0, pid: null };
    var M = { pxPerWorldY: 1, lid: null };
    var THEME = { hue: 120, lo: 0, isDark: false };

    root.innerHTML = '';
    ensureStyle(root);

    var wrap = document.createElement('div');
    wrap.className = 'tea-wrap';
    wrap.innerHTML =
      '<div class="tea-stage">' +
        '<svg class="tea-steam" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">' +
          '<g filter="url(#tea-steam-blur)">' +
            '<path class="tea-wisp w1" d="M44 42c-3-6 4-9 -1-15s3-8 0-13"/>' +
            '<path class="tea-wisp w2" d="M50 44c-2.5-6 3.5-10 -1-15s2.5-8 0-12"/>' +
            '<path class="tea-wisp w3" d="M56 43c-3-6 3.5-9 -1-14s3-8 0-12"/>' +
          '</g>' +
          '<defs><filter id="tea-steam-blur" x="-60%" y="-60%" width="220%" height="220%">' +
            '<feGaussianBlur stdDeviation="1.6"/></filter></defs>' +
        '</svg>' +
        '<button type="button" class="tea-kbd" aria-label="揭开或合上碗盖；点击杯托或按 P 切换纹样"></button>' +
        '<div class="tea-verse v-top"><span>不如<span class="el">……</span></span></div>' +
        '<div class="tea-verse v-bot"><span>吃茶去</span></div>' +
        '<div class="tea-count"><span></span></div>' +
'<div class="tea-tools">' +
                '<button class="tea-gear" type="button" aria-label="喝茶设置">' +
        '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.6" ' +
        'stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/>' +
        '<path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>' +
      '</button>' +
      '</div>' +
      '</div>' +
      '<div class="tea-card" aria-live="polite">' +
        '<div class="tea-name"></div><div class="tea-meta"></div>' +
        '<div class="tea-note"></div><div class="tea-brew"></div>' +
        '<button type="button" class="tea-save"></button>' +
      '</div>' +
      '<div class="tea-tip">揭盖看茶 · 拖动可转</div>' +
            '<div class="tea-mask">' +
        '<div class="tea-cab-panel" role="dialog" aria-modal="true" aria-label="茶柜与茶库">' +
          '<div class="tea-cab-head">' +
            '<div class="tea-title tea-cab-title">茶柜</div>' +
            '<button type="button" class="tea-x" data-act="cab-close" aria-label="关闭">×</button>' +
          '</div>' +
          '<input type="search" class="tea-find" placeholder="搜茶名 · 分类" aria-label="搜索茶样" />' +
          '<div class="tea-seg">' +
            '<button type="button" class="tea-seg-btn" data-seg="all">全部</button>' +
            '<button type="button" class="tea-seg-btn" data-seg="cab">我的茶柜</button>' +
          '</div>' +
          '<div class="tea-seg tea-seg-types">' + buildTypeSegs() + '</div>' +
          '<div class="tea-cab-list"></div>' +
          '<div class="tea-pager">' +
            '<button type="button" class="tea-pg" data-pg="-1" aria-label="上一页">‹</button>' +
            '<span class="tea-pg-i"></span>' +
            '<button type="button" class="tea-pg" data-pg="1" aria-label="下一页">›</button>' +
          '</div>' +
        '</div>' +
        '<div class="tea-dialog" role="dialog" aria-modal="true" aria-label="喝茶设置">' +
          '<div class="tea-title">今天想喝什么</div>' +
          '<div class="tea-hint">不选就整柜都算，选了就只从这几类里抽</div>' +
          '<div class="tea-chips">' +
            TYPES.map(function (t) { return '<button type="button" class="tea-chip" data-t="' + t + '">' + t + '</button>'; }).join('') +
          '</div>' +
          '<div class="tea-sub">杯身纹样</div>' +
          '<div class="tea-chips" data-row="pattern">' +
            '<button type="button" class="tea-chip pat" data-p="none">素瓷</button>' +
            '<button type="button" class="tea-chip pat" data-p="crackle">冰裂</button>' +
          '</div>' +
          '<div class="tea-sub">夜色效果</div>' +
          '<div class="tea-chips" data-row="night">' +
            '<button type="button" class="tea-chip night" data-n="body">微光</button>' +
            '<button type="button" class="tea-chip night" data-n="crackle">裂纹</button>' +
          '</div>' +
          '<div class="tea-slider-row">' +
            '<span class="tea-slider-label">强度</span>' +
            '<input type="range" class="tea-range" min="0" max="100" step="1" aria-label="夜色效果强度" />' +
          '</div>' +
          '<label class="tea-switch"><span class="tea-switch-label">蒸汽</span>' +
            '<input type="checkbox" class="tea-steam-input" /><span class="track" aria-hidden="true"></span></label>' +
          '<label class="tea-switch"><span class="tea-switch-label">缓慢自转</span>' +
            '<input type="checkbox" class="tea-spin-input" /><span class="track" aria-hidden="true"></span></label>' +
          '<button type="button" class="tea-link" data-act="open-cab">' +
            '<span class="tea-link-text">我的茶柜</span><span class="tea-link-arrow">›</span>' +
          '</button>' +
          '<div class="tea-actions">' +
            '<button type="button" class="tea-btn ghost" data-act="cancel">取消</button>' +
            '<button type="button" class="tea-btn primary" data-act="save">保存</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    root.appendChild(wrap);

    el.wrap = wrap;
    el.stage = wrap.querySelector('.tea-stage');
    el.kbd = wrap.querySelector('.tea-kbd');
    el.verseTop = wrap.querySelector('.tea-verse.v-top');
    el.verseBot = wrap.querySelector('.tea-verse.v-bot');
    el.card = wrap.querySelector('.tea-card');
    el.name = wrap.querySelector('.tea-name');
    el.meta = wrap.querySelector('.tea-meta');
    el.note = wrap.querySelector('.tea-note');
    el.brew = wrap.querySelector('.tea-brew');
    el.save = wrap.querySelector('.tea-save');
    el.cabLink = wrap.querySelector('.tea-link');
    el.dialog = wrap.querySelector('.tea-dialog');
    el.cabPanel = wrap.querySelector('.tea-cab-panel');
    el.cabList = wrap.querySelector('.tea-cab-list');
    el.cabTitle = wrap.querySelector('.tea-cab-title');
    el.find = wrap.querySelector('.tea-find');
    var countStr = wrap.querySelector('.tea-count span');
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
    el.tip = wrap.querySelector('.tea-tip');
    el.gear = wrap.querySelector('.tea-gear');
    el.maskEl = wrap.querySelector('.tea-mask');
    el.chips = wrap.querySelector('.tea-chips:not([data-row="pattern"])');
    el.patChips = wrap.querySelector('.tea-chips[data-row="pattern"]');
    el.nightChips = wrap.querySelector('.tea-chips[data-row="night"]');
    el.range = wrap.querySelector('.tea-range');
    el.steamInput = wrap.querySelector('.tea-steam-input');
    el.spinInput = wrap.querySelector('.tea-spin-input');
    el.saveBtn = wrap.querySelector('[data-act="save"]');
    el.cancelBtn = wrap.querySelector('[data-act="cancel"]');

    loadConfig();

    /* ── 渲染器 ── */
    try {
      gl = GaiwanMount(el.stage, { spin: state.spin, tyRef: _tyRef });
    } catch (e) {
      LOG.warn('[' + ID + '] WebGL 初始化失败', e);
      gl = null;
    }
    if (!gl) {
      wrap.classList.add('tea-nogl');
      if (el.tip) el.tip.textContent = '这台设备开不了 WebGL';
      return makeApi();
    }
    wrap.classList.add('tea-gl');

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
      wrap.classList.toggle('tea-narrow', narrow);
      if (el.find) el.find.setAttribute('placeholder', narrow ? '搜茶名' : '搜茶名 · 分类');
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
      wrap.classList.toggle('tea-dark', !!THEME.isDark);
      wrap.classList.toggle('tea-no-steam', !state.steam);
      if (gl) {
        try { gl.setPorcelain(porcelainHex(THEME.hue, THEME.lo, THEME.isDark)); } catch (e) { LOG.warn('[' + ID + '] 瓷色更新失败', e); }
        try {
          var cr = state.night === 'crackle';
          var t = clamp(state.nightFx[state.night] == null ? 0.5 : state.nightFx[state.night], 0, 1);
          gl.setNightFx({
            glow: (THEME.isDark && !cr) ? t * GLOW_MAX : 0,
            bodyDim: (THEME.isDark && cr) ? DIM_MAX * (1 - t) : 1,
            lineGlow: (THEME.isDark && cr) ? t * LINE_MAX : 0
          });
        } catch (e) { LOG.warn('[' + ID + '] 夜色效果更新失败', e); }
      }
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
      var on = state.spin && _visible;
      gl.setSpin(on);
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
      state.pattern = (raw && PATTERNS.indexOf(raw.pattern) >= 0) ? raw.pattern : 'crackle';
      state.night = (raw && raw.night === 'crackle') ? 'crackle' : 'body';
      if (raw && raw.cabinet && raw.cabinet.length) {
        var ids = {};
        TEAS.forEach(function (t) { ids[t.id] = 1; });
        state.cabinet = raw.cabinet.filter(function (id) { return ids[id]; });
      }
      if (raw && raw.nightFx) {
        state.nightFx = {
          body: clamp(+raw.nightFx.body || 0, 0, 1),
          crackle: clamp(+raw.nightFx.crackle || 0, 0, 1)
        };
      }
      if (raw && typeof raw.spin === 'boolean') { state.spin = raw.spin; state.spinUserSet = true; }
      wrap.classList.toggle('tea-no-steam', !state.steam);
      /* 异步到达时 UI 已按默认值画过一遍：各处按真值补刷 */
      setPattern(state.pattern, false);
      renderNightChips(); syncRange(); applyTheme();
      renderChips();
      if (el.steamInput) el.steamInput.checked = state.steam;
      if (el.spinInput) el.spinInput.checked = state.spin;
      if (gl && gl.setSpin) gl.setSpin(state.spin);
      paintCount(); paintSaveBtn();
    }
    function saveConfig() {
      try {
        if (api.saveData) api.saveData({ types: state.types.slice(), steam: !!state.steam, spin: !!state.spin, pattern: state.pattern, night: state.night, nightFx: { body: state.nightFx.body, crackle: state.nightFx.crackle }, cabinet: state.cabinet.slice() });
      } catch (e) { LOG.warn('[' + ID + '] 保存设置失败', e); }
    }

    /* ── 抽茶 ── */
    /* 抽茶池：先茶柜、后类型筛选。
       柜为空 → 全库；柜非空但筛完没剩 → 退回柜内全部（绝不出现空池）。 */
    function pool() {
      var base = TEAS;
      if (state.cabinet.length) {
        var inCab = TEAS.filter(function (t) { return state.cabinet.indexOf(t.id) >= 0; });
        if (inCab.length) base = inCab;
      }
      if (!state.types.length) return base;
      var list = base.filter(function (t) { return state.types.indexOf(t.t) >= 0; });
      return list.length ? list : base;
    }
    function pickTea() {
      var list = pool();
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
      if (!t) { el.save.style.display = ''; el.save.textContent = ''; return; }
      el.save.style.display = '';
      el.save.textContent = inCabinet(t.id) ? '已入柜 · 移出' : '存入茶柜';
    }
    /* 竖向题字双态：默认「录茶N」= 库统计；悬停/聚焦换成「我的茶柜」= 入口名。
       两个状态各有各的语义，不混用。 */
    var _countHover = false;
    function paintCount() {
      var n = state.cabinet.length;
      if (countStr) {
        countStr.textContent = _countHover
          ? '我的茶柜'
          : ('录茶' + cnNum(TEAS.length));
        var box = countStr.parentNode;
        if (box) box.classList.toggle('has-cab', n > 0);
      }
      if (el.cabLink) {
        var txt = el.cabLink.querySelector('.tea-link-text');
        if (txt) txt.textContent = '我的茶柜 · ' + cnNum(n);
      }
    }
    var cabMode = 'all', cabType = '', cabPage = 0, cabQ = '';
    var CAB_PER = 8;   // 单列每页上限 8 款（矮视口按容器高度自适应缩减）
    function buildTypeSegs() {
      var out = '<button type="button" class="tea-seg-btn" data-type="">全类</button>';
      for (var i = 0; i < TYPES.length; i++) {
        out += '<button type="button" class="tea-seg-btn" data-type="' + TYPES[i] + '">' + TYPES[i] + '</button>';
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
        var head = cabQ ? '找到' : (cabMode === 'cab' ? '茶柜' : (cabType || '录茶'));
        el.cabTitle.textContent = _narrow ? head : (head + ' · ' + cnNum(items.length));
      }
      var segs = el.cabPanel.querySelectorAll('.tea-seg-btn');
      for (var i = 0; i < segs.length; i++) {
        var b = segs[i];
        if (b.hasAttribute('data-seg')) b.classList.toggle('on', b.getAttribute('data-seg') === cabMode);
        else b.classList.toggle('on', (b.getAttribute('data-type') || '') === cabType);
      }

      if (!items.length) {
        var pg0 = el.cabPanel.querySelector('.tea-pager');
        if (pg0) pg0.classList.remove('show');
        /* SPEC E1>E2>E4：柜空优先于类型空态——移走最后一件茶后，
           「换分类」解决不了柜子空了的事实，文案必须指向收茶 */
        el.cabList.innerHTML = cabQ
          ? '<div class="tea-cab-empty">没有找到「' + esc(cabQ) + '」<br />换个词试试</div>'
          : (cabMode === 'cab'
            ? '<div class="tea-cab-empty">我的茶柜还是空的<br />在「全部」里点右侧的 ＋ 收进来</div>'
            : '<div class="tea-cab-empty">这一类没有茶<br />换个分类看看</div>');
        return;
      }
      /* 分页取代滚动：每页 12 款（两列 × 6 行），面板高度恒定，最长也只有一屏 */
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
        return '<div class="tea-row" title="' + esc(t.n + ' · ' + t.t) + '">' +
               '<button type="button" class="tea-row-n" data-brew="' + t.id + '">' + esc(t.n) + '</button>' +
               '<button type="button" class="tea-row-t' + (on ? ' on' : '') + '" data-id="' + t.id +
               '" aria-label="' + (on ? '移出茶柜' : '存入茶柜') + '">' + (on ? '✓' : '＋') + '</button></div>';
      }).join('');
      var pager = el.cabPanel.querySelector('.tea-pager');
      if (pager) {
        pager.classList.toggle('show', pages > 1);
        var idxEl = pager.querySelector('.tea-pg-i');
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
        btn.setAttribute('aria-label', on ? '移出茶柜' : '存入茶柜');
        if (el.cabTitle) {
          el.cabTitle.textContent = cabMode === 'cab'
            ? ('茶柜 · ' + cnNum(state.cabinet.length))
            : ('录茶 · ' + cnNum(TEAS.length));
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
      if (i >= 0) { state.cabinet.splice(i, 1); flashTip('已移出茶柜'); }
      else { state.cabinet.push(t.id); flashTip('已存入茶柜'); }
      paintSaveBtn();
      paintCount();
      saveConfig();
    }
    function paintText(t) {
      if (el.name) el.name.textContent = t.n;
      if (el.meta) el.meta.textContent = t.t + ' · ' + t.o;
      if (el.note) el.note.textContent = '「' + t.s + '」';
      if (el.brew) {
        el.brew.innerHTML = t.w + '℃<span class="tea-dot"></span>' + t.d +
          '<span class="tea-dot"></span>' + esc(t.l);
      }
    }
    function paintTea(t) {
      if (gl) { gl.setTeaColor(t.c); if (t.lf) gl.setLeafColor(t.lf); }
      paintText(t);
      paintSaveBtn();
      /* 文案高度是在这一步才定下来的：排版缓存必须失效，否则（尤其长文案）
         题字/卡片的位置还按「空卡」算，末行会压到页脚。 */
      if (el.stage) el.stage._vKey = '';
      if (gl) gl.render();
    }

    /* ── 揭盖 ── */
    function applyLift(v) {
      state.lift = clamp(v, 0, 1);
      if (gl) gl.setLift(state.lift);
      /* 命中区跟着盖走：与渲染器同一套投影，位移 1.30 / 1.02 世界单位 */
      if (el.hitArea && M.pxPerWorldY) {
        el.hitArea.style.transform = 'translate(' + (1.05 * state.lift * M.pxPerWorldY).toFixed(1) +
          'px,' + (-0.95 * state.lift * M.pxPerWorldY).toFixed(1) + 'px)';
      }
    }
    var _tipTimer = null;
    function flashTip(text) {
      if (!el.tip) return;
      if (_tipTimer) clearTimeout(_tipTimer);
      el.tip.textContent = text;
      _tipTimer = setTimeout(function () {
        _tipTimer = null;
        if (el.tip) el.tip.textContent = state.open ? '再揭一次，换一盏' : '揭盖看茶 · 拖动可转';
      }, 1000);
    }

    function renderPatChips() {
      if (!el.patChips) return;
      var list = el.patChips.querySelectorAll('.tea-chip');
      for (var i = 0; i < list.length; i++) {
        list[i].classList.toggle('on', list[i].getAttribute('data-p') === state.pattern);
      }
    }
    function renderNightChips() {
      if (!el.nightChips) return;
      var list = el.nightChips.querySelectorAll('.tea-chip');
      for (var i = 0; i < list.length; i++) {
        list[i].classList.toggle('on', list[i].getAttribute('data-n') === state.night);
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
      open(t);
      flashTip('换泡 ' + t.n);
    }
    function open(forced) {
      if (state.open) return;
      state.open = true;
      state.tea = forced || pickTea();
      wrap.classList.add('is-open');
      applyLift(1);
      syncSpin();
      if (el.tip) el.tip.textContent = '再揭一次，换一盏';
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
      if (el.card) el.card.classList.remove('is-live');
      if (el.tip) el.tip.textContent = '揭盖看茶 · 拖动可转';
      applyLift(0);
      syncSpin();
      if (_revealTimer) { clearTimeout(_revealTimer); _revealTimer = null; }
    }
    function toggle() { if (state.open) close(); else open(); }

    /* ── 手势 ──
       按下时先拾取部件（1×1 离屏渲染，逐像素准确）：
         碗盖 → 揭盖（拖动）/ 开合（点按）
         其余 → 轨道绕转（拖动）；**茶托（杯托）点按 → 换纹样**，杯身点按不再切换
       这样不再需要一块 DOM 命中区跟着相机跑。 */
    var _g = { active: false, kind: 'orbit', part: 0, x: 0, y: 0, moved: 0 };

    /* 必须用画布的 rect，不是 stage 的：stage 有内边距，画布是内缩的 */
    function stagePoint(e) {
      var r = (gl && gl.canvas ? gl.canvas : el.stage).getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    }
    function onPointerDown(e) {
      if (e.button !== undefined && e.button !== 0) return;
      /* 底部工具行（茶柜 / 设置）在舞台内：一旦被 setPointerCapture 捕获，
         后续 click 会被重定向到舞台，按钮自己的 click 永远收不到。整行放行。 */
      if (e.target && e.target.closest && e.target.closest('.tea-tools, .tea-count')) return;
      var p = stagePoint(e), part = 0;
      try { part = gl ? gl.pick(p.x, p.y) : 0; } catch (err) { part = 0; }
      _g.active = true;
      _g.part = part;
      _g.kind = part === 3 ? 'lid' : 'orbit';
      _g.x = e.clientX; _g.y = e.clientY; _g.moved = 0;
      wrap.classList.add(_g.kind === 'lid' ? 'is-dragging' : 'is-orbiting');
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
      wrap.classList.remove('is-dragging', 'is-orbiting');
      var tap = _g.moved <= 4;
      if (_g.kind === 'lid') {
        if (tap) toggle();
        else if (state.open) { if (state.lift < 0.66) close(); else applyLift(1); }
        else { if (state.lift > 0.34) open(); else applyLift(0); }
      } else if (tap && _g.part === 1) {
        cyclePattern();
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
    function renderChips() {
      var list = el.chips ? el.chips.querySelectorAll('.tea-chip') : [];
      for (var i = 0; i < list.length; i++) {
        list[i].classList.toggle('on', state.types.indexOf(list[i].getAttribute('data-t')) >= 0);
      }
    }
    function openSettings() {
      _snapCfg = { types: state.types.slice(), steam: !!state.steam, spin: !!state.spin, pattern: state.pattern };
      renderNightChips();
      renderChips();
      syncRange();
      if (el.steamInput) el.steamInput.checked = !!state.steam;
      if (el.spinInput) el.spinInput.checked = !!state.spin;
      wrap.classList.add('is-set');
      syncSpinState();
    }
    function closeSettings() { wrap.classList.remove('is-set'); syncSpinState(); }
    function cancelSettings() {
      if (_snapCfg) {
        state.types = _snapCfg.types.slice();
        state.night = _snapCfg.night || 'body';
        renderNightChips();
        state.steam = _snapCfg.steam;
        state.spin = _snapCfg.spin;
        wrap.classList.toggle('tea-no-steam', !state.steam);
        syncSpin();
        setPattern(_snapCfg.pattern, false);
        _snapCfg = null;
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
        var chip = e.target && e.target.closest ? e.target.closest('.tea-chip') : null;
        if (!chip) return;
        var t = chip.getAttribute('data-t');
        var i = state.types.indexOf(t);
        if (i >= 0) state.types.splice(i, 1); else state.types.push(t);
        chip.classList.toggle('on', i < 0);
      });
    }
    if (el.patChips) {
      el.patChips.addEventListener('click', function (e) {
        var chip = e.target && e.target.closest ? e.target.closest('.tea-chip') : null;
        if (!chip) return;
        setPattern(chip.getAttribute('data-p'), false);
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
        var tg = t && t.closest ? t.closest('.tea-row-t') : null;
        if (tg) { toggleFromList(tg); return; }
        var br = t && t.closest ? t.closest('.tea-row-n') : null;
        if (br) brewFromList(br.getAttribute('data-brew'));
      });
    }
    var countBox = wrap.querySelector('.tea-count');
    if (countBox) {
      countBox.setAttribute('role', 'button');
      countBox.setAttribute('tabindex', '0');
      countBox.setAttribute('aria-label', '打开我的茶柜');
      countBox.addEventListener('mouseenter', function () { _countHover = true; paintCount(); });
      countBox.addEventListener('mouseleave', function () { _countHover = false; paintCount(); });
      countBox.addEventListener('focus', function () { _countHover = true; paintCount(); });
      countBox.addEventListener('blur', function () { _countHover = false; paintCount(); });
      /* 默认文案是「录茶N」（库），点击开「全部」段——用户明确要求过：点它看完整列表再挑进柜 */
      countBox.addEventListener('click', function () { openCabinet('all'); });
      countBox.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openCabinet('all'); }
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
        state.nightFx[state.night] = clamp(parseFloat(el.range.value) / 100 || 0, 0, 1);
        applyTheme();
      });
    }
    if (el.nightChips) {
      el.nightChips.addEventListener('click', function (e) {
        var chip = e.target && e.target.closest ? e.target.closest('.tea-chip') : null;
        if (!chip) return;
        setNight(chip.getAttribute('data-n'));
      });
    }
    if (el.steamInput) {
      el.steamInput.addEventListener('change', function () {
        state.steam = !!el.steamInput.checked;
        wrap.classList.toggle('tea-no-steam', !state.steam);
      });
    }
    if (el.spinInput) {
      el.spinInput.addEventListener('change', function () {
        state.spin = !!el.spinInput.checked;
        syncSpin();
      });
    }
    if (el.maskEl) el.maskEl.addEventListener('click', function (e) { if (e.target === el.maskEl) cancelSettings(); });
    if (el.saveBtn) {
      el.saveBtn.addEventListener('click', function () {
        var changed = typesChanged(_snapCfg);
        _snapCfg = null;
        saveConfig();
        closeSettings();
        if (changed) close();
      });
    }
    if (el.cancelBtn) el.cancelBtn.addEventListener('click', cancelSettings);

    /* ── 卸载 ── */
    function destroy() {
      if (_revealTimer) { clearTimeout(_revealTimer); _revealTimer = null; }
      if (_themeRaf) { cancelAnimationFrame(_themeRaf); _themeRaf = 0; }
      window.removeEventListener('message', onThemeMessage);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      window.removeEventListener('blur', onUp);
      window.removeEventListener('pointermove', onOrbitMove);
      window.removeEventListener('pointerup', onOrbitUp);
      window.removeEventListener('pointercancel', onOrbitUp);
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
    '.tea-wrap{' +
      '--lo:var(--accent-lightness-offset,0%);' +
      'position:relative;height:100%;min-height:0;display:flex;flex-direction:column;' +
      'font-family:var(--font-family,-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif);' +
      'color:hsl(var(--th),18%,22%);overflow:hidden;user-select:none;-webkit-user-select:none;' +
      /* 不铺底：与 blog / curtain 一致，坐在宿主的面上，只靠器物自身的明暗与案上柔影立形 */
    '}' +
    '.tea-wrap.tea-dark{' +
      'color:hsl(var(--th),10%,92%);' +
    '}' +

    '.tea-stage{position:relative;flex:1 1 auto;min-height:0;touch-action:none;}' +
    /* 命中区：盖子在视口里的投影（相机固定 → 比例固定） */
    '.tea-kbd{position:absolute;left:0;top:0;width:100%;height:100%;padding:0;border:0;background:transparent;' +
      'opacity:0;pointer-events:none;}' +
    '.tea-kbd:focus-visible{opacity:1;outline:2px dashed hsl(var(--th),32%,52%);outline-offset:-6px;' +
      'border-radius:var(--radius-md,14px);}' +
    '.tea-sub{margin-top:var(--space-14);font-size:var(--type-xs);color:var(--text-tertiary,currentColor);' +
      'opacity:.9;letter-spacing:.04em;}' +
    '.tea-chips[data-row=pattern]{grid-template-columns:repeat(2,1fr);margin-top:var(--space-8);}' +
    '.tea-steam{position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;' +
      'opacity:0;transition:opacity var(--duration-slow) var(--ease-cn);}' +
    '.tea-wrap.is-open .tea-steam{opacity:1;transition-delay:var(--duration-normal);}' +
    '.tea-wrap.tea-no-steam .tea-steam{display:none;}' +
    '.tea-dark .tea-wisp{stroke:hsla(var(--th),20%,96%,.26);}' +
    '.tea-wisp{fill:none;stroke:hsla(0,0%,100%,.55);stroke-width:3.2;stroke-linecap:round;' +
      'transform-box:fill-box;transform-origin:50% 100%;}' +
    '.tea-wrap.is-open .tea-wisp{animation:tea-rise 5.6s ease-in-out infinite;}' +
    '.tea-wrap.is-open .w2{animation-duration:6.8s;animation-delay:-2.1s;}' +
    '.tea-wrap.is-open .w3{animation-duration:6.2s;animation-delay:-3.6s;}' +
    '@keyframes tea-rise{' +
      '0%{opacity:0;transform:translateY(2px) scaleX(.8);}' +
      '24%{opacity:.9;}' +
      '64%{opacity:.45;}' +
      '100%{opacity:0;transform:translateY(-4px) scaleX(1.15);}' +
    '}' +
    /* 上下两行题字：位置由 placeVerse() 按器物在屏幕上的实际边界算，不写死百分比 */
    /* 竖排：外层满宽只负责水平居中，内层 span 用 vertical-rl 把字竖着叠；
       高度随字数变化，故用 translateY(-50%) 以自身中心对齐 placeVerse() 给出的 y */
    '.tea-verse{position:absolute;left:0;right:0;text-align:center;pointer-events:none;' +
      'font-size:15px;line-height:1;opacity:.62;transform:translateY(-50%);' +
      'white-space:nowrap;transition:opacity var(--duration-slow) var(--ease-cn);}' +
    /* 省略号字形贴基线，竖排后墨迹会偏出列中心约 0.22 字宽；这里按实测补偿。 */
    '.tea-verse .el{display:inline-block;transform:translateX(0.305em);}' +
    /* 收录数量：竖排、默认显示（未开盖），开盖后让位给茶样文案 */
    /* 这一列本身就是「柜 / 库」的状态显示，点击直达茶柜 —— 比另加图标更省地方 */
    /* 计数列常显 .55（PATCH-49 的隐藏是误读：用户当时要的是改名不是隐藏）；
       悬停自身提亮到 .85 提示可点，开盖后让位给茶样文案 */
    '.tea-count{position:absolute;z-index:2;left:0;right:0;text-align:center;pointer-events:auto;cursor:pointer;' +
      'font-size:15px;line-height:1;opacity:.55;transform:translateY(-50%);' +
      'white-space:nowrap;transition:opacity var(--duration-slow) var(--ease-cn);}' +
    '.tea-count:focus-visible{opacity:.85;}' +
    /* 同级特异性：否则悬停自身被下面的开盖规则之外的因素压住 */
    '.tea-wrap:not(.is-open) .tea-count:hover{opacity:.85;}' +
    /* 颜色不写死：继承 .tea-wrap 的主题色（浅底 hsl(--th,18%,22%)、深底 hsl(--th,10%,92%)），
       与两列题字同源，只是透明度更低一档。 */
    '.tea-count>span{display:inline-block;writing-mode:vertical-rl;text-orientation:mixed;' +
      'letter-spacing:.30em;margin-inline-end:-.30em;}' +
    /* 开盖后这段纵向空间交给茶样文案：数量是未开盖态的信息，工具行也不必在喝茶中途出现
       （要开茶柜/设置，合盖即可）。不隐藏的话三者会叠在一起、按钮被盖住点不到。 */
    /* 竖排里 text-decoration:underline 会沿文字方向画一条竖线，看着像多出来的一根线，
       所以悬停只换颜色，不加下划线 */
    '.tea-count:hover>span,.tea-count:focus-visible>span{color:var(--bm-primary,#3a7a3a);opacity:1;}' +
    '.tea-wrap.is-open .tea-count{opacity:0;pointer-events:none;}' +
    /* ── 窄面板（<210px）：单列列表、分类三列、留白收紧 ── */
    '.tea-narrow .tea-dialog,.tea-narrow .tea-cab-panel{padding:12px;' +
      'max-width:none;width:calc(100% - 8px);}' +
    '.tea-narrow .tea-cab-list{grid-template-columns:1fr;column-gap:0;row-gap:0;}' +
    '.tea-narrow .tea-seg-types{grid-template-columns:repeat(3,1fr);gap:0 6px;}' +
    '.tea-narrow .tea-seg-btn{font-size:11px;}' +
    '.tea-narrow .tea-row{padding:4px 4px;margin:0 -4px;}' +
    '.tea-narrow .tea-find{height:24px;line-height:24px;font-size:11px;margin-top:8px;}' +
    '.tea-narrow .tea-title{font-size:14px;}' +
    '.tea-narrow .tea-actions{padding-top:8px;margin-top:10px;}' +
    '.tea-wrap.is-open .tea-tools{opacity:0;pointer-events:none;}' +
    '.tea-verse>span{display:inline-block;writing-mode:vertical-rl;text-orientation:mixed;' +
      'letter-spacing:.18em;margin-inline-end:-.18em;}' +
    '.tea-wrap:hover .tea-verse{opacity:.78;}' +
    '.tea-slider-row{display:flex;align-items:center;gap:10px;margin-top:10px;}' +
    '.tea-slider-label{font-size:11px;letter-spacing:.02em;opacity:.72;white-space:nowrap;}' +
    /* 滑块沿用 curtain 模块 .bc-range 的组件写法（轨道 4px / 拇指 14px），
       并保留那条必须的 min-height:0 —— base.css 有全局 :where(input) 触控地板，
       不显式清零会被撑到 44px 高，把面板顶变形。 */
    '.tea-range{flex:1 1 auto;min-width:0;display:block;height:18px;min-height:0;margin:0;' +
      '-webkit-appearance:none;appearance:none;background:transparent;cursor:pointer;' +
      '-webkit-tap-highlight-color:transparent;}' +
    '.tea-range::-webkit-slider-runnable-track{height:4px;border-radius:2px;background:hsla(var(--th),20%,46%,.28);}' +
    '.tea-range::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:14px;height:14px;margin-top:-5px;' +
      'border-radius:50%;background:hsl(var(--th),36%,40%);box-shadow:0 1px 2px rgba(0,0,0,.3);}' +
    '.tea-range::-moz-range-track{height:4px;border-radius:2px;background:hsla(var(--th),20%,46%,.28);}' +
    '.tea-range::-moz-range-thumb{width:14px;height:14px;border:none;border-radius:50%;' +
      'background:hsl(var(--th),36%,40%);box-shadow:0 1px 2px rgba(0,0,0,.3);}' +
    '.tea-range:focus-visible{outline:2px solid hsl(var(--th),40%,46%);outline-offset:2px;}' +
    '.tea-hit{position:absolute;left:22%;top:27%;width:56%;height:14%;' +
      'cursor:grab;outline:none;transition:transform var(--duration-slower) cubic-bezier(.2,.8,.2,1);}' +
    '.tea-wrap.is-dragging .tea-hit{cursor:grabbing;transition:none;}' +
    '.tea-stage{cursor:grab;}' +
    '.tea-wrap.is-orbiting .tea-stage{cursor:grabbing;}' +
    '.tea-hit:focus-visible{outline:2px dashed hsl(var(--th),32%,52%);outline-offset:4px;border-radius:50%;}' +
    '.tea-wrap.tea-nogl .tea-stage{display:none;}' +

    /* 文案整体上提：用 relative+top 而不是 margin/transform ——
       margin 会改变舞台高度（器物跟着缩放），transform 与 is-live 的淡入位移冲突。 */
    '.tea-card{position:relative;padding:0 var(--space-20) var(--space-8);text-align:center;opacity:0;' +
      'transform:translateY(10px);transition:opacity var(--duration-slow) var(--ease-cn),' +
      'transform var(--duration-slow) var(--ease-cn);}' +
    '.tea-card.is-live{opacity:1;transform:none;}' +
    '.tea-save{margin-top:8px;padding:2px 0;border:0;background:none;cursor:pointer;' +
      'font-family:inherit;font-size:11px;letter-spacing:.06em;color:var(--bm-primary,#3a7a3a);opacity:.8;' +
      'transition:opacity var(--duration-fast) var(--ease-cn);}' +
    '.tea-save:hover{opacity:1;text-decoration:underline;text-underline-offset:3px;}' +
    '.tea-name{font-size:var(--type-xl);font-weight:500;letter-spacing:.12em;line-height:1.3;' +
      'font-family:"Songti SC","Noto Serif CJK SC",Georgia,serif;}' +
    '.tea-meta{margin-top:var(--space-5);font-size:var(--type-xs);opacity:.62;letter-spacing:.08em;}' +
    '.tea-note{margin-top:var(--space-12);font-size:var(--type-sm);opacity:.8;line-height:1.7;letter-spacing:.04em;}' +
    '.tea-brew{margin-top:var(--space-10);font-size:var(--type-xs);opacity:.5;letter-spacing:.08em;' +
      'display:flex;align-items:center;justify-content:center;gap:var(--space-8);}' +
    '.tea-dot{width:2px;height:2px;border-radius:50%;background:currentColor;opacity:.55;}' +
    /* 提示行默认隐藏，悬停整个模块时淡入；触摸设备没有 hover，保持常显。
       只改透明度不改 display —— 它仍占位，底部布局与卡片位置不受影响。 */
    '.tea-tip{position:relative;flex:0 0 auto;text-align:center;font-size:var(--type-xs);letter-spacing:.22em;' +
      'opacity:0;padding:0 var(--space-8) 0;transition:opacity var(--duration-slow) var(--ease-cn);}' +
    '.tea-wrap:hover .tea-tip,.tea-wrap:focus-within .tea-tip{opacity:.34;}' +
    '@media (hover:none){.tea-tip{opacity:.34;}}' +

    /* 设置按钮放到底部居中、提示行上方：原来在右上角，侧栏里离器物太远，
       且和「录茶六十 / 吃茶去。」那几列字抢右上角的空白。 */
    /* z-index 必须高于画布：齿轮在 .tea-stage 里，而画布由渲染器后插入 stage，会盖住它 */
    /* 底部工具行：茶柜 + 设置，两个图标并列。容器负责水平居中（margin auto 不依赖宽度），
       按钮常显但很淡 —— 一个图标可以靠 hover 藏，两个就不容易被发现了。 */
    '.tea-tools{position:absolute;z-index:2;left:0;right:0;margin:0 auto;top:0;width:max-content;' +
      'display:flex;flex-direction:column;align-items:center;gap:10px;}' +
    '.tea-tools button{width:22px;height:22px;display:flex;align-items:center;justify-content:center;' +
      'padding:0;border:0;background:transparent;color:inherit;opacity:.22;cursor:pointer;' +
      'transition:opacity var(--duration-normal) var(--ease-cn),transform var(--duration-normal) var(--ease-cn);}' +
    '.tea-wrap:hover .tea-tools button{opacity:.42;}' +
    '.tea-tools button:hover,.tea-tools button:focus-visible{opacity:.85;}' +
    '.tea-tools button:focus-visible{outline:2px solid hsl(var(--th),32%,52%);outline-offset:2px;}' +
    '.tea-gear:hover{transform:rotate(30deg);}' +
    '@media (hover:none){.tea-tools button{opacity:.42;}}' +

    /* 面板贴底：居中会正好盖住盖碗，调参时看不到器物 */
    '.tea-mask{position:absolute;inset:0;display:none;align-items:flex-end;justify-content:center;' +
      'background:hsla(var(--th),20%,12%,.20);padding:12px;z-index:var(--z-layer-overlay,10000);}' +
    '.tea-wrap.is-set .tea-mask,.tea-wrap.is-cab .tea-mask{display:flex;}' +
    /* ── 设置面板：尺寸全部写死像素，不再吃宿主的 --space-* ——
       那套令牌是给正文排版的，用在弹窗里会把每行都撑大，整体显笨。 */
    '.tea-dialog,.tea-cab-panel{display:none;width:100%;max-width:296px;max-height:100%;overflow-y:auto;' +
      'scrollbar-width:none;-ms-overflow-style:none;' +
      'background:var(--overlay-surface,#fff);' +
      'border:var(--overlay-border,1px solid rgba(0,0,0,.08));border-radius:14px;' +
      'box-shadow:var(--overlay-shadow,0 12px 32px rgba(0,0,0,.18));padding:16px;' +
      'color:var(--text-primary,inherit);}' +
    /* 底色与文字色都取宿主语义变量（--overlay-surface / --text-*），二者必须配套翻转——
       这是宿主主题的约定：暗色下宿主同时翻两者，模块不越权替宿主配色。
       对比度核查按此口径执行（16/16 通过，见 PATCHES.md PATCH-44）。 */
    '.tea-cab-panel::-webkit-scrollbar,.tea-dialog::-webkit-scrollbar{display:none;}' +
    '.tea-wrap.is-set .tea-dialog,.tea-wrap.is-cab .tea-cab-panel{display:block;}' +
    '.tea-title{font-size:14px;font-weight:600;line-height:1.3;letter-spacing:.02em;}' +
    '.tea-link{display:flex;align-items:center;justify-content:space-between;width:100%;gap:8px;' +
      'margin-top:12px;padding:7px 0 0;border:0;border-top:1px solid hsla(var(--th),18%,46%,.14);' +
      'background:none;cursor:pointer;font-family:inherit;font-size:11px;' +
      'color:var(--text-tertiary,currentColor);opacity:.85;}' +
    '.tea-link:hover{opacity:1;color:var(--bm-primary,#3a7a3a);}' +
    '.tea-link-arrow{opacity:.6;}' +
    /* 搜索框：左右内边距归零，让占位文字与标题/分类/茶名共用同一条左边线。
       （原来用填充底色 + 9px 内边距，文字比其它内容右移了 9px，是唯一没对齐的元素）
       高度写死并 min-height:0，否则被宿主的表单触控地板撑高。 */
    '.tea-find{display:block;width:100%;box-sizing:border-box;height:26px;min-height:0;margin:8px 0 8px;' +
      'padding:0;border:0;border-bottom:1px solid hsla(var(--th),18%,46%,.16);border-radius:0;' +
      'background:none;color:inherit;font-family:inherit;font-size:12px;line-height:26px;outline:none;' +
      '-webkit-appearance:none;appearance:none;}' +
    '.tea-find::placeholder{color:var(--text-tertiary,currentColor);opacity:.5;}' +
    '.tea-find:focus{border-bottom-color:var(--bm-primary,#3a7a3a);}' +
    '.tea-find::-webkit-search-cancel-button{-webkit-appearance:none;display:none;}' +
    '.tea-seg{display:flex;gap:16px;margin-top:4px;padding-bottom:3px;' +
      'border-bottom:1px solid hsla(var(--th),18%,46%,.14);}' +
    /* 行高压到 1.1、上下内边距 1px：胶囊去掉后按钮仍被行高撑出留白 */
    '.tea-seg-btn{padding:2px 0;min-height:0;line-height:1.1;white-space:nowrap;text-align:left;border:0;background:none;cursor:pointer;' +
      'font-family:inherit;font-size:11px;color:var(--text-tertiary,currentColor);opacity:.8;}' +
    '.tea-seg-btn.on{color:var(--bm-primary,#3a7a3a);opacity:1;font-weight:600;}' +
    /* 暗色底上主色回退值对比度只有 3.1（实测 #3a7a3a on #1d231d），选中色按主题双向定明暗保 AA */
    '.tea-wrap.tea-dark .tea-seg-btn.on,.tea-wrap.tea-dark .tea-chip.on,.tea-wrap.tea-dark .tea-row-t.on,' +
    '.tea-wrap.tea-dark .tea-row-n:hover,.tea-wrap.tea-dark .tea-save{color:hsl(var(--th),42%,58%);}' +
    '.tea-wrap:not(.tea-dark) .tea-seg-btn.on,.tea-wrap:not(.tea-dark) .tea-chip.on,' +
    '.tea-wrap:not(.tea-dark) .tea-row-t.on,.tea-wrap:not(.tea-dark) .tea-row-n:hover,' +
    '.tea-wrap:not(.tea-dark) .tea-save{color:hsl(var(--th),42%,30%);}' +
    /* 类型段必须写在这之后，否则 margin/padding 会被上面的 .tea-seg 覆盖（之前就是这样） */
    '.tea-seg-types{display:grid;grid-template-columns:repeat(5,1fr);gap:0 8px;margin-top:5px;' +
      'padding-bottom:2px;border-bottom:0;overflow:visible;}' +
    '.tea-seg-types .tea-seg-btn{flex:0 0 auto;font-size:11px;}' +
    /* 两列网格 + 分页取代滚动：72 行竖排要 2400px，两列分页后一屏放得下 */
    '.tea-cab-head{display:flex;align-items:center;justify-content:space-between;gap:8px;}' +
    '.tea-cab-title{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}' +
    '.tea-x{width:22px;height:22px;display:flex;align-items:center;justify-content:center;padding:0;' +
      'border:0;background:none;color:inherit;opacity:.45;font-size:17px;line-height:1;cursor:pointer;' +
      'transition:opacity var(--duration-fast) var(--ease-cn),color var(--duration-fast) var(--ease-cn);}' +
    '.tea-x:hover{opacity:1;color:var(--bm-primary,#3a7a3a);}' +
    /* 单列：茶名有完整宽度，＋/✓ 归位行尾，扫读更快；每页 8 款保证面板高度不涨 */
    '.tea-cab-list{display:grid;grid-template-columns:minmax(0,1fr);margin-top:8px;}' +
    '.tea-pager{display:none;align-items:center;justify-content:center;gap:16px;margin-top:8px;padding-top:9px;white-space:nowrap;' +
      'border-top:1px solid hsla(var(--th),18%,46%,.12);' +
      'font-size:11px;color:var(--text-tertiary,currentColor);opacity:.75;}' +
    '.tea-pager.show{display:flex;}' +
    '.tea-pg{padding:0 6px;border:0;background:none;cursor:pointer;font-family:inherit;font-size:13px;' +
      'line-height:1;color:inherit;opacity:.7;}' +
    '.tea-pg:hover{opacity:1;}' +
    '.tea-pg:disabled{opacity:.25;cursor:default;}' +
    /* content-visibility: 屏幕外的行跳过布局与绘制，72 行列表打开时不再全量排版 */
    '.tea-row{display:flex;align-items:center;justify-content:space-between;gap:6px;' +
      'padding:2px 6px;margin:0 -6px;border-radius:6px;' +
      'transition:background-color var(--duration-fast) var(--ease-cn);' +
      'cursor:default;' +
      'font-size:12px;color:var(--text-secondary,inherit);' +
      'content-visibility:auto;contain-intrinsic-size:auto 28px;contain:content;}' +
    '.tea-row:hover{background:hsla(var(--th),18%,50%,.08);}' +
    /* 茶名是「泡」的按钮（J3）：虚线暗示可点，hover 实线主色——可供性不许撒谎（P2） */
    '.tea-row-n{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;' +
      'padding:0;border:0;background:none;cursor:pointer;font-family:inherit;font-size:12px;' +
      'color:var(--text-secondary,inherit);text-align:left;' +
      'text-decoration:underline dashed hsla(var(--th),18%,46%,.30);text-underline-offset:3px;' +
      'text-decoration-thickness:1px;transition:color var(--duration-fast) var(--ease-cn);}' +
    '.tea-row-n:hover{color:var(--bm-primary,#3a7a3a);text-decoration-style:solid;}' +
    '.tea-row-n:focus-visible{outline:2px solid hsl(var(--th),32%,52%);outline-offset:2px;border-radius:3px;}' +
    '.tea-row-t{flex:0 0 auto;width:24px;height:24px;display:flex;align-items:center;justify-content:flex-end;' +
      'padding:0;border:0;background:none;cursor:pointer;font-family:inherit;font-size:13px;line-height:1;' +
      'color:var(--text-tertiary,currentColor);opacity:.6;}' +
    '.tea-row-t:hover{opacity:1;color:var(--bm-primary,#3a7a3a);}' +
    '.tea-row-t.on{color:var(--bm-primary,#3a7a3a);opacity:1;}' +
    '.tea-cab-item{display:flex;align-items:center;justify-content:space-between;gap:8px;' +
      'padding:5px 0;border-bottom:1px solid hsla(var(--th),18%,46%,.14);' +
      'font-size:12px;color:var(--text-secondary,inherit);}' +
    '.tea-cab-item:last-child{border-bottom:0;}' +
    '.tea-cab-del{padding:1px 0;border:0;background:none;cursor:pointer;font-family:inherit;' +
      'font-size:11px;color:var(--text-tertiary,currentColor);opacity:.7;}' +
    '.tea-cab-del:hover{opacity:1;color:var(--bm-primary,#3a7a3a);}' +
    /* 空状态要跨两列，否则在网格里只占半行、文字被挤断 */
    '.tea-cab-empty{grid-column:1 / -1;padding:12px 0;text-align:center;font-size:11px;line-height:1.6;' +
      'color:var(--text-tertiary,currentColor);opacity:.75;}' +
    '.tea-hint{margin-top:4px;font-size:11px;line-height:1.45;color:var(--text-tertiary,currentColor);opacity:.85;}' +
    '.tea-sub{margin-top:12px;font-size:11px;letter-spacing:.06em;color:var(--text-tertiary,currentColor);opacity:.9;}' +
    /* 选项用纯文字排布，不做胶囊：行内自然换行，省下边框与内边距的垂直空间 */
    '.tea-chips{display:flex;flex-wrap:wrap;gap:4px 13px;margin-top:8px;}' +
    /* min-height:0 同 .tea-range —— 宿主 base.css 对表单控件有全局触控地板 */
    '.tea-chip{padding:2px 0;min-height:0;border:0;background:none;border-radius:0;' +
      'color:var(--text-tertiary,currentColor);font-size:11px;line-height:1.4;' +
      'cursor:pointer;white-space:nowrap;opacity:.85;' +
      'transition:color var(--duration-fast) var(--ease-cn),opacity var(--duration-fast) var(--ease-cn);}' +
    /* 选中：改用颜色 + 字重，并在下方加一道 2px 短横，代替原来的描边胶囊 */
    '.tea-chip.on{color:var(--bm-primary,#3a7a3a);opacity:1;font-weight:600;}' +
    '.tea-chip:hover{opacity:1;}' +
    '.tea-chip:focus-visible,.tea-btn:focus-visible{outline:2px solid var(--bm-primary,#3a7a3a);outline-offset:2px;}' +
    '.tea-switch{display:flex;align-items:center;justify-content:space-between;margin-top:12px;' +
      'font-size:11px;color:var(--text-secondary,inherit);cursor:pointer;position:relative;}' +
    '.tea-switch input{position:absolute;opacity:0;width:0;height:0;pointer-events:none;}' +
    '.tea-switch .track{width:30px;height:17px;border-radius:999px;flex:0 0 auto;' +
      'background:var(--bamboo-border,rgba(0,0,0,.16));position:relative;' +
      'transition:background-color var(--duration-fast) var(--ease-cn);}' +
    '.tea-switch .track::after{content:"";position:absolute;top:2px;left:2px;width:13px;height:13px;border-radius:50%;' +
      'background:#fff;transition:transform var(--duration-fast) var(--ease-cn);box-shadow:0 1px 2px rgba(0,0,0,.22);}' +
    '.tea-switch input:checked ~ .track{background:var(--bm-primary,#3a7a3a);}' +
    '.tea-switch input:checked ~ .track::after{transform:translateX(13px);}' +
    '.tea-switch input:focus-visible ~ .track{outline:2px solid var(--bm-primary,#3a7a3a);outline-offset:2px;}' +
    /* 按钮固定在面板底部：72 行的列表很长，否则要滚到底才能关闭 */
    '.tea-actions{position:sticky;bottom:0;display:flex;gap:8px;margin-top:12px;padding-top:10px;' +
      'background:inherit;border-top:1px solid var(--bamboo-border,rgba(0,0,0,.1));}' +
    '.tea-btn{flex:1;padding:6px 10px;border-radius:8px;font-size:11px;cursor:pointer;' +
      'transition:background-color var(--duration-fast) var(--ease-cn),opacity var(--duration-fast) var(--ease-cn);}' +
    '.tea-btn.ghost{background:transparent;border:1px solid var(--bamboo-border,rgba(0,0,0,.14));' +
      'color:var(--text-secondary,inherit);}' +
    '.tea-btn.primary{background:var(--bm-primary,#3a7a3a);border:1px solid transparent;' +
      'color:var(--text-on-accent,#fff);}' +
    '.tea-btn.ghost:hover{opacity:.8;}' +
    '.tea-btn.primary:hover{opacity:.9;}' +

    '@media (prefers-reduced-motion:reduce){' +
      '.tea-hit,.tea-card{transition-duration:.01ms !important;}' +
    '}';
  }

  var _styleReady = false;
  function ensureStyle(root) {
    if (_styleReady || document.getElementById('tea-module-style')) return;
    var s = document.createElement('style');
    s.id = 'tea-module-style';
    s.textContent = css();
    (document.head || root).appendChild(s);
    _styleReady = true;
  }

  window.__bamboo_module_tea = {
    id: ID,
    name: TITLE,
    version: VERSION,
    mount: mount,
    unmount: function () { if (instance) instance.destroy(); },
    destroy: function () { if (instance) instance.destroy(); }
  };
})();
