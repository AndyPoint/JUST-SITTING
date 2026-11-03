/* Mycelium — a 1 Hz electrode trace, heard.
   The voltage is too slow and too small to be a sound. Time is sped by
   `compress`, and the trace bends the pitch of a quiet tone. The plate
   then reads that tone the way it reads a whale. Nothing is added that
   was not in the samples.
   Part of JUST SITTING, AGPL-3.0-or-later. */
var NatureMycelium = (function () {
  function decodeI16(buf, scale) {
    var view = new DataView(buf);
    var n = (buf.byteLength / 2) | 0;
    var out = new Float32Array(n);
    for (var i = 0; i < n; i++) out[i] = view.getInt16(i * 2, true) * scale;
    return out;
  }

  function smooth(samples, win) {
    var n = samples.length;
    var out = new Float32Array(n);
    var acc = 0;
    var w = win < 1 ? 1 : win | 0;
    for (var i = 0; i < n; i++) {
      acc += samples[i];
      if (i >= w) acc -= samples[i - w];
      out[i] = acc / Math.min(i + 1, w);
    }
    return out;
  }

  /* samples: millivolts at 1 Hz. Returns a mono Float32Array. */
  function render(samples, o) {
    var compress = (o && o.compress) || 120;
    var rate = (o && o.rate) || 8000;
    var n = samples.length;
    if (n < 2) return new Float32Array(rate);
    var slow = smooth(samples, 30);
    var nOut = Math.max(1, Math.floor(n / compress * rate));
    var out = new Float32Array(nOut);
    var f0 = 98;
    var p1 = 0, p2 = 0, p3 = 0;
    var TAU = Math.PI * 2;
    for (var i = 0; i < nOut; i++) {
      var pos = (i / rate) * compress;
      var i0 = pos | 0;
      if (i0 >= n - 1) i0 = n - 2;
      var frac = pos - i0;
      var tide = slow[i0] * (1 - frac) + slow[i0 + 1] * frac;
      var fast = samples[i0] - slow[i0];
      var z = tide / 1.8;
      if (z > 1) z = 1;
      else if (z < -1) z = -1;
      var freq = f0 * (1 + 0.22 * z);
      p1 += TAU * freq / rate;
      p2 += TAU * freq * 1.4983 / rate;
      p3 += TAU * freq * 2.01 / rate;
      var grit = fast / 0.08;
      if (grit > 1) grit = 1;
      else if (grit < -1) grit = -1;
      var env = 0.28 + 0.22 * (z + 1) * 0.5 + 0.18 * (grit < 0 ? -grit : grit);
      var s = Math.sin(p1) * 0.62 + Math.sin(p2) * 0.26 + Math.sin(p3) * 0.12;
      out[i] = s * env * 0.42 + grit * 0.04;
    }
    return out;
  }

  function sonify(ctx, samples, o) {
    var rate = (o && o.rate) || 8000;
    var data = render(samples, o);
    var buffer = ctx.createBuffer(1, data.length, rate);
    buffer.getChannelData(0).set(data);
    return buffer;
  }

  return { decodeI16: decodeI16, render: render, sonify: sonify };
})();
