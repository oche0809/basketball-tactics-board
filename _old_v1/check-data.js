/*
 * 戦術データのチェック（data/tactics.js を編集した後に実行）
 *   node check-data.js
 * 入力ミス（存在しない選手番号、座標の書き忘れ、クイズの答えの番号違いなど）を見つけます。
 */
var fs = require("fs");
var vm = require("vm");
var path = require("path");

var sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, "data/tactics.js"), "utf8"), sandbox);
var tactics = sandbox.window.TACTICS || [];
var cats = (sandbox.window.CATEGORIES || []).map(function (c) { return c.id; });
var errors = [];
var ids = {};

function isPoint(p) { return Array.isArray(p) && p.length === 2 && p.every(function (v) { return typeof v === "number"; }); }

tactics.forEach(function (t, ti) {
  var where = "[" + (t.name || "戦術" + (ti + 1)) + "] ";
  function err(msg) { errors.push(where + msg); }
  if (!t.id) err("id がありません");
  else if (ids[t.id]) err("id「" + t.id + "」が重複しています");
  ids[t.id] = true;
  if (cats.indexOf(t.category) < 0) err("category「" + t.category + "」は CATEGORIES にありません");
  ["name", "purpose"].forEach(function (k) { if (!t[k]) err(k + " が空です"); });
  if (!t.source || !t.source.type) err("source（出典）がありません");

  var known = Object.keys(t.players || {}).concat(Object.keys(t.defense || {}));
  Object.keys(t.players || {}).forEach(function (k) { if (!isPoint(t.players[k])) err("players の " + k + " の座標が [x, y] になっていません"); });
  if (Object.keys(t.players || {}).length !== 5) err("players は5人必要です");
  if (known.indexOf(t.ball) < 0) err("ball「" + t.ball + "」の選手がいません");

  var holder = t.ball;
  (t.steps || []).forEach(function (st, si) {
    var sw = "STEP " + (si + 1) + "：";
    if (!st.action) err(sw + "action が空です");
    if (st.pass) {
      if (known.indexOf(st.pass.from) < 0 || known.indexOf(st.pass.to) < 0) err(sw + "pass の選手番号が正しくありません");
      else if (st.pass.from !== holder) err(sw + "pass の from（" + st.pass.from + "）はボールを持っていません（今は " + holder + " が持っています）");
      holder = st.pass.to;
    }
    (st.moves || []).forEach(function (m) {
      if (known.indexOf(m.id) < 0) err(sw + "moves の選手「" + m.id + "」がいません");
      var pts = m.path || (m.to ? [m.to] : []);
      if (!pts.length || !pts.every(isPoint)) err(sw + "moves（" + m.id + "）の to / path が [x, y] になっていません");
      if (m.type && ["move", "cut", "screen"].indexOf(m.type) < 0) err(sw + "type は move / cut / screen のどれかにしてください");
      if (m["for"] && known.indexOf(m["for"]) < 0) err(sw + "screen の for「" + m["for"] + "」がいません");
    });
    if (st.shot && known.indexOf(st.shot) < 0) err(sw + "shot の選手がいません");
  });

  (t.quiz || []).forEach(function (q, qi) {
    if (!Array.isArray(q.choices) || q.choices.length < 2) err("クイズ" + (qi + 1) + "：choices が足りません");
    else if (!(q.answer >= 0 && q.answer < q.choices.length)) err("クイズ" + (qi + 1) + "：answer は 0〜" + (q.choices.length - 1) + " の番号にしてください（0 = A）");
  });
});

if (errors.length) {
  console.log("✖ " + errors.length + " 件の問題があります");
  errors.forEach(function (e) { console.log("  - " + e); });
  process.exit(1);
}
console.log("✔ 戦術データに問題はありません（" + tactics.length + " 件）");
