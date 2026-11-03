/* Ensō strokes. One gesture per work, drawn as grains.
   The stroke stays open. It closes on the last breath of the cycle.
   Dolphin never draws the circle; echoes reveal it.
   Part of JUST SITTING, AGPL-3.0-or-later. */
var NatureStrokes = (function () {
  var TAU = Math.PI * 2;
  var GOLD = Math.PI * (3 - Math.sqrt(5));

  /* How far around the circle a stroke has travelled.
     Before the last breath it stops short of a full turn. */
  function openAngle(pos, last, close) {
    var gap = last ? (1 - close) * 0.55 : 0.55;
    var p = pos < 0 ? 0 : pos > 1 ? 1 : pos;
    return -Math.PI / 2 + p * (TAU - gap);
  }

  function grainsOnArc(paper, radius, from, to, step, rad, alpha) {
    if (to < from) return;
    for (var a = from; a <= to; a += step) {
      paper.dab(Math.cos(a) * radius, Math.sin(a) * radius, rad, alpha);
    }
  }

  /* Close the gap that sits across the top of the circle. */
  function closeGap(paper, amount, radius) {
    var full = 0.55;
    var left = full * (1 - (amount < 0 ? 0 : amount > 1 ? 1 : amount));
    var start = -Math.PI / 2 - full;
    var end = -Math.PI / 2 - left;
    grainsOnArc(paper, radius || 0.96, start, end, 0.045, 0.018, 0.55);
  }

  function mycelium() {
    var tips = [];
    var ready = false;
    return {
      reset: function () { tips = []; ready = false; },
      step: function (paper, s) {
        if (!ready) {
          ready = true;
          for (var i = 0; i < 14; i++) {
            var a = openAngle(i / 13, false, 0);
            tips.push(tip(Math.cos(a) * 0.98, Math.sin(a) * 0.98, -Math.cos(a), -Math.sin(a), 0));
          }
          grainsOnArc(paper, 0.98, openAngle(0, false, 0), openAngle(1, false, 0), 0.02, 0.005, 0.16);
        }
        paper.fadeRim(0.045 + (s.energy < 0.08 ? 0.03 : 0));
        var spike = s.flux > 0.09 || s.bits > 1.15;
        var grow = 0.00012 + 0.00022 * (s.energy || 0);
        var next = [];
        for (var t = 0; t < tips.length; t++) {
          var p = tips[t];
          if (!p.alive) continue;
          var inward = Math.hypot(p.x, p.y) || 1;
          var wander = Math.sin(s.pos * 28 + t * 1.7) * 0.35;
          p.hx = p.hx * 0.82 - (p.x / inward) * 0.18 + wander * 0.08;
          p.hy = p.hy * 0.82 - (p.y / inward) * 0.18 + Math.cos(t * 0.9 + s.pos * 20) * 0.08;
          var h = Math.hypot(p.hx, p.hy) || 1;
          p.x += (p.hx / h) * grow;
          p.y += (p.hy / h) * grow;
          if (Math.hypot(p.x, p.y) < 0.04) { p.alive = false; continue; }
          paper.dab(p.x, p.y, 0.006, 0.22 + 0.35 * (s.energy || 0));
          if (spike && tips.length < 36 && p.gen < 3 && (t % 7) === 0) {
            next.push(tip(p.x, p.y, -p.hy, p.hx, p.gen + 1));
          }
          if ((s.energy || 0) < 0.04 && s.bits < 0.08 && (t % 11) === 0) p.alive = false;
          next.push(p);
        }
        tips = next.slice(0, 64);
        if (s.last) closeGap(paper, s.close, 0.98);
      }
    };
  }

  function tip(x, y, hx, hy, gen) {
    return { x: x, y: y, hx: hx, hy: hy, alive: true, gen: gen };
  }

  function tree() {
    var limbs = [];
    var ring = -1;
    return {
      reset: function () {
        limbs = [];
        ring = -1;
        for (var i = 0; i < 7; i++) {
          limbs.push({ a: -Math.PI / 2 + i * (TAU / 7), len: 0.9, grown: 0, depth: 0, x: 0, y: 0 });
        }
      },
      step: function (paper, s) {
        var vigor = 0.35 + 0.65 * (s.energy || 0);
        for (var i = 0; i < limbs.length; i++) {
          var L = limbs[i];
          var want = L.len * Math.min(1, s.pos * 1.05);
          if (L.grown >= want) continue;
          var step = Math.min(want - L.grown, 0.008 + 0.02 * vigor);
          var x0 = L.x + Math.cos(L.a) * L.grown;
          var y0 = L.y + Math.sin(L.a) * L.grown;
          L.grown += step;
          paper.dab(x0, y0, Math.max(0.008, 0.02 - L.depth * 0.004), 0.34 + 0.3 * vigor);
        }
        var b = s.breath | 0;
        if (b !== ring && b >= 0) {
          ring = b;
          var rad = 0.1 + 0.82 * ((b + 0.35) / s.breaths);
          var end = openAngle(1, s.last, s.close);
          grainsOnArc(paper, rad, openAngle(0, false, 0), end, 0.09, 0.009, 0.22);
          if (limbs.length > 0 && limbs.length < 40) {
            var parent = limbs[Math.min(limbs.length - 1, ((b % 7) + 7) % 7)];
            if (!parent) parent = limbs[0];
            var px = parent.x + Math.cos(parent.a) * parent.grown;
            var py = parent.y + Math.sin(parent.a) * parent.grown;
            limbs.push({ a: parent.a + 0.55, len: parent.len * 0.62, grown: 0, depth: parent.depth + 1, x: px, y: py });
            limbs.push({ a: parent.a - 0.55, len: parent.len * 0.62, grown: 0, depth: parent.depth + 1, x: px, y: py });
          }
        }
        if (s.last) closeGap(paper, s.close, 0.96);
      }
    };
  }

  function whale() {
    var prev = null;
    return {
      reset: function () { prev = null; },
      step: function (paper, s) {
        paper.fade(0.0004);
        var ang = openAngle(s.pos, s.last, s.close);
        var amp = (0.045 + 0.12 * (s.centroid || 0.25)) * (0.45 + 0.55 * (s.energy || 0));
        var rad = 0.9 + amp * Math.sin(ang * 3);
        var x = Math.cos(ang) * rad, y = Math.sin(ang) * rad;
        if (prev) {
          for (var u = 0; u <= 1; u += 0.34) {
            paper.dab(prev.x + (x - prev.x) * u, prev.y + (y - prev.y) * u, 0.009, 0.42);
          }
        } else paper.dab(x, y, 0.009, 0.42);
        prev = { x: x, y: y };
        if (s.last) closeGap(paper, s.close, 0.94);
      }
    };
  }

  function dolphin() {
    var pings = [];
    var echoes = [];
    var lastPing = -1;
    return {
      reset: function () { pings = []; echoes = []; lastPing = -1; },
      step: function (paper, s) {
        paper.fade(0.03);
        var hit = (s.flux || 0) > 0.08 || (s.bits || 0) > 0.45 || (s.energy || 0) > 0.55;
        if (hit && pings.length < 6 && (lastPing < 0 || s.pos - lastPing > 0.035 || s.pos < lastPing)) {
          lastPing = s.pos;
          pings.push({ r: 0.08, a: (s.pos * 7.3 + echoes.length * 0.4) % TAU, w: 0.7 });
        }
        var keep = [];
        for (var i = 0; i < pings.length; i++) {
          var p = pings[i];
          p.r += 0.01 + 0.018 * (s.energy || 0);
          var span = p.w * (1.1 - p.r);
          for (var da = -span; da <= span; da += 0.14) {
            paper.dab(Math.cos(p.a + da) * p.r, Math.sin(p.a + da) * p.r, 0.011, 0.22 * (1.05 - p.r));
          }
          if (p.r >= 0.93) {
            for (var k = -3; k <= 3; k++) echoes.push(p.a + k * 0.07);
            if (echoes.length > 700) echoes = echoes.slice(echoes.length - 700);
          } else keep.push(p);
        }
        pings = keep;
        for (var e = 0; e < echoes.length; e++) {
          var a = echoes[e];
          paper.dab(Math.cos(a) * 0.95, Math.sin(a) * 0.95, 0.016, 0.72);
        }
        if (s.last) {
          var bins = 48;
          var seen = new Array(bins);
          for (var n = 0; n < echoes.length; n++) {
            var bi = Math.floor(((echoes[n] % TAU) + TAU) % TAU / TAU * bins);
            seen[bi] = true;
          }
          for (var b = 0; b < bins * s.close; b++) {
            if (seen[b]) continue;
            var aa = (b + 0.5) / bins * TAU;
            paper.dab(Math.cos(aa) * 0.95, Math.sin(aa) * 0.95, 0.016, 0.55);
          }
        }
      }
    };
  }

  function plant() {
    var shown = -1;
    return {
      reset: function () { shown = -1; },
      step: function (paper, s) {
        var want = Math.min(s.breaths - (s.last ? 0 : 1), Math.floor(s.pos * s.breaths));
        while (shown < want) {
          shown++;
          var a = shown * GOLD;
          var rad = 0.16 + 0.78 * Math.sqrt((shown + 1) / (s.breaths + 1));
          var nx = Math.cos(a), ny = Math.sin(a);
          var px = -ny, py = nx;
          for (var u = 0.15; u <= 1; u += 0.07) {
            paper.dab(nx * rad * u, ny * rad * u, 0.008 + 0.01 * (1 - u), 0.36);
          }
          paper.dab(nx * rad + px * 0.045, ny * rad + py * 0.045, 0.028, 0.32 + 0.2 * (s.energy || 0));
          paper.dab(nx * rad - px * 0.045, ny * rad - py * 0.045, 0.028, 0.32 + 0.2 * (s.energy || 0));
        }
        if (s.last) closeGap(paper, s.close, 0.97);
      }
    };
  }

  function create(kind) {
    var stroke = kind === "mycelium" ? mycelium()
      : kind === "tree" ? tree()
      : kind === "dolphin" ? dolphin()
      : kind === "plant" ? plant()
      : whale();
    stroke.reset();
    return stroke;
  }

  return { create: create, openAngle: openAngle, GOLD: GOLD };
})();
