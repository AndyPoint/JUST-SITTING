/* Nature listening — the circle on the screen.
   Sand, an ensō, and a frame that returns slightly smaller and turned.
   Drawn after the plate in just-sitting.html. Part of JUST SITTING, AGPL-3.0-or-later. */
var NatureView = (function () {
  var TAU = Math.PI * 2;
  var SAND = [0.914, 0.89, 0.839];
  var VOID = [11 / 255, 11 / 255, 11 / 255];
  var INKS = {
    WHITE: [[0.98, 0.965, 0.935], [0.90, 0.935, 0.97]],
    RED: [[1.0, 0.227, 0.118], [0.83, 0.13, 0.09]]
  };

  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function smooth(a, b, x) {
    var t = clamp((x - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  }

  function makeEnso(doc) {
    var enso = {
      cv: doc.createElement("canvas"), ctx: null, dabs: [], drawn: 0, dirty: true, inner: 0.93,
      init: function () { this.ctx = this.cv.getContext("2d", { alpha: false }); }
    };
    enso.init();
    enso.make = function (r, W, H, cx, cy, RE) {
      var d = [];
      var sweep = TAU * (0.88 + 0.07 * r()), a0 = r() * TAU, dir = r() < 0.5 ? 1 : -1;
      var Wd = 0.065 + 0.03 * r(), steps = 900, B = 22;
      var ph1 = r() * TAU, ph2 = r() * TAU, wob = 0.006 + 0.01 * r();
      var bristles = [];
      for (var b = 0; b < B; b++) {
        var o = b / (B - 1) - 0.5;
        bristles.push({ o: o + (r() - 0.5) * 0.015, load: 0.85 + 0.15 * r(), dry: (0.6 + 0.6 * r()) * (0.5 + 1.2 * Math.abs(o)) });
      }
      for (var s = 0; s <= steps; s++) {
        var t = s / steps, ang = a0 + dir * sweep * t;
        var press = (0.6 + 0.4 * smooth(0, 0.03, t)) * (1 + 0.35 * Math.exp(-t * 12)) * (1 - 0.6 * smooth(0.8, 1, t));
        var width = Wd * press;
        var rad = 1 + wob * Math.sin(2 * ang + ph1) + 0.6 * wob * Math.sin(5 * ang + ph2) + 0.014 * t;
        var nx = Math.cos(ang), ny = Math.sin(ang);
        for (var bi = 0; bi < bristles.length; bi++) {
          var bz = bristles[bi];
          var load = bz.load - bz.dry * Math.pow(smooth(0.35, 1, t), 1.2) * 0.9 + (r() - 0.5) * 0.1;
          if (load <= 0.05 || r() > smooth(0.05, 0.3, load)) continue;
          var off = bz.o * width + (r() - 0.5) * width * 0.025;
          d.push({
            x: (rad + off) * nx, y: (rad + off) * ny,
            r: (width / B) * (1.4 + 0.8 * r()),
            w: clamp(load * (1 - 0.7 * Math.abs(bz.o)), 0.05, 1),
            t: t
          });
        }
      }
      var inner = d.map(function (q) { return Math.hypot(q.x, q.y) - q.r; }).sort(function (a, b) { return a - b; });
      enso.inner = inner[Math.floor(inner.length * 0.03)] || 0.93;
      enso.dabs = d;
      enso.drawn = 0;
      enso.place(W, H, cx, cy, RE);
    };
    enso.place = function (W, H, cx, cy, RE) {
      var WS = 0.5;
      enso.WS = WS; enso.cx = cx; enso.cy = cy; enso.RE = RE;
      enso.cv.width = Math.max(1, Math.ceil(W * WS));
      enso.cv.height = Math.max(1, Math.ceil(H * WS));
      enso.redraw();
    };
    enso.clear = function () {
      var c = enso.ctx;
      c.globalCompositeOperation = "source-over";
      c.fillStyle = "#000";
      c.fillRect(0, 0, enso.cv.width, enso.cv.height);
      enso.dirty = true;
    };
    enso.redraw = function () {
      var p = enso.drawn ? enso.dabs[enso.drawn - 1].t : 0;
      enso.clear();
      enso.drawn = 0;
      if (p > 0) enso.draw(p);
    };
    enso.draw = function (progress) {
      var c = enso.ctx, WS = enso.WS || 0.5;
      c.globalCompositeOperation = "lighter";
      var i = enso.drawn;
      while (i < enso.dabs.length && enso.dabs[i].t <= progress) {
        var q = enso.dabs[i];
        c.fillStyle = "rgba(255,255,255," + (q.w * 0.16).toFixed(3) + ")";
        c.beginPath();
        c.arc((enso.cx + q.x * enso.RE) * WS, (enso.cy + q.y * enso.RE) * WS, Math.max(0.6, q.r * enso.RE * WS), 0, TAU);
        c.fill();
        i++;
      }
      if (i > enso.drawn) { enso.drawn = i; enso.dirty = true; }
    };
    return enso;
  }

  function mount(canvas) {
    var doc = canvas.ownerDocument;
    var gl = null;
    try {
      gl = canvas.getContext("webgl2", { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false });
    } catch (e) {}
    var ctx2d = gl ? null : canvas.getContext("2d");
    var enso = makeEnso(doc);
    var ink = "WHITE";
    var W = 2, H = 2, dpr = 1, cx = 1, cy = 1, Rp = 1, cell = 2;
    var primed = false;
    var reduce = false;
    try { reduce = doc.defaultView.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}

    var feed, pts, out, tri, pv, pb, wetTex, targets, cur, ptsData;
    if (gl) {
      var VS = "#version 300 es\nlayout(location=0) in vec2 p; void main(){ gl_Position = vec4(p,0.,1.); }";
      var FEED = "#version 300 es\nprecision highp float; out vec4 o; uniform sampler2D prev; uniform vec2 res; uniform vec2 ctr; uniform float zoom; uniform float rot; uniform float echo; uniform float eps;\n" +
        "void main(){ vec2 px = gl_FragCoord.xy - ctr; float c = cos(rot), s = sin(rot); vec2 q = vec2(c*px.x + s*px.y, -s*px.x + c*px.y)/zoom + ctr; vec2 t = q/res; vec3 col = vec3(0.);\n" +
        " if (t.x >= 0. && t.y >= 0. && t.x <= 1. && t.y <= 1.) col = texture(prev, t).rgb; o = vec4(max(col*echo - eps, 0.), 1.); }";
      var PVS = "#version 300 es\nlayout(location=0) in vec2 p; uniform vec2 res; uniform vec2 ctr; uniform float rad; uniform float psize; void main(){ vec2 s = ctr + p*rad; gl_Position = vec4(s/res*2.-1., 0., 1.); gl_PointSize = psize; }";
      var PFS = "#version 300 es\nprecision mediump float; uniform vec3 col; out vec4 o; void main(){ o = vec4(col, 1.); }";
      var OUT = "#version 300 es\nprecision highp float; out vec4 o; uniform sampler2D fb; uniform sampler2D wetmap; uniform vec2 res; uniform vec3 voidc; uniform vec3 inkA; uniform vec3 inkB; uniform float level; uniform float wetOn; uniform float cell;\n" +
        "float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }\n" +
        "void main(){ vec2 cc = floor(gl_FragCoord.xy / cell); float w = texture(wetmap, (cc + 0.5) * cell / res).r; float n = h(cc), n2 = h(cc + 17.17);\n" +
        " float on = step((0.045 + level) * (0.75 + 0.5 * n), w) * wetOn; vec3 ink = mix(inkA, inkB, n2) * (0.84 + 0.16 * clamp(w, 0., 1.));\n" +
        " o = vec4(mix(voidc, ink, on) + texture(fb, gl_FragCoord.xy / res).rgb, 1.); }";
      function sh(type, src) {
        var s = gl.createShader(type);
        gl.shaderSource(s, src);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
        return s;
      }
      function prog(vs, fs) {
        var p = gl.createProgram();
        gl.attachShader(p, sh(gl.VERTEX_SHADER, vs));
        gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
        gl.linkProgram(p);
        if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
        var un = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
        for (var i = 0; i < n; i++) {
          var inf = gl.getActiveUniform(p, i);
          un[inf.name] = gl.getUniformLocation(p, inf.name);
        }
        return { p: p, u: un };
      }
      try {
        feed = prog(VS, FEED); pts = prog(PVS, PFS); out = prog(VS, OUT);
      } catch (err) {
        console.warn(err);
        gl = null;
        ctx2d = canvas.getContext("2d");
      }
    }
    if (gl) {
      tri = gl.createVertexArray(); gl.bindVertexArray(tri);
      var tb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, tb);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      pv = gl.createVertexArray(); gl.bindVertexArray(pv);
      pb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, pb);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.bindVertexArray(null);
      function tex(filter) {
        var t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        return t;
      }
      wetTex = tex(gl.LINEAR);
      targets = [];
      cur = 0;
      ptsData = new Float32Array(0);
    }

    function resizeTargets() {
      if (!gl) return;
      for (var i = 0; i < targets.length; i++) {
        gl.deleteTexture(targets[i].tex);
        gl.deleteFramebuffer(targets[i].fbo);
      }
      targets = [0, 1].map(function () {
        var t = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        var f = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, f);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
        gl.viewport(0, 0, W, H);
        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
        return { tex: t, fbo: f };
      });
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    function uploadWet() {
      if (!gl) return;
      gl.bindTexture(gl.TEXTURE_2D, wetTex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, enso.cv);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    }

    var view = {
      enso: enso,
      gl: !!gl,
      layout: function (cssW, cssH) {
        dpr = Math.min((doc.defaultView.devicePixelRatio || 1), 2);
        W = Math.max(2, Math.round(cssW * dpr));
        H = Math.max(2, Math.round(cssH * dpr));
        canvas.width = W; canvas.height = H;
        var m = Math.min(W, H);
        cx = W / 2; cy = H / 2;
        Rp = m * 0.331;
        var gap = m * 0.047;
        cell = Math.max(1, Math.round(dpr * clamp(Math.round(Math.min(cssW, cssH) / 280), 2, 5)));
        var RE = Rp + gap;
        enso._RE = RE; enso._gap = gap; enso.cx = cx; enso.cy = cy;
        var pw = Math.max(1, Math.ceil(W * 0.5)), ph = Math.max(1, Math.ceil(H * 0.5));
        if (enso.cv.width !== pw || enso.cv.height !== ph) {
          enso.cv.width = pw; enso.cv.height = ph;
          enso.clear();
        }
        resizeTargets();
        if (enso.cv.width > 1) uploadWet();
        return { W: W, H: H, Rp: Rp, dpr: dpr };
      },
      clearPaper: function () { enso.clear(); uploadWet(); },
      paper: function () {
        var R = enso._RE || Rp, WS = 0.5, c = enso.ctx;
        function dab(x, y, rad, alpha) {
          var a = alpha < 0 ? 0 : alpha > 1 ? 1 : alpha;
          c.globalCompositeOperation = "lighter";
          c.fillStyle = "rgba(255,255,255," + a.toFixed(3) + ")";
          c.beginPath();
          c.arc((cx + x * R) * WS, (cy + y * R) * WS, Math.max(0.45, rad * R * WS), 0, TAU);
          c.fill();
          enso.dirty = true;
        }
        return {
          dab: dab,
          fade: function (amount) {
            c.globalCompositeOperation = "source-over";
            c.fillStyle = "rgba(0,0,0," + amount + ")";
            c.fillRect(0, 0, enso.cv.width, enso.cv.height);
            enso.dirty = true;
          },
          fadeRim: function (amount) {
            var gx = cx * WS, gy = cy * WS, rad = R * WS;
            var g = c.createRadialGradient(gx, gy, rad * 0.2, gx, gy, rad * 1.08);
            g.addColorStop(0, "rgba(0,0,0,0)");
            g.addColorStop(0.55, "rgba(0,0,0,0)");
            g.addColorStop(1, "rgba(0,0,0," + amount + ")");
            c.globalCompositeOperation = "source-over";
            c.fillStyle = g;
            c.fillRect(0, 0, enso.cv.width, enso.cv.height);
            enso.dirty = true;
          }
        };
      },
      beginCycle: function (rng) {
        var RE = (Rp + (enso._gap || 0)) / 0.93;
        enso.make(rng, W, H, cx, cy, RE);
        var fitted = (Rp + (enso._gap || Math.min(W, H) * 0.047)) / enso.inner;
        enso.place(W, H, cx, cy, fitted);
        uploadWet();
      },
      setInk: function (name) { ink = name === "RED" ? "RED" : "WHITE"; },
      strokeOn: true,
      frame: function (f) {
        if (!this.strokeOn && enso.dabs.length) enso.draw(f.draw || 0);
        if (enso.dirty) { uploadWet(); enso.dirty = false; }
        var echo = f.echo == null ? 0.9 : f.echo;
        var pa = 0.06 + 0.5 * (1 - echo);
        var psize = Math.max(1, 1.4 * dpr);
        if (!gl || !targets.length) return frame2d(f, pa, psize);
        var next = 1 - cur, A = targets[cur], B = targets[next];
        gl.bindFramebuffer(gl.FRAMEBUFFER, B.fbo);
        gl.viewport(0, 0, W, H);
        gl.useProgram(feed.p); gl.bindVertexArray(tri);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, A.tex); gl.uniform1i(feed.u.prev, 0);
        gl.uniform2f(feed.u.res, W, H); gl.uniform2f(feed.u.ctr, W / 2, H / 2);
        gl.uniform1f(feed.u.zoom, reduce ? 1 : Math.pow(0.9965, f.dtf || 1));
        gl.uniform1f(feed.u.rot, reduce ? 0 : 0.0022 * (f.dtf || 1));
        gl.uniform1f(feed.u.echo, Math.pow(echo, f.dtf || 1));
        gl.uniform1f(feed.u.eps, 0.7 / 255);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        var n = f.n || 0;
        if (ptsData.length !== n * 2) ptsData = new Float32Array(n * 2);
        for (var i = 0; i < n; i++) { ptsData[2 * i] = f.px[i]; ptsData[2 * i + 1] = f.py[i]; }
        gl.useProgram(pts.p); gl.bindVertexArray(pv); gl.bindBuffer(gl.ARRAY_BUFFER, pb);
        gl.bufferData(gl.ARRAY_BUFFER, ptsData, gl.DYNAMIC_DRAW);
        gl.uniform2f(pts.u.res, W, H); gl.uniform2f(pts.u.ctr, W / 2, H / 2);
        gl.uniform1f(pts.u.rad, Rp); gl.uniform1f(pts.u.psize, psize);
        gl.uniform3f(pts.u.col, SAND[0] * pa, SAND[1] * pa, SAND[2] * pa);
        gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
        gl.drawArrays(gl.POINTS, 0, n);
        gl.disable(gl.BLEND);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, W, H);
        gl.useProgram(out.p); gl.bindVertexArray(tri);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, B.tex); gl.uniform1i(out.u.fb, 0);
        gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, wetTex); gl.uniform1i(out.u.wetmap, 1);
        var pair = INKS[ink];
        gl.uniform2f(out.u.res, W, H);
        gl.uniform3f(out.u.voidc, VOID[0], VOID[1], VOID[2]);
        gl.uniform3f(out.u.inkA, pair[0][0], pair[0][1], pair[0][2]);
        gl.uniform3f(out.u.inkB, pair[1][0], pair[1][1], pair[1][2]);
        gl.uniform1f(out.u.level, f.level || 0);
        gl.uniform1f(out.u.wetOn, f.wetOn == null ? 1 : f.wetOn);
        gl.uniform1f(out.u.cell, cell);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.bindVertexArray(null);
        cur = next;
      }
    };

    function frame2d(f, pa, psize) {
      var echo = f.echo == null ? 0.9 : f.echo;
      ctx2d.globalCompositeOperation = "source-over";
      ctx2d.globalAlpha = 1;
      if (!primed) {
        ctx2d.fillStyle = "#0B0B0B";
        ctx2d.fillRect(0, 0, W, H);
        primed = true;
      }
      ctx2d.fillStyle = "rgba(11,11,11," + (1 - Math.pow(echo, f.dtf || 1)).toFixed(3) + ")";
      ctx2d.fillRect(0, 0, W, H);
      if ((f.wetOn == null ? 1 : f.wetOn) > 0 && enso.cv.width > 1) {
        ctx2d.save();
        ctx2d.globalCompositeOperation = "screen";
        ctx2d.globalAlpha = clamp(1 - (f.level || 0) / 1.35, 0, 1);
        ctx2d.imageSmoothingEnabled = false;
        ctx2d.drawImage(enso.cv, 0, 0, W, H);
        ctx2d.restore();
      }
      ctx2d.globalCompositeOperation = "lighter";
      ctx2d.globalAlpha = pa * 2.2;
      ctx2d.fillStyle = "rgb(233,227,214)";
      ctx2d.beginPath();
      var n = f.n || 0, s = psize;
      for (var i = 0; i < n; i++) {
        ctx2d.rect(cx + f.px[i] * Rp - s / 2, cy - f.py[i] * Rp - s / 2, s, s);
      }
      ctx2d.fill();
    }

    return view;
  }

  return { mount: mount, INKS: INKS };
})();
