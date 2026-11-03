/* An open voice. It can be read. It cannot be taught.
   pull takes the time step and nothing else. There is no unrest,
   no temperature, and no setter that could grow one later:
   the object is frozen. Speed and tuning are the listener's hands,
   not the plate's.
   Part of JUST SITTING, AGPL-3.0-or-later. */
var NatureOpen = (function () {
  function makeShifter(ctx) {
    var input = ctx.createGain();
    var output = ctx.createGain();
    var dry = ctx.createGain();
    var wet = ctx.createGain();
    dry.gain.value = 1;
    wet.gain.value = 0;
    input.connect(dry);
    dry.connect(output);
    var ratio = 1;
    var processor = null;
    try {
      var size = 2048;
      processor = ctx.createScriptProcessor(size, 2, 1);
      var window = 1536;
      var ring = new Float32Array(window * 2);
      var write = 0;
      var phaseA = 0.1;
      var phaseB = 0.6;
      processor.onaudioprocess = function (e) {
        var ch0 = e.inputBuffer.getChannelData(0);
        var ch1 = e.inputBuffer.numberOfChannels > 1 ? e.inputBuffer.getChannelData(1) : null;
        var out = e.outputBuffer.getChannelData(0);
        var len = ring.length;
        var step = (1 - ratio) / window;
        for (var i = 0; i < ch0.length; i++) {
          ring[write] = ch1 ? (ch0[i] + ch1[i]) * 0.5 : ch0[i];
          phaseA += step;
          if (phaseA >= 1) phaseA -= 1;
          else if (phaseA < 0) phaseA += 1;
          phaseB = phaseA + 0.5;
          if (phaseB >= 1) phaseB -= 1;
          var i1 = write - (0.08 + phaseA) * window;
          var i2 = write - (0.08 + phaseB) * window;
          var s1 = read(ring, i1, len);
          var s2 = read(ring, i2, len);
          var w1 = 0.5 * (1 - Math.cos(Math.PI * 2 * phaseA));
          var w2 = 0.5 * (1 - Math.cos(Math.PI * 2 * phaseB));
          var ws = w1 + w2 || 1;
          out[i] = (s1 * w1 + s2 * w2) / ws;
          write++;
          if (write >= len) write = 0;
        }
      };
      processor.connect(wet);
      wet.connect(output);
    } catch (err) {
      processor = null;
    }
    function read(ring, idx, len) {
      while (idx < 0) idx += len;
      var base = Math.floor(idx) % len;
      var frac = idx - Math.floor(idx);
      var next = (base + 1) % len;
      return ring[base] * (1 - frac) + ring[next] * frac;
    }
    return {
      input: input,
      output: output,
      setSemitones: function (semi, now) {
        ratio = Math.pow(2, semi / 12);
        if (!processor) return;
        var t = now || 0;
        var use = Math.abs(semi) > 0.01;
        dry.gain.setTargetAtTime(use ? 0 : 1, t, 0.03);
        wet.gain.setTargetAtTime(use ? 1 : 0, t, 0.03);
      },
      ratio: function () { return ratio; },
      live: !!processor
    };
  }

  /* reader.pull is the spectrum measure. This wrapper refuses a second argument. */
  function seal(reader) {
    function pull(dt) {
      return reader.pull(dt, 1);
    }
    var speed = 1;
    var semi = 0;
    var node = null;
    var shifter = null;
    var ctx = null;
    var api = {
      kind: "open",
      pull: pull,
      setSpeed: function (s) {
        speed = s;
        if (node && ctx) node.playbackRate.setTargetAtTime(s, ctx.currentTime, 0.05);
      },
      setTuning: function (semitones) {
        semi = semitones;
        if (shifter && ctx) shifter.setSemitones(semi, ctx.currentTime);
      },
      speed: function () { return speed; },
      semitones: function () { return semi; },
      pitchRatio: function () { return Math.pow(2, semi / 12); },
      bind: function (audioCtx, bufferNode, shift) {
        ctx = audioCtx;
        node = bufferNode;
        shifter = shift;
        if (node) node.playbackRate.value = speed;
        if (shifter) shifter.setSemitones(semi, ctx.currentTime);
      }
    };
    return Object.freeze(api);
  }

  return { makeShifter: makeShifter, seal: seal };
})();
