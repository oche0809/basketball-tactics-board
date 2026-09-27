/*
 * データのチェック＋オフライン用バンドル作成
 *   node build.js
 * 1. 原本・作図レイヤー・チーム用データを調べる（人数・構造のチェックは validate.js）
 * 2. 読み込めるデータなら data/bundle.js を作る（index.html をダブルクリックで開いたときに使う）
 *    ※「要修正」の戦術があっても止めない（アプリ側でその戦術だけ「要修正」と表示する）
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { validate, libIndex, validateQuiz, validateOptions, offenseIds, validateTeamTactic, modelDefense, modelIndex } = require("./validate.js");

const DIR = path.join(__dirname, "data");
const FILES = {
  source: "basketball_tactics_with_u16_setplays.json",
  diagrams: "diagrams.json",
  team: "team_variants.json",
  library: "defense_pattern_library.json",
  teamTactics: "team/team_tactics.json",
  models: "tactical_defense_models.json",
  defMap: "defense_step_map.json"
};

const fatal = [];    // ファイルが壊れている等、アプリが起動できない問題
const needsFix = []; // 戦術ごとの「要修正」
const warnings = [];

function load(name) {
  try {
    return JSON.parse(fs.readFileSync(path.join(DIR, name), "utf8"));
  } catch (e) {
    fatal.push(`${name} を読めません: ${e.message}`);
    return null;
  }
}

const source = load(FILES.source);
const diagrams = load(FILES.diagrams);
const team = load(FILES.team) || { variants: [] };
const library = load(FILES.library) || { patterns: [] };
const LIB = libIndex(library);
const teamTactics = load(FILES.teamTactics) || { tactics: {} };
const models = load(FILES.models) || { tactics: [] };
const defMap = load(FILES.defMap) || { tactics: {} };
{ // 守備ライブラリの形のチェック
  const seen = {};
  (library.patterns || []).forEach((p) => {
    if (!p.id || seen[p.id]) fatal.push(`守備ライブラリの id「${p.id}」が空か重複しています`);
    seen[p.id] = true;
    if (!Array.isArray(p.actions) || !p.actions.length) fatal.push(`守備ライブラリ ${p.id} に actions がありません`);
    if (typeof p.verified !== "boolean") warnings.push(`守備ライブラリ ${p.id} の verified が true/false ではありません`);
  });
}

if (source && diagrams) {
  const byId = {};
  (source.tactics || []).forEach((t) => {
    if (byId[t.id]) fatal.push(`原本の id「${t.id}」が重複しています`);
    byId[t.id] = t;
    if (!source.meta.categories[t.category]) fatal.push(`[${t.id}] category「${t.category}」が meta.categories にありません`);
  });

  Object.entries(diagrams.diagrams || {}).forEach(([id, d]) => {
    const t = byId[id];
    if (!t) return fatal.push(`diagrams.json の「${id}」は原本にありません`);
    if (!t.verified || !t.steps.length) return needsFix.push([id, ["原本で verified=false または steps が空のため、作図できません。"]]);
    const r = validate(d, t, LIB);
    if (!r.ok) needsFix.push([id, r.errors]);
  });
  Object.entries(diagrams.text_only || {}).forEach(([id, d]) => {
    const t = byId[id];
    if (!t) return fatal.push(`text_only の「${id}」は原本にありません`);
    if ((d.source_steps_ja || []).length !== t.steps.length) warnings.push(`[${id}] text_only の日本語訳の数が原本と違います`);
  });
  Object.entries(diagrams.options_ja || {}).forEach(([id, arr]) => {
    const t = byId[id];
    if (!t) return fatal.push(`options_ja の「${id}」は原本にありません`);
    if (arr.length !== t.options.length) warnings.push(`[${id}] options_ja の数（${arr.length}）が原本 options の数（${t.options.length}）と違います`);
  });

  const vids = {};
  (team.variants || []).forEach((v, i) => {
    const w = `チーム版 ${v.id || "#" + (i + 1)}`;
    if (!v.id) return warnings.push(`[${w}] id がありません`);
    if (vids[v.id] || byId[v.id]) warnings.push(`[${w}] id が重複しています`);
    vids[v.id] = true;
    if (!byId[v.base_id]) return warnings.push(`[${w}] base_id「${v.base_id}」が原本にありません`);
    const vd = Object.assign({}, v.diagram || diagrams.diagrams[v.base_id], v.defense ? { defense: v.defense } : {});
    if (v.offense_options || v.decisions)
      validateOptions({ options: v.offense_options || [], decisions: v.decisions || [] }, vd, byId[v.base_id], LIB).forEach((e) => needsFix.push([w, [e]]));
    const qctx = { options: (v.offense_options || []).map((o) => o.id), players: offenseIds(vd).concat(vd.inbounder ? ["I"] : []) };
    (v.quizzes || []).forEach((q) => validateQuiz(q, LIB, (vd.steps || []).length, qctx).forEach((e) => needsFix.push([w, [e]])));
    if (v.diagram || v.defense) {
      const base = v.diagram || diagrams.diagrams[v.base_id];
      const r = validate(Object.assign({}, base, v.defense ? { defense: v.defense } : {}), byId[v.base_id], LIB);
      if (!r.ok) needsFix.push([w, r.errors]);
    }
  });
}

// チーム戦術（原本 + チーム独自設定）
if (source && diagrams) {
  const byId = {};
  source.tactics.forEach((t) => { byId[t.id] = t; });
  Object.entries(teamTactics.tactics || {}).forEach(([id, e]) => {
    validateTeamTactic(id, e, byId[id], diagrams.diagrams[id], LIB).forEach((er) => needsFix.push(["チーム戦術 " + id, [er]]));
  });
}

// 教材用守備モデル（教師未確認）：読み込めるか・人数や動作のルールに合うか
let modelMoving = 0, modelMotion = 0;
if (source && diagrams) {
  const byId = {};
  source.tactics.forEach((t) => { byId[t.id] = t; });
  const M = modelIndex(models);
  Object.keys(M).forEach((id) => {
    if (!byId[id]) return warnings.push(`教材守備モデル「${id}」は原本にありません`);
    if (M[id].verified !== false) warnings.push(`教材守備モデル ${id} は verified:false のはずです`);
    const dg = diagrams.diagrams[id];
    if (!dg) return; // 作図のない戦術（文章のみ）は読み込むだけ
    const mp = (defMap.tactics || {})[id];
    if (!mp) warnings.push(`教材守備モデル ${id}：資料STEPとアプリSTEPの対応（defense_step_map.json）がありません（守備は動きません）`);
    ((mp && mp.steps) || []).forEach((x) => {
      if (!M[id].steps.some((s) => s.offense_step === x.source_step)) warnings.push(`対応表 ${id}：source_step ${x.source_step} は教材モデルにありません`);
      if (x.app_step !== undefined && !(x.app_step >= 1 && x.app_step <= dg.steps.length)) needsFix.push(["対応表 " + id, [`app_step ${x.app_step} はありません（1〜${dg.steps.length}）`]]);
    });
    const def = modelDefense(M[id], dg, mp);
    const r = validate(Object.assign({}, dg, { defense: def }), byId[id], LIB);
    if (!r.ok) needsFix.push(["教材守備モデル " + id, r.errors]);
    else if (def.animation_status === "motion_rule_only") modelMotion++;
    else modelMoving++;
  });
}

warnings.forEach((w) => console.log("⚠ " + w));
if (needsFix.length) {
  console.log(`△ 要修正の戦術 ${needsFix.length} 件（アプリでは「戦術データエラー・要修正」と表示され、アニメーションしません）`);
  needsFix.forEach(([id, errs]) => console.log(`  - ${id}：${errs.join(" ／ ")}`));
}
if (fatal.length) {
  console.log(`✖ ${fatal.length} 件の問題があります（bundle.js は更新していません）`);
  fatal.forEach((e) => console.log("  - " + e));
  process.exit(1);
}

const bundle =
  "/* 自動生成ファイル（node build.js）。直接編集しないでください。 */\n" +
  "window.TB_BUNDLE = " +
  JSON.stringify({ built: new Date().toISOString(), source, diagrams, team, library, teamTactics, models, defMap }) +
  ";\n";
fs.writeFileSync(path.join(DIR, "bundle.js"), bundle);
const okCount = Object.keys(diagrams.diagrams).length - needsFix.filter(([id]) => diagrams.diagrams[id]).length;
console.log(`✔ 原本 ${source.tactics.length} 件 / アニメーション可 ${okCount} 件 / 守備ライブラリ ${library.patterns.length} 件 / 教材守備モデル ${(models.tactics || []).length} 件（守備STEPあり ${modelMoving} 件・原則のみ ${modelMotion} 件） / チーム戦術 ${Object.keys(teamTactics.tactics || {}).length} 件 / チーム版 ${team.variants.length} 件 → data/bundle.js を更新しました`);

// ---------- GitHub Pages 用の公開フォルダ（node build.js --dist） ----------
// ブラウザで使うファイルだけを dist/ にコピーする（開発用の build.js・tests・docs・_old_v1・run.sh は含めない）
if (process.argv.includes("--dist")) {
  const ROOT = __dirname;
  const OUT = path.join(ROOT, "dist");
  const PUBLIC_FILES = ["index.html", "style.css", "app.js", "board.js", "validate.js", "manifest.json"];
  const PUBLIC_DIRS = ["icons", "data"];
  const ALLOWED_EXT = [".html", ".css", ".js", ".json", ".png", ".svg", ".webmanifest"];
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  let count = 0;
  const copy = (rel) => {
    const src = path.join(ROOT, rel);
    const st = fs.statSync(src);
    if (st.isDirectory()) return fs.readdirSync(src).forEach((f) => copy(path.join(rel, f)));
    if (!ALLOWED_EXT.includes(path.extname(rel)) || path.basename(rel).startsWith(".")) return;
    fs.mkdirSync(path.dirname(path.join(OUT, rel)), { recursive: true });
    fs.copyFileSync(src, path.join(OUT, rel));
    count++;
  };
  PUBLIC_FILES.forEach(copy);
  PUBLIC_DIRS.forEach(copy);
  fs.writeFileSync(path.join(OUT, ".nojekyll"), ""); // GitHub Pages でそのまま配信する
  // 公開物の最低限の確認：index.html がルートにあり、アプリが読むファイルがそろっている
  const must = PUBLIC_FILES.concat(["data/bundle.js", "data/basketball_tactics_with_u16_setplays.json", "data/diagrams.json",
    "data/team_variants.json", "data/defense_pattern_library.json", "data/team/team_tactics.json", "data/tactical_defense_models.json",
    "data/defense_step_map.json", "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png"]);
  const missing = must.filter((f) => !fs.existsSync(path.join(OUT, f)));
  if (missing.length) { console.log("✖ dist/ に必要なファイルがありません：" + missing.join(", ")); process.exit(1); }
  console.log(`✔ dist/ を作成しました（${count} ファイル）。GitHub Pages ではこのフォルダを公開します。`);
}
