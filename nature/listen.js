/* Nature listening — surprise from a spectrum.
   A breath's figure is chosen by how far the sound moved from the
   expectation the recent sound itself had built. In bits: KL(heard || expected).
   Nothing is stored. The expectation is a few hundred numbers that die with the page.
   Part of JUST SITTING, AGPL-3.0-or-later. */
var NatureListen = (function () {
  var TAU_SEC = 4;

  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }

  function makeExpectation(n) {
    var P = new Float64Array(n);
    var inv = 1 / n;
    P.fill(inv);
    return {
      n: n,
      /* q is a probability array of length n. T is the listening temperature.
         Returns surprise in bits and updates the expectation. */
      read: function (q, T, dt) {
        var i, s = 0, kl = 0, flux = 0;
        var eps = 1e-12;
        for (i = 0; i < n; i++) s += q[i];
        if (!(s > 0)) return 0;
        var t = T > 0 ? T : 1;
        var alpha = 1 - Math.exp(-dt / (TAU_SEC * t));
        var loose = clamp((t - 1) * 0.25, 0, 0.4);
        var beta = 1 - Math.exp(-dt * loose);
        for (i = 0; i < n; i++) {
          var qi = q[i] / s;
          var pi = P[i] > eps ? P[i] : eps;
          if (qi > eps) kl += qi * Math.log2(qi / pi);
          var d = qi - P[i];
          if (d > 0) flux += d;
          P[i] = (1 - alpha) * P[i] + alpha * qi;
        }
        if (beta > 0) {
          var u = beta * inv;
          var keep = 1 - beta;
          for (i = 0; i < n; i++) P[i] = keep * P[i] + u;
        }
        return { bits: kl < 0 ? 0 : kl, flux: flux };
      }
    };
  }

  /* Rank a value inside a growing memory of breaths, so any voice can
     reach both a simple figure and a full one. */
  function makeRank() {
    var mus = [0.02, 0.08, 0.2, 0.45, 0.9, 1.6];
    var sig = [0.005, 0.02, 0.06, 0.14, 0.28, 0.5];
    function sorted(a) { return a.slice().sort(function (x, y) { return x - y; }); }
    return {
      push: function (mu, sigma) {
        mus.push(mu); sig.push(sigma);
        if (mus.length > 48) { mus.shift(); sig.shift(); }
      },
      place: function (mu, sigma) {
        var plate = (typeof NaturePlate !== "undefined") ? NaturePlate : null;
        var rank = plate ? plate.rankIn : function (arr, x) {
          var lo = 0, hi = arr.length;
          while (lo < hi) { var mid = (lo + hi) >> 1; if (arr[mid] < x) lo = mid + 1; else hi = mid; }
          return arr.length > 1 ? lo / (arr.length - 1) : 0.5;
        };
        var c = 0.08 + 0.84 * rank(sorted(mus), mu);
        var rs = rank(sorted(sig), sigma);
        var count = rs > 0.66 ? 3 : rs > 0.33 ? 2 : 1;
        return { c: c, count: count };
      }
    };
  }

  function statsOf(samples) {
    var n = samples.length;
    if (!n) return { mu: 0, sigma: 0, seed: 1, centroid: 0 };
    var mu = 0, i, hash = 2166136261;
    for (i = 0; i < n; i++) mu += samples[i];
    mu /= n;
    var v = 0;
    for (i = 0; i < n; i++) {
      var d = samples[i] - mu;
      v += d * d;
      hash ^= (samples[i] * 1000) | 0;
      hash = Math.imul(hash, 16777619);
    }
    return { mu: mu, sigma: Math.sqrt(v / n), seed: hash >>> 0, n: n };
  }

  /* Live reader. Owns no audio nodes until attach(). */
  function makeReader(band) {
    var reader = {
      band: band.slice(),
      ctx: null, analyser: null, db: null, time: null, bins: null, expect: null,
      samples: [], centroidSum: 0, sampleN: 0, rmsPeak: 0.02, energy: 0,
      last: { bits: 0, flux: 0, rms: 0, centroid: 0, energy: 0, silent: true }
    };

    reader.setBand = function (b) {
      reader.band = b.slice();
      reader.bins = null;
      reader.expect = null;
      reader.samples = [];
      reader.centroidSum = 0;
      reader.sampleN = 0;
    };

    reader.attach = function (ctx, analyser) {
      reader.ctx = ctx;
      reader.analyser = analyser;
      reader.db = new Float32Array(analyser.frequencyBinCount);
      reader.time = new Float32Array(analyser.fftSize);
      reader.bins = null;
      reader.expect = null;
    };

    function binning() {
      if (reader.bins) return reader.bins;
      var analyser = reader.analyser;
      if (!analyser) return null;
      var hz = reader.ctx.sampleRate / analyser.fftSize;
      var ny = reader.ctx.sampleRate * 0.48;
      var lo = reader.band[0], hi = Math.min(reader.band[1], ny);
      var i0 = Math.max(1, Math.floor(lo / hz));
      var i1 = Math.min(analyser.frequencyBinCount - 1, Math.ceil(hi / hz));
      if (i1 <= i0) i1 = Math.min(analyser.frequencyBinCount - 1, i0 + 8);
      var n = i1 - i0;
      reader.bins = { i0: i0, i1: i1, n: n, hz: hz };
      reader.expect = makeExpectation(n);
      return reader.bins;
    }

    reader.pull = function (dt, T) {
      var analyser = reader.analyser;
      var last = reader.last;
      if (!analyser || dt <= 0) return last;
      var bins = binning();
      if (!bins) return last;
      analyser.getFloatFrequencyData(reader.db);
      analyser.getFloatTimeDomainData(reader.time);
      var q = new Float64Array(bins.n);
      var sum = 0, cnum = 0, i;
      for (i = 0; i < bins.n; i++) {
        var db = reader.db[bins.i0 + i];
        var p = db < -120 || db !== db ? 0 : Math.pow(10, db / 10);
        q[i] = p;
        sum += p;
        cnum += p * (bins.i0 + i + 0.5) * bins.hz;
      }
      var rms = 0;
      var td = reader.time;
      for (i = 0; i < td.length; i++) rms += td[i] * td[i];
      rms = Math.sqrt(rms / td.length);
      if (rms > reader.rmsPeak) reader.rmsPeak += (rms - reader.rmsPeak) * 0.35;
      else reader.rmsPeak += (rms - reader.rmsPeak) * 0.02;
      var energy = reader.rmsPeak > 1e-4 ? clamp(rms / reader.rmsPeak, 0, 1) : 0;
      reader.energy += (energy - reader.energy) * (1 - Math.exp(-dt / 0.2));
      var silent = sum < 1e-10 || rms < 0.004;
      var surprise = 0, flux = 0;
      if (!silent) {
        var got = reader.expect.read(q, T, dt);
        surprise = got.bits;
        flux = got.flux;
        reader.samples.push(surprise);
        reader.centroidSum += cnum / sum;
        reader.sampleN++;
      }
      last.bits = surprise;
      last.flux = flux;
      last.rms = rms;
      last.centroid = silent || sum <= 0 ? last.centroid : cnum / sum;
      last.energy = reader.energy;
      last.silent = silent;
      return last;
    };

    reader.take = function () {
      var s = statsOf(reader.samples);
      s.centroid = reader.sampleN ? reader.centroidSum / reader.sampleN : 0;
      reader.samples = [];
      reader.centroidSum = 0;
      reader.sampleN = 0;
      return s;
    };

    return reader;
  }

  return {
    makeExpectation: makeExpectation,
    makeRank: makeRank,
    statsOf: statsOf,
    makeReader: makeReader
  };
})();
