/* 人数ルールのテスト：node --test tests/ */
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const V = require("../validate.js");
global.window = { TBValidate: V };
require("../board.js");
const src = require("../data/basketball_tactics_with_u16_setplays.json");
const dg = require("../data/diagrams.json");

const BLOB = { category: "BLOB", steps: ["a"] };
const HC = { category: "HALFCOURT", steps: ["a"] };
const ok4 = () => ({
  inbounder: "1", inbound: [100, -7], on_court_players: ["2", "3", "4", "5"],
  players: { "2": [104, 25], "3": [46, 25], "4": [46, 52], "5": [104, 52] },
  steps: [{ src: [0], label: "x", passes: [{ from: "1", to: "2" }] }]
});
const has = (r, s) => r.errors.some((e) => e.includes(s));

test("正しいBLOB（4人＋I）は通る", () => assert.ok(V.validate(ok4(), BLOB).ok));
test("コート上5人＋I は不可", () => {
  const d = ok4(); d.on_court_players.push("1"); d.players["1"] = [75, 80];
  const r = V.validate(d, BLOB);
  assert.ok(has(r, "BLOBではコート上の選手は4人です。現在5人登録されています。"));
  assert.ok(has(r, "スローイン担当（O1）がコート上の選手にも登録されています。"));
});
test("スローイン担当なしは不可", () => {
  const d = ok4(); d.inbounder = null;
  assert.ok(has(V.validate(d, BLOB), "スローイン担当が設定されていません。"));
});
test("O6（攻撃6人）は不可", () => {
  const d = ok4(); d.on_court_players.push("6"); d.players["6"] = [75, 80];
  const r = V.validate(d, BLOB);
  assert.ok(has(r, "O6 は使えません"));
  assert.ok(has(r, "攻撃側は5人です。現在6人です。"));
});
test("選手ID重複は不可", () => {
  const d = ok4(); d.on_court_players = ["2", "2", "4", "5"];
  assert.ok(has(V.validate(d, BLOB), "同じ選手IDが重複しています"));
});
test("守備4人・6人は不可", () => {
  const d = ok4();
  d.defense = { enabled: true, players: [1, 2, 3, 4].map((i) => ({ id: "D" + i, pos: [70, 20] })) };
  assert.ok(has(V.validate(d, BLOB), "守備は5人です。現在4人"));
  d.defense.players = [1, 2, 3, 4, 5, 6].map((i) => ({ id: "D" + i, pos: [70, 20] }));
  assert.ok(has(V.validate(d, BLOB), "守備は5人です。現在6人"));
});
test("ハーフコートは5人・inbounder null", () => {
  const d = { inbounder: null, on_court_players: ["1", "2", "3", "4", "5"], ball: "1",
    players: { "1": [75, 86], "2": [130, 62], "3": [20, 62], "4": [141, 12], "5": [9, 12] }, steps: [{ src: [0], label: "x" }] };
  assert.ok(V.validate(d, HC).ok);
  d.inbounder = "1";
  assert.ok(!V.validate(d, HC).ok);
});

test("アニメーションできる全戦術：初期状態の攻撃5人・守備5人・スローインは4＋I", () => {
  for (const t of src.tactics) {
    const d = dg.diagrams[t.id];
    if (!d || !V.validate(d, t).ok) continue;
    const s0 = window.TBBoard.computeStates(d)[0];
    const shown = Object.values(s0.pos).filter(Boolean);
    const onCourt = shown.filter((p) => p[0] >= 0 && p[0] <= 150 && p[1] >= 0 && p[1] <= 140);
    assert.strictEqual(shown.length, 5, t.id + " 攻撃の表示人数");
    assert.strictEqual(Object.keys(s0.dpos).length, 5, t.id + " 守備の人数");
    assert.strictEqual(onCourt.length, V.isThrowIn(t.category) ? 4 : 5, t.id + " コート上の人数");
  }
});

// ---------- 守備 ----------
const withDef = (def) => Object.assign(ok4(), { defense: def });
const D5 = () => ["D1", "D2", "D3", "D4", "D5"].map((id, i) => ({ id, pos: [40 + i * 10, 30] }));
test("既存18戦術：守備は想定（verified=false・動作なし・5人）", () => {
  for (const t of src.tactics) {
    const d = dg.diagrams[t.id];
    if (!d) continue;
    const def = V.defenseOf(d);
    assert.strictEqual(def.verified, false, t.id);
    assert.strictEqual(def.steps.length, 0, t.id + " 守備動作は自動生成しない");
    assert.strictEqual(def.players.length, 5, t.id);
  }
});
test("守備D6・不明なaction・targetなしは不可", () => {
  const p = D5(); p[4].id = "D6";
  assert.ok(has(V.validate(withDef({ players: p }), BLOB), "D6 は使えません"));
  assert.ok(has(V.validate(withDef({ players: D5(), steps: [{ step: 1, actions: [{ defender: "D4", action: "fly" }] }] }), BLOB), "fly"));
  assert.ok(has(V.validate(withDef({ players: D5(), steps: [{ step: 1, actions: [{ defender: "D4", action: "follow" }] }] }), BLOB), "相手（target"));
  assert.ok(has(V.validate(withDef({ players: D5(), steps: [{ step: 1, actions: [{ defender: "D4", action: "help" }] }] }), BLOB), "移動先"));
  assert.ok(has(V.validate(withDef({ players: D5(), verified: "yes" }), BLOB), "verified"));
});
test("守備のスイッチでマッチアップが入れ替わり、登録のないSTEPは動かない", () => {
  const d = withDef({ verified: true, players: D5(), matchups: { D1: "O1", D2: "O2", D3: "O3", D4: "O4", D5: "O5" },
    steps: [{ step: 1, actions: [{ defender: "D4", action: "switch", target: "O5" }, { defender: "D5", action: "switch", target: "O4" }] }] });
  d.steps.push({ src: [0], label: "y" });
  assert.ok(V.validate(d, BLOB).ok, JSON.stringify(V.validate(d, BLOB).errors));
  const st = window.TBBoard.computeStates(d);
  assert.strictEqual(st[1].mu.D4, "5");
  assert.strictEqual(st[1].mu.D5, "4");
  assert.strictEqual(st[1].dmoves.length, 2);
  assert.strictEqual(st[2].dmoves.length, 0);
  assert.deepStrictEqual(st[2].dpos, st[1].dpos);
});

// ---------- 守備ライブラリ ----------
const libJson = require("../data/defense_pattern_library.json");
const LIB = V.libIndex(libJson);
const base3 = () => { const d = withDef({ verified: true, players: D5(), matchups: { D1: "O1", D2: "O2", D3: "O3", D4: "O4", D5: "O5" }, steps: [] }); d.steps.push({ src: [0], label: "y" }, { src: [0], label: "z" }); return d; };
test("守備ライブラリは15件・IDは重複なし・既存戦術に自動適用されていない", () => {
  assert.strictEqual(libJson.patterns.length, 15);
  assert.strictEqual(Object.keys(LIB).length, 15);
  for (const id of Object.keys(dg.diagrams)) assert.ok(!dg.diagrams[id].defense, id + " に守備が自動追加されていない");
});
test("無効なパターンID・パターンにない動作は拒否", () => {
  const d = base3();
  d.defense.steps = [{ step: 1, actions: [{ pattern: "DEF-99", defender: "D4", action: "stay" }] }];
  assert.ok(has(V.validate(d, BLOB, LIB), "DEF-99"));
  d.defense.steps = [{ step: 1, actions: [{ pattern: "DEF-08", defender: "D4", action: "switch", target: "O5" }] }];
  assert.ok(has(V.validate(d, BLOB, LIB), "DEF-08"));
});
test("片側だけのスイッチ（マッチアップ不整合）は検出", () => {
  const d = base3();
  d.defense.steps = [{ step: 1, actions: [{ pattern: "DEF-10", defender: "D4", action: "switch", target: "O5" }] }];
  assert.ok(has(V.validate(d, BLOB, LIB), "スイッチ後のマッチアップが合っていません"));
});
test("パターン（DEF-08・DEF-10）の動作で守備が動き、スイッチでマッチアップ更新", () => {
  const d = base3();
  d.defense.steps = [
    { step: 1, actions: [{ pattern: "DEF-08", defender: "D5", action: "screen_avoid_under", target: "O5", screen_by: "O4" }] },
    { step: 2, actions: [{ pattern: "DEF-10", defender: "D4", action: "switch", target: "O5" }, { pattern: "DEF-10", defender: "D5", action: "switch", target: "O4" }] }
  ];
  const r = V.validate(d, BLOB, LIB);
  assert.ok(r.ok, JSON.stringify(r.errors));
  const st = window.TBBoard.computeStates(d);
  assert.strictEqual(st[1].dmoves.length, 1);
  assert.ok(st[1].dmoves[0].via.length === 1, "スクリーンの下を通る経由点");
  assert.strictEqual(st[2].mu.D4, "5");
  assert.strictEqual(st[2].mu.D5, "4");
});
test("位置が必要なパターン動作（ヘルプポジション）は to なしで拒否", () => {
  const d = base3();
  d.defense.steps = [{ step: 1, actions: [{ pattern: "DEF-03", defender: "D1", action: "help_position" }] }];
  assert.ok(has(V.validate(d, BLOB, LIB), "移動先"));
});
test("守備クイズの形（問題・正解は先生が作る）", () => {
  assert.strictEqual(V.validateQuiz({ id: "Q1", pattern_id: "DEF-10", question: "?", choices: ["a", "b"], answer_index: 1 }, LIB, 3).length, 0);
  assert.ok(V.validateQuiz({ id: "Q2", pattern_id: "DEF-99", question: "?", choices: ["a"], answer_index: 3 }, LIB, 3).length >= 2);
});

// ---------- オプション・判断練習 ----------
const planD = () => { const d = base3(); d.steps.push({ src: [0], label: "w" }); d.defense.steps = [{ step: 2, actions: [{ pattern: "DEF-12", defender: "D4", action: "screen_avoid_over", target: "O4", screen_by: "O5" }] }]; return d; };
const plan = () => ({
  options: [
    { id: "option-1", label: "第1オプション", step: 2, players: ["O4"], player_notes: { O4: "先生の説明" } },
    { id: "option-2", label: "第2オプション", step: 3, players: ["O2"] },
    { id: "option-3", label: "第3オプション", step: 3, players: ["O5"] },
    { id: "safety", label: "セーフティ", step: 1, players: ["I"] }
  ],
  decisions: [{ step: 2, stopped: "option-1", defense: { step: 2, defender: "D4" }, pattern_id: "DEF-12", choices: ["option-2", "option-3", "safety"], answer: "option-2", next_step: 3, player_notes: { O4: "先生の説明" } }]
});
test("オプション：第1〜第3・セーフティを登録でき、守備STEPとパターンを参照できる", () => {
  const d = planD();
  assert.ok(V.validate(d, BLOB, LIB).ok);
  assert.deepStrictEqual(V.validateOptions(plan(), d, BLOB, LIB), []);
});
test("オプション：id重複・存在しないSTEP・不正な選手・D6・存在しない守備STEP・パターンIDを拒否", () => {
  const d = planD();
  const p1 = plan(); p1.options[1].id = "option-1";
  assert.ok(V.validateOptions(p1, d, BLOB, LIB).some((e) => e.includes("重複")));
  const p2 = plan(); p2.options[0].step = 9; p2.decisions[0].next_step = 9;
  assert.ok(V.validateOptions(p2, d, BLOB, LIB).filter((e) => e.includes("STEP 9")).length === 2);
  const p3 = plan(); p3.options[0].players = ["O6"]; p3.decisions[0].player_notes = { O7: "x" };
  assert.ok(V.validateOptions(p3, d, BLOB, LIB).filter((e) => e.includes("この戦術にいません")).length === 2);
  const p4 = plan(); p4.decisions[0].defense = { step: 2, defender: "D6" };
  assert.ok(V.validateOptions(p4, d, BLOB, LIB).some((e) => e.includes("D6")));
  const p5 = plan(); p5.decisions[0].defense = { step: 1, defender: "D4" }; p5.decisions[0].pattern_id = "DEF-77";
  const e5 = V.validateOptions(p5, d, BLOB, LIB);
  assert.ok(e5.some((e) => e.includes("守備 STEP 1")) && e5.some((e) => e.includes("DEF-77")));
  const p6 = plan(); p6.decisions[0].answer = "option-1";
  assert.ok(V.validateOptions(p6, d, BLOB, LIB).some((e) => e.includes("正解")));
});
test("オプション：ハーフコートでは I を選手にできない・クイズからオプション参照", () => {
  const d = { inbounder: null, on_court_players: ["1", "2", "3", "4", "5"], ball: "1", players: { "1": [75, 86], "2": [130, 62], "3": [20, 62], "4": [141, 12], "5": [9, 12] }, steps: [{ src: [0], label: "x" }] };
  assert.ok(V.validateOptions({ options: [{ id: "safety", players: ["I"] }], decisions: [] }, d, HC, LIB).length === 1);
  const ctx = { options: ["option-1"], players: ["1", "2", "3", "4", "5"] };
  assert.strictEqual(V.validateQuiz({ id: "Q", question: "D4がスイッチした場合、O4の次の動きは？", choices: ["a", "b"], answer_index: 0, option_id: "option-1", player: "O4", defender: "D4" }, LIB, 1, ctx).length, 0);
  assert.strictEqual(V.validateQuiz({ id: "Q", question: "?", choices: ["a", "b"], answer_index: 0, option_id: "option-9", player: "O6", defender: "D9" }, LIB, 1, ctx).length, 3);
});

// ---------- チーム戦術（原本 + チーム独自設定） ----------
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const sha = (f) => crypto.createHash("sha256").update(fs.readFileSync(path.join(__dirname, "..", "data", f))).digest("hex");
const teamJson = require("../data/team/team_tactics.json");
const byIdT = Object.fromEntries(src.tactics.map((t) => [t.id, t]));
test("原本データが変更されていない", () => {
  assert.strictEqual(sha("basketball_tactics_with_u16_setplays.json"), "463e4e85566dda9f3760e321cbd6fc26c6cd0a290317c16b4224005a6bd040ab");
  assert.strictEqual(sha("diagrams.json"), "2710d19419315f8bf3b812eea52b7ab571b52ef635f61badb478ac7900a68dcd");
  assert.strictEqual(sha("defense_pattern_library.json"), "f680ea890d25e5967debf9fab3219371708dfd7f790c3819e1858bf952ddbb76");
});
test("team_tactics.json が読み込め、内容は自動で作られていない", () => {
  assert.deepStrictEqual(teamJson.meta.initial_targets, ["BLOB-03", "SLOB-01", "HC-01"]);
  for (const [id, e] of Object.entries(teamJson.tactics)) assert.deepStrictEqual(V.validateTeamTactic(id, e, byIdT[id], dg.diagrams[id], LIB), []);
});
test("チーム版が原本を上書きし、ない項目は原本を使う（原本オブジェクトは変わらない）", () => {
  const orig = JSON.stringify(dg.diagrams["BLOB-03"]);
  const e = { use: true, team_call_name: "テスト", defense: { verified: true, players: D5(), matchups: { D1: "O1", D2: "O2", D3: "O3", D4: "O4", D5: "O5" }, steps: [] } };
  const m = V.mergeTeam(dg.diagrams["BLOB-03"], e);
  assert.strictEqual(m.defense.verified, true);
  assert.strictEqual(m.steps, dg.diagrams["BLOB-03"].steps);
  assert.strictEqual(m.inbounder, "2");
  assert.strictEqual(JSON.stringify(dg.diagrams["BLOB-03"]), orig);
  assert.strictEqual(V.mergeTeam(dg.diagrams["HC-01"], { team_call_name: "x" }), dg.diagrams["HC-01"]);
  assert.deepStrictEqual(V.validateTeamTactic("BLOB-03", e, byIdT["BLOB-03"], dg.diagrams["BLOB-03"], LIB), []);
});
test("チーム戦術：存在しないID・作図なし・O6・不正STEP・不正パターン・D6・option重複・守備人数を拒否", () => {
  const v = (id, e) => V.validateTeamTactic(id, e, byIdT[id], dg.diagrams[id], LIB);
  assert.ok(v("BLOB-99", {})[0].includes("存在しない戦術ID"));
  assert.ok(v("HC-06", {})[0].includes("作図（アニメーション）がない"));
  assert.ok(v("HC-01", { step_roles: { "2": { O6: "x" } }, position_notes: { O6: "x" } }).length === 2);
  assert.ok(v("HC-01", { player_roles: { "6": "x" } }).some((x) => x.includes("O6")));
  assert.ok(v("HC-01", { step_roles: { "9": { O1: "x" } } }).some((x) => x.includes("STEP 9")));
  assert.ok(v("SLOB-01", { position_notes: { I: "スローイン担当の説明" } }).length === 0);
  assert.ok(v("HC-01", { position_notes: { I: "x" } }).length === 1);
  const d5 = { players: D5(), steps: [{ step: 1, actions: [{ pattern: "DEF-99", defender: "D6", action: "stay" }] }] };
  const er = v("HC-01", { defense: d5 });
  assert.ok(er.some((x) => x.includes("DEF-99")) && er.some((x) => x.includes("D6")));
  assert.ok(v("HC-01", { offense_options: [{ id: "option-1" }, { id: "option-1" }] }).some((x) => x.includes("重複")));
  assert.ok(v("SLOB-01", { defense: { players: D5().slice(0, 4) } }).some((x) => x.includes("守備は5人")));
});

// ---------- 教材用守備モデル（tactical_defense_models.json・教師未確認） ----------
const modelsJson = require("../data/tactical_defense_models.json");
const MODEL = V.modelIndex(modelsJson);
const MAP = require("../data/defense_step_map.json").tactics;
test("教材守備モデル：20戦術を読み込め、すべて verified:false・team_tactics へ自動コピーされていない", () => {
  assert.strictEqual(Object.keys(MODEL).length, 20);
  for (const id of Object.keys(MODEL)) { assert.ok(byIdT[id], id); assert.strictEqual(MODEL[id].verified, false); }
  assert.deepStrictEqual(teamJson.tactics, {});
});
test("教材守備モデル：アニメーション可の18戦術で守備が動き、攻撃5人・守備5人を超えない", () => {
  let moving = 0;
  for (const t of src.tactics) {
    const d = dg.diagrams[t.id];
    if (!d) continue;
    const def = V.modelDefense(MODEL[t.id], d, MAP[t.id]);
    assert.strictEqual(def.verified, false);
    assert.strictEqual(def.label, "教材モデル・教師未確認");
    const md = Object.assign({}, d, { defense: def });
    const r = V.validate(md, t, LIB);
    assert.ok(r.ok, t.id + " " + r.errors.join(" / "));
    const st = window.TBBoard.computeStates(md);
    const realMove = st.some((s) => (s.dmoves || []).some((m) => Math.hypot(m.to[0] - m.from[0], m.to[1] - m.from[1]) > 0.5));
    // HC-04 は、JSONの守備動作が「動かない相手への closeout/recover」と「位置のない adjust_to_ball」だけなので、推測で動かさない
    assert.strictEqual(realMove, t.id !== "HC-04", t.id + " 守備が動くか");
    if (t.id === "HC-04") assert.strictEqual(def.animation_status, "motion_rule_only");
    for (const s of st) {
      assert.ok(Object.values(s.pos).filter(Boolean).length === 5, t.id + " 攻撃5人");
      assert.strictEqual(Object.keys(s.dpos).length, 5, t.id + " 守備5人");
    }
    // JSONにないSTEPを追加していない：守備動作の数はJSONと同じ
    const jsonActs = MODEL[t.id].steps.reduce((a, s) => a + (s.defense || []).length, 0);
    const appActs = def.steps.reduce((a, s) => a + s.actions.length, 0);
    if (t.id === "HC-04") assert.strictEqual(appActs, 0, "HC-04 は motion_rule_only で守備動作を作らない");
    else assert.strictEqual(appActs, jsonActs, t.id + " 守備動作の数");
    moving++;
  }
  assert.strictEqual(moving, 18);
});
test("教材守備モデル：switch でマッチアップが更新される（交換）", () => {
  const d = dg.diagrams["BLOB-02"];
  const st = window.TBBoard.computeStates(Object.assign({}, d, { defense: V.modelDefense(MODEL["BLOB-02"], d, MAP["BLOB-02"]) }));
  const k = st.findIndex((s) => (s.switched || []).includes("D4"));
  assert.ok(k > 0);
  assert.strictEqual(st[k].mu.D4, "5");
  assert.strictEqual(st[k].mu.D5, "4");
  assert.deepStrictEqual(st[k].exchanged, [{ id: "D5", to: "4" }]);
  const s4 = window.TBBoard.computeStates(Object.assign({}, dg.diagrams["SLOB-04"], { defense: V.modelDefense(MODEL["SLOB-04"], dg.diagrams["SLOB-04"], MAP["SLOB-04"]) }));
  const k4 = s4.findIndex((s) => (s.switched || []).includes("D2"));
  assert.strictEqual(s4[k4].mu.D2, "5");
  assert.strictEqual(s4[k4].mu.D5, "2");
});

test("資料STEP（source_step）とアプリSTEP（app_step）：保存され、守備は app_step で動き、app_step がなければ動かない", () => {
  for (const [id, mp] of Object.entries(MAP)) {
    if (mp.animation_status) continue;
    const def = V.modelDefense(MODEL[id], dg.diagrams[id], mp);
    for (const s of def.steps) { assert.ok(s.source_step >= 1 && s.app_step >= 1, id); assert.strictEqual(s.step, s.app_step); }
  }
  // BLOB-02：資料STEP1（O4がO5をクロススクリーン）→ アプリSTEP2
  const d = dg.diagrams["BLOB-02"];
  const moved = (mp) => window.TBBoard.computeStates(Object.assign({}, d, { defense: V.modelDefense(MODEL["BLOB-02"], d, mp) })).map((s) => (s.dmoves || []).length > 0);
  const m1 = moved(MAP["BLOB-02"]);
  assert.strictEqual(m1[1], false); assert.strictEqual(m1[2], true);
  const alt = JSON.parse(JSON.stringify(MAP["BLOB-02"])); alt.steps[0].app_step = 1;
  const m2 = moved(alt);
  assert.strictEqual(m2[1], true);
  const none = { steps: MAP["BLOB-02"].steps.map((x) => ({ source_step: x.source_step })) };
  const defN = V.modelDefense(MODEL["BLOB-02"], d, none);
  assert.deepStrictEqual(defN.unmapped_source_steps, [1, 2, 3, 4]);
  assert.ok(moved(none).every((x) => x === false));
});
test("HC-04：motion_rule_only・守備座標を作らない・エラーにならない", () => {
  const d = dg.diagrams["HC-04"];
  const def = V.modelDefense(MODEL["HC-04"], d, MAP["HC-04"]);
  assert.strictEqual(def.animation_status, "motion_rule_only");
  assert.deepStrictEqual(def.steps, []);
  assert.ok(V.validate(Object.assign({}, d, { defense: def }), byIdT["HC-04"], LIB).ok);
  const st = window.TBBoard.computeStates(Object.assign({}, d, { defense: def }));
  assert.ok(st.every((s) => (s.dmoves || []).length === 0));
  assert.strictEqual(Object.keys(st[0].dpos).length, 5);
});

// ---------- 教材モデルの教師確認（defense_review） ----------
test("教師確認：未確認・approved・modified・rejected の表示と優先順位（原本・教材モデルは変えない）", () => {
  const id = "BLOB-02", d = dg.diagrams[id], m = MODEL[id], mp = MAP[id];
  const before = JSON.stringify([d, m, mp]);
  const r0 = V.resolveDefense(d, m, mp, null);
  assert.strictEqual(r0.source, "model"); assert.strictEqual(r0.diagram.defense.label, "教材モデル・教師未確認");
  const rA = V.resolveDefense(d, m, mp, { defense_review: { status: "approved", reviewer: "T", reviewed_at: "2026-09-27T00:00:00Z", note: "" } });
  assert.strictEqual(rA.source, "model"); assert.strictEqual(rA.diagram.defense.label, "教師確認済み（教材モデル）");
  assert.strictEqual(rA.diagram.defense.verified, false, "verified は自動変更しない");
  const mod = JSON.parse(JSON.stringify(V.modelDefense(m, d, mp))); mod.steps[0].actions = [{ defender: "D5", action: "stay_in_matchup", target: "O5" }];
  const eM = { defense_review: { status: "modified", reviewer: "T", reviewed_at: "2026-09-27T00:00:00Z", note: "" }, defense: mod };
  const rM = V.resolveDefense(d, m, mp, eM);
  assert.strictEqual(rM.source, "team"); assert.strictEqual(rM.diagram.defense.label, "教師確認・修正版（チーム版）");
  assert.deepStrictEqual(rM.diagram.defense.steps[0].actions, mod.steps[0].actions);
  assert.deepStrictEqual(V.validateTeamTactic(id, eM, byIdT[id], d, LIB), []);
  const rR = V.resolveDefense(d, m, mp, { defense_review: { status: "rejected", reviewer: "", reviewed_at: "", note: "" } });
  assert.strictEqual(rR.source, "rejected"); assert.strictEqual(rR.diagram.defense, undefined, "採用しないなら教材モデルを使わない");
  const stR = window.TBBoard.computeStates(rR.diagram);
  assert.strictEqual(Object.keys(stR[0].dpos).length, 5, "位置表示（想定ディフェンス）は使える");
  assert.ok(stR.every((s) => (s.dmoves || []).length === 0));
  assert.strictEqual(JSON.stringify([d, m, mp]), before, "原本・教材モデル・対応表は変わらない");
  assert.strictEqual(sha("tactical_defense_models.json"), "2757ca660fb11ad8137543a92b4c3e89619ad49d3d4a6f038a66a52915a4a542");
});
test("教師確認：不正な状態・修正なのに守備なし は保存できない／チーム版への自動コピーなし／HC-04は従来通り", () => {
  const v = (id, e) => V.validateTeamTactic(id, e, byIdT[id], dg.diagrams[id], LIB);
  assert.ok(v("BLOB-02", { defense_review: { status: "ok" } }).some((x) => x.includes("defense_review.status")));
  assert.ok(v("BLOB-02", { defense_review: { status: "modified" } }).some((x) => x.includes("修正")));
  assert.deepStrictEqual(teamJson.tactics, {});
  const r = V.resolveDefense(dg.diagrams["HC-04"], MODEL["HC-04"], MAP["HC-04"], null);
  assert.strictEqual(r.diagram.defense.animation_status, "motion_rule_only");
  assert.deepStrictEqual(r.diagram.defense.steps, []);
});
