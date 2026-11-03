/* Nature listening — the plate.
   The same circular membrane as JUST SITTING: sand leaves where the plate
   moves and rests where it is still. Part of JUST SITTING, AGPL-3.0-or-later.
   The Bessel table and the particle step follow just-sitting.html. */
var NaturePlate = (function () {
  var TAU = Math.PI * 2;
  var BREATH = 10;
  var INHALE = 0.4;
  var GRID = 160;
  var MMAX = 12, NMAX = 4, XMAX = 44, BTAB = 4096;
  var KMAX_TRUE = 28;
  var F0 = 65.41;

  function makeRng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function smooth(a, b, x) {
    var t = clamp((x - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  }
  function breathCurve(phase) {
    return phase < INHALE
      ? (1 - Math.cos((Math.PI * phase) / INHALE)) / 2
      : (1 + Math.cos((Math.PI * (phase - INHALE)) / (1 - INHALE))) / 2;
  }

  var BES = (function () {
    var S = 128, out = [];
    for (var m = 0; m <= MMAX; m++) {
      var arr = new Float32Array(BTAB + 2);
      for (var i = 0; i <= BTAB + 1; i++) {
        var x = (i / BTAB) * XMAX;
        var sum = 0;
        for (var k = 0; k <= S; k++) {
          var t = (Math.PI * k) / S;
          var w = k === 0 || k === S ? 1 : k % 2 ? 4 : 2;
          sum += w * Math.cos(m * t - x * Math.sin(t));
        }
        arr[i] = sum / (3 * S);
      }
      out.push(arr);
    }
    return out;
  })();

  function J(m, x) {
    if (x < 0) x = -x;
    var f = (x / XMAX) * BTAB;
    if (f >= BTAB) return 0;
    var i = f | 0, t = f - i, a = BES[m];
    return a[i] + (a[i + 1] - a[i]) * t;
  }

  var ZEROS = BES.map(function (a, m) {
    var zs = [];
    for (var i = 1; i < BTAB && zs.length < NMAX; i++) {
      var x = (i / BTAB) * XMAX;
      if (x < m * 0.9) continue;
      if (a[i] * a[i + 1] < 0) zs.push(((i + a[i] / (a[i] - a[i + 1])) / BTAB) * XMAX);
    }
    return zs;
  });
  var J01 = ZEROS[0][0];
  var TRUE_MODES = [];
  for (var m = 0; m <= MMAX; m++) {
    for (var n = 1; n <= NMAX; n++) {
      var kk = ZEROS[m][n - 1];
      if (kk && kk <= KMAX_TRUE) TRUE_MODES.push({ m: m, n: n, k: kk });
    }
  }
  TRUE_MODES.sort(function (p, q) { return p.k - q.k; });

  var gridCache = new Map();
  function modeGrid(m, k, phi) {
    var key = m + ":" + k.toFixed(4) + ":" + phi.toFixed(3);
    if (gridCache.has(key)) return gridCache.get(key);
    var g = new Float32Array(GRID * GRID);
    var mx = 1e-6;
    for (var y = 0; y < GRID; y++) {
      var py = ((y + 0.5) / GRID) * 2 - 1;
      for (var x = 0; x < GRID; x++) {
        var px = ((x + 0.5) / GRID) * 2 - 1;
        var r = Math.hypot(px, py);
        var v = 0;
        if (r <= 1.08) v = J(m, k * r) * Math.cos(m * Math.atan2(py, px) + phi);
        g[y * GRID + x] = v;
        if (r <= 1 && Math.abs(v) > mx) mx = Math.abs(v);
      }
    }
    for (var i = 0; i < g.length; i++) g[i] /= mx;
    if (gridCache.size > 32) gridCache.delete(gridCache.keys().next().value);
    gridCache.set(key, g);
    return g;
  }

  function chooseModes(stats) {
    var r = makeRng(stats.seed >>> 0);
    var c = stats.c !== undefined ? stats.c : clamp((stats.mu - 0.05) / 1.2, 0, 1);
    var count = stats.count || (stats.sigma > 0.35 ? 3 : stats.sigma > 0.15 ? 2 : 1);
    var amp = 0.3 + 0.7 * c;
    var modes = [];
    var N = TRUE_MODES.length;
    var i1 = clamp(Math.round(c * (N - 1) * 0.92 + (r() - 0.5) * 3), 0, N - 1) | 0;
    var used = {};
    used[i1] = true;
    modes.push(Object.assign({}, TRUE_MODES[i1], { w: 1, phi: r() * TAU }));
    for (var tries = 0; modes.length < count && tries < 40; tries++) {
      var i = clamp(i1 + (r() < 0.5 ? -1 : 1) * (1 + ((r() * 5) | 0)), 0, N - 1) | 0;
      if (used[i]) continue;
      used[i] = true;
      modes.push(Object.assign({}, TRUE_MODES[i], { w: 0.45 + 0.25 * r(), phi: r() * TAU }));
    }
    for (var j = 0; j < modes.length; j++) modes[j].f = F0 * modes[j].k / J01;
    return { modes: modes, amp: amp, c: c };
  }

  function makeField() {
    return {
      F: new Float32Array(GRID * GRID),
      GX: new Float32Array(GRID * GRID),
      GY: new Float32Array(GRID * GRID),
      gscale: 1
    };
  }

  function combine(field, layers) {
    var F = field.F, GX = field.GX, GY = field.GY;
    F.fill(0);
    var wsum = 0;
    for (var a = 0; a < layers.length; a++) if (layers[a].w > 1e-3) wsum += layers[a].w;
    if (wsum < 1e-3) { GX.fill(0); GY.fill(0); return; }
    for (var b = 0; b < layers.length; b++) {
      var L = layers[b];
      if (L.w <= 1e-3) continue;
      var g = L.grid, w = L.w / wsum;
      for (var i = 0; i < F.length; i++) F[i] += w * g[i];
    }
    var s = GRID / 4;
    var gsum = 0, gn = 0;
    for (var y = 0; y < GRID; y++) {
      var ym = y > 0 ? y - 1 : y, yp = y < GRID - 1 ? y + 1 : y;
      var py = ((y + 0.5) / GRID) * 2 - 1;
      for (var x = 0; x < GRID; x++) {
        var xm = x > 0 ? x - 1 : x, xp = x < GRID - 1 ? x + 1 : x;
        var i = y * GRID + x;
        GX[i] = (F[y * GRID + xp] - F[y * GRID + xm]) * s;
        GY[i] = (F[yp * GRID + x] - F[ym * GRID + x]) * s;
        var px = ((x + 0.5) / GRID) * 2 - 1;
        if (px * px + py * py < 1) { gsum += Math.abs(GX[i]) + Math.abs(GY[i]); gn++; }
      }
    }
    field.gscale = clamp(6 / (gsum / Math.max(1, gn) + 1e-3), 0.5, 8);
  }

  function makeParticles(n) {
    return { n: n, x: new Float32Array(n), y: new Float32Array(n) };
  }
  function scatterParticles(P, r) {
    for (var i = 0; i < P.n; i++) {
      var a = r() * TAU, d = Math.sqrt(r()) * 0.98;
      P.x[i] = d * Math.cos(a);
      P.y[i] = d * Math.sin(a);
    }
  }
  function stepParticles(P, field, vib, rnd) {
    var F = field.F, GX = field.GX, GY = field.GY;
    var n = P.n, X = P.x, Y = P.y;
    var jit = 0.018 * vib, pull = 0.0006 * vib * (field.gscale || 1);
    var half = GRID * 0.5, maxI = GRID - 1.001;
    var moved = 0;
    for (var i = 0; i < n; i++) {
      var x = X[i], y = Y[i];
      var fx = (x + 1) * half - 0.5, fy = (y + 1) * half - 0.5;
      fx = fx < 0 ? 0 : fx > maxI ? maxI : fx;
      fy = fy < 0 ? 0 : fy > maxI ? maxI : fy;
      var ix = fx | 0, iy = fy | 0, tx = fx - ix, ty = fy - iy;
      var i00 = iy * GRID + ix, i10 = i00 + 1, i01 = i00 + GRID, i11 = i01 + 1;
      var w00 = (1 - tx) * (1 - ty), w10 = tx * (1 - ty), w01 = (1 - tx) * ty, w11 = tx * ty;
      var u = F[i00] * w00 + F[i10] * w10 + F[i01] * w01 + F[i11] * w11;
      var gx = GX[i00] * w00 + GX[i10] * w10 + GX[i01] * w01 + GX[i11] * w11;
      var gy = GY[i00] * w00 + GY[i10] * w10 + GY[i01] * w01 + GY[i11] * w11;
      var a = u < 0 ? -u : u;
      var dx = (rnd() - 0.5) * 2 * jit * a - pull * u * gx;
      var dy = (rnd() - 0.5) * 2 * jit * a - pull * u * gy;
      x += dx; y += dy;
      var rr = x * x + y * y;
      if (rr > 0.9801) { var rad = Math.sqrt(rr), sc = (1.98 - rad) / rad; x *= sc; y *= sc; }
      X[i] = x; Y[i] = y;
      moved += (dx < 0 ? -dx : dx) + (dy < 0 ? -dy : dy);
    }
    return moved / n;
  }

  function rankIn(sorted, x) {
    var lo = 0, hi = sorted.length;
    while (lo < hi) {
      var mid = (lo + hi) >> 1;
      if (sorted[mid] < x) lo = mid + 1;
      else hi = mid;
    }
    return sorted.length > 1 ? lo / (sorted.length - 1) : 0.5;
  }

  return {
    TAU: TAU, BREATH: BREATH, INHALE: INHALE, GRID: GRID, F0: F0, J01: J01,
    TRUE_MODES: TRUE_MODES,
    clamp: clamp, smooth: smooth, breathCurve: breathCurve, makeRng: makeRng,
    J: J, chooseModes: chooseModes, modeGrid: modeGrid,
    makeField: makeField, combine: combine,
    makeParticles: makeParticles, scatterParticles: scatterParticles, stepParticles: stepParticles,
    rankIn: rankIn
  };
})();
