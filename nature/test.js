/* Node checks for the plate and the surprise measure. Run: node nature/test.js */
var fs = require("fs");
var vm = require("vm");
var path = require("path");
var dir = __dirname;
var context = { console: console, Math: Math, Map: Map, Float32Array: Float32Array, Float64Array: Float64Array, Object: Object, URLSearchParams: URLSearchParams };
vm.createContext(context);
["plate.js", "listen.js", "sources.js", "mycelium.js", "works.js", "openvoice.js", "strokes.js"].forEach(function (name) {
  vm.runInContext(fs.readFileSync(path.join(dir, name), "utf8"), context, { filename: name });
});
var P = context.NaturePlate;
var L = context.NatureListen;
var M = context.NatureMycelium;
var sources = context.NATURE_SOURCES;
var works = context.NATURE_WORKS;
var Open = context.NatureOpen;
var Strokes = context.NatureStrokes;
var failed = 0;
function check(name, cond) {
  if (!cond) { failed++; console.error("FAIL " + name); }
  else console.log("ok   " + name);
}

check("J01 near 2.4048", Math.abs(P.J01 - 2.4048255577) < 0.02);
check("J(0, J01) ~ 0", Math.abs(P.J(0, P.J01)) < 0.02);
check("true modes", P.TRUE_MODES.length >= 16);

var fig = P.chooseModes({ mu: 0.4, sigma: 0.2, seed: 7, c: 0.55, count: 2 });
check("two modes", fig.modes.length === 2);
check("mode frequency", fig.modes.every(function (m) { return m.f > 40 && m.f < 4000; }));

var field = P.makeField();
var layers = fig.modes.map(function (m) { return { grid: P.modeGrid(m.m, m.k, m.phi), w: m.w }; });
P.combine(field, layers);
var energy = 0;
for (var i = 0; i < field.F.length; i++) energy += Math.abs(field.F[i]);
check("field has a figure", energy > 100);

var rnd = P.makeRng(1);
var parts = P.makeParticles(400);
P.scatterParticles(parts, rnd);
var still = P.stepParticles(parts, field, 0, rnd);
check("still sand stays", still === 0);
var moved = 0;
for (var s = 0; s < 30; s++) moved += P.stepParticles(parts, field, 1, rnd);
check("vibration moves sand", moved > 0.01);

function peak(n, at) {
  var q = new Float64Array(n);
  q[at] = 1;
  return q;
}
function feed(exp, q, T, sec) {
  var bits = 0, dt = 0.05, k = 0;
  for (var t = 0; t < sec; t += dt) { bits = exp.read(q, T, dt).bits; k++; }
  return bits;
}
var a = L.makeExpectation(32);
var b = L.makeExpectation(32);
var q0 = peak(32, 4);
var early = a.read(q0, 1, 0.05).bits;
var late = feed(a, q0, 1, 2);
check("steady spectrum grows familiar", late < early * 0.5);

var cold = feed(L.makeExpectation(32), q0, 0.5, 1);
var hot = feed(L.makeExpectation(32), q0, 1.8, 1);
check("hotter listening stays more surprised", hot > cold);

var steady = L.makeExpectation(32);
var varied = L.makeExpectation(32);
var sumSteady = 0, sumVaried = 0, n = 0;
for (var t = 0; t < 3; t += 0.05) {
  sumSteady += steady.read(q0, 1, 0.05).bits;
  sumVaried += varied.read(peak(32, (n * 3) % 32), 1, 0.05).bits;
  n++;
}
check("a changing spectrum is more surprising", sumVaried > sumSteady * 2);

var ids = sources.map(function (s) { return s.id; });
check("picker order", ids.join(",") === "whale,dolphin,mycelium,file");
var whale = sources.filter(function (s) { return s.id === "whale"; })[0];
var dolphin = sources.filter(function (s) { return s.id === "dolphin"; })[0];
var myc = sources.filter(function (s) { return s.id === "mycelium"; })[0];
var yours = sources.filter(function (s) { return s.id === "file"; })[0];
check("whale exemplar", whale && whale.exemplar && whale.exemplar.url.indexOf("humpback") >= 0);
check("dolphin exemplar", dolphin && dolphin.exemplar && dolphin.exemplar.license.indexOf("Public domain") >= 0);
check("mycelium is CC BY data", myc && myc.series && myc.series.license.indexOf("CC BY") >= 0 && !myc.exemplar);
check("your file has no bundle", yours && yours.exemplar === null && yours.series === null);
check("bands are pairs", sources.every(function (s) { return s.band[0] < s.band[1]; }));

var bytes = new ArrayBuffer(8);
var view = new DataView(bytes);
view.setInt16(0, 1500, true);
view.setInt16(2, -200, true);
view.setInt16(4, 0, true);
view.setInt16(6, 800, true);
var mv = M.decodeI16(bytes, 0.001);
check("int16 millivolts", Math.abs(mv[0] - 1.5) < 1e-6 && Math.abs(mv[1] + 0.2) < 1e-6);
function rms(a) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i] * a[i]; return Math.sqrt(s / a.length); }
function period(a) {
  var marks = [];
  for (var i = 1; i < a.length; i++) if (a[i - 1] <= 0 && a[i] > 0) marks.push(i);
  if (marks.length < 3) return 0;
  return (marks[marks.length - 1] - marks[0]) / (marks.length - 1);
}
var high = M.render(new Float32Array(800).fill(1.5), { compress: 80, rate: 4000 });
var low = M.render(new Float32Array(800).fill(-1.5), { compress: 80, rate: 4000 });
check("sonification is audible", rms(high) > 0.05 && rms(high) < 0.95);
check("voltage bends pitch", period(high) > 0 && period(low) > period(high) * 1.05);
var raw = fs.readFileSync(path.join(dir, "audio/schizophyllum-commune-d5-6.i16"));
var ab = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
var series = M.decodeI16(ab, 0.001);
check("bundled mycelium excerpt", series.length === 28800 && series[0] > 0.5 && series[0] < 2);

var st = L.statsOf([0.2, 0.4, 1.1]);
check("breath stats", st.mu > 0.5 && st.mu < 0.6 && st.sigma > 0 && st.seed > 0);

check("work order", works.map(function (w) { return w.id; }).join(",") === "sitting,mycelium,whale,tree,dolphin,plant");
check("just sitting is the closed work", works[0].closed === true && works[0].stroke === null);
check("nature works are open", works.slice(1).every(function (w) { return w.closed === false && w.stroke; }));
var seenT = null;
var voice = Open.seal({ pull: function (dt, T) { seenT = T; return { dt: dt }; } });
voice.pull(0.2, 9);
check("open voice is frozen", Object.isFrozen(voice));
check("open pull takes one argument", voice.pull.length === 1);
check("unrest cannot enter", voice.setUnrest === undefined && seenT === 1);
var a0 = Strokes.openAngle(0, false, 0);
var openEnd = Strokes.openAngle(1, false, 0);
var shut = Strokes.openAngle(1, true, 1);
check("stroke stays open until the last breath", openEnd - a0 < Math.PI * 2 - 0.4);
check("last breath can close", shut - a0 > openEnd - a0);
var dabs = [];
var paper = { dab: function (x, y) { dabs.push([x, y]); }, fade: function () {}, fadeRim: function () {} };
Strokes.create("plant").step(paper, { pos: 0.5, breath: 5, breaths: 11, last: false, close: 0, energy: 0.5, flux: 0, bits: 0.2, centroid: 0.4, phase: 0.2 });
check("plant draws leaves before the circle closes", dabs.length > 8);

if (failed) {
  console.error(failed + " failed");
  process.exit(1);
}
console.log("all passed");
