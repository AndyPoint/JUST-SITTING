/* Nature listening.
   A recording plays. The plate reads its surprise, once a breath,
   and shows it. The recording is not changed. Nothing is learned.
   Part of JUST SITTING, AGPL-3.0-or-later. */
(function () {
  var P = NaturePlate;
  var root = document.getElementById("nature");
  if (!root || !P) return;
  var $ = function (k) { return root.querySelector('[data-n="' + k + '"]'); };
  var canvas = $("plate");
  var audioEl = $("audio");
  var info = $("info");
  var panel = $("panel");
  var view = NatureView.mount(canvas);
  var reader = NatureListen.makeReader(NATURE_SOURCES[0].band);
  var rank = NatureListen.makeRank();

  var params = new URLSearchParams(location.search);
  var work = natureWork(params.get("work") || "whale");
  var lastNature = work.closed ? "whale" : work.id;
  var source = natureSource(work.voice || "file");
  var custom = null;
  var stroke = NatureStrokes.create(work.stroke || "whale");
  var openVoice = null;
  var shifter = null;
  var speed = 1;
  var tuning = 0;
  var sitting = false;
  var soundOn = true;
  var plateOn = true;
  var gain = 1;
  var echo = 0.9;
  var ink = "WHITE";
  var CYCLE = 11 * 60;
  var DRAW = 11;
  var HOLD = 25;
  var LEVEL_MAX = 1.35;

  var ctx = null, analyser = null, input = null, voiceGain = null, plateGain = null, master = null;
  var mediaNode = null, bufferNode = null, voices = [];
  var loadGen = 0;
  var heardAudio = false;
  var origin = 0;
  var sittingTime = 0;
  var breathIdx = -1;
  var cycleId = -1;
  var U = 0;
  var amp = 0.4;
  var field = P.makeField();
  var figure = null;
  var prevFig = null;
  var crossT = 0;
  var fieldDirty = true;
  var heard = null;
  var last = { bits: 0, flux: 0, rms: 0, centroid: 0, energy: 0, silent: true };
  var seisHist = new Float32Array(240);
  var seisAt = 0;
  var seisAcc = 0;
  var prng = P.makeRng(20261103);
  var shapeRng = P.makeRng(20261103 ^ 0x9e3779b9);
  var nParts = 9000;
  var parts = null;
  var acc = 0;
  var lastTs = 0;
  var raf = 0;
  var laid = null;

  function clamp(x, a, b) { return P.clamp(x, a, b); }
  function mmss(sec) {
    sec = Math.max(0, Math.floor(sec));
    return String(Math.floor(sec / 60)).padStart(2, "0") + ":" + String(sec % 60).padStart(2, "0");
  }
  function temperature() {
    return clamp(1 + 0.6 * gain * (U - 0.3), 0.5, 1.8);
  }

  function layout() {
    var r = canvas.getBoundingClientRect();
    var cssW = Math.max(2, r.width), cssH = Math.max(2, r.height);
    laid = view.layout(cssW, cssH);
    if (!parts) {
      var coarse = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
      nParts = coarse || cssW * cssH < 900000 ? 8000 : 11000;
      parts = P.makeParticles(nParts);
      P.scatterParticles(parts, prng);
    }
  }

  function setFigure(fig) {
    prevFig = figure;
    figure = fig;
    figure.layers = fig.modes.map(function (m) {
      return { grid: P.modeGrid(m.m, m.k, m.phi), w: m.w };
    });
    crossT = sittingTime;
    fieldDirty = true;
    if (ctx && plateOn) retune(fig.modes);
    ui.breath();
  }

  function refreshField() {
    if (!figure) return;
    var x = P.smooth(0, P.INHALE * P.BREATH, sittingTime - crossT);
    if (x >= 1 && !fieldDirty) {
      amp = figure.amp;
      return;
    }
    var layers = [];
    if (prevFig && x < 1) {
      for (var i = 0; i < prevFig.layers.length; i++) {
        layers.push({ grid: prevFig.layers[i].grid, w: prevFig.layers[i].w * (1 - x) });
      }
    }
    var fade = prevFig ? x : 1;
    for (var j = 0; j < figure.layers.length; j++) {
      layers.push({ grid: figure.layers[j].grid, w: figure.layers[j].w * fade });
    }
    P.combine(field, layers);
    fieldDirty = x < 1;
    amp = prevFig ? prevFig.amp * (1 - x) + figure.amp * x : figure.amp;
  }

  function commit(stats) {
    if (!stats.n) return;
    var lo = source.band[0], hi = source.band[1];
    var pitch = hi > lo ? clamp((stats.centroid - lo) / (hi - lo), 0, 1) : 0.5;
    var placed = rank.place(stats.mu, stats.sigma);
    stats.c = clamp(placed.c * 0.82 + pitch * 0.18, 0, 1);
    stats.count = placed.count;
    rank.push(stats.mu, stats.sigma);
    heard = stats;
    setFigure(P.chooseModes(stats));
  }

  function cycleLen() { return (work.breaths || 11) * P.BREATH; }

  function onBreathBoundary(b) {
    if (breathIdx >= 0) commit(reader.take());
    breathIdx = b;
    var len = cycleLen();
    var cyc = Math.floor(sittingTime / len);
    if (cyc !== cycleId) {
      var first = cycleId < 0;
      cycleId = cyc;
      if (!first && work.stroke === "whale" && view.paper) view.paper().fade(0.45);
      else if (!first && view.clearPaper) { view.clearPaper(); if (stroke) stroke.reset(); }
      if (sitting && cyc > 0 && soundOn) bell();
    }
  }

  function schedule(t) {
    var len = cycleLen();
    var b = Math.floor(t / P.BREATH);
    var age = t % len;
    var ph = (t / P.BREATH) % 1;
    if (b !== breathIdx) onBreathBoundary(b);
    var breathIn = ((b % work.breaths) + work.breaths) % work.breaths;
    return {
      b: b, ph: ph, br: P.breathCurve(ph), age: age, cycleLen: len, breathIn: breathIn,
      draw: 0, level: 0, wetOn: 1
    };
  }

  function ensureAudio() {
    if (ctx) {
      if (ctx.state !== "running") ctx.resume();
      return ctx;
    }
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0;
    analyser.minDecibels = -100;
    analyser.maxDecibels = -10;
    input = ctx.createGain();
    voiceGain = ctx.createGain();
    plateGain = ctx.createGain();
    master = ctx.createGain();
    voiceGain.gain.value = 0.9;
    plateGain.gain.value = plateOn ? 1 : 0;
    master.gain.value = soundOn ? 1 : 0;
    var comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 8;
    comp.ratio.value = 2.5;
    comp.attack.value = 0.01;
    comp.release.value = 0.3;
    shifter = NatureOpen.makeShifter(ctx);
    openVoice = NatureOpen.seal(reader);
    input.connect(shifter.input);
    shifter.output.connect(analyser);
    analyser.connect(voiceGain);
    voiceGain.connect(master);
    plateGain.connect(master);
    master.connect(comp);
    comp.connect(ctx.destination);
    mediaNode = ctx.createMediaElementSource(audioEl);
    mediaNode.connect(input);
    reader.attach(ctx, analyser);
    return ctx;
  }

  function retune(modes) {
    if (!ctx) return;
    var now = ctx.currentTime;
    for (var i = 0; i < voices.length; i++) {
      var old = voices[i];
      old.g.gain.cancelScheduledValues(now);
      old.g.gain.setTargetAtTime(0, now, 1.4);
      for (var k = 0; k < old.o.length; k++) old.o[k].stop(now + 8);
    }
    var norm = 1 / Math.sqrt(Math.max(1, modes.length));
    voices = modes.map(function (m, i) {
      var g = ctx.createGain();
      g.gain.value = 0;
      g.connect(plateGain);
      var os = [];
      var ratio = openVoice ? openVoice.pitchRatio() : 1;
      function tone(hz, vol) {
        var o = ctx.createOscillator();
        var pg = ctx.createGain();
        o.type = "sine";
        o.frequency.value = hz * ratio;
        pg.gain.value = vol;
        o.connect(pg);
        pg.connect(g);
        o.start(now);
        os.push(o);
      }
      tone(m.f, 1);
      tone(m.f * 1.0019, 0.6);
      tone(m.f * 2.003, 0.28);
      return { g: g, o: os, f: m.f, base: m.w * norm * Math.pow(P.F0 / m.f, 0.35) * 0.11 };
    });
  }

  function bell() {
    if (!ctx || !soundOn) return;
    var t0 = ctx.currentTime + 0.04;
    var f = P.F0 * 4;
    [[1, 1, 4.2], [2.76, 0.42, 2.6], [5.4, 0.16, 1.5]].forEach(function (p) {
      var o = ctx.createOscillator(), g = ctx.createGain(), end = t0 + p[2];
      o.type = "sine";
      o.frequency.value = f * p[0];
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(0.09 * p[1], t0 + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, end);
      o.connect(g);
      g.connect(master);
      o.start(t0);
      o.stop(end + 0.2);
    });
  }

  function voiceLevel() {
    if (!ctx || !voices.length) return;
    var sch = schedule(sittingTime);
    var level = amp * (0.3 + 0.7 * sch.br) * (0.25 + 0.75 * (last.energy || 0));
    var now = ctx.currentTime;
    for (var i = 0; i < voices.length; i++) {
      voices[i].g.gain.setTargetAtTime(plateOn ? voices[i].base * level : 0, now, 0.35);
    }
  }

  function stopBuffer() {
    if (!bufferNode) return;
    try { bufferNode.stop(); } catch (e) {}
    try { bufferNode.disconnect(); } catch (e) {}
    bufferNode = null;
  }

  function beginClock(withSound) {
    if (!sitting) return;
    origin = ctx.currentTime;
    sittingTime = 0;
    breathIdx = -1;
    cycleId = -1;
    heardAudio = true;
    root.classList.toggle("hearing", withSound !== false);
    reader.setBand(source.band);
    reader.attach(ctx, analyser);
    heard = null;
    if (figure) retune(figure.modes);
    bell();
    ui.voice();
  }

  function rest() {
    stopBuffer();
    try { audioEl.pause(); } catch (e) {}
    loadGen++;
    heardAudio = false;
    root.classList.remove("hearing");
    last.energy = 0;
    last.bits = 0;
    last.silent = true;
  }

  function startBuffer(buffer) {
    if (ctx.state !== "running") ctx.resume();
    audioEl.pause();
    stopBuffer();
    bufferNode = ctx.createBufferSource();
    bufferNode.buffer = buffer;
    bufferNode.loop = true;
    bufferNode.playbackRate.value = speed;
    bufferNode.connect(input);
    bufferNode.start();
    if (openVoice) openVoice.bind(ctx, bufferNode, shifter);
    beginClock();
  }

  function startMedia(url) {
    stopBuffer();
    audioEl.loop = true;
    audioEl.src = url;
    var p = audioEl.play();
    if (p && p.catch) p.catch(function () {});
    beginClock();
  }

  function loadSeries(src) {
    var gen = ++loadGen;
    if (!ensureAudio()) {
      ui.hint("This browser has no Web Audio.");
      return;
    }
    var meta = src.series;
    ui.hint("Reading the mycelium…");
    fetch(meta.url).then(function (r) {
      if (!r.ok) throw new Error(String(r.status));
      return r.arrayBuffer();
    }).then(function (buf) {
      if (gen !== loadGen) return;
      var samples = NatureMycelium.decodeI16(buf, meta.scale);
      var audioBuf = NatureMycelium.sonify(ctx, samples, meta);
      if (gen !== loadGen) return;
      startBuffer(audioBuf);
      ui.hint(src.voice + ". " + meta.note + " " + meta.license + ".");
    }).catch(function () {
      if (gen !== loadGen) return;
      rest();
      ui.hint("Could not read the mycelium recording. Serve this folder over http, or drop another file.");
    });
  }

  function loadUrl(url, label) {
    var gen = ++loadGen;
    if (!ensureAudio()) {
      ui.hint("This browser has no Web Audio.");
      return;
    }
    ui.hint("Listening…");
    fetch(url).then(function (r) {
      if (!r.ok) throw new Error(String(r.status));
      return r.arrayBuffer();
    }).then(function (buf) {
      return ctx.decodeAudioData(buf.slice(0));
    }).then(function (audioBuf) {
      if (gen !== loadGen) return;
      startBuffer(audioBuf);
      ui.hint(label);
    }).catch(function () {
      if (gen !== loadGen) return;
      try {
        startMedia(url);
        ui.hint(label);
      } catch (e) {
        ui.hint("Could not play " + label + ". Drop another recording.");
      }
    });
  }

  function useFile(file) {
    if (!file) return;
    if (custom && custom.url) URL.revokeObjectURL(custom.url);
    custom = { name: file.name.replace(/\.[^.]+$/, ""), url: URL.createObjectURL(file) };
    if (work.closed) {
      hideSitting();
      work = natureWork(lastNature || "whale");
      stroke = NatureStrokes.create(work.stroke);
      if (view.clearPaper) view.clearPaper();
      stroke.reset();
    }
    ui.titles();
    ui.voice();
    if (!sitting) sit();
    else playCurrent();
  }

  function exemplarLabel(src) {
    var ex = src.exemplar;
    if (!ex) return src.obtain;
    return ex.credit + ". " + ex.license + " " + (ex.note || "") + " Drop a recording to replace it.";
  }

  function activeSource() {
    if (custom) return natureSource("file");
    return natureSource(work.voice || "file");
  }

  function playCurrent() {
    if (work.closed) return;
    source = activeSource();
    reader.setBand(source.band);
    if (custom) { loadUrl(custom.url, custom.name); return; }
    if (source.series) { loadSeries(source); return; }
    if (source.exemplar) { loadUrl(source.exemplar.url, exemplarLabel(source)); return; }
    stopBuffer();
    try { audioEl.pause(); } catch (e) {}
    loadGen++;
    if (!ctx) ensureAudio();
    beginClock(false);
    ui.hint("No recording is bundled for this work. Drop a file you have the right to play. The stroke still keeps the breath.");
    ui.voice();
  }

  function showSitting() {
    work = natureWork("sitting");
    rest();
    root.classList.add("as-sitting");
    var frame = $("sitting");
    frame.hidden = false;
    $("worksBack").hidden = false;
    if (!frame.getAttribute("src")) frame.src = "../just-sitting.html";
    closePanels();
    ui.titles();
  }

  function hideSitting() {
    root.classList.remove("as-sitting");
    var frame = $("sitting");
    frame.hidden = true;
    frame.removeAttribute("src");
    $("worksBack").hidden = true;
  }

  function sit() {
    if (sitting) return;
    if (work.closed) { showSitting(); return; }
    if (!ensureAudio()) return;
    sitting = true;
    root.classList.add("sitting");
    P.scatterParticles(parts, prng);
    U = 0;
    setFigure(P.chooseModes({ mu: 0.2, sigma: 0.04, seed: 11, c: 0.22, count: 1 }));
    holdScreen();
    playCurrent();
    wake();
  }

  function setWork(id) {
    var next = natureWork(id);
    if (next.closed) { showSitting(); ui.works(); return; }
    if (work.id === next.id && sitting) return;
    hideSitting();
    lastNature = next.id;
    work = next;
    source = activeSource();
    reader.setBand(source.band);
    stroke = NatureStrokes.create(work.stroke);
    breathIdx = -1;
    cycleId = -1;
    if (view.clearPaper) view.clearPaper();
    stroke.reset();
    ui.titles();
    ui.works();
    if (!sitting) sit();
    else playCurrent();
  }

  function stepWork(dir) {
    var i = 0;
    for (var k = 0; k < NATURE_WORKS.length; k++) if (NATURE_WORKS[k].id === work.id) i = k;
    setWork(NATURE_WORKS[(i + dir + NATURE_WORKS.length) % NATURE_WORKS.length].id);
  }

  var wakeLock = null;
  function holdScreen() {
    try {
      if (navigator.wakeLock) navigator.wakeLock.request("screen").then(function (l) { wakeLock = l; }).catch(function () {});
    } catch (e) {}
  }

  var idleTimer = 0;
  function wake() {
    root.classList.remove("idle");
    clearTimeout(idleTimer);
    idleTimer = setTimeout(function () {
      if (sitting && !panel.classList.contains("open") && !info.classList.contains("open")) root.classList.add("idle");
    }, 3500);
  }

  function setPanel(el, btn, open) {
    el.classList.toggle("open", open);
    el.setAttribute("aria-hidden", String(!open));
    if (btn) btn.setAttribute("aria-expanded", String(open));
  }
  function panelsOpen() {
    var openInfo = info.classList.contains("open");
    var openSet = panel.classList.contains("open");
    root.classList.toggle("has-panel", openInfo || openSet);
    if (openSet) ui.seis();
  }
  function toggleInfo() {
    setPanel(info, $("mark"), !info.classList.contains("open"));
    if (info.classList.contains("open")) setPanel(panel, $("menu"), false);
    panelsOpen();
    wake();
  }
  function toggleSettings() {
    setPanel(panel, $("menu"), !panel.classList.contains("open"));
    if (panel.classList.contains("open")) setPanel(info, $("mark"), false);
    panelsOpen();
    wake();
  }
  function closePanels() {
    setPanel(info, $("mark"), false);
    setPanel(panel, $("menu"), false);
    panelsOpen();
  }

  function toggleFullscreen() {
    var doc = document;
    try {
      if (doc.fullscreenElement) doc.exitFullscreen();
      else root.requestFullscreen().catch(function () {});
    } catch (e) {}
  }

  var seis = $("seis");
  var sctx = seis.getContext("2d");
  var ui = {
    hint: function (t) { $("hint").textContent = t; },
    titles: function () {
      $("title").textContent = work.title;
      var sub = $("subtitle");
      sub.textContent = work.subtitle || "";
      sub.hidden = !work.subtitle;
      document.title = work.title;
    },
    works: function () {
      var buttons = root.querySelectorAll("[data-work]");
      for (var i = 0; i < buttons.length; i++) {
        buttons[i].setAttribute("aria-pressed", String(buttons[i].getAttribute("data-work") === work.id));
      }
    },
    voice: function () {
      var shown = custom ? custom.name : (source.exemplar ? source.exemplar.title : (source.series ? "Schizophyllum, 8 h at 120×" : "None yet"));
      $("fileName").textContent = shown;
      $("band").textContent = source.band[0] + "–" + source.band[1] + " Hz";
      $("loopState").textContent = work.closed ? "Closed" : "Open";
      if (!sitting || !heardAudio) {
        var ex = source.exemplar, series = source.series;
        this.hint(custom ? custom.name : (ex ? exemplarLabel(source) : (series ? series.note + " " + series.license + "." : "No recording is bundled. Drop a file you have the right to play.")));
      }
      var invite = $("invite");
      if (invite && !root.classList.contains("drag")) {
        invite.textContent = (!source.exemplar && !source.series && !custom) ? "Drop a recording" : "Click to listen";
      }
      this.works();
      this.speed();
      this.tuning();
    },
    breath: function () {
      var st = heard;
      $("rMu").innerHTML = (st ? st.mu : last.bits).toFixed(2) + "<small>BITS</small>";
      $("rSigma").innerHTML = (st ? st.sigma : 0).toFixed(2) + "<small>BITS</small>";
      if (!figure) return;
      $("rModes").textContent = figure.modes.map(function (m) { return "(" + m.m + "," + m.n + ")"; }).join(" ");
      $("rFreq").textContent = figure.modes.map(function (m) { return Math.round(m.f); }).join(" · ") + " Hz";
    },
    tick: function (sch) {
      $("dot").style.opacity = sitting && sch ? (0.35 + 0.65 * sch.br).toFixed(2) : "1";
      if (!panel.classList.contains("open")) return;
      $("rTime").textContent = mmss(sittingTime % cycleLen()) + " / " + mmss(cycleLen());
      $("rBreath").textContent = sch ? String(sch.breathIn + 1) + " / " + work.breaths : "–";
      $("rU").textContent = U.toFixed(2);
      $("rNow").innerHTML = last.bits.toFixed(2) + "<small>BITS</small>";
      this.seis();
    },
    seis: function () {
      if (!panel.classList.contains("open")) return;
      var w = seis.clientWidth, h = seis.clientHeight, r = Math.min(2, window.devicePixelRatio || 1);
      if (!w || !h) return;
      if (seis.width !== Math.round(w * r)) { seis.width = Math.round(w * r); seis.height = Math.round(h * r); }
      sctx.setTransform(r, 0, 0, r, 0, 0);
      sctx.clearRect(0, 0, w, h);
      sctx.fillStyle = "#2A2A2A";
      sctx.fillRect(0, h - 1, w, 1);
      sctx.fillStyle = "#8A8A8A";
      var n = seisHist.length, bw = w / n;
      for (var i = 0; i < n; i++) {
        var s = seisHist[(seisAt + i) % n];
        var bh = Math.min(h - 1, (s / 2) * (h - 1));
        sctx.fillRect(i * bw, h - 1 - bh, Math.max(1, bw - 0.5), bh);
      }
    },
    speed: function () {
      if (!$("rSpeed")) return;
      $("rSpeed").textContent = speed.toFixed(2) + "×";
      $("speed").value = String(speed);
    },
    tuning: function () {
      if (!$("rTune")) return;
      var sign = tuning > 0 ? "+" : "";
      $("rTune").textContent = sign + tuning.toFixed(0);
      $("tune").value = String(tuning);
    },
    echo: function () {
      $("rEcho").textContent = echo.toFixed(2);
      $("echo").value = String(echo);
    },
    toggles: function () {
      $("soundBtn").textContent = soundOn ? "Sound on" : "Sound off";
      $("soundBtn").setAttribute("aria-pressed", String(soundOn));
      $("plateBtn").textContent = plateOn ? "Tones on" : "Tones off";
      $("plateBtn").setAttribute("aria-pressed", String(plateOn));
      $("inkLabel").textContent = ink === "RED" ? "Red" : "White";
    }
  };

  function setSound(on) {
    soundOn = on;
    if (master) master.gain.setTargetAtTime(on ? 1 : 0, ctx.currentTime, 0.3);
    ui.toggles();
  }
  function setPlate(on) {
    plateOn = on;
    if (plateGain) plateGain.gain.setTargetAtTime(on ? 1 : 0, ctx.currentTime, 0.3);
    if (on && figure) retune(figure.modes);
    ui.toggles();
  }
  function setInk(name) {
    ink = name;
    view.setInk(ink);
    ui.toggles();
  }

  function tick(dt) {
    var sch = null;
    if (sitting && ctx && !work.closed) {
      sittingTime = Math.max(0, ctx.currentTime - origin);
      sch = schedule(sittingTime);
      if (openVoice) last = openVoice.pull(dt);
      if (stroke && view.paper) {
        var lo = source.band[0], hi = source.band[1], cen = 0;
        if (last.centroid && hi > lo) cen = clamp((last.centroid - lo) / (hi - lo), 0, 1);
        stroke.step(view.paper(), {
          pos: sch.cycleLen ? sch.age / sch.cycleLen : 0,
          breath: sch.breathIn,
          breaths: work.breaths,
          last: sch.breathIn === work.breaths - 1,
          close: sch.breathIn === work.breaths - 1 ? sch.ph : 0,
          energy: last.energy || 0,
          flux: last.flux || 0,
          bits: last.bits || 0,
          centroid: cen,
          phase: sch.ph
        });
      }
      seisAcc += dt;
      if (seisAcc >= 1 / 12) {
        seisAcc = 0;
        seisHist[seisAt] = last.bits || 0;
        seisAt = (seisAt + 1) % seisHist.length;
      }
      voiceLevel();
    } else {
      sch = { br: 0, draw: 0, level: 0, wetOn: 0, age: 0 };
    }
    refreshField();
    var steps = 0;
    acc += dt;
    var vibBase = sitting ? amp * (0.18 + 0.82 * (sch.br || 0)) * (0.12 + 0.88 * (last.energy || 0)) : 0;
    while (acc >= 1 / 60 && steps < 4) {
      acc -= 1 / 60;
      steps++;
      var moved = P.stepParticles(parts, field, vibBase, prng);
      var Uraw = sitting ? clamp(moved / 0.0012, 0, 1) : 0;
      U += (Uraw - U) * (1 / 120);
    }
    view.frame({
      n: parts.n, px: parts.x, py: parts.y,
      echo: echo, dtf: dt * 60,
      draw: 0,
      level: 0,
      wetOn: sitting && !work.closed ? 1 : 0
    });
    ui.tick(sitting ? sch : null);
  }

  function loop(ts) {
    raf = requestAnimationFrame(loop);
    if (!lastTs) lastTs = ts;
    var dt = Math.min(0.05, (ts - lastTs) / 1000);
    lastTs = ts;
    if (dt > 0) tick(dt);
  }

  layout();
  setFigure(P.chooseModes({ mu: 0.15, sigma: 0.02, seed: 3, c: 0.18, count: 1 }));
  fieldDirty = true;
  refreshField();
  ui.voice();
  ui.titles();
  ui.speed();
  ui.tuning();
  ui.echo();
  ui.toggles();
  requestAnimationFrame(loop);
  window.addEventListener("resize", layout);
  if (window.ResizeObserver) new ResizeObserver(layout).observe(root);

  root.addEventListener("click", function (ev) {
    if (ev.target.closest("button, a, input, aside, label")) return;
    sit();
  });
  $("mark").addEventListener("click", toggleInfo);
  $("menu").addEventListener("click", toggleSettings);
  $("infoClose").addEventListener("click", closePanels);
  $("panelClose").addEventListener("click", closePanels);
  var workBox = $("works");
  NATURE_WORKS.forEach(function (w) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "work";
    b.setAttribute("data-work", w.id);
    b.setAttribute("aria-pressed", "false");
    var name = document.createElement("span");
    name.className = "clab";
    name.textContent = w.title;
    b.appendChild(name);
    if (w.subtitle) {
      var sub = document.createElement("small");
      sub.textContent = w.subtitle;
      b.appendChild(sub);
    }
    b.addEventListener("click", function () { setWork(w.id); });
    workBox.appendChild(b);
  });
  ui.works();
  ui.voice();
  $("loadBtn").addEventListener("click", function () { $("file").click(); });
  $("file").addEventListener("change", function () {
    if ($("file").files && $("file").files[0]) useFile($("file").files[0]);
    $("file").value = "";
  });
  $("soundBtn").addEventListener("click", function () { setSound(!soundOn); });
  $("plateBtn").addEventListener("click", function () { setPlate(!plateOn); });
  $("fsBtn").addEventListener("click", toggleFullscreen);
  $("inkPrev").addEventListener("click", function () { setInk(ink === "RED" ? "WHITE" : "RED"); });
  $("inkNext").addEventListener("click", function () { setInk(ink === "RED" ? "WHITE" : "RED"); });
  $("speed").addEventListener("input", function () {
    speed = clamp(parseFloat($("speed").value), 0.5, 1.5);
    if (openVoice) openVoice.setSpeed(speed);
    ui.speed();
  });
  $("tune").addEventListener("input", function () {
    tuning = clamp(parseFloat($("tune").value), -12, 12);
    if (openVoice) openVoice.setTuning(tuning);
    if (figure) retune(figure.modes);
    ui.tuning();
  });
  $("worksBack").addEventListener("click", function () {
    hideSitting();
    work = natureWork(lastNature || "whale");
    stroke = NatureStrokes.create(work.stroke);
    ui.titles();
    ui.works();
    toggleSettings();
  });
  $("clearFile").addEventListener("click", function () {
    if (custom && custom.url) URL.revokeObjectURL(custom.url);
    custom = null;
    if (sitting && !work.closed) playCurrent();
    else ui.voice();
  });
  $("echo").addEventListener("input", function () {
    echo = clamp(parseFloat($("echo").value), 0, 0.97);
    ui.echo();
  });

  window.addEventListener("dragover", function (ev) {
    ev.preventDefault();
    root.classList.add("drag");
    $("invite").textContent = "Drop to listen";
  });
  window.addEventListener("dragleave", function () { root.classList.remove("drag"); });
  window.addEventListener("drop", function (ev) {
    ev.preventDefault();
    root.classList.remove("drag");
    $("invite").textContent = "Click to listen";
    var f = ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files[0];
    if (f) useFile(f);
  });
  window.addEventListener("keydown", function (ev) {
    if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
    var k = ev.key;
    if (k === "Escape") closePanels();
    else if (k === "i" || k === "I") toggleInfo();
    else if (k === "p" || k === "P") toggleSettings();
    else if (k === "f" || k === "F") toggleFullscreen();
    else if (k === "m" || k === "M") setSound(!soundOn);
    else if (k === "v" || k === "V") stepWork(1);
    else if (k === "[") { speed = clamp(speed - 0.05, 0.5, 1.5); if (openVoice) openVoice.setSpeed(speed); ui.speed(); }
    else if (k === "]") { speed = clamp(speed + 0.05, 0.5, 1.5); if (openVoice) openVoice.setSpeed(speed); ui.speed(); }
    else if (k === "-" || k === "_") { tuning = clamp(tuning - 1, -12, 12); if (openVoice) openVoice.setTuning(tuning); if (figure) retune(figure.modes); ui.tuning(); }
    else if (k === "=" || k === "+") { tuning = clamp(tuning + 1, -12, 12); if (openVoice) openVoice.setTuning(tuning); if (figure) retune(figure.modes); ui.tuning(); }
    else return;
    ev.preventDefault();
  });
  window.addEventListener("pointermove", wake);

  canvas.addEventListener("webglcontextlost", function (ev) { ev.preventDefault(); });

  window.NATURE = {
    sit: sit,
    setWork: setWork,
    useFile: useFile,
    advance: function (seconds) {
      var steps = Math.round(seconds * 30), dt = 1 / 30, i;
      for (i = 0; i < steps; i++) {
        sittingTime += dt;
        var sch = schedule(sittingTime);
        if (parts && i % 2 === 0) P.stepParticles(parts, field, 0.55 * (0.2 + 0.8 * (last.energy || 0.5)), prng);
        if (!stroke || !view.paper || work.closed) continue;
        var lo = source.band[0], hi = source.band[1], cen = 0;
        if (last.centroid && hi > lo) cen = clamp((last.centroid - lo) / (hi - lo), 0, 1);
        stroke.step(view.paper(), {
          pos: sch.cycleLen ? (sittingTime % sch.cycleLen) / sch.cycleLen : 0,
          breath: sch.breathIn, breaths: work.breaths,
          last: sch.breathIn === work.breaths - 1,
          close: sch.breathIn === work.breaths - 1 ? sch.ph : 0,
          energy: last.energy || 0.4, flux: last.flux || 0, bits: last.bits || 0, centroid: cen, phase: sch.ph
        });
      }
    },
    snapshot: function () {
      return {
        sitting: sitting,
        work: work.id,
        closed: !!work.closed,
        openVoice: !!(openVoice && Object.isFrozen(openVoice) && openVoice.pull.length === 1 && openVoice.setUnrest === undefined),
        source: source.id,
        file: custom ? custom.name : (source.exemplar ? source.exemplar.title : (source.series ? "mycelium" : "")),
        bits: last.bits,
        energy: last.energy,
        flux: last.flux,
        silent: last.silent,
        mu: heard ? heard.mu : null,
        modes: figure ? figure.modes.map(function (m) { return { m: m.m, n: m.n, f: m.f }; }) : [],
        U: U,
        speed: speed,
        tuning: tuning,
        t: sittingTime,
        particles: parts ? parts.n : 0,
        gl: view.gl,
        band: source.band.slice()
      };
    }
  };

  if (params.get("autostart") === "1") {
    window.addEventListener("load", function () { setTimeout(sit, 60); });
    if (document.readyState === "complete") setTimeout(sit, 60);
  }
})();
