/*
 * 戦術データ（作図レイヤー）の人数・構造チェック
 * ブラウザ（app.js）と node（build.js / tests）の両方で使う。
 *
 * BLOB / SLOB      : コート上4人（on_court_players）＋ スローイン担当1人（inbounder、位置は inbound）
 * HALFCOURT / SET  : コート上5人、inbounder = null
 * 守備             : 5人
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.TBValidate = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  var PIDS = ["1", "2", "3", "4", "5"];
  var BASKET = [75, 15.75];
  var MOVE_TYPES = ["cut", "move", "dribble", "screen"];

  function isPt(p) {
    return Array.isArray(p) && p.length === 2 && p.every(function (v) { return typeof v === "number" && isFinite(v); });
  }
  function insideCourt(p) { return p[0] >= 0 && p[0] <= 150 && p[1] >= 0 && p[1] <= 140; }
  function isThrowIn(cat) { return cat === "BLOB" || cat === "SLOB"; }
  function r1(v) { return Math.round(v * 10) / 10; }

  function offenseIds(d) {
    var oc = Array.isArray(d.on_court_players) ? d.on_court_players.map(String) : [];
    if (d.inbounder !== null && d.inbounder !== undefined && d.inbounder !== "") oc = oc.concat([String(d.inbounder)]);
    return oc;
  }

  // 守備の動作（アニメーションで扱えるものだけ）
  // 守備ライブラリ（defense_pattern_library.json）の動作名もそのまま使える
  var LIB_ACTIONS = ["stay_in_matchup", "adjust_to_ball", "help_position", "help_rotation", "matchup_recover", "lock_and_trail",
    "screen_avoid_under", "screen_avoid_over", "screen_avoid_through", "double"];
  var DEF_ACTIONS = ["stay", "follow", "switch", "switch_back", "recover", "closeout", "screen_avoid", "help", "hedge", "deny"].concat(LIB_ACTIONS);
  var NEEDS_TARGET = ["follow", "switch", "closeout", "screen_avoid", "matchup_recover", "lock_and_trail",
    "screen_avoid_under", "screen_avoid_over", "screen_avoid_through", "double"];
  // 位置は登録された to だけを使う（自動で決めない）
  var NEEDS_TO = ["help", "hedge", "deny", "adjust_to_ball", "help_position", "help_rotation", "double"];
  var SCREEN_METHODS = ["under", "over", "go_through", "switch"];
  var SCREEN_ACTIONS = { screen_avoid: null, screen_avoid_under: "under", screen_avoid_over: "over", screen_avoid_through: "go_through", lock_and_trail: "trail" };
  // ライブラリの動作名 → アニメーションの動作
  function normAction(a) {
    var act = a.action, method = a.method;
    if (act === "stay_in_matchup") act = "stay";
    if (SCREEN_ACTIONS[act]) { method = SCREEN_ACTIONS[act]; act = "screen_avoid"; }
    if (act === "screen_avoid" && method === "switch") act = "switch";
    if (["adjust_to_ball", "help_position", "help_rotation", "double", "help", "hedge", "deny"].indexOf(act) >= 0) act = "move_to";
    return { act: act, method: method };
  }
  var CHANGES_MATCHUP = ["switch", "switch_back", "matchup_recover"];
  // スイッチでマッチアップを更新。exchange:true（教材モデル）のときは、相手を担当していた守備に自分の元の相手を渡す（交換）。
  // 交換された守備は動かさない（動作データがないため）。戻り値：交換された守備のID
  function applySwitch(mu, id, t, exchange) {
    var prev = mu[id], partner = null;
    if (exchange) Object.keys(mu).forEach(function (k) { if (k !== id && mu[k] === t && !partner) partner = k; });
    mu[id] = t;
    if (partner && prev) mu[partner] = prev;
    return partner;
  }
  function normO(v) { return v === null || v === undefined || v === "" ? null : String(v).replace(/^O/i, ""); }

  // 守る相手とゴールを結ぶ線上の位置（相手の位置から機械的に決まる。位置の「想定」にだけ使う）
  function guardPos(pos) {
    var dx = BASKET[0] - pos[0], dy = BASKET[1] - pos[1], dist = Math.hypot(dx, dy) || 1;
    var k = Math.min(insideCourt(pos) ? 9 : 11, dist * 0.45) / dist;
    return [r1(pos[0] + dx * k), r1(pos[1] + dy * k)];
  }

  // 資料に守備の記載がない場合の「想定ディフェンス」：各選手とゴールを結ぶ線上に機械的に置くだけ（動かさない）
  function defaultDefense(d) {
    var players = [], matchups = {};
    offenseIds(d).forEach(function (p) {
      var pos = String(d.inbounder) === p ? d.inbound : (d.players || {})[p];
      if (!isPt(pos)) return;
      players.push({ id: "D" + p, guards: p, pos: guardPos(pos) });
      matchups["D" + p] = "O" + p;
    });
    return {
      enabled: true, mode: "man_to_man", verified: false, generated: true, label: "想定ディフェンス",
      note: "資料に記載された守備動作ではありません。各選手とゴールの間に機械的に置いた想定の位置です。",
      players: players, matchups: matchups, steps: []
    };
  }
  function defenseOf(d) {
    if (!d) return null;
    if (d.defense && d.defense.enabled === false) return null;
    var base = defaultDefense(d);
    if (!d.defense) return base;
    var def = {};
    Object.keys(d.defense).forEach(function (k) { def[k] = d.defense[k]; });
    if (!Array.isArray(def.players) || !def.players.length) { def.players = base.players; def.generated_positions = true; }
    if (!def.matchups) {
      def.matchups = {};
      def.players.forEach(function (x) { def.matchups[x.id] = x.guards ? "O" + normO(x.guards) : base.matchups[x.id]; });
    }
    def.mode = def.mode || def.scenario || "man_to_man";
    def.verified = def.verified === true;
    def.label = def.label || (def.verified ? "登録ディフェンス" : "想定ディフェンス");
    def.steps = Array.isArray(def.steps) ? def.steps : [];
    return def;
  }

  // d = 作図データ、t = 原本の戦術（category と steps を使う）
  function libIndex(libJson) {
    var m = {};
    ((libJson && libJson.patterns) || []).forEach(function (p) { m[p.id] = p; });
    return m;
  }

  // 教師が登録する守備クイズ（問題・正解は自動生成しない）
  // { id, pattern_id, step, question, choices:[...], answer_index, explanation }
  // ctx = { options:[オプションid], players:["1",…,"I"] }（オプションや選手を参照するクイズ用）
  function validateQuiz(q, lib, nSteps, ctx) {
    var E = [];
    if (q && q.option_id && ctx && (ctx.options || []).indexOf(q.option_id) < 0) E.push("クイズのオプション「" + q.option_id + "」は登録されていません。");
    if (q && q.player && ctx && (ctx.players || []).indexOf(q.player === "I" ? "I" : normO(q.player)) < 0) E.push("クイズの選手「" + q.player + "」はこの戦術にいません。");
    if (q && q.defender && !/^D[1-5]$/.test(q.defender)) E.push("クイズの守備「" + q.defender + "」は使えません（D1〜D5）。");
    if (!q || !q.id) E.push("クイズに id がありません。");
    if (q && q.pattern_id && lib && !lib[q.pattern_id]) E.push("クイズの守備パターン「" + q.pattern_id + "」は守備ライブラリにありません。");
    if (!q || !q.question) E.push("クイズの問題（question）が空です。");
    if (!q || !Array.isArray(q.choices) || q.choices.length < 2) E.push("クイズの選択肢（choices）は2つ以上必要です。");
    else if (!(q.answer_index >= 0 && q.answer_index < q.choices.length)) E.push("クイズの正解（answer_index）は 0〜" + (q.choices.length - 1) + " です。");
    if (q && q.step !== undefined && !(q.step >= 0 && q.step <= (nSteps || 0))) E.push("クイズの step が戦術のSTEP数を超えています。");
    return E;
  }

  // オフェンスのオプションと判断練習（先生が登録。内容は自動で作らない）
  // plan = { options:[{id,label,description,trigger,step,players:["O4","I"],player_notes:{"O4":"…"}}],
  //          decisions:[{step,stopped,defense:{step,defender},pattern_id,message,question,choices:[option id],answer,next_step,player_notes}] }
  function validateOptions(plan, d, t, lib) {
    var E = [];
    if (!plan) return E;
    var n = ((d && d.steps) || []).length;
    var offense = d ? offenseIds(d) : [];
    var ib = d && d.inbounder ? String(d.inbounder) : null;
    var okP = function (p) {
      if (p === "I") return !!ib;
      return offense.indexOf(normO(p)) >= 0;
    };
    var okStep = function (s) { return typeof s === "number" && s >= 0 && s <= n && Math.floor(s) === s; };
    var ids = {};
    (plan.options || []).forEach(function (o) {
      var w = "オプション「" + (o.label || o.id) + "」：";
      if (!o.id) E.push("オプションに id がありません。");
      else if (ids[o.id]) E.push("オプションの id「" + o.id + "」が重複しています。");
      ids[o.id] = true;
      if (o.step !== undefined && o.step !== null && !okStep(o.step)) E.push(w + "STEP " + o.step + " はありません（0〜" + n + "）。");
      (o.players || []).forEach(function (p) { if (!okP(p)) E.push(w + "選手「" + p + "」はこの戦術にいません（O1〜O5" + (ib ? "・I" : "") + "）。"); });
      Object.keys(o.player_notes || {}).forEach(function (p) { if (!okP(p)) E.push(w + "説明の選手「" + p + "」はこの戦術にいません。"); });
    });
    var def = d ? defenseOf(d) : null;
    (plan.decisions || []).forEach(function (q, i) {
      var w = "判断 " + (i + 1) + "（STEP " + q.step + "）：";
      if (!okStep(q.step) || q.step < 1) E.push(w + "STEP " + q.step + " はありません（1〜" + n + "）。");
      if (q.stopped && !ids[q.stopped]) E.push(w + "止められたオプション「" + q.stopped + "」が登録されていません。");
      if (!Array.isArray(q.choices) || q.choices.length < 2) E.push(w + "次の動きの選択肢は2つ以上必要です。");
      else q.choices.forEach(function (c) { if (!ids[c]) E.push(w + "選択肢「" + c + "」はオプションに登録されていません。"); });
      if (!q.answer || (q.choices || []).indexOf(q.answer) < 0) E.push(w + "正解（answer）は選択肢の中から選んでください。");
      if (q.next_step !== undefined && q.next_step !== null && !okStep(q.next_step)) E.push(w + "移動先の STEP " + q.next_step + " はありません。");
      Object.keys(q.player_notes || {}).forEach(function (p) { if (!okP(p)) E.push(w + "説明の選手「" + p + "」はこの戦術にいません。"); });
      if (q.pattern_id && lib && !lib[q.pattern_id]) E.push(w + "守備パターン「" + q.pattern_id + "」は守備ライブラリにありません。");
      if (q.defense) {
        var dr = q.defense;
        if (dr.defender && !/^D[1-5]$/.test(dr.defender)) E.push(w + "守備「" + dr.defender + "」は使えません（D1〜D5）。");
        var ds = null;
        ((def && def.steps) || []).forEach(function (s) { if (s.step === dr.step) ds = s; });
        if (!ds) E.push(w + "守備 STEP " + dr.step + " の動作は登録されていません。");
        else if (dr.defender && !(ds.actions || []).some(function (a) { return a.defender === dr.defender; }) && !(ds.moves || []).some(function (m) { return m.id === dr.defender; }))
          E.push(w + "守備 STEP " + dr.step + " に " + dr.defender + " の動作は登録されていません。");
      }
    });
    return E;
  }

  // 戦術別の教材用守備モデル（data/tactical_defense_models.json）→ アプリの defense 形式
  // offense_step は「資料の流れ」の番号。その番号を src に持つアプリSTEPのうち最後のSTEPで守備を動かす（機械的な対応づけ）。
  // 位置が必要な動作（ディナイ等）で位置がないものは display_only（文字だけ表示し、動かさない）。
  // 守備STEPの番号：app_step（アプリで表示するSTEP）を使う。教師データは step（＝アプリSTEP）
  function defStepNo(s) { return s.app_step !== undefined && s.app_step !== null ? s.app_step : s.step; }
  // 同じアプリSTEPの守備をまとめる（資料STEPが2つ同じアプリSTEPに対応する場合など）
  function groupDefSteps(def) {
    var g = {};
    ((def && def.steps) || []).forEach(function (s) {
      var k = defStepNo(s);
      if (k === undefined || k === null) return;
      var e = g[k] || (g[k] = { step: k, actions: [], moves: [], note: "", source_steps: [] });
      e.actions = e.actions.concat(s.actions || []);
      e.moves = e.moves.concat(s.moves || []);
      if (s.note) e.note = e.note ? e.note + "／" + s.note : s.note;
      if (s.source_step !== undefined) e.source_steps.push(s.source_step);
    });
    return g;
  }

  // 戦術別の教材用守備モデル → アプリの defense 形式
  // map = data/defense_step_map.json の1戦術分 { steps:[{source_step, app_step}] } または { animation_status:"motion_rule_only", note }
  // app_step がない資料STEPの守備は動かさない（unmapped_source_steps に記録）。位置がない動作は display_only。
  function modelDefense(m, dg, map) {
    if (!m || !dg) return null;
    var ibd = m.inbounder_defense;
    var def = {
      enabled: true, mode: "man_to_man", verified: false, status: "teaching_model", label: "教材モデル・教師未確認",
      source: "tactical_defense_models.json（" + (m.name || m.tactic_id) + "）", source_url: (m.sources || [])[0] || "",
      note: (m.notes || []).join(" ") + (ibd ? " スローイン時：" + ibd.defender + "（" + ibd.mode + "）" + (ibd.note ? " " + ibd.note : "") : ""),
      matchups: m.matchup_start || undefined, players: [], steps: [], unmapped_source_steps: []
    };
    if (map && map.animation_status === "motion_rule_only") {
      def.animation_status = "motion_rule_only";
      def.motion_note = map.note || "";
      return def;
    }
    var mm = {};
    ((map && map.steps) || []).forEach(function (x) { mm[x.source_step] = x.app_step; });
    (m.steps || []).forEach(function (s) {
      var app = mm[s.offense_step];
      if (app === undefined || app === null) { def.unmapped_source_steps.push(s.offense_step); return; }
      def.steps.push({
        source_step: s.offense_step, app_step: app, step: app, note: s.trigger,
        actions: (s.defense || []).map(function (a) {
          var c = {};
          Object.keys(a).forEach(function (k) { c[k] = a[k]; });
          if (NEEDS_TO.indexOf(a.action) >= 0 && !isPt(a.to)) c.display_only = true;
          if (a.action === "switch") c.exchange = true; // スイッチ＝マッチアップの交換として扱う
          return c;
        })
      });
    });
    return def;
  }
  // 守備の表示の優先順位：チーム版 ＞ 教師確認済み教材モデル ＞ 未確認教材モデル ＞ 想定ディフェンス
  // 教師確認は team_tactics の defense_review に保存（教材モデル・原本は変えない）。rejected なら教材モデルを使わない。
  var REVIEW_STATUS = ["unreviewed", "approved", "modified", "rejected"];
  function resolveDefense(dg, m, map, e) {
    var rv = (e && e.defense_review) || null;
    if (!dg) return { diagram: dg, source: "none", review: rv };
    if (e && e.defense) {
      var dt = mergeTeam(dg, e), td = {};
      Object.keys(e.defense).forEach(function (k) { td[k] = e.defense[k]; });
      if (rv && rv.status === "modified") td.label = "教師確認・修正版（チーム版）";
      td.review = rv;
      dt.defense = td;
      return { diagram: dt, source: "team", review: rv };
    }
    if (dg.defense || !m) return { diagram: dg, source: "assumed", review: rv };
    if (rv && rv.status === "rejected") return { diagram: dg, source: "rejected", review: rv };
    var def = modelDefense(m, dg, map);
    if (rv && rv.status === "approved") def.label = "教師確認済み（教材モデル）";
    def.review = rv;
    var out = {};
    Object.keys(dg).forEach(function (k) { out[k] = dg[k]; });
    out.defense = def;
    return { diagram: out, source: "model", review: rv };
  }

  function modelIndex(json) {
    var m = {};
    ((json && json.tactics) || []).forEach(function (t) { m[t.tactic_id] = t; });
    return m;
  }

  // チーム戦術（data/team/team_tactics.json）：原本 + チーム独自設定 = 表示する戦術
  // entry = { use, team_call_name, name, signal, teacher_memo, team_notes, player_roles, positions, step_points,
  //           step_roles:{"3":{"O4":"…"}}, position_notes:{"O4":"…"}, defense, offense_options, decisions, quizzes }
  function mergeTeam(dg, entry) { // 作図（原本）は書き換えない。守備だけチーム版を重ねる
    if (!dg || !entry || !entry.defense) return dg;
    var out = {};
    Object.keys(dg).forEach(function (k) { out[k] = dg[k]; });
    out.defense = entry.defense;
    return out;
  }
  function validateTeamTactic(id, entry, t, dg, lib) {
    var E = [];
    if (!t) return ["存在しない戦術ID「" + id + "」です。"];
    if (!dg) return ["「" + id + "」は作図（アニメーション）がないため、チーム戦術として登録できません。"];
    if (!entry || typeof entry !== "object") return ["「" + id + "」のチーム設定の形が正しくありません。"];
    if (entry.use !== undefined && typeof entry.use !== "boolean") E.push("「使用するか（use）」は true か false です。");
    var rv = entry.defense_review;
    if (rv !== undefined) {
      if (!rv || REVIEW_STATUS.indexOf(rv.status) < 0) E.push("守備モデルの確認状態（defense_review.status）は " + REVIEW_STATUS.join(" / ") + " のどれかです。");
      else if (rv.status === "modified" && !entry.defense) E.push("「修正」の場合は、チーム版の守備（defense）が必要です。");
      ["reviewer", "reviewed_at", "note"].forEach(function (k) { if (rv && rv[k] !== undefined && typeof rv[k] !== "string") E.push("defense_review." + k + " は文字で書いてください。"); });
    }
    var merged = mergeTeam(dg, entry);
    var r = validate(merged, t, lib);
    if (!r.ok) E = E.concat(r.errors);
    E = E.concat(validateOptions({ options: entry.offense_options || [], decisions: entry.decisions || [] }, merged, t, lib));
    var n = (dg.steps || []).length, offense = offenseIds(dg), ib = dg.inbounder ? String(dg.inbounder) : null;
    var okP = function (p) { return p === "I" ? !!ib : /^O?[1-5]$/.test(String(p)) && offense.indexOf(normO(p)) >= 0; };
    Object.keys(entry.player_roles || {}).concat(Object.keys(entry.positions || {})).forEach(function (p) {
      if (!okP(p)) E.push("選手「" + (/^\d$/.test(p) ? "O" + p : p) + "」はこの戦術にいません（O1〜O5）。");
    });
    Object.keys(entry.step_roles || {}).forEach(function (k) {
      if (!/^\d+$/.test(k) || +k > n) E.push("STEP " + k + " はありません（0〜" + n + "）。");
      Object.keys(entry.step_roles[k] || {}).forEach(function (p) { if (!okP(p)) E.push("STEP " + k + " の役割：選手「" + p + "」はこの戦術にいません。"); });
    });
    Object.keys(entry.step_points || {}).forEach(function (k) { if (!/^\d+$/.test(k) || +k > n) E.push("指導ポイントの STEP " + k + " はありません。"); });
    Object.keys(entry.position_notes || {}).forEach(function (p) { if (!okP(p)) E.push("選手別説明：選手「" + p + "」はこの戦術にいません。"); });
    var ctx = { options: (entry.offense_options || []).map(function (o) { return o.id; }), players: offense.concat(ib ? ["I"] : []) };
    (entry.quizzes || []).forEach(function (q) { E = E.concat(validateQuiz(q, lib, n, ctx)); });
    return E;
  }

  // library = { "DEF-01": パターン, ... }（守備ライブラリ。パターンIDの確認に使う）
  function validate(d, t, library) {
    var E = [], W = [];
    var lib = library || null;
    var cat = t && t.category;
    if (!d || typeof d !== "object") return { ok: false, errors: ["作図データがありません。"], warnings: W };

    // ---- 攻撃の人数 ----
    var oc = Array.isArray(d.on_court_players) ? d.on_court_players.map(String) : null;
    if (!oc) { E.push("コート上の選手（on_court_players）が設定されていません。"); oc = []; }
    var ib = d.inbounder === undefined || d.inbounder === "" ? null : d.inbounder;
    if (ib !== null) ib = String(ib);

    var seen = {}, dup = [];
    oc.forEach(function (p) { if (seen[p]) dup.push("O" + p); seen[p] = true; });
    if (dup.length) E.push("同じ選手IDが重複しています：" + dup.join("、"));
    var badIds = oc.concat(ib !== null ? [ib] : []).filter(function (p) { return PIDS.indexOf(p) < 0; });
    if (badIds.length) E.push("選手IDは O1〜O5 だけです（" + badIds.map(function (p) { return "O" + p; }).join("、") + " は使えません）。");

    if (isThrowIn(cat)) {
      if (oc.length !== 4) E.push(cat + "ではコート上の選手は4人です。現在" + oc.length + "人登録されています。");
      if (ib === null) E.push("スローイン担当が設定されていません。");
      else {
        if (oc.indexOf(ib) >= 0) E.push("スローイン担当（O" + ib + "）がコート上の選手にも登録されています。");
        if (!isPt(d.inbound)) E.push("スローイン位置（inbound）が [x, y] で設定されていません。");
        else if (insideCourt(d.inbound)) E.push("スローイン位置がコートの内側です。コートの外に置いてください。");
      }
    } else {
      if (oc.length !== 5) E.push("この戦術ではコート上の選手は5人です。現在" + oc.length + "人登録されています。");
      if (ib !== null) E.push("スローインではない戦術にスローイン担当は設定できません（inbounder は null）。");
    }
    var offense = offenseIds({ on_court_players: oc, inbounder: ib });
    var uniq = offense.filter(function (p, i) { return offense.indexOf(p) === i; });
    if (uniq.length !== 5) E.push("攻撃側は5人です。現在" + uniq.length + "人です。");

    // ---- 位置 ----
    var players = d.players || {};
    oc.forEach(function (p) {
      if (!isPt(players[p])) E.push("O" + p + "の初期位置が未確定です（資料で要確認）。");
      else if (!insideCourt(players[p])) E.push("O" + p + "はコート上の選手ですが、位置がコートの外です。");
    });
    Object.keys(players).forEach(function (p) {
      if (oc.indexOf(p) >= 0) return;
      if (p === ib) E.push("スローイン担当（O" + p + "）の位置は players ではなく inbound に書いてください。");
      else E.push("players に、コート上の選手ではない O" + p + " が入っています。");
    });

    // ---- 守備 ----
    var rosterOk = !E.length;
    var def = null;
    if (rosterOk) {
      def = defenseOf(d);
      if (def) {
        var dp = def.players || [];
        if (dp.length !== 5) E.push("守備は5人です。現在" + dp.length + "人登録されています。");
        var dseen = {};
        dp.forEach(function (x) {
          if (!x || !x.id) { E.push("守備の選手に id がありません。"); return; }
          if (!/^D[1-5]$/.test(x.id)) E.push("守備の選手IDは D1〜D5 です（" + x.id + " は使えません）。");
          if (dseen[x.id]) E.push("守備の選手IDが重複しています：" + x.id);
          dseen[x.id] = true;
          if (!isPt(x.pos)) E.push("守備 " + x.id + " の位置が [x, y] ではありません。");
        });
        if (d.defense && d.defense.verified !== undefined && typeof d.defense.verified !== "boolean")
          E.push("守備の verified は true か false にしてください。");
        var inOff = function (v) { return offense.indexOf(normO(v)) >= 0; };
        var mt = {};
        Object.keys(def.matchups || {}).forEach(function (did) {
          var o = def.matchups[did];
          if (!dseen[did]) E.push("マッチアップの守備「" + did + "」がいません。");
          if (!inOff(o)) E.push("マッチアップ " + did + " の相手「" + o + "」は攻撃の5人にいません。");
          else if (mt[normO(o)]) E.push("マッチアップの相手 O" + normO(o) + " が重複しています。");
          mt[normO(o)] = true;
        });
        var n = (d.steps || []).length;
        (def.steps || []).forEach(function (s) {
          var sw = "守備 STEP " + s.step + "：";
          var sn = defStepNo(s);
          if (!(sn >= 1 && sn <= n)) E.push("守備の " + (s.app_step !== undefined ? "app_step" : "step") + " は 1〜" + n + " にしてください。");
          (s.moves || []).forEach(function (m) {
            if (!dseen[m.id]) E.push(sw + "守備の選手「" + m.id + "」がいません。");
            if (!isPt(m.to)) E.push(sw + m.id + " の to が [x, y] ではありません。");
          });
          (s.actions || []).forEach(function (a) {
            if (!dseen[a.defender]) E.push(sw + "守備の選手「" + a.defender + "」がいません。");
            if (DEF_ACTIONS.indexOf(a.action) < 0) E.push(sw + "action「" + a.action + "」は使えません（" + DEF_ACTIONS.join(" / ") + "）。");
            if (NEEDS_TARGET.indexOf(a.action) >= 0 && !inOff(a.target)) E.push(sw + a.defender + " の " + a.action + " には相手（target：O1〜O5）が必要です。");
            else if (a.target !== undefined && a.target !== "" && !inOff(a.target)) E.push(sw + a.defender + " の相手「" + a.target + "」は攻撃の5人にいません。");
            if (NEEDS_TO.indexOf(a.action) >= 0 && !isPt(a.to) && a.display_only !== true) E.push(sw + a.defender + " の " + a.action + " には移動先（to：[x, y]）の登録が必要です。");
            if (a.to !== undefined && !isPt(a.to)) E.push(sw + a.defender + " の to が [x, y] ではありません。");
            // screen_by は "O4,O5"（2人のスクリーン）も可
            var sbOk = a.screen_by !== undefined && a.screen_by !== "" && String(a.screen_by).split(",").every(function (x) { return inOff(x.trim()); });
            if (a.action in SCREEN_ACTIONS && a.action !== "lock_and_trail" && !sbOk) E.push(sw + a.defender + " の " + a.action + " にはスクリーンをかける選手（screen_by）が必要です。");
            if (a.action === "screen_avoid" && SCREEN_METHODS.indexOf(a.method) < 0) E.push(sw + a.defender + " の method は " + SCREEN_METHODS.join(" / ") + " のどれかです。");
            if (a.pattern !== undefined && a.pattern !== "") {
              var pat = lib ? lib[a.pattern] : null;
              if (!pat) E.push(sw + "守備パターン「" + a.pattern + "」は守備ライブラリにありません。");
              else if (pat.actions.indexOf(a.action) < 0) E.push(sw + a.pattern + "（" + pat.name + "）の動作は " + pat.actions.join(" / ") + " です（" + a.action + " は使えません）。");
            }
          });
        });
        // スイッチ等の後のマッチアップ：同じ攻撃選手を2人で担当していないか
        var mus = [{}];
        Object.keys(def.matchups || {}).forEach(function (k) { mus[0][k] = normO(def.matchups[k]); });
        var dByStep = groupDefSteps(def);
        (d.steps || []).forEach(function (s, i) {
          var b = mus[s.reset_to !== undefined && s.reset_to <= i ? s.reset_to : i] || {}, mu = {};
          Object.keys(b).forEach(function (k) { mu[k] = b[k]; });
          var ds = dByStep[i + 1];
          ((ds && ds.actions) || []).forEach(function (a) {
            var n2 = normAction(a).act, act = a.action === "matchup_recover" ? "matchup_recover" : n2;
            if (CHANGES_MATCHUP.indexOf(act) < 0 || !dseen[a.defender]) return;
            if (act === "switch") applySwitch(mu, a.defender, normO(a.target), a.exchange === true);
            else mu[a.defender] = act === "switch_back" ? mus[0][a.defender] : normO(a.target);
          });
          var who = {};
          Object.keys(mu).forEach(function (k) { if (mu[k]) (who[mu[k]] = who[mu[k]] || []).push(k); });
          Object.keys(who).forEach(function (o) {
            if (who[o].length > 1) E.push("守備 STEP " + (i + 1) + "：スイッチ後のマッチアップが合っていません（O" + o + " を " + who[o].join("・") + " が担当）。相手側のスイッチも登録してください。");
          });
          mus.push(mu);
        });
      }
    }

    // ---- STEP（人数が正しいときだけ細かく見る）----
    if (!rosterOk) {
      W.push("人数・位置の問題を直すと、STEPの中身もチェックされます。");
    } else {
      var known = function (p) { return offense.indexOf(String(p)) >= 0; };
      var holders = [isThrowIn(cat) ? ib : d.ball];
      if (!known(holders[0])) E.push("最初にボールを持つ選手（ball）が設定されていません。");
      (d.steps || []).forEach(function (s, i) {
        var sw = "STEP " + (i + 1) + "：";
        if (!s.label) E.push(sw + "説明（label）が空です。");
        if (t && t.steps && (!Array.isArray(s.src) || !s.src.length || s.src.some(function (k) { return !(k >= 0 && k < t.steps.length); })))
          E.push(sw + "src は原本の STEP 番号（0〜" + (t.steps.length - 1) + "）にしてください。");
        var holder = holders[i];
        if (s.reset_to !== undefined) {
          if (!(s.reset_to >= 0 && s.reset_to <= i)) E.push(sw + "reset_to は 0〜" + i + " にしてください。");
          else holder = holders[s.reset_to];
        }
        (s.moves || []).forEach(function (m) {
          if (!known(m.p)) E.push(sw + "動く選手「" + m.p + "」は攻撃の5人にいません。");
          if (!isPt(m.to)) E.push(sw + "O" + m.p + " の to が [x, y] ではありません。");
          (m.via || []).forEach(function (v) { if (!isPt(v)) E.push(sw + "O" + m.p + " の via が正しくありません。"); });
          if (MOVE_TYPES.indexOf(m.type) < 0) E.push(sw + "type は " + MOVE_TYPES.join(" / ") + " のどれかです。");
          if (m.type === "screen" && !known(m["for"])) E.push(sw + "スクリーンの相手「" + m["for"] + "」がいません。");
        });
        (s.passes || []).forEach(function (ps) {
          if (!known(ps.from) || !known(ps.to)) E.push(sw + "パスの選手番号が正しくありません（" + ps.from + "→" + ps.to + "）。");
          else if (String(ps.from) !== String(holder)) E.push(sw + "パスの出し手 O" + ps.from + " はボールを持っていません（保持者は O" + holder + "）。");
          holder = ps.to;
        });
        (s.options || []).forEach(function (o) {
          if (!known(o.from) || !known(o.to)) E.push(sw + "選択肢の選手番号が正しくありません（" + o.from + "→" + o.to + "）。");
        });
        holders.push(holder);
      });
      if (t && t.steps && Array.isArray(d.source_steps_ja) && d.source_steps_ja.length !== t.steps.length)
        E.push("日本語訳（source_steps_ja）の数が原本の STEP 数と違います。");
    }
    return { ok: !E.length, errors: E, warnings: W, defense: def };
  }

  return {
    validate: validate, defenseOf: defenseOf, defaultDefense: defaultDefense, offenseIds: offenseIds, isThrowIn: isThrowIn, PIDS: PIDS,
    guardPos: guardPos, normO: normO, insideCourt: insideCourt, DEF_ACTIONS: DEF_ACTIONS, SCREEN_METHODS: SCREEN_METHODS,
    normAction: normAction, libIndex: libIndex, validateQuiz: validateQuiz, validateOptions: validateOptions,
    applySwitch: applySwitch, mergeTeam: mergeTeam, validateTeamTactic: validateTeamTactic, modelDefense: modelDefense, modelIndex: modelIndex, resolveDefense: resolveDefense, REVIEW_STATUS: REVIEW_STATUS, defStepNo: defStepNo, groupDefSteps: groupDefSteps
  };
});
