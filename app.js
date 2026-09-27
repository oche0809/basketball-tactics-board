/*
 * 画面（一覧・詳細・自分視点・チーム用編集）
 * 戦術の中身はすべて data/ のJSONから読む。戦術ごとの処理はここに書かない。
 */
(function () {
  "use strict";

  var FILES = {
    source: "data/basketball_tactics_with_u16_setplays.json",
    diagrams: "data/diagrams.json",
    team: "data/team_variants.json",
    library: "data/defense_pattern_library.json",
    teamTactics: "data/team/team_tactics.json",
    models: "data/tactical_defense_models.json",
    defMap: "data/defense_step_map.json"
  };
  var LS_KEY = "tb.teamVariants.v1";
  var PIDS = TBBoard.PIDS;
  var CAT_ORDER = ["BLOB", "SLOB", "HALFCOURT", "SET_U16_PLUS"];
  var POSITION_NAMES = ["PG", "SG", "SF", "PF", "C", "G", "F"];

  var D = null; // { source, diagrams, team, from }
  var app = document.getElementById("app");
  var cleanup = null;

  /* ---------- 小道具 ---------- */
  function esc(s) {
    return String(s === undefined || s === null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function nl2br(s) { return esc(s).replace(/\n/g, "<br>"); }
  function safeUrl(u) { return /^https?:\/\//.test(u || "") ? u : "#"; }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function loadLocal() {
    try { var v = JSON.parse(localStorage.getItem(LS_KEY) || "[]"); return Array.isArray(v) ? v : []; }
    catch (e) { return []; }
  }
  // チーム戦術（data/team/team_tactics.json）。このブラウザで入力した分を優先し、「書き出し」でファイルにする
  var LS_TEAMT = "tb.teamTactics.v1";
  function loadTeamLocal() {
    try { var o = JSON.parse(localStorage.getItem(LS_TEAMT) || "{}"); return o && typeof o === "object" && !Array.isArray(o) ? o : {}; }
    catch (e) { return {}; }
  }
  function saveTeamLocal(o) {
    try { localStorage.setItem(LS_TEAMT, JSON.stringify(o)); return true; }
    catch (e) { alert("このブラウザでは保存できませんでした。「書き出し」でファイルに保存してください。"); return false; }
  }
  function teamEntry(id) {
    var l = loadTeamLocal();
    if (l[id]) return { e: l[id], local: true };
    var f = ((D.teamTactics || {}).tactics || {})[id];
    return f ? { e: f, local: false } : null;
  }
  function allTeamTactics() {
    var out = {}, f = (D.teamTactics || {}).tactics || {}, l = loadTeamLocal();
    Object.keys(f).forEach(function (k) { out[k] = f[k]; });
    Object.keys(l).forEach(function (k) { out[k] = l[k]; });
    return out;
  }

  function saveLocal(list) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(list)); return true; }
    catch (e) { alert("このブラウザでは保存できませんでした（プライベートモード等）。「書き出し」でファイルに保存してください。"); return false; }
  }

  function tacticById(id) {
    var list = D.source.tactics;
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  // ファイルのチーム版 + このブラウザで作ったチーム版（同じidはブラウザ側を優先）
  function allVariants() {
    var map = {}, order = [];
    (D.team.variants || []).forEach(function (v) { map[v.id] = { v: v, local: false }; order.push(v.id); });
    loadLocal().forEach(function (v) { if (!map[v.id]) order.push(v.id); map[v.id] = { v: v, local: true }; });
    return order.map(function (id) { return map[id]; });
  }
  function variantById(id) {
    var all = allVariants();
    for (var i = 0; i < all.length; i++) if (all[i].v.id === id) return all[i];
    return null;
  }

  // 教師がチーム版に登録した守備（v.defense）を作図データに重ねる。原本・作図レイヤーは変えない
  function withDefense(dgm, v) {
    if (!dgm || !v || !v.defense) return dgm;
    var out = {};
    Object.keys(dgm).forEach(function (k) { out[k] = dgm[k]; });
    out.defense = v.defense;
    return out;
  }

  // チーム設定のうち「守備モデルの確認結果」以外の内容があるか（確認だけならチーム版の見出しにしない）
  function isTeamContent(e) {
    return !!e && Object.keys(e).some(function (k) { return ["defense_review", "updated"].indexOf(k) < 0; });
  }

  // 表示用にまとめる（原本 + 作図 + チーム版）
  function resolve(kind, id) {
    var v = null, local = false, t;
    if (kind === "v") {
      var hit = variantById(id);
      if (!hit) return null;
      v = hit.v; local = hit.local;
      t = tacticById(v.base_id);
    } else {
      t = tacticById(id);
      var te = kind === "t" && t && D.diagrams.diagrams[t.id] ? teamEntry(t.id) : null;
      if (te && isTeamContent(te.e)) { v = {}; Object.keys(te.e).forEach(function (k) { v[k] = te.e[k]; }); v.base_id = t.id; v._team = true; local = te.local; }
    }
    if (!t) return null;
    var dg = D.diagrams.diagrams[t.id] || null;
    var to = (D.diagrams.text_only || {})[t.id] || null;
    var rolesBase = (dg && dg.roles_ja) || (to && to.roles_ja) || {};
    // 守備：チーム版 ＞ 教師確認済み教材モデル ＞ 未確認教材モデル ＞ 想定ディフェンス（「採用しない」なら教材モデルを使わない）
    var baseDg = v && v.diagram ? v.diagram : dg;
    var rd = TBValidate.resolveDefense(baseDg, baseDg ? D.model[t.id] : null, ((D.defMap || {}).tactics || {})[t.id],
      kind === "src" ? null : (v || (te ? te.e : null)));
    var roles = {};
    PIDS.forEach(function (p) {
      roles[p] = (v && v.player_roles && v.player_roles[p]) || rolesBase[p] || (t.player_roles || {})[p] || "";
    });
    return {
      t: t, v: v, local: local,
      diagram: rd.diagram,
      defSource: rd.source, review: rd.review,
      textOnly: to,
      stepsJa: (dg && dg.source_steps_ja) || (to && to.source_steps_ja) || [],
      optionsJa: (D.diagrams.options_ja || {})[t.id] || t.options || [],
      roles: roles,
      rolesFromTeam: (v && v.player_roles) || {},
      positions: (v && v.positions) || {},
      title: (v && v.name) || t.name,
      callName: v && v.team_call_name,
      stepPoints: (v && v.step_points) || {},
      plan: { options: (v && v.offense_options) || [], decisions: (v && v.decisions) || [] },
      stepRoles: (v && v.step_roles) || {},
      positionNotes: (v && v.position_notes) || {},
      kind: kind
    };
  }

  function compactView() {
    try {
      return window.matchMedia("(pointer: coarse) and (min-width: 861px) and (max-height: 1024px) and (orientation: landscape)").matches ||
        window.matchMedia("(max-width: 520px)").matches ||
        window.matchMedia("(pointer: coarse) and (max-width: 860px)").matches;
    } catch (e) { return false; }
  }

  function insideCourt(p) { return !!p && p[0] >= 0 && p[0] <= 150 && p[1] >= 0 && p[1] <= 140; }
  // 守備データの種類を画面で区別する（verified / 想定）
  function defNoteHtml(def) {
    var h = '守備（赤い丸 D1〜D5）：<b>' + esc(def.label) + '</b>（' + esc(scenarioName(def.mode)) + '）';
    var rv = def.review || null;
    if (rv && rv.status === "modified") h += '<br><span class="tag-team">教師確認・修正版</span> チーム版（team_tactics）に保存された、教師が修正した守備です。';
    else if (def.status === "teaching_model" && rv && rv.status === "approved") h += '<br><span class="tag-ver">教師確認済み</span> 教材モデルを教師が確認して採用しました（元の教材モデル・verified は変更していません）。';
    else if (def.status === "teaching_model") h += '<br><span class="tag-unv">教材モデル・教師未確認</span> JBA/FIBAの守備原則などから作った教材用のモデルです。元資料に書かれた守備動作ではありません。';
    if (rv && rv.status !== "unreviewed" && (rv.reviewer || rv.reviewed_at || rv.note)) h += '<br><span class="muted small">確認：' + esc(rv.reviewer || "（名前なし）") + ' ' + esc((rv.reviewed_at || "").slice(0, 10)) + (rv.note ? '／メモ：' + esc(rv.note) : '') + '</span>';
    if (def.generated || def.generated_positions) h += '<br><span class="tag-unv">想定ディフェンス</span> ' + (def.status === "teaching_model" ? "守備の開始位置は機械的に置いた想定です。" : "資料に記載された守備動作ではありません。");
    if (def.animation_status === "motion_rule_only") h += '<br><span class="tag-unv">motion_rule_only・具体的守備座標未登録</span> ' + esc(def.motion_note || "この戦術の守備は、ボール移動に応じた原則のみで、具体的な守備座標は未登録です。");
    if ((def.unmapped_source_steps || []).length) h += '<br>資料STEP ' + esc(def.unmapped_source_steps.join("・")) + ' の守備：対応するアプリSTEPが未設定（動かしていません）';
    if (def.verified) h += '<br><span class="tag-ver">資料または教師確認済み</span>';
    else if (!def.generated && def.status !== "teaching_model" && !(rv && (rv.status === "approved" || rv.status === "modified"))) h += '<br><span class="tag-unv">想定・教師未確認</span>';
    if (def.source || def.source_url) h += '<br>出典：' + esc(def.source || "") + (def.source_url ? ' ' + link(def.source_url, def.source_url) : '');
    if (def.note && !def.generated) h += '<br>備考：' + esc(def.note);
    return h;
  }

  function reviewFormHtml(rv) {
    var cur = (rv && rv.status) || "";
    var r = function (v2, label) { return '<label class="chk"><input type="radio" name="rvStatus" value="' + v2 + '"' + (cur === v2 ? " checked" : "") + '> ' + label + '</label>'; };
    return '<div class="review-form" id="reviewForm" hidden><b>守備モデルの確認</b>' +
      r("approved", "採用（この教材モデルを使う）") + r("modified", "修正（チーム版にコピーして編集）") + r("rejected", "採用しない（この戦術では守備モデルを使用しない）") +
      '<label class="f"><span>確認した人</span><input id="rvName" value="' + esc((rv && rv.reviewer) || "") + '"></label>' +
      '<label class="f"><span>教師メモ</span><input id="rvNote" value="' + esc((rv && rv.note) || "") + '"></label>' +
      '<p class="muted small">確認日時は保存時に記録します。確認済み（verified）は自動では変わりません。</p>' +
      '<button type="button" class="btn btn-main btn-sm" id="reviewSave">確認結果を保存</button></div>';
  }

  function scenarioName(s) {
    return { man_to_man: "マンツーマン", "switch": "スイッチ", help_and_recover: "ヘルプ＆リカバー", zone_23: "2-3ゾーン", custom: "カスタム" }[s] || s || "未設定";
  }

  /* ---------- 場所の名前（自分視点の説明に使う） ---------- */
  function zone(pt) {
    if (!pt) return "位置要確認";
    var x = pt[0], y = pt[1];
    if (y < 0) return "エンドラインの外（スローイン）";
    if (x < 0) return "左サイドラインの外（スローイン）";
    if (x > 150) return "右サイドラインの外（スローイン）";
    var side = x < 75 ? "左" : "右";
    if (Math.hypot(x - 75, y - 15.75) < 11) return "ゴール下";
    if (y <= 22 && (x < 16 || x > 134)) return side + "コーナー";
    if (y <= 18 && (x < 50 || x > 100)) return side + "ショートコーナー";
    if (x >= 38 && x <= 112 && y <= 34) return x >= 64 && x <= 86 ? "ゴール前（ペイント）" : side + "ローポスト（ブロック）";
    if (x >= 50 && x <= 100 && y <= 46) return "ペイント内";
    if (y >= 46 && y <= 70 && Math.abs(Math.abs(x - 75) - 25) <= 12) return side + "エルボー（ハイポスト）";
    if (x > 50 && x < 100 && y <= 70) return "フリースローライン付近";
    if (y > 100) return "トップの後方（セーフティ）";
    if (y >= 72 && x >= 60 && x <= 90) return "トップ";
    if (y >= 72) return side + "のトップ寄り（スロット）";
    return side + "ウイング";
  }

  /* ---------- 一覧 ---------- */
  // 人数・構造のチェック。壊れたデータで例外が出てもアプリ全体は止めない
  function check(d, t) {
    if (!t.verified || !t.steps.length) return { ok: false, errors: ["原本で verified=false または steps が空のため、作図できません。"], warnings: [] };
    try { return TBValidate.validate(d, t, D.lib); }
    catch (e) { return { ok: false, errors: ["データを読み取れませんでした：" + e.message], warnings: [] }; }
  }

  function statusBadges(t, dg, to) {
    var b = [];
    b.push(t.verified ? '<span class="badge ok">資料で確認済み</span>' : '<span class="badge wait">資料確認中</span>');
    if (dg && !check(dg, t).ok) b.push('<span class="badge err">要修正</span>');
    else if (dg) b.push('<span class="badge anim">アニメーション</span>');
    else if (to) b.push('<span class="badge text">文章のみ</span>');
    else if (!t.steps.length) b.push('<span class="badge none">動作データ未確定</span>');
    return b.join("");
  }

  function teamBadge(id) {
    var te = D.diagrams.diagrams[id] && teamEntry(id);
    if (!te) return "";
    var rs = te.e.defense_review && te.e.defense_review.status;
    var rb = rs === "approved" ? '<span class="badge ok">守備：教師確認済み</span>' : rs === "modified" ? '<span class="badge team-b">守備：教師修正版</span>' : rs === "rejected" ? '<span class="badge none">守備モデル不使用</span>' : "";
    if (!isTeamContent(te.e)) return rb;
    return (te.e.use === false ? '<span class="badge none">チーム：使用しない</span>' : '<span class="badge team-b">チーム版</span>') + rb;
  }

  function renderList() {
    var meta = D.source.meta;
    var variants = allVariants();
    var html = '<section class="intro">' +
      '<p>戦術を選ぶと、作戦盤で <b>5人全体 → 自分の役割 → 次の動き → 選択肢</b> の順に確認できます。</p>' +
      '<p class="muted">原本：' + esc(FILES.source.replace("data/", "")) + (meta.version ? "（v" + esc(meta.version) + "）" : "") + '。' +
      '動きは原本の文章に書かれたものだけを描いています。コート上の位置は模式図です。</p></section>';

    CAT_ORDER.concat(Object.keys(meta.categories).filter(function (c) { return CAT_ORDER.indexOf(c) < 0; })).forEach(function (cat) {
      var items = D.source.tactics.filter(function (t) { return t.category === cat; });
      if (!items.length) return;
      html += '<section class="cat"><h2>' + esc(meta.categories[cat] || cat) + ' <span class="cat-id">' + esc(cat) + '</span></h2>';
      if (cat === "SET_U16_PLUS" && meta.official_guidance) {
        html += '<p class="cat-note">' + esc(meta.official_guidance.JBA_set_play_note || "") + '</p>';
      }
      html += '<div class="cards">';
      items.forEach(function (t) {
        var dg = D.diagrams.diagrams[t.id], to = (D.diagrams.text_only || {})[t.id];
        html += '<a class="card' + (t.verified ? "" : " card-wait") + '" href="#/t/' + encodeURIComponent(t.id) + '">' +
          '<div class="card-id">' + esc(t.id) + '</div>' +
          '<div class="card-name">' + esc(t.name) + '</div>' +
          '<div class="card-sub">' + esc(t.formation) + ' ・ ' + esc(t.theme) + '</div>' +
          '<div class="badges">' + statusBadges(t, dg, to) + teamBadge(t.id) + '</div></a>';
        variants.filter(function (x) { return x.v.base_id === t.id; }).forEach(function (x) {
          html += '<a class="card card-team" href="#/v/' + encodeURIComponent(x.v.id) + '">' +
            '<div class="card-id">チーム版 ・ ' + esc(t.id) + '</div>' +
            '<div class="card-name">' + esc(x.v.team_call_name || x.v.name || t.name) + '</div>' +
            '<div class="card-sub">' + esc(x.v.name || t.name) + (x.local ? '（このブラウザに保存）' : '（ファイル）') + '</div>' +
            (x.v.diagram && !check(x.v.diagram, t).ok ? '<div class="badges"><span class="badge err">要修正</span></div>' : '') + '</a>';
        });
      });
      html += '</div></section>';
    });

    html += '<section class="cat"><h2>チーム戦術管理</h2><a class="card lib-link" href="#/team"><div class="card-name">📋 チーム戦術管理</div>' +
      '<div class="card-sub">このチームで使う戦術の設定（原本は変えずに、チーム独自の内容だけを登録）</div></a></section>';
    html += '<section class="cat"><h2>守備ライブラリ</h2><a class="card lib-link" href="#/lib"><div class="card-name">🛡 守備ライブラリを見る</div>' +
      '<div class="card-sub">守備の基本パターン ' + ((D.library && D.library.patterns) || []).length + ' 件（マッチアップ・ヘルプ・スクリーン対応・スイッチ など）</div></a></section>';
    html += '<section class="teacher-tools"><h2>顧問用：チーム版データ</h2>' +
      '<p class="muted">チーム版は公開資料の原本とは別に保存されます。作成は各戦術の「チーム用に変更」から。' +
      'ほかの端末で使うときは「書き出し」したファイルを <code>data/team_variants.json</code> と置き換えるか、「読み込み」してください。</p>' +
      '<div class="btn-row"><button class="btn" id="btnExport" type="button">書き出し（team_variants.json）</button>' +
      '<label class="btn">読み込み<input type="file" id="fileImport" accept=".json,application/json" hidden></label></div>' +
      '<p class="muted small">現在のチーム版：' + variants.length + ' 件 ／ データの読み込み元：' + esc(D.from) + '</p></section>';
    app.innerHTML = html;

    $("#btnExport").addEventListener("click", exportVariants);
    $("#fileImport").addEventListener("change", importVariants);
  }

  function exportVariants() {
    var out = { meta: D.team.meta || {}, variants: allVariants().map(function (x) { return x.v; }) };
    var blob = new Blob([JSON.stringify(out, null, 2) + "\n"], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "team_variants.json";
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function importVariants(ev) {
    var file = ev.target.files[0];
    if (!file) return;
    var r = new FileReader();
    r.onload = function () {
      try {
        var data = JSON.parse(r.result);
        var list = Array.isArray(data) ? data : data.variants;
        if (!Array.isArray(list)) throw new Error("variants がありません");
        var local = loadLocal(), ok = 0, skip = 0;
        list.forEach(function (v) {
          if (!v || !v.id || !tacticById(v.base_id)) { skip++; return; }
          local = local.filter(function (x) { return x.id !== v.id; });
          local.push(v); ok++;
        });
        saveLocal(local);
        alert(ok + " 件読み込みました" + (skip ? "（原本にない戦術のため " + skip + " 件スキップ）" : ""));
        renderList();
      } catch (e) { alert("読み込めませんでした：" + e.message); }
    };
    r.readAsText(file);
  }

  /* ---------- 詳細 ---------- */
  function link(url, text) {
    return '<a href="' + esc(safeUrl(url)) + '" target="_blank" rel="noopener noreferrer">' + esc(text || url) + '</a>';
  }
  function sourceInfo(x) {
    var t = x.t, meta = D.source.meta, dg = x.diagram;
    var h = '<details class="teacher"><summary>教師用情報（出典・注記）</summary><dl>';
    h += '<dt>出典</dt><dd>' + esc(t.source_title) + '<br>' + link(t.source_url) + '</dd>';
    h += '<dt>確認状態</dt><dd>' + (t.verified ? "verified = true（資料で確認済み）" : "verified = false（資料確認中）") + (t.source_status ? "<br>" + esc(t.source_status) : "") + '</dd>';
    if (t.adaptation_note) h += '<dt>原本の注記</dt><dd>' + esc(t.adaptation_note) + '</dd>';
    if (dg) {
      h += '<dt>作図について</dt><dd>' + (dg.layout_status === "source_diagram" ? "元資料の図の位置を、FIBAのコートに合わせて換算して作図。" : (dg.layout_status === "example" ? "原則を示す一例として作図。" : "原本に座標がないため、位置は模式図（仮配置）。") + '元資料の図で確認してください。');
      if (dg.verification_note) h += '<br><b>確認メモ：</b>' + esc(dg.verification_note);
      if ((dg.source_figures || []).length) h += '<br><b>確認した図：</b>' + dg.source_figures.map(function (u) { return link(u, u.split("/").pop()); }).join("、");
      if ((dg.unknown_notes || []).length) h += '<ul>' + dg.unknown_notes.map(function (n) { return "<li>" + esc(n) + "</li>"; }).join("") + '</ul>';
      h += '</dd>';
    }
    if (x.textOnly && x.textOnly.reason) h += '<dt>作図していない理由</dt><dd>' + esc(x.textOnly.reason) + '</dd>';
    if (t.category === "SET_U16_PLUS" && meta.official_guidance) {
      h += '<dt>年代別指導指針</dt><dd>' + esc(meta.official_guidance.JBA_set_play_note) + '<br>' + link(meta.official_guidance.JBA, "JBA資料") +
        (meta.advanced_set_source ? '<br>' + esc(meta.advanced_set_source) : '') + '</dd>';
    }
    if ((meta.supplementary_sources || []).length) {
      h += '<dt>補助資料</dt><dd>' + meta.supplementary_sources.map(function (s) { return link(s.url, s.title); }).join("<br>") + '</dd>';
    }
    return h + '</dl></details>';
  }

  function sourceSteps(x) {
    var t = x.t;
    if (!t.steps.length) return "";
    var h = '<details class="panel fold"' + (compactView() ? '' : ' open') + '><summary><h3>資料の流れ</h3></summary><ol class="src-steps">';
    t.steps.forEach(function (s, i) {
      h += '<li><span class="ja">' + esc(x.stepsJa[i] || "（日本語訳なし）") + '</span><span class="en">原文：' + esc(s) + '</span></li>';
    });
    return h + '</ol></details>';
  }

  function optionsBlock(x) {
    var h = '<details class="panel fold" open><summary><h3>オプション</h3></summary>';
    var first = x.v && x.v.options_first, second = x.v && x.v.options_second;
    if (first || second) {
      h += '<ul class="opts"><li><b>第1オプション</b>' + esc(first || "—") + '</li><li><b>第2オプション</b>' + esc(second || "—") + '</li></ul>' +
        '<p class="muted small">チーム版の設定。資料記載：' + esc(x.optionsJa.join(" ／ ") || "なし") + '</p>';
    } else if (x.optionsJa.length) {
      h += '<ul class="opts">' + x.optionsJa.map(function (o, i) {
        return '<li><b>' + (i === 0 ? "第1オプション" : i === 1 ? "第2オプション" : "その他") + '</b>' + esc(o) + '</li>';
      }).join("") + '</ul><p class="muted small">資料に書かれている順に並べています。</p>';
    } else h += '<p class="muted">資料に記載なし（動きの原則として扱う戦術です）。</p>';
    return h + '</details>';
  }

  function rolesTable(x) {
    var h = '<details class="panel fold"' + (compactView() ? '' : ' open') + '><summary><h3>O1〜O5の役割</h3></summary><table class="roles"><thead><tr><th>番号</th><th>ポジション</th><th>役割</th></tr></thead><tbody>';
    var ib = x.diagram && x.diagram.inbounder ? String(x.diagram.inbounder) : null;
    PIDS.forEach(function (p) {
      h += '<tr><td>O' + p + (p === ib ? '<br><small>I・スローイン担当</small>' : '') + '</td><td>' + esc(x.positions[p] || "—") + '</td><td>' + esc(x.roles[p] || "—") +
        (x.rolesFromTeam[p] ? ' <span class="tag team">チーム</span>' : '') + '</td></tr>';
    });
    return h + '</tbody></table></details>';
  }

  // 先生が登録したオフェンスのオプション（第1〜第3・セーフティ）。登録がなければ何も出さない
  function planBlock(x) {
    var os = x.plan.options;
    if (!os.length) return "";
    return '<details class="panel fold" open><summary><h3>オプション（先生の登録）</h3></summary><ul class="opts plan-opts">' + os.map(function (o) {
      return '<li><b>' + esc(o.label || o.id) + '</b>' + esc(o.description || "") +
        (o.trigger ? '<br><span class="muted small">発動：' + esc(o.trigger) + '</span>' : '') +
        ((o.players || []).length ? '<br><span class="muted small">選手：' + esc(o.players.join("・")) + '</span>' : '') +
        (o.step !== undefined && o.step !== null ? ' <button type="button" class="btn btn-sm" data-optstep="' + o.step + '">STEP ' + o.step + ' へ</button>' : '') + '</li>';
    }).join("") + '</ul></details>';
  }

  // 先生が登録した守備クイズ（登録がなければ何も出さない）
  function quizBlock(x) {
    var qs = (x.v && x.v.quizzes) || [];
    if (!qs.length) return "";
    return '<section class="panel"><h3>守備クイズ（先生作成）</h3>' + qs.map(function (q, i) {
      var p = q.pattern_id && D.lib[q.pattern_id];
      return '<div class="quiz"><p><b>Q' + (i + 1) + '</b>' + (q.step !== undefined ? '（STEP ' + esc(q.step) + '）' : '') + (p ? '［' + esc(p.name) + '］' : '') + ' ' + esc(q.question) + '</p><ol type="A">' +
        (q.choices || []).map(function (c) { return '<li>' + esc(c) + '</li>'; }).join("") + '</ol>' +
        '<details><summary>答えを見る</summary><p>' + String.fromCharCode(65 + q.answer_index) + '：' + esc((q.choices || [])[q.answer_index]) + '</p>' +
        (q.explanation ? '<p class="muted">' + esc(q.explanation) + '</p>' : '') + '</details></div>';
    }).join("") + '</section>';
  }

  function teamBlock(x) {
    if (!x.v) return "";
    var v = x.v;
    var h = '<section class="panel team-panel"><h3>チーム版の情報</h3><dl>';
    h += '<dt>元の戦術</dt><dd><a href="#/' + (v._team ? "src" : "t") + '/' + encodeURIComponent(x.t.id) + '">' + esc(x.t.id + " " + x.t.name) + '</a>（公開資料）</dd>';
    if (v._team) h += '<dt>このチームで</dt><dd>' + (v.use === false ? "使用しない" : v.use === true ? "使用する" : "未設定") + '</dd>';
    if (v.team_notes) h += '<dt>チーム独自の注意点</dt><dd>' + nl2br(v.team_notes) + '</dd>';
    if (v.signal) h += '<dt>合図</dt><dd>' + esc(v.signal) + '</dd>';
    if (v.teacher_memo) h += '<dt>教師メモ</dt><dd>' + nl2br(v.teacher_memo) + '</dd>';
    if (v.diagram) h += '<dt>動き</dt><dd>チーム用に変更した初期位置・STEPを使用中</dd>';
    return h + '</dl></section>';
  }

  function headBlock(x) {
    var t = x.t;
    return '<div class="d-head"><a class="back" href="#/">← 戦術一覧</a>' +
      '<div class="d-id">' + esc(t.id) + ' ・ ' + esc(D.source.meta.categories[t.category] || t.category) + (x.v ? ' ・ <b>' + (x.v._team ? "チーム版（原本＋チーム設定）" : "チーム版") + '</b>' : (x.kind === "src" ? " ・ 原本だけを表示中" : "")) + '</div>' +
      '<h1>' + esc(x.callName || x.title) + '</h1>' +
      '<details class="head-more"' + (compactView() ? '' : ' open') + '><summary>戦術の情報</summary>' +
      '<div class="names">' + (x.callName ? '<span>チーム内の呼び名：<b>' + esc(x.callName) + '</b></span>' : '') +
      '<span>正式名（資料）：' + esc(t.name) + '</span>' + (x.v && x.v.name && x.v.name !== t.name ? '<span>チーム用の戦術名：' + esc(x.v.name) + '</span>' : '') + '</div>' +
      '<div class="d-sub">' + esc(t.formation) + ' ・ ' + esc(t.theme) + '</div>' +
      '<div class="badges">' + statusBadges(t, x.diagram, x.textOnly) +
      (x.diagram ? (x.diagram.layout_status === "source_diagram" ? '<span class="badge ok">配置は元資料の図で確認済み</span>' : '<span class="badge layout">配置は模式図・元図で要確認</span>') : '') +
      (t.category === "SET_U16_PLUS" ? '<span class="badge u16">JBA指針ではU16以降の内容</span>' : '') + '</div></details></div>';
  }

  function renderDetail(kind, id) {
    var x = resolve(kind, id);
    if (!x) { app.innerHTML = '<p class="notice">戦術が見つかりません。<a href="#/">一覧へ戻る</a></p>'; return; }
    document.title = (x.callName || x.title) + " | バスケ作戦盤";
    var hasDg = !!D.diagrams.diagrams[x.t.id], tid = encodeURIComponent(x.t.id);
    var editLink = '<div class="btn-row">' + (x.v && !x.v._team ? '<a class="btn" href="#/edit/' + encodeURIComponent(x.v.id) + '">チーム版を編集</a>'
      : hasDg ? '<a class="btn" href="#/team/' + tid + '">チーム戦術管理で編集</a>' +
        (x.v ? '<a class="btn" href="#/src/' + tid + '">原本だけを見る</a>' : (teamEntry(x.t.id) ? '<a class="btn" href="#/t/' + tid + '">チーム版を見る</a>' : ''))
      : '<a class="btn" href="#/edit/' + tid + '">チーム用に変更</a>') + '</div>';

    // 動作データがない戦術：推測で動かさない
    if (!x.diagram) {
      var t = x.t, h = headBlock(x);
      if (!t.verified || !t.steps.length) {
        h += '<section class="panel pending"><h3>' + (t.verified ? "具体的な動作データは未確定" : "資料確認中") + '</h3>' +
          '<p>具体的な動作データは未確定です。動きを推測したアニメーションは表示しません。</p>' +
          (t.source_status ? '<p class="muted">' + esc(t.source_status) + '</p>' : '') +
          '<dl class="kv"><dt>指導上のテーマ</dt><dd>' + esc(t.theme) + '</dd><dt>形式</dt><dd>' + esc(t.formation) + '</dd>' +
          '<dt>出典</dt><dd>' + esc(t.source_title) + '</dd></dl></section>';
      } else {
        h += '<section class="panel pending"><h3>作図データ未作成（文章のみ）</h3><p>' + esc(x.textOnly ? x.textOnly.reason : "作図レイヤーがありません。") + '</p>' +
          (x.textOnly && x.textOnly.related ? '<p><a href="#/t/' + encodeURIComponent(x.textOnly.related) + '">関連：' + esc(x.textOnly.related) + ' を見る</a></p>' : '') + '</section>';
        h += sourceSteps(x) + optionsBlock(x) + rolesTable(x);
      }
      h += teamBlock(x) + sourceInfo(x) + editLink;
      app.innerHTML = '<div class="detail">' + h + '</div>';
      return;
    }

    // 人数・構造のチェック：満たさない戦術はアニメーションしない
    var vr = check(x.diagram, x.t);
    if (!vr.ok) {
      var fixNotes = x.diagram.fix_notes || [];
      app.innerHTML = '<div class="detail">' + headBlock(x) +
        '<section class="panel error"><h3>戦術データエラー（要修正）</h3>' +
        '<p>人数・位置のルールを満たしていないため、アニメーションは表示しません。</p><ul>' +
        vr.errors.map(function (e) { return "<li>" + esc(e) + "</li>"; }).join("") + '</ul>' +
        (fixNotes.length ? '<p><b>要修正の理由（資料との照合）</b></p><ul>' + fixNotes.map(function (n) { return "<li>" + esc(n) + "</li>"; }).join("") + '</ul>' : '') +
        (vr.warnings || []).map(function (w) { return '<p class="muted small">' + esc(w) + '</p>'; }).join("") +
        '<p class="muted small">ルール：スローイン（BLOB／SLOB）はコート上4人＋スローイン担当1人、ハーフコートはコート上5人、守備は5人。</p></section>' +
        sourceSteps(x) + optionsBlock(x) + rolesTable(x) + teamBlock(x) + sourceInfo(x) + editLink + '</div>';
      return;
    }

    var d = x.diagram;
    var def = vr.defense;
    var canReview = x.kind !== "src" && !!D.model[x.t.id] && !(x.v && x.v.diagram) && ["model", "rejected", "team"].indexOf(x.defSource) >= 0 &&
      !(def && def.animation_status === "motion_rule_only") && !(x.defSource === "team" && !(x.review && x.review.status === "modified"));
    var hasDefSteps = !!(def && def.steps.some(function (s) { return (s.actions || []).length || (s.moves || []).length; }));
    var ibId = d.inbounder ? String(d.inbounder) : null;
    var selectable = (d.on_court_players || []).map(String).sort().concat(ibId ? [ibId] : []);
    app.innerHTML = '<div class="detail">' + headBlock(x) +
      '<div class="d-main">' +
      '<section class="board-wrap">' +
      '<svg id="board" class="board" aria-label="作戦盤"></svg>' +
      '<div class="controls">' +
      '<button class="btn" id="cReset" type="button" title="最初に戻す">⏮ リセット</button>' +
      '<button class="btn" id="cPrev" type="button">◀ 戻る</button>' +
      '<button class="btn btn-main" id="cPlay" type="button">▶ 再生</button>' +
      '<button class="btn" id="cNext" type="button">進む ▶</button>' +
      '</div><div class="controls controls-sub">' +
      '<label>速さ <select id="cSpeed"><option value="0.5">0.5倍</option><option value="0.75">0.75倍</option><option value="1" selected>1倍</option><option value="1.5">1.5倍</option><option value="2">2倍</option></select></label>' +
      '<button class="btn btn-toggle" id="cMirror" type="button" aria-pressed="false">⇆ 左右反転</button>' +
      '</div>' +
      (def ? '<div class="seg seg-def" id="defSeg" role="group" aria-label="ディフェンス表示">' +
        '<button type="button" data-dm="off" class="on">ディフェンス：OFF</button><button type="button" data-dm="pos">ディフェンス：位置</button>' +
        '<button type="button" data-dm="move"' + (hasDefSteps ? '' : ' class="unavail"') + '>ディフェンス：動き</button></div>' : '') +
      '<details class="legend-box"' + (compactView() ? '' : ' open') + '><summary>記号の見かた</summary><div class="legend">' +
      '<span><i class="lg lg-cut"></i>カット</span><span><i class="lg lg-move"></i>移動</span><span><i class="lg lg-dribble"></i>ドリブル</span>' +
      '<span><i class="lg lg-screen"></i>スクリーン</span><span><i class="lg lg-pass"></i>パス</span><span><i class="lg lg-option"></i>選択肢（パスの候補）</span>' +
      (ibId ? '<span><b class="ib-legend">I</b>＝スローイン担当（O' + ibId + '）</span>' : '') +
      '</div></details>' +
      (def ? '<div class="def-note" id="defNote" hidden>' + defNoteHtml(def) +
        (x.defSource === "rejected" ? '<br><span class="tag-unv">この戦術では守備モデルを使用しない</span>（教師の確認結果。位置は想定ディフェンスで表示）' : '') +
        (canReview ? '<br><button type="button" class="btn btn-sm" id="reviewBtn">守備モデルを確認</button>' + reviewFormHtml(x.review) : '') +
        '</div><p class="def-note" id="defMsg" hidden></p>' : '') +
      '<p class="mirror-note" id="mirrorNote" hidden>左右反転中：文章の「右・左」も逆に読み替えてください。</p>' +
      '</section>' +
      '<aside class="side">' +
      '<div class="seg" id="learnSeg" role="group" aria-label="学習モード"><button type="button" data-lm="normal" class="on">通常</button><button type="button" data-lm="practice">判断練習</button></div>' +
      '<section class="panel step-card" id="stepCard" aria-live="polite"></section>' +
      '<section class="panel practice" id="practice" hidden></section>' +
      '<section class="panel"><h3>見かた</h3>' +
      '<div class="seg" role="group" aria-label="表示の切り替え">' +
      '<button type="button" data-mode="all" class="on">全体</button><button type="button" data-mode="me">自分</button><button type="button" data-mode="ball">ボール</button></div>' +
      '<p class="muted small">自分の番号を選ぶと、その選手だけを強調します。</p>' +
      '<div class="players" role="group" aria-label="自分の番号">' +
      selectable.map(function (p) {
        if (p === ibId) return '<button type="button" class="ib" data-p="' + p + '">I<small>スローイン O' + p + '</small></button>';
        return '<button type="button" data-p="' + p + '">O' + p + (x.positions[p] ? '<small>' + esc(x.positions[p]) + '</small>' : '') + '</button>';
      }).join("") +
      '</div><div id="mePanel"></div>' +
      (def ? '<h3 class="sub-h">守備を見る</h3><div class="players dplayers" role="group" aria-label="守備の選手">' +
        def.players.slice().sort(function (a2, b2) { return a2.id < b2.id ? -1 : 1; }).map(function (p) { return '<button type="button" data-d="' + esc(p.id) + '">' + esc(p.id) + '</button>'; }).join("") +
        '</div><div id="dPanel"></div>' : '') + '</section>' +
      planBlock(x) + optionsBlock(x) +
      '</aside></div>' +
      sourceSteps(x) + rolesTable(x) + quizBlock(x) + teamBlock(x) + sourceInfo(x) + editLink + '</div>';

    var board = new TBBoard.Board($("#board"));
    board.setData(d);
    board.setOptions({ positions: x.positions });
    var N = board.stepCount();
    var S = { k: 0, t: 1, playing: false, raf: 0, timer: 0, speed: 1, mode: "all", focus: null, mirror: false, defMode: "off", dfocus: null, learn: "normal", answered: {}, feedback: null };
    var plan = x.plan;
    function optById(id) { for (var i = 0; i < plan.options.length; i++) if (plan.options[i].id === id) return plan.options[i]; return null; }
    function optLabel(id) { var o = optById(id); return o ? o.label || id : id; }
    function decisionAt(k) { for (var i = 0; i < plan.decisions.length; i++) if (plan.decisions[i].step === k) return plan.decisions[i]; return null; }
    function goStep(k) { stop(); S.k = Math.max(0, Math.min(N, k)); S.t = 0; S.feedback = null; refresh(); if (S.k > 0) animate(); }
    function pName(p) { return p === "I" ? "I（O" + ibId + "）" : "O" + TBValidate.normO(p); }
    function myKey() { return S.mode === "me" && S.focus ? (S.focus === ibId ? "I" : "O" + S.focus) : null; }
    function noteFor(notes) { // 自分の選手の説明（先生が登録したものだけ）
      var k = myKey();
      if (!k || !notes) return null;
      return notes[k] || (k === "I" ? null : notes[S.focus]) || null;
    }

    // 判断練習：先生が登録した問題だけを出す
    function renderPractice() {
      var box = $("#practice");
      box.hidden = S.learn !== "practice";
      if (box.hidden) return;
      var me = myKey();
      var h = me ? '<div class="me-title">あなたは <b>' + esc(pName(me === "I" ? "I" : S.focus)) + '</b> です</div>' : '';
      if (!plan.decisions.length) {
        box.innerHTML = h + '<p class="muted">判断練習の問題が登録されていません。先生が「チーム用に変更」→「オプション設定」で登録すると使えます。</p>';
        return;
      }
      var q = decisionAt(S.k);
      if (!q) {
        box.innerHTML = h + '<p class="muted small">このSTEPに判断の問題はありません。「進む」で次へ。</p>' +
          '<p class="muted small">問題があるSTEP：' + plan.decisions.map(function (d2) { return "STEP " + d2.step; }).join("、") + '</p>';
        return;
      }
      if (S.t < 1) { box.innerHTML = h + '<p class="muted">動きを見ています…</p>'; return; }
      var st = d.steps[S.k - 1];
      h += '<div class="pr-step">STEP ' + S.k + '</div><div><b>【攻撃】</b>' + esc(st.label) + '</div>';
      if (q.defense) {
        var dt = defActionTexts(q.defense.step).filter(function (tx) { return !q.defense.defender || tx.indexOf(q.defense.defender + "：") === 0; });
        h += '<div class="def-note"><b>【守備】</b>' + esc(dt.join("／") || "動作データなし") + '</div>';
      }
      h += '<p class="pr-msg">' + esc(q.message || (q.stopped ? optLabel(q.stopped) + "が守られました。" : "")) + '</p>';
      if (me && !S.answered[S.k]) h += '<p class="small">あなた（' + esc(pName(me === "I" ? "I" : S.focus)) + '）の次の動きは？</p>';
      h += '<p class="pr-q">' + esc(q.question || "次の動きは？") + '</p>';
      if (!S.answered[S.k]) {
        h += '<div class="pr-choices">' + q.choices.map(function (c) { return '<button type="button" class="btn" data-choice="' + esc(c) + '">' + esc(optLabel(c)) + '</button>'; }).join("") + '</div>';
        if (S.feedback) h += '<p class="warn">「' + esc(optLabel(S.feedback)) + '」ではありません。もう一度考えよう。' + (optById(S.feedback) && optById(S.feedback).description ? '<br><span class="muted small">' + esc(optById(S.feedback).description) + '</span>' : '') + '</p>';
      } else {
        var ans = optById(q.answer) || {};
        var target = q.next_step !== undefined && q.next_step !== null ? q.next_step : (ans.step !== undefined && ans.step !== null ? ans.step : S.k + 1);
        h += '<p class="ok-msg">正解：' + esc(optLabel(q.answer)) + '</p>' + (ans.description ? '<p>' + esc(ans.description) + '</p>' : '');
        var mine = noteFor(q.player_notes) || noteFor(ans.player_notes);
        if (me) h += '<div class="me-row me-final"><span class="me-k">あなたの次の動き</span><span>' + esc(mine || "（先生の説明は未登録）") + '</span></div>';
        if (target <= N) h += '<button type="button" class="btn btn-main" data-goto="' + target + '">次へ（STEP ' + target + '）</button>';
      }
      box.innerHTML = h;
      $all("[data-choice]", box).forEach(function (b) {
        b.addEventListener("click", function () {
          var c = b.getAttribute("data-choice");
          if (c === q.answer) { S.answered[S.k] = true; S.feedback = null; } else S.feedback = c;
          refresh();
        });
      });
      $all("[data-goto]", box).forEach(function (b) { b.addEventListener("click", function () { goStep(+b.getAttribute("data-goto")); }); });
    }

    function draw() { board.draw(S.k, S.t); }

    function renderStepCard() {
      var s = S.k ? d.steps[S.k - 1] : null;
      var chips = (s ? s.src || [] : []).map(function (n) {
        return '<span class="chip" title="' + esc(x.t.steps[n]) + '">資料 STEP ' + (n + 1) + '</span>';
      }).join("");
      if (s && s.conditional) chips += '<span class="chip chip-cond">条件つき</span>';
      if (s && s.reset_to !== undefined) chips += '<span class="chip chip-branch">別の展開：STEP ' + s.reset_to + ' の後から</span>';
      if (s && (s.moves || []).some(function (m) { return m.uncertain; })) chips += '<span class="chip chip-unc">？＝資料で要確認</span>';
      var pt = x.stepPoints[String(S.k)];
      var sr = x.stepRoles[String(S.k)] || {}, mk = myKey(), roleLine = "";
      var srKeys = Object.keys(sr).filter(function (k2) { return !mk || k2 === mk; });
      if (srKeys.length) roleLine = '<div class="team-roles"><b>このSTEPの役割（チーム）</b>' + srKeys.map(function (k2) { return esc(k2) + "：" + esc(sr[k2]); }).join("<br>") + '</div>';
      // 【攻撃】と【守備】の対応表示（守備はデータにある動作だけ）
      var defLine = "";
      if (S.defMode !== "off" && def && s) {
        var dtxt;
        if (S.defMode === "pos") dtxt = "位置だけ表示中（守備の動きは表示していません）";
        else {
          var items = defActionTexts(S.k);
          dtxt = items.length ? items.join("／") : "動作データなし";
        }
        defLine = '<div class="od-pair"><div><b>【攻撃】</b>' + esc(s.label) + '</div><div class="def-note"><b>【守備】</b>' + esc(dtxt) + '</div></div>';
      }
      var dots = "";
      for (var i = 0; i <= N; i++) dots += '<button type="button" class="dot' + (i === S.k ? " on" : "") + '" data-k="' + i + '" aria-label="' + (i ? "STEP " + i : "初期配置") + '"></button>';
      $("#stepCard").innerHTML = '<div class="step-no">' + (s ? "STEP " + S.k + " / " + N : "初期配置") + '</div>' +
        '<div class="step-label">' + esc(s ? s.label : "まず5人の位置とボールを確認しよう") + '</div>' +
        '<div class="chips">' + chips + '</div>' + defLine + roleLine +
        '<div class="step-dots">' + dots + '</div>' +
        '<div class="point"><b>指導ポイント</b>' + (pt ? '<p>' + nl2br(pt) + '</p>' : '<p class="muted">未記入（「チーム用に変更」で顧問が書き込めます）</p>') + '</div>';
      $all(".dot", $("#stepCard")).forEach(function (b) {
        b.addEventListener("click", function () { stop(); S.k = +b.getAttribute("data-k"); S.t = 1; refresh(); });
      });
    }

    function describe(p, k) {
      var s = d.steps[k - 1], out = [];
      var nm = function (id) { return String(id) === ibId ? "I（O" + id + "）" : "O" + id; };
      var shown = function (pt) { return zone(board.X(pt)); };
      (s.moves || []).forEach(function (m) {
        if (m.p === p) {
          var z = shown(m.to), u = m.uncertain ? "（位置は要確認）" : "";
          var before = board.stateAt(k).base.pos[p];
          var enters = p === ibId && before && !insideCourt(before) && insideCourt(m.to);
          if (enters) out.push("コートに入る → " + z + u);
          else if (m.type === "screen") out.push(nm(m["for"]) + "のためにスクリーン（" + z + "）" + u);
          else if (m.type === "cut") out.push("カット → " + z + u);
          else if (m.type === "dribble") out.push("ドリブル → " + z + u);
          else out.push("移動 → " + z + u);
        } else if (m["for"] === p) out.push(nm(m.p) + "があなたのためにスクリーン");
      });
      (s.passes || []).forEach(function (ps) {
        var inb = String(ps.from) === ibId && board.stateAt(k).base.holder === ibId && !insideCourt(board.stateAt(k).base.pos[ibId]);
        if (ps.from === p) out.push(nm(ps.to) + "へ" + (ps.type === "handoff" ? "ハンドオフ" : inb ? "インバウンドパス" : "パス"));
        if (ps.to === p) out.push(inb ? "スローイン担当からインバウンドパスを受ける" : nm(ps.from) + "から" + (ps.type === "handoff" ? "ハンドオフを受ける" : "パスを受ける"));
      });
      (s.options || []).forEach(function (o) {
        if (o.to === p) out.push("パスを受けられる準備（選択肢" + (o.label ? "：" + o.label : "") + "）");
        if (o.from === p) out.push("判断：" + nm(o.to) + "へのパス" + (o.label ? "（" + o.label + "）" : ""));
      });
      return out;
    }

    function renderMe() {
      var box = $("#mePanel");
      if (S.mode !== "me" || !S.focus) { box.innerHTML = ""; return; }
      var p = S.focus;
      var isIb = p === ibId;
      var p0 = board.stateAt(0).pos[p];
      var start = p0 ? board.X(p0) : null;
      var init = isIb ? "スローイン位置：" + zone(start) + "／ボールを持ってスタート" : zone(start);
      var h = '<div class="me"><div class="me-title">あなたは <b>' + (isIb ? "I" : "O" + p) + '</b>' +
        (isIb ? '（スローイン担当・O' + p + '）' : '') + (x.positions[p] ? '（' + esc(x.positions[p]) + '）' : '') + '</div>';
      var pn = x.positionNotes[isIb ? "I" : "O" + p];
      if (pn) h += '<div class="me-row me-final"><span class="me-k">チームでの説明</span><span>' + nl2br(pn) + '</span></div>';
      h += '<div class="me-row' + (S.k === 0 ? " now" : "") + '"><span class="me-k">初期位置</span><span>' + esc(init) + '</span></div>';
      for (var k = 1; k <= N; k++) {
        var items = describe(p, k), s = d.steps[k - 1];
        h += '<button type="button" class="me-row' + (k === S.k ? " now" : "") + (items.length ? " act" : "") + '" data-k="' + k + '">' +
          '<span class="me-k">STEP ' + k + (s.reset_to !== undefined ? '<small>別展開</small>' : s.conditional ? '<small>条件</small>' : '') + '</span>' +
          '<span>' + (items.length ? esc(items.join(" ／ ")) : '<span class="muted">この場面での動きの記載なし</span>') + '</span></button>';
      }
      h += '<div class="me-row me-final"><span class="me-k">最終的な役割</span><span>' + esc(x.roles[p] || "—") + '</span></div>';
      if (isIb && !d.steps.some(function (s) { return (s.moves || []).some(function (m) { return m.p === p; }); }))
        h += '<p class="muted small">スローイン後にコートへ入る動きは、資料に記載がないため表示していません。</p>';
      box.innerHTML = h + '</div>';
      $all("button.me-row", box).forEach(function (b) {
        b.addEventListener("click", function () { stop(); S.k = +b.getAttribute("data-k"); S.t = 0; refresh(); animate(); });
      });
    }

    function refreshButtons() {
      $("#cPlay").textContent = S.playing ? "⏸ 一時停止" : "▶ 再生";
      $("#cPrev").disabled = S.k === 0;
      $("#cNext").disabled = (S.k >= N && S.t >= 1) || (S.learn === "practice" && S.t >= 1 && !!decisionAt(S.k) && !S.answered[S.k]);
      $all("button[data-lm]").forEach(function (b) { b.classList.toggle("on", b.getAttribute("data-lm") === S.learn); });
      $all("button[data-mode]").forEach(function (b) { b.classList.toggle("on", b.getAttribute("data-mode") === S.mode); });
      $all("button[data-p]").forEach(function (b) { b.classList.toggle("on", S.mode === "me" && S.focus === b.getAttribute("data-p")); });
      $all("button[data-dm]").forEach(function (b) { b.classList.toggle("on", b.getAttribute("data-dm") === S.defMode); });
      $all("button[data-d]").forEach(function (b) { b.classList.toggle("on", S.dfocus === b.getAttribute("data-d")); });
    }
    function refresh() {
      board.setOptions({ mode: S.mode, focus: S.focus, mirror: S.mirror, defenseMode: S.defMode, dfocus: S.defMode === "off" ? null : S.dfocus });
      if (def) $("#defNote").hidden = S.defMode === "off";
      draw(); renderStepCard(); renderMe(); renderD(); renderPractice(); refreshButtons();
    }

    // 守備の動作を短い日本語に（登録された動作だけ）
    function actionText(a) {
      var t = a.target ? "O" + TBValidate.normO(a.target) : "";
      var sb = a.screen_by ? String(a.screen_by).split(",").map(function (z) { return "O" + TBValidate.normO(z.trim()); }).join("・") : "";
      var mth = { under: "下を通る", over: "上を通る", go_through: "間を通る", "switch": "スイッチ" }[a.method] || "";
      return a.defender + "：" + ({
        stay: "ステイ", follow: t + "を追従", "switch": t + "にスイッチ", switch_back: "元の相手に戻る（スイッチバック）",
        recover: (t ? t + "へ" : "") + "リカバー", closeout: t + "へクローズアウト",
        screen_avoid: sb + "のスクリーンを回避" + (mth ? "（" + mth + "）" : ""),
        help: "ヘルプ", hedge: "ヘッジ", deny: (t ? t + "への" : "") + "ディナイ",
        matchup_recover: (t ? t + "（新しいマッチアップ）へ" : "") + "戻る",
        lock_and_trail: t + "をロック＆トレイルで追う", double: (t ? t + "に" : "") + "ダブルチーム"
      }[a.action] || ((LIB_ACT_JA[a.action] || a.action) + (t ? "（" + t + "）" : "")) + (sb && a.action.indexOf("screen_avoid_") === 0 ? "（スクリーン：" + sb + "）" : "")) +
        (a.pattern && D.lib[a.pattern] ? "［" + D.lib[a.pattern].name + "］" : "");
    }
    function defActionTexts(k, only) {
      var ds = board.stateAt(k).dstep, out = [];
      var acts = ((ds && ds.actions) || []).filter(function (a) { return !only || a.defender === only; });
      var sw = acts.filter(function (a) { return a.action === "switch" || (a.action === "screen_avoid" && a.method === "switch"); });
      if (sw.length >= 2 && !only) out.push(sw.map(function (a) { return a.defender; }).join("・") + " スイッチ");
      acts.forEach(function (a) { out.push(actionText(a) + (a.display_only ? "（位置データなし・動かさない）" : "")); });
      (board.stateAt(k).exchanged || []).forEach(function (x2) { if ((board.stateAt(k).switched || []).indexOf(x2.id) < 0 && (!only || x2.id === only)) out.push(x2.id + "：マッチアップ交換（移動データなし）→ 相手O" + x2.to); });
      if (ds && ds.source_steps && ds.source_steps.length && !only && out.length) out.unshift("資料STEP " + ds.source_steps.join("・") + "→アプリSTEP " + k);
      ((ds && ds.moves) || []).forEach(function (m) { if (!only || m.id === only) out.push(m.id + "：移動"); });
      if (ds && ds.note && !only) out.push(ds.note);
      return out;
    }
    function renderD() {
      var box = $("#dPanel");
      if (!box) return;
      if (!S.dfocus || S.defMode === "off") { box.innerHTML = ""; return; }
      var id = S.dfocus;
      var h = '<div class="me"><div class="me-title"><b class="dname">' + esc(id) + '</b>　マッチアップ：O' + esc(board.stateAt(S.defMode === "move" ? S.k : 0).mu[id] || "—") + '</div>';
      h += '<div class="me-row' + (S.k === 0 ? " now" : "") + '"><span class="me-k">初期位置</span><span>' + esc(zone(board.X(board.stateAt(0).dpos[id]))) + '（' + esc(def.label) + '）</span></div>';
      for (var k = 1; k <= N; k++) {
        var items = defActionTexts(k, id).map(function (s) { return s.replace(id + "：", ""); });
        var mu = board.stateAt(k).mu[id];
        h += '<button type="button" class="me-row' + (k === S.k ? " now" : "") + (items.length ? " act" : "") + '" data-k="' + k + '">' +
          '<span class="me-k">STEP ' + k + '</span><span>' + (items.length ? esc(items.join(" ／ ")) + (mu ? '<small class="muted">（相手 O' + esc(mu) + '）</small>' : '') : '<span class="muted">動作データなし</span>') + '</span></button>';
      }
      if (!hasDefSteps) h += '<p class="muted small">この戦術には守備動作が登録されていません。</p>';
      box.innerHTML = h + '</div>';
      $all("button.me-row", box).forEach(function (b) {
        b.addEventListener("click", function () { stop(); S.k = +b.getAttribute("data-k"); S.t = 0; refresh(); animate(); });
      });
    }

    function duration() {
      var s = d.steps[S.k - 1];
      return (s && (s.moves || []).length ? 1600 : 1000) / S.speed;
    }
    function animate(done) {
      cancelAnimationFrame(S.raf);
      var t0 = performance.now(), dur = duration();
      function frame(now) {
        S.t = Math.min(1, (now - t0) / dur);
        draw();
        if (S.t < 1) S.raf = requestAnimationFrame(frame);
        else { renderPractice(); refreshButtons(); if (done) done(); }
      }
      S.raf = requestAnimationFrame(frame);
    }
    function stop() {
      S.playing = false;
      cancelAnimationFrame(S.raf); clearTimeout(S.timer);
      if (S.t < 1) S.t = 1;
    }
    function next() {
      if (S.t < 1) { stop(); refresh(); return; }
      if (S.k >= N) return;
      S.k++; S.t = 0; refresh(); animate();
    }
    function playLoop() {
      if (!S.playing) return;
      if (S.k >= N) { S.playing = false; refresh(); return; }
      S.k++; S.t = 0; refresh();
      animate(function () {
        if (S.learn === "practice" && decisionAt(S.k) && !S.answered[S.k]) { S.playing = false; refresh(); return; } // 判断の問題で止まる
        S.timer = setTimeout(playLoop, 650 / S.speed);
      });
    }

    $("#cNext").addEventListener("click", function () { S.playing = false; clearTimeout(S.timer); next(); });
    $("#cPrev").addEventListener("click", function () { stop(); if (S.k > 0) S.k--; S.t = 1; refresh(); });
    $("#cReset").addEventListener("click", function () { stop(); S.k = 0; S.t = 1; refresh(); });
    $("#cPlay").addEventListener("click", function () {
      if (S.playing) { stop(); refresh(); return; }
      stop();
      if (S.k >= N) { S.k = 0; S.t = 1; }
      S.playing = true; refresh(); playLoop();
    });
    $("#cSpeed").addEventListener("change", function (e) { S.speed = parseFloat(e.target.value) || 1; });
    $all("button[data-dm]").forEach(function (b) {
      b.addEventListener("click", function () {
        var m = b.getAttribute("data-dm"), msg = $("#defMsg");
        msg.hidden = true;
        if (m === "move" && !hasDefSteps) { // 守備動作は推測で作らない
          m = "pos";
          msg.textContent = def.animation_status === "motion_rule_only"
            ? "この戦術はモーションオフェンスの守備原則のみ登録されています。具体的な守備動作は未設定です。"
            : "この戦術には守備動作が登録されていません。位置表示に切り替えました。";
          msg.hidden = false;
        }
        S.defMode = m;
        refresh();
      });
    });
    // 守備モデルの教師確認：採用／修正／採用しない（結果は team_tactics の defense_review に保存。教材モデルは変えない）
    if ($("#reviewBtn")) {
      $("#reviewBtn").addEventListener("click", function () { $("#reviewForm").hidden = !$("#reviewForm").hidden; });
      $("#reviewSave").addEventListener("click", function () {
        var st = ($("#reviewForm").querySelector('input[name="rvStatus"]:checked') || {}).value;
        if (!st) { alert("採用・修正・採用しない のどれかを選んでください。"); return; }
        var tl = loadTeamLocal(), cur = teamEntry(x.t.id), e = {};
        Object.keys((cur && cur.e) || {}).forEach(function (k) { e[k] = cur.e[k]; });
        if ((st === "approved" || st === "rejected") && e.defense && !confirm("チーム版の守備（修正版）が保存されています。削除して「" + (st === "approved" ? "採用" : "採用しない") + "」にしますか？")) return;
        e.defense_review = { status: st, reviewer: $("#rvName").value.trim(), reviewed_at: new Date().toISOString(), note: $("#rvNote").value.trim() };
        if (st === "approved" || st === "rejected") delete e.defense;
        if (st === "modified" && !e.defense) { // 教材モデルをチーム版にコピーして、教師が編集する
          var md = JSON.parse(JSON.stringify(TBValidate.modelDefense(D.model[x.t.id], D.diagrams.diagrams[x.t.id], ((D.defMap || {}).tactics || {})[x.t.id])));
          delete md.unmapped_source_steps; delete md.review;
          md.label = "教師確認・修正版";
          e.defense = md;
        }
        e.updated = new Date().toISOString();
        var er = TBValidate.validateTeamTactic(x.t.id, e, x.t, D.diagrams.diagrams[x.t.id], D.lib);
        if (er.length) { alert("保存できませんでした：\n・" + er.join("\n・")); return; }
        tl[x.t.id] = e;
        if (!saveTeamLocal(tl)) return;
        if (st === "modified") { alert("チーム版にコピーしました。「ディフェンス設定」で守備の動きを修正して保存してください。"); location.hash = "#/team/" + encodeURIComponent(x.t.id); }
        else route();
      });
    }
    $all("button[data-d]").forEach(function (b) {
      b.addEventListener("click", function () {
        S.dfocus = S.dfocus === b.getAttribute("data-d") ? null : b.getAttribute("data-d");
        if (S.dfocus && S.defMode === "off") S.defMode = "pos";
        refresh();
      });
    });
    $("#cMirror").addEventListener("click", function (e) {
      S.mirror = !S.mirror;
      e.currentTarget.setAttribute("aria-pressed", String(S.mirror));
      e.currentTarget.classList.toggle("on", S.mirror);
      $("#mirrorNote").hidden = !S.mirror;
      refresh();
    });
    $all("button[data-mode]").forEach(function (b) {
      b.addEventListener("click", function () {
        S.mode = b.getAttribute("data-mode");
        if (S.mode === "me" && !S.focus) S.focus = selectable[0];
        refresh();
      });
    });
    $all("button[data-p]").forEach(function (b) {
      b.addEventListener("click", function () { S.focus = b.getAttribute("data-p"); S.mode = "me"; refresh(); });
    });
    $all("button[data-lm]").forEach(function (b) {
      b.addEventListener("click", function () {
        S.learn = b.getAttribute("data-lm");
        S.answered = {}; S.feedback = null;
        if (S.learn === "practice") { stop(); S.k = 0; S.t = 1; if (hasDefSteps && S.defMode === "off") S.defMode = "move"; }
        refresh();
      });
    });
    // オプションパネルの「STEP n へ」
    $all("[data-optstep]").forEach(function (b) { b.addEventListener("click", function () { goStep(+b.getAttribute("data-optstep")); }); });
    function onKey(e) {
      if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      if (e.key === "ArrowRight") $("#cNext").click();
      else if (e.key === "ArrowLeft") $("#cPrev").click();
      else if (e.key === " ") { e.preventDefault(); $("#cPlay").click(); }
    }
    document.addEventListener("keydown", onKey);
    cleanup = function () { stop(); document.removeEventListener("keydown", onKey); };

    refresh();
  }

  /* ---------- チーム版の編集 ---------- */
  // teamMode = true：チーム戦術管理（data/team/team_tactics.json の1戦術分を編集）
  function renderEdit(id, teamMode) {
    var existing = teamMode ? null : variantById(id);
    var base = existing ? tacticById(existing.v.base_id) : tacticById(id);
    if (!base || (teamMode && !D.diagrams.diagrams[base.id])) { app.innerHTML = '<p class="notice">この戦術はチーム戦術として登録できません（存在しないIDか、作図がない戦術です）。<a href="#/team">チーム戦術管理へ戻る</a></p>'; return; }
    var te = teamMode ? teamEntry(base.id) : null;
    var v = existing ? JSON.parse(JSON.stringify(existing.v)) : te ? JSON.parse(JSON.stringify(te.e)) : {};
    v.base_id = base.id;
    var x = resolve("src", base.id);
    var baseDiagram = D.diagrams.diagrams[base.id] || null;
    var curDiagram = v.diagram || baseDiagram;
    var n = curDiagram ? curDiagram.steps.length : 0;
    var throwIn = TBValidate.isThrowIn(base.category);
    var emptyDiagram = throwIn
      ? { inbounder: "1", inbound: [100, -7], on_court_players: ["2", "3", "4", "5"], players: { "2": null, "3": null, "4": null, "5": null }, source_steps_ja: [], steps: [] }
      : { inbounder: null, on_court_players: ["1", "2", "3", "4", "5"], players: { "1": null, "2": null, "3": null, "4": null, "5": null }, ball: "1", source_steps_ja: [], steps: [] };

    function field(label, name, val, ph, area) {
      return '<label class="f"><span>' + esc(label) + '</span>' +
        (area ? '<textarea name="' + name + '" rows="3" placeholder="' + esc(ph || "") + '">' + esc(val || "") + '</textarea>'
          : '<input name="' + name + '" value="' + esc(val || "") + '" placeholder="' + esc(ph || "") + '">') + '</label>';
    }

    var pls = curDiagram ? planPlayers(curDiagram) : [];
    var h = '<div class="detail edit"><div class="d-head"><a class="back" href="' + (teamMode ? "#/team" : existing ? "#/v/" + encodeURIComponent(v.id) : "#/t/" + encodeURIComponent(base.id)) + '">← 戻る</a>' +
      '<div class="d-id">' + esc(base.id) + ' ・ ' + (teamMode ? "チーム戦術管理" : "チーム版の" + (existing ? "編集" : "作成")) + '</div><h1>' + esc(base.name) + '</h1>' +
      '<p class="muted">ここで入力した内容は' + (teamMode ? " data/team/team_tactics.json（チーム戦術）" : "「チーム版」") + 'として別に保存され、公開資料の原本（' + esc(base.id) + '）は変わりません。' +
      (teamMode ? '入力しない項目は空欄のままで、表示には原本が使われます。' : '') + '</p></div>' +
      '<form id="editForm" class="edit-form">' +
      (teamMode ? '<section class="panel"><h3>使用・注意点・選手別説明</h3>' +
        '<label class="chk"><input type="checkbox" name="use"' + (v.use === true ? " checked" : "") + '> この戦術をチームで使用する</label>' +
        field("チーム独自の注意点", "team_notes", v.team_notes, "", true) +
        '<table class="roles edit-roles"><thead><tr><th>選手</th><th>自分のポジションごとの説明（「自分を見る」で表示）</th></tr></thead><tbody>' +
        pls.map(function (p) { return '<tr><td>' + p + '</td><td><input name="pn_' + p + '" value="' + esc((v.position_notes || {})[p] || "") + '"></td></tr>'; }).join("") +
        '</tbody></table></section>' : '') +
      '<section class="panel"><h3>名前・合図</h3>' +
      field("戦術名（チーム用）", "name", v.name, base.name) +
      field("呼び名（チーム内での呼び方）", "team_call_name", v.team_call_name, "例：ボックス1、青") +
      field("合図", "signal", v.signal, "例：コーチが拳を上げる／「ブルー」とコール") +
      field("教師メモ", "teacher_memo", v.teacher_memo, "チーム事情、使う場面など", true) + '</section>' +
      (teamMode ? '' : '<section class="panel"><h3>オプション</h3>' +
      field("第1オプション", "options_first", v.options_first, x.optionsJa[0] || "") +
      field("第2オプション", "options_second", v.options_second, x.optionsJa[1] || "") + '</section>') +
      '<section class="panel"><h3>O1〜O5（ポジション名・役割）</h3><datalist id="posNames">' + POSITION_NAMES.map(function (p) { return '<option value="' + p + '">'; }).join("") + '</datalist>' +
      '<table class="roles edit-roles"><thead><tr><th>番号</th><th>ポジション</th><th>役割（空欄なら資料の役割）</th></tr></thead><tbody>' +
      PIDS.map(function (p) {
        return '<tr><td>O' + p + '</td><td><input name="pos_' + p + '" list="posNames" value="' + esc((v.positions || {})[p] || "") + '" placeholder="PG など"></td>' +
          '<td><input name="role_' + p + '" value="' + esc((v.player_roles || {})[p] || "") + '" placeholder="' + esc(x.roles[p] || "") + '"></td></tr>';
      }).join("") + '</tbody></table></section>';

    if (curDiagram) {
      h += '<section class="panel"><h3>STEPごとの指導ポイント</h3>';
      for (var k = 0; k <= n; k++) {
        h += field(k === 0 ? "初期配置" : "STEP " + k + "：" + curDiagram.steps[k - 1].label, "pt_" + k, (v.step_points || {})[k], "", true);
        if (teamMode) h += '<label class="f sr"><span>STEP ' + k + ' の選手ごとの役割（1行に1人「O4: 役割」）</span><textarea name="sr_' + k + '" rows="2">' + esc(notesText((v.step_roles || {})[k])) + '</textarea></label>';
      }
      h += '</section>';
    }
    h += curDiagram ? defenseEditorHtml(v, withDefense(curDiagram, v), n) : "";
    h += curDiagram ? planEditorHtml(v, curDiagram, n) : "";
    h += '<section class="panel"' + (teamMode ? " hidden" : "") + '><h3>初期位置・STEP（上級者向け）</h3>' +
      '<p class="muted small">動きそのものをチーム用に変える場合だけ、JSONを書き換えます。形式は <code>data/diagrams.json</code> と同じです。<br>' +
      '<b>人数のルール：' + (throwIn ? "コート上4人（on_court_players）＋スローイン担当1人（inbounder、位置は inbound）" : "コート上5人（on_court_players）、inbounder は null") +
      '、守備（defense.players）は5人。</b>満たさない場合は保存できません。<br>' +
      '下の図をクリックすると、その場所の座標 [x, y] が表示されます。</p>' +
      '<label class="chk"><input type="checkbox" name="useDiagram"' + (v.diagram ? " checked" : "") + '> 動きをチーム用に変更する</label>' +
      '<textarea name="diagram" rows="14" class="code" spellcheck="false">' + esc(JSON.stringify(curDiagram || emptyDiagram, null, 2)) + '</textarea>' +
      '<div class="edit-preview"><svg id="editBoard" class="board board-sm" aria-label="座標確認用のコート"></svg><div><div id="coord" class="coord">座標：—</div><div id="jsonMsg" class="muted small"></div></div></div>' +
      '</section>' +
      '<div class="btn-row"><button class="btn btn-main" type="submit">保存</button>' +
      ((existing && existing.local) || (te && te.local) ? '<button class="btn btn-danger" type="button" id="btnDelete">' + (teamMode ? "このブラウザの入力を削除" : "このチーム版を削除") + '</button>' : '') +
      '</div></form></div>';
    app.innerHTML = h;

    var eb = new TBBoard.Board($("#editBoard"));
    eb.onCoord = function (c) { $("#coord").textContent = "座標：[" + c[0] + ", " + c[1] + "]"; };
    var form = $("#editForm");
    function preview() {
      var msg = $("#jsonMsg");
      try {
        var dj = JSON.parse(form.diagram.value);
        eb.setData(dj); eb.draw(0, 1);
        msg.textContent = "JSONは読み取れます（初期配置を表示中）";
        msg.className = "muted small";
        return dj;
      } catch (e) {
        eb.d = null; eb.draw(0, 1);
        msg.textContent = "JSONの形が正しくありません：" + e.message;
        msg.className = "warn small";
        return null;
      }
    }
    form.diagram.addEventListener("input", preview);
    preview();
    if (curDiagram) initDefenseEditor(form, withDefense(curDiagram, v), n);
    if (curDiagram) initPlanEditor(v, curDiagram, n);

    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var f = form;
      var nv = {
        id: v.id || nextVariantId(base.id),
        base_id: base.id,
        name: f.name.value.trim(),
        team_call_name: f.team_call_name.value.trim(),
        signal: f.signal.value.trim(),
        teacher_memo: f.teacher_memo.value.trim(),
        options_first: f.options_first ? f.options_first.value.trim() : "",
        options_second: f.options_second ? f.options_second.value.trim() : "",
        positions: {}, player_roles: {}, step_points: {},
        updated: new Date().toISOString()
      };
      PIDS.forEach(function (p) {
        var ps = f["pos_" + p].value.trim(), r = f["role_" + p].value.trim();
        if (ps) nv.positions[p] = ps;
        if (r) nv.player_roles[p] = r;
      });
      if (f.useDiagram.checked) {
        var dj = preview();
        if (!dj) { alert("JSONの形が正しくないため保存できません。"); return; }
        var r = check(dj, base);
        if (!r.ok) { alert("保存できません。次の点を直してください：\n・" + r.errors.join("\n・")); return; }
        nv.diagram = dj;
      }
      if ($("#planForm")) {
        var cp = collectPlan();
        if (cp.plan.options.length || cp.plan.decisions.length) {
          var perr = cp.errors.concat(TBValidate.validateOptions(cp.plan, withDefense(nv.diagram || baseDiagram, f.def_custom && f.def_custom.checked ? { defense: collectDefense(f) } : v), base, D.lib));
          if (perr.length) { alert("保存できません（オプション設定）。次の点を直してください：\n・" + perr.join("\n・")); return; }
          nv.offense_options = cp.plan.options;
          nv.decisions = cp.plan.decisions;
        }
      }
      if (f.quizzes && f.quizzes.value.trim() && f.quizzes.value.trim() !== "[]") {
        var qs;
        try { qs = JSON.parse(f.quizzes.value); } catch (e) { alert("守備クイズのJSONの形が正しくありません：" + e.message); return; }
        if (!Array.isArray(qs)) { alert("守備クイズは [ … ] の配列で書いてください。"); return; }
        var qerr = [];
        var qd = nv.diagram || baseDiagram || { steps: [] };
        var qctx = { options: (nv.offense_options || []).map(function (o) { return o.id; }), players: TBValidate.offenseIds(qd).concat(qd.inbounder ? ["I"] : []) };
        qs.forEach(function (q) { qerr = qerr.concat(TBValidate.validateQuiz(q, D.lib, qd.steps.length, qctx)); });
        if (qerr.length) { alert("保存できません（守備クイズ）：\n・" + qerr.join("\n・")); return; }
        nv.quizzes = qs;
      }
      if (f.def_custom && f.def_custom.checked) {
        nv.defense = collectDefense(f);
        var rd = check(withDefense(nv.diagram || baseDiagram, nv), base);
        if (!rd.ok) { alert("保存できません（ディフェンス設定）。次の点を直してください：\n・" + rd.errors.join("\n・")); return; }
      }
      var dg = nv.diagram || baseDiagram;
      if (dg) for (var k = 0; k <= dg.steps.length; k++) {
        var inp = f["pt_" + k];
        if (inp && inp.value.trim()) nv.step_points[k] = inp.value.trim();
      }
      if (teamMode) { // チーム戦術：入力された項目だけを保存（空欄は保存しない＝原本を使う）
        var e = { use: !!f.use.checked };
        ["name", "team_call_name", "signal", "teacher_memo"].forEach(function (k2) { if (nv[k2]) e[k2] = nv[k2]; });
        if (f.team_notes.value.trim()) e.team_notes = f.team_notes.value.trim();
        ["positions", "player_roles", "step_points"].forEach(function (k2) { if (Object.keys(nv[k2]).length) e[k2] = nv[k2]; });
        var perr2 = [], pn = {}, sr = {};
        pls.forEach(function (p2) { var val = f["pn_" + p2].value.trim(); if (val) pn[p2] = val; });
        for (var k3 = 0; k3 <= n; k3++) {
          var srv = parseNotes(f["sr_" + k3] ? f["sr_" + k3].value : "", "STEP " + k3 + " の役割", perr2);
          if (Object.keys(srv).length) sr[k3] = srv;
        }
        if (Object.keys(pn).length) e.position_notes = pn;
        if (Object.keys(sr).length) e.step_roles = sr;
        ["defense", "offense_options", "decisions", "quizzes"].forEach(function (k2) { if (nv[k2]) e[k2] = nv[k2]; });
        if (v.defense_review) e.defense_review = v.defense_review;
        e.updated = nv.updated;
        perr2 = perr2.concat(TBValidate.validateTeamTactic(base.id, e, base, baseDiagram, D.lib));
        if (perr2.length) { alert("保存できません。次の点を直してください：\n・" + perr2.join("\n・")); return; }
        var tl = loadTeamLocal();
        tl[base.id] = e;
        if (saveTeamLocal(tl)) location.hash = "#/t/" + encodeURIComponent(base.id);
        return;
      }
      var local = loadLocal().filter(function (y) { return y.id !== nv.id; });
      local.push(nv);
      if (saveLocal(local)) location.hash = "#/v/" + encodeURIComponent(nv.id);
    });
    var del = $("#btnDelete");
    if (del && teamMode) del.addEventListener("click", function () {
      if (!confirm("このブラウザで入力した「" + base.id + "」のチーム設定を削除します。よろしいですか？")) return;
      var tl = loadTeamLocal(); delete tl[base.id]; saveTeamLocal(tl);
      location.hash = "#/team";
    });
    else if (del) del.addEventListener("click", function () {
      if (!confirm("このブラウザに保存したチーム版「" + (v.team_call_name || v.name || v.id) + "」を削除します。よろしいですか？")) return;
      saveLocal(loadLocal().filter(function (y) { return y.id !== v.id; }));
      location.hash = "#/t/" + encodeURIComponent(base.id);
    });
  }

  /* ---------- チーム戦術管理 ---------- */
  function renderTeamList() {
    document.title = "チーム戦術管理 | バスケ作戦盤";
    var targets = ((D.teamTactics || {}).meta || {}).initial_targets || [];
    var all = allTeamTactics(), local = loadTeamLocal();
    var ids = D.source.tactics.filter(function (t) { return D.diagrams.diagrams[t.id]; }).map(function (t) { return t.id; });
    ids.sort(function (a, b) { return (targets.indexOf(a) < 0) - (targets.indexOf(b) < 0); });
    function row(id) {
      var t = tacticById(id), e = all[id];
      var st = !e ? '<span class="muted">未登録（原本のまま）</span>' : (local[id] ? "このブラウザで入力" : "ファイル（team_tactics.json）") + (e.use === true ? "・使用する" : e.use === false ? "・使用しない" : "");
      return '<tr><td>' + esc(id) + (targets.indexOf(id) >= 0 ? '<br><span class="badge ok">最初に登録</span>' : '') + '</td><td>' + esc(t.name) + (e && e.team_call_name ? '<br><b>' + esc(e.team_call_name) + '</b>' : '') + '</td>' +
        '<td>' + st + '</td><td><a class="btn btn-sm" href="#/team/' + encodeURIComponent(id) + '">編集</a>' + (e ? ' <a class="btn btn-sm" href="#/t/' + encodeURIComponent(id) + '">表示</a>' : '') + '</td></tr>';
    }
    app.innerHTML = '<div class="detail"><a class="back" href="#/">← 戦術一覧</a><h1>チーム戦術管理</h1>' +
      '<p class="muted">原本（公開資料）は変えずに、このチームで実際に使う内容だけを登録します。登録した項目はアプリで原本より優先され、登録していない項目は原本のまま表示されます。内容は自動では作りません。</p>' +
      '<table class="roles team-table"><thead><tr><th>ID</th><th>戦術</th><th>状態</th><th></th></tr></thead><tbody>' + ids.map(row).join("") + '</tbody></table>' +
      '<section class="teacher-tools"><h2>ファイルへの保存</h2><p class="muted small">このブラウザで入力した内容は「書き出し」で team_tactics.json として保存し、<code>data/team/team_tactics.json</code> と置き換えると、ほかの端末でも使えます。</p>' +
      '<div class="btn-row"><button class="btn" id="tExport" type="button">書き出し（team_tactics.json）</button>' +
      '<label class="btn">読み込み<input type="file" id="tImport" accept=".json,application/json" hidden></label></div></section></div>';
    $("#tExport").addEventListener("click", function () {
      var out = { meta: (D.teamTactics || {}).meta || {}, tactics: allTeamTactics() };
      var a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([JSON.stringify(out, null, 2) + "\n"], { type: "application/json" }));
      a.download = "team_tactics.json";
      document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    });
    $("#tImport").addEventListener("change", function (ev) {
      var file = ev.target.files[0];
      if (!file) return;
      var r = new FileReader();
      r.onload = function () {
        try {
          var data = JSON.parse(r.result), tl = loadTeamLocal(), ok = 0, errs = [];
          Object.keys((data && data.tactics) || {}).forEach(function (id) {
            var er = TBValidate.validateTeamTactic(id, data.tactics[id], tacticById(id), D.diagrams.diagrams[id], D.lib);
            if (er.length) errs.push(id + "：" + er[0]); else { tl[id] = data.tactics[id]; ok++; }
          });
          saveTeamLocal(tl);
          alert(ok + " 件読み込みました" + (errs.length ? "\n読み込めなかったもの：\n" + errs.join("\n") : ""));
          renderTeamList();
        } catch (e) { alert("読み込めませんでした：" + e.message); }
      };
      r.readAsText(file);
    });
  }

  /* ---------- 守備ライブラリ ---------- */
  // ライブラリの動作名の日本語（表示用の訳。内容は追加しない）
  var LIB_ACT_JA = {
    stay_in_matchup: "マッチアップを保つ", adjust_to_ball: "ボールに合わせて位置を調整", deny: "ディナイ", help_position: "ヘルプポジション",
    help: "ヘルプ", recover: "リカバー", help_rotation: "ヘルプローテーション", matchup_recover: "新しいマッチアップへ戻る",
    closeout: "クローズアウト", lock_and_trail: "ロック＆トレイル（追いかける）", screen_avoid_under: "スクリーンの下を通る",
    screen_avoid_over: "スクリーンの上を通る", screen_avoid_through: "スクリーンの間を通る", "switch": "スイッチ", double: "ダブルチーム"
  };
  // JBA U15 マンツーマン基準の学習項目（ライブラリの動作名で分類するだけ）
  var U15_BY_ACTION = {
    stay_in_matchup: ["マッチアップ"], adjust_to_ball: ["ボールとマークマンの両方を見る"], deny: ["ボールとマークマンの両方を見る"],
    help_position: ["ヘルプ"], help: ["ヘルプ"], recover: ["ヘルプ後のマッチアップ"], help_rotation: ["ヘルプ", "ヘルプ後のマッチアップ"],
    matchup_recover: ["ヘルプ後のマッチアップ"], "switch": ["スイッチ"]
  };
  var U15_ITEMS = ["マッチアップ", "ボールとマークマンの両方を見る", "ヘルプ", "ヘルプ後のマッチアップ", "スイッチ"];
  function u15Items(p) {
    var out = [];
    p.actions.forEach(function (a) { (U15_BY_ACTION[a] || []).forEach(function (x) { if (out.indexOf(x) < 0) out.push(x); }); });
    return out;
  }
  function stars(n) { return "★★★".slice(0, n || 0); }

  // 学習カード：何をする（目的）・いつ使う（発動場面）・確認ポイント（ライブラリの動作と出典箇所）。戦術ごとの答えは作らない
  function learnCard(p) {
    return '<div class="learn-card"><div class="lc-title">' + esc(p.id + " " + p.name) + '</div>' +
      '<div><b>何をする</b>' + esc(p.purpose) + '</div>' +
      '<div><b>いつ使う</b>' + esc((p.trigger || []).join("／")) + '</div>' +
      '<div><b>確認ポイント</b>' + esc(p.actions.map(function (a) { return LIB_ACT_JA[a] || a; }).join("／")) +
      '<span class="muted small">（出典：' + esc(p.source.map(function (s) { return s.section; }).join("、")) + '）</span></div></div>';
  }

  function renderLibrary() {
    document.title = "守備ライブラリ | バスケ作戦盤";
    var pats = (D.library && D.library.patterns) || [];
    var cats = [];
    pats.forEach(function (p) { if (cats.indexOf(p.category) < 0) cats.push(p.category); });
    app.innerHTML = '<div class="detail"><a class="back" href="#/">← 戦術一覧</a><h1>守備ライブラリ</h1>' +
      '<p class="muted">' + esc(D.library.description || "") + '</p>' +
      '<p class="muted small">使い方：' + esc((D.library.usage_rules || []).join("／")) + '</p>' +
      '<p class="cat-note"><b>JBA U15 マンツーマン基準との対応：</b>マッチアップ／ボールとマークマンの両方を見る／ヘルプ／ヘルプ後のマッチアップ／スイッチ を学習項目として絞り込めます。' +
      'この教材の「スイッチ」は、スクリーン等を契機にマッチアップを交換することを指し、エリアを守り続ける目的のスイッチとは区別します。</p>' +
      '<div class="lib-filters">' +
      '<label>分類<select id="fCat"><option value="">すべて</option>' + opts(cats, "") + '</select></label>' +
      '<label>U15学習項目<select id="fU15"><option value="">すべて</option>' + opts(U15_ITEMS, "") + '</select></label>' +
      '<label>名称で検索<input id="fQ" type="search" placeholder="例：スイッチ、ヘルプ"></label></div>' +
      '<p class="muted small" id="libCount"></p><div class="cards lib-cards" id="libCards"></div></div>';
    function draw() {
      var c = $("#fCat").value, u = $("#fU15").value, q = $("#fQ").value.trim();
      var list = pats.filter(function (p) {
        return (!c || p.category === c) && (!u || u15Items(p).indexOf(u) >= 0) && (!q || (p.name + p.id).indexOf(q) >= 0);
      });
      $("#libCount").textContent = list.length + " / " + pats.length + " 件";
      $("#libCards").innerHTML = list.map(function (p) {
        return '<div class="card lib-card" data-id="' + esc(p.id) + '"><div class="card-id">' + esc(p.id) + '・' + esc(p.category) + '</div>' +
          '<div class="card-name">' + esc(p.name) + '</div>' +
          '<div class="badges">' + (p.verified ? '<span class="badge ok">出典確認済み</span>' : '<span class="badge wait">未確認</span>') +
          '<span class="badge u16">対象：' + esc(p.scope) + '</span><span class="badge layout">難易度 ' + stars(p.difficulty) + '</span>' +
          u15Items(p).map(function (x) { return '<span class="badge anim">' + esc(x) + '</span>'; }).join("") + '</div>' +
          '<dl class="kv"><dt>目的</dt><dd>' + esc(p.purpose) + '</dd><dt>発動場面</dt><dd>' + esc((p.trigger || []).join("／")) + '</dd>' +
          '<dt>動作</dt><dd>' + esc(p.actions.map(function (a) { return (LIB_ACT_JA[a] || a) + "（" + a + "）"; }).join("、")) + '</dd>' +
          '<dt>出典</dt><dd>' + p.source.map(function (s) { return link(s.url, s.title) + '<br><span class="muted small">' + esc(s.section) + '</span>'; }).join("<br>") + '</dd></dl></div>';
      }).join("") || '<p class="muted">該当するパターンはありません。</p>';
    }
    ["fCat", "fU15"].forEach(function (id) { $("#" + id).addEventListener("change", draw); });
    $("#fQ").addEventListener("input", draw);
    draw();
  }

  /* ---------- ディフェンス設定（チーム版の編集画面） ---------- */
  var DEF_IDS = ["D1", "D2", "D3", "D4", "D5"];
  var ACTION_JA = { stay: "ステイ", follow: "追従", "switch": "スイッチ", switch_back: "スイッチバック", recover: "リカバー",
    closeout: "クローズアウト", screen_avoid: "スクリーン回避", help: "ヘルプ（位置が必要）", hedge: "ヘッジ（位置が必要）", deny: "ディナイ（位置が必要）" };
  var ACT_LABEL = {};
  [LIB_ACT_JA, ACTION_JA].forEach(function (m) { Object.keys(m).forEach(function (k) { ACT_LABEL[k] = m[k]; }); });
  var METHOD_JA = { under: "下を通る", over: "上を通る", go_through: "間を通る", "switch": "スイッチ" };
  function opts(list, cur, labels) {
    return list.map(function (x) { return '<option value="' + esc(x) + '"' + (String(cur) === String(x) ? " selected" : "") + '>' + esc(labels ? labels[x] || x : x) + '</option>'; }).join("");
  }
  var OIDS = ["", "O1", "O2", "O3", "O4", "O5"];

  function defenseEditorHtml(v, dgm, n) {
    var cur = TBValidate.defenseOf(dgm) || TBValidate.defaultDefense(dgm);
    var raw = v.defense || {};
    var pos = {};
    (cur.players || []).forEach(function (p) { pos[p.id] = p.pos; });
    var h = '<section class="panel"><h3>ディフェンス設定</h3>' +
      '<p class="muted small">資料または教師が確認した守備だけを登録してください。登録しない場合は「想定ディフェンス」（位置のみ・動かない）が表示されます。' +
      '守備は必ず D1〜D5 の5人です。コートをクリックすると座標が表示されます（下の図）。</p>' +
      '<label class="chk"><input type="checkbox" name="def_custom"' + (v.defense ? " checked" : "") + '> 守備をチーム版に登録する</label>' +
      '<div class="def-form"><label class="chk"><input type="checkbox" name="def_enabled"' + (raw.enabled === false ? "" : " checked") + '> 守備を表示する（ON）</label>' +
      '<label class="chk"><input type="checkbox" name="def_verified"' + (raw.verified === true ? " checked" : "") + '> 資料または教師が確認済み（verified）</label>' +
      '<label class="f"><span>守備の種類</span><select name="def_mode">' + opts(["man_to_man", "switch", "help_and_recover", "zone_23", "custom"], cur.mode, { man_to_man: "マンツーマン", "switch": "スイッチ", help_and_recover: "ヘルプ＆リカバー", zone_23: "2-3ゾーン", custom: "カスタム" }) + '</select></label>' +
      '<label class="f"><span>出典</span><input name="def_source" value="' + esc(raw.source || "") + '" placeholder="資料名／「顧問が確認」など"></label>' +
      '<label class="f"><span>出典URL</span><input name="def_source_url" value="' + esc(raw.source_url || "") + '"></label>' +
      '<label class="f"><span>備考</span><input name="def_note" value="' + esc(raw.note || "") + '"></label>' +
      '<table class="roles edit-roles"><thead><tr><th>守備</th><th>初期位置 x</th><th>y</th><th>マッチアップ</th></tr></thead><tbody>' +
      DEF_IDS.map(function (id) {
        var p = pos[id] || ["", ""];
        return '<tr><td>' + id + '</td><td><input name="dx_' + id + '" inputmode="decimal" value="' + esc(p[0]) + '"></td><td><input name="dy_' + id + '" inputmode="decimal" value="' + esc(p[1]) + '"></td>' +
          '<td><select name="dm_' + id + '">' + opts(OIDS, (cur.matchups || {})[id] ? "O" + TBValidate.normO(cur.matchups[id]) : "") + '</select></td></tr>';
      }).join("") + '</tbody></table>' +
      '<h4>STEPごとの守備の動き（スイッチ・スクリーン対応を含む）</h4>' +
      '<p class="muted small">動きは登録した分だけアニメーションします（自動では作りません）。ヘルプ・ヘッジ・ディナイは移動先 x, y が必要です。</p>' +
      '<div class="pat-pick"><label class="f"><span>守備パターンから追加（守備ライブラリ）</span><select id="patSel"><option value="">パターンを選ぶ</option>' +
      libOptions("") + '</select></label><div id="patCard"></div>' +
      '<button type="button" class="btn" id="patAdd" disabled>このパターンの動きを追加</button>' +
      '<p class="muted small">追加した行の STEP・守備（D1〜D5）・相手O・移動先・スイッチ後の相手は、戦術に合わせて先生が選んでください（自動では入りません）。</p></div>' +
      '<div id="defActs"></div><button type="button" class="btn" id="addAct">＋ 守備の動きを追加</button></div></section>' +
      '<section class="panel"><h3>守備クイズ（先生が作成・任意）</h3>' +
      '<p class="muted small">問題と正解は自動では作りません。形式：[{"id":"Q1","pattern_id":"DEF-10","step":3,"question":"…","choices":["…","…"],"answer_index":0,"explanation":"…"}]</p>' +
      '<textarea name="quizzes" rows="5" class="code" spellcheck="false">' + esc(JSON.stringify(v.quizzes || [], null, 2)) + '</textarea></section>';
    return h;
  }
  function libOptions(cur) {
    var pats = (D.library && D.library.patterns) || [], groups = {};
    pats.forEach(function (p) { (groups[p.category] = groups[p.category] || []).push(p); });
    return Object.keys(groups).map(function (c) {
      return '<optgroup label="' + esc(c) + '">' + groups[c].map(function (p) {
        return '<option value="' + esc(p.id) + '"' + (cur === p.id ? " selected" : "") + '>' + esc(p.id + " " + p.name) + '</option>';
      }).join("") + '</optgroup>';
    }).join("");
  }

  function actRowHtml(a, n) {
    var steps = [];
    for (var i = 1; i <= n; i++) steps.push(String(i));
    var to = a.to || ["", ""];
    var pat = a.pattern && D.lib[a.pattern];
    var actList = pat ? pat.actions : TBValidate.DEF_ACTIONS;
    // 教材モデルから来た印（交換つきスイッチ・位置なしで表示のみ・資料STEP）は編集しても残す
    var keep = {};
    ["display_only", "exchange", "source_step"].forEach(function (k) { if (a[k] !== undefined) keep[k] = a[k]; });
    var keepTxt = (keep.exchange ? "マッチアップ交換" : "") + (keep.display_only ? (keep.exchange ? "・" : "") + "位置なし（x, y を入れると動く）" : "") + (keep.source_step !== undefined ? "・資料STEP " + keep.source_step : "");
    return '<div class="act-row" data-keep="' + esc(JSON.stringify(keep)) + '">' +
      (keepTxt ? '<span class="keep-tag">' + esc(keepTxt.replace(/^・/, "")) + '</span>' : '') +
      '<label>パターン<select data-f="pattern"><option value="">（なし）</option>' + libOptions(a.pattern || "") + '</select></label>' +
      '<label>STEP<select data-f="step"><option value="">（選ぶ）</option>' + opts(steps, a.step || "") + '</select></label>' +
      '<label>守備<select data-f="defender"><option value="">（選ぶ）</option>' + opts(DEF_IDS, a.defender || "") + '</select></label>' +
      '<label>動作<select data-f="action">' + opts(actList, a.action || actList[0], ACT_LABEL) + '</select></label>' +
      '<label>相手<select data-f="target">' + opts(OIDS, a.target ? "O" + TBValidate.normO(a.target) : "") + '</select></label>' +
      '<label>スクリーン<select data-f="screen_by">' + opts(OIDS, a.screen_by ? "O" + TBValidate.normO(a.screen_by) : "") + '</select></label>' +
      '<label>方法<select data-f="method">' + opts([""].concat(TBValidate.SCREEN_METHODS), a.method || "", METHOD_JA) + '</select></label>' +
      '<label>x<input data-f="tx" inputmode="decimal" value="' + esc(to[0]) + '"></label><label>y<input data-f="ty" inputmode="decimal" value="' + esc(to[1]) + '"></label>' +
      '<button type="button" class="btn btn-danger act-del" aria-label="この動きを削除">×</button></div>';
  }

  function initDefenseEditor(form, dgm, n) {
    var box = $("#defActs");
    if (!box) return;
    var raw = (dgm.defense && dgm.defense.steps) || [];
    function add(a) {
      var w = document.createElement("div");
      w.innerHTML = actRowHtml(a, n);
      var row = w.firstChild;
      row.querySelector(".act-del").addEventListener("click", function () { row.remove(); });
      box.appendChild(row);
    }
    raw.forEach(function (s) { (s.actions || []).forEach(function (a) { var c = {}; for (var k in a) c[k] = a[k]; c.step = TBValidate.defStepNo(s); if (s.source_step !== undefined) c.source_step = s.source_step; add(c); }); });
    $("#addAct").addEventListener("click", function () { add({}); });
    // 守備パターン：学習カードを見せ、パターンの動作ごとに空欄つきの行を追加（戦術ごとの値は先生が入れる）
    var sel = $("#patSel"), btn = $("#patAdd");
    sel.addEventListener("change", function () {
      var p = D.lib[sel.value];
      $("#patCard").innerHTML = p ? learnCard(p) : "";
      btn.disabled = !p;
    });
    btn.addEventListener("click", function () {
      var p = D.lib[sel.value];
      if (p) p.actions.forEach(function (act) { add({ pattern: p.id, action: act }); });
    });
    // 行のパターンを変えたら、動作の選択肢をそのパターンの動作に絞る
    box.addEventListener("change", function (e) {
      if (e.target.getAttribute("data-f") !== "pattern") return;
      var p = D.lib[e.target.value], aSel = e.target.closest(".act-row").querySelector('[data-f="action"]');
      var list = p ? p.actions : TBValidate.DEF_ACTIONS;
      aSel.innerHTML = opts(list, list[0], ACT_LABEL);
    });
  }

  function collectDefense(f) {
    var num = function (v) { var x = parseFloat(v); return isFinite(x) ? x : null; };
    var def = {
      enabled: f.def_enabled.checked, mode: f.def_mode.value, verified: f.def_verified.checked,
      source: f.def_source.value.trim(), source_url: f.def_source_url.value.trim(), note: f.def_note.value.trim(),
      players: [], matchups: {}, steps: []
    };
    DEF_IDS.forEach(function (id) {
      var x = num(f["dx_" + id].value), y = num(f["dy_" + id].value);
      if (x !== null && y !== null) def.players.push({ id: id, pos: [x, y] });
      if (f["dm_" + id].value) def.matchups[id] = f["dm_" + id].value;
    });
    var byStep = {};
    $all("#defActs .act-row").forEach(function (row) {
      var g = function (k) { return row.querySelector('[data-f="' + k + '"]').value; };
      var a = { defender: g("defender"), action: g("action") };
      if (g("pattern")) a.pattern = g("pattern");
      if (g("target")) a.target = g("target");
      if (g("screen_by")) a.screen_by = g("screen_by");
      if (g("method")) a.method = g("method");
      var tx = num(g("tx")), ty = num(g("ty"));
      if (tx !== null && ty !== null) a.to = [tx, ty];
      var keep = {};
      try { keep = JSON.parse(row.getAttribute("data-keep") || "{}"); } catch (e) { keep = {}; }
      if (keep.exchange && a.action === "switch") a.exchange = true;
      if (keep.display_only && !a.to) a.display_only = true;
      if (keep.source_step !== undefined) a.source_step = keep.source_step;
      var st = +g("step");
      (byStep[st] = byStep[st] || []).push(a);
    });
    Object.keys(byStep).sort(function (a, b) { return a - b; }).forEach(function (st) {
      var acts = byStep[st], ss = acts.map(function (a) { return a.source_step; }).filter(function (x) { return x !== undefined; });
      var e2 = { step: +st, app_step: +st, actions: acts };
      if (ss.length === acts.length && ss.every(function (x) { return x === ss[0]; })) e2.source_step = ss[0];
      acts.forEach(function (a) { delete a.source_step; });
      def.steps.push(e2);
    });
    return def;
  }

  /* ---------- オプション設定（チーム版の編集画面） ---------- */
  var OPT_DEF = [["option-1", "第1オプション"], ["option-2", "第2オプション"], ["option-3", "第3オプション"], ["safety", "セーフティ"]];
  function planPlayers(dgm) {
    var ps = TBValidate.offenseIds(dgm).sort().map(function (p) { return "O" + p; });
    return dgm.inbounder ? ps.concat(["I"]) : ps;
  }
  function notesText(notes) { return Object.keys(notes || {}).map(function (k) { return k + ": " + notes[k]; }).join("\n"); }
  function stepOpts(n, cur, from) {
    var a = [];
    for (var i = from; i <= n; i++) a.push(String(i));
    return '<option value="">（なし）</option>' + opts(a, cur === undefined || cur === null ? "" : cur);
  }
  function planEditorHtml(v, dgm, n) {
    var cur = {};
    (v.offense_options || []).forEach(function (o) { cur[o.id] = o; });
    var pl = planPlayers(dgm);
    return '<section class="panel" id="planForm"><h3>オプション設定（第1オプションが止められたときの次の動き）</h3>' +
      '<p class="muted small">内容は先生が登録します（自動では作りません）。STEP は「そのオプションを行うSTEP」、選手ごとの説明は1行に1人「O4: 説明」の形で書きます' + (dgm.inbounder ? "（スローイン担当は I）" : "") + '。</p>' +
      OPT_DEF.map(function (od) {
        var o = cur[od[0]] || {};
        return '<div class="opt-row" data-oid="' + od[0] + '"><div class="opt-head"><input data-f="label" value="' + esc(o.label || od[1]) + '">' +
          '<label>STEP<select data-f="step">' + stepOpts(n, o.step, 0) + '</select></label></div>' +
          '<label class="f"><span>説明</span><input data-f="description" value="' + esc(o.description || "") + '"></label>' +
          '<label class="f"><span>発動条件</span><input data-f="trigger" value="' + esc(o.trigger || "") + '" placeholder="例：D4がオーバーで守ったとき"></label>' +
          '<div class="chk-row"><span>関係する選手</span>' + pl.map(function (p) {
            return '<label class="chk"><input type="checkbox" data-f="player" value="' + p + '"' + ((o.players || []).indexOf(p) >= 0 ? " checked" : "") + '>' + p + '</label>';
          }).join("") + '</div>' +
          '<label class="f"><span>選手ごとの説明</span><textarea data-f="notes" rows="2" placeholder="O4: …">' + esc(notesText(o.player_notes)) + '</textarea></label></div>';
      }).join("") +
      '<h4>判断練習の問題（どの守備でどのオプションへ移るか）</h4><div id="decRows"></div>' +
      '<button type="button" class="btn" id="addDec">＋ 判断の問題を追加</button></section>';
  }
  function decRowHtml(q, n) {
    var ids = OPT_DEF.map(function (o) { return o[0]; }), lab = {};
    OPT_DEF.forEach(function (o) { lab[o[0]] = o[1]; });
    return '<div class="dec-row">' +
      '<label>STEP<select data-f="step">' + stepOpts(n, q.step, 1) + '</select></label>' +
      '<label>守られたオプション<select data-f="stopped"><option value="">（選ぶ）</option>' + opts(ids, q.stopped || "", lab) + '</select></label>' +
      '<label>守備のSTEP<select data-f="dstep">' + stepOpts(n, q.defense ? q.defense.step : "", 1) + '</select></label>' +
      '<label>守備<select data-f="defender"><option value="">（なし）</option>' + opts(DEF_IDS, q.defense ? q.defense.defender || "" : "") + '</select></label>' +
      '<label>守備パターン<select data-f="pattern"><option value="">（なし）</option>' + libOptions(q.pattern_id || "") + '</select></label>' +
      '<label class="wide">表示する文<input data-f="message" value="' + esc(q.message || "") + '" placeholder="例：第1オプションが守られました。"></label>' +
      '<label class="wide">問い<input data-f="question" value="' + esc(q.question || "") + '" placeholder="次の動きは？"></label>' +
      '<div class="chk-row"><span>選択肢</span>' + ids.map(function (id) {
        return '<label class="chk"><input type="checkbox" data-f="choice" value="' + id + '"' + ((q.choices || []).indexOf(id) >= 0 ? " checked" : "") + '>' + lab[id] + '</label>';
      }).join("") + '</div>' +
      '<label>正解<select data-f="answer"><option value="">（選ぶ）</option>' + opts(ids, q.answer || "", lab) + '</select></label>' +
      '<label>正解後に進むSTEP<select data-f="next_step">' + stepOpts(n, q.next_step, 0) + '</select></label>' +
      '<label class="wide">選手ごとの「次の動き」<textarea data-f="notes" rows="2" placeholder="O4: …">' + esc(notesText(q.player_notes)) + '</textarea></label>' +
      '<button type="button" class="btn btn-danger dec-del" aria-label="この問題を削除">×</button></div>';
  }
  function initPlanEditor(v, dgm, n) {
    var box = $("#decRows");
    function add(q) {
      var w = document.createElement("div");
      w.innerHTML = decRowHtml(q, n);
      var row = w.firstChild;
      row.querySelector(".dec-del").addEventListener("click", function () { row.remove(); });
      box.appendChild(row);
    }
    (v.decisions || []).forEach(add);
    $("#addDec").addEventListener("click", function () { add({}); });
  }
  function parseNotes(text, where, errors) {
    var out = {};
    String(text || "").split(/\n/).forEach(function (line) {
      line = line.trim();
      if (!line) return;
      var m = line.match(/^(O?[1-5]|I)\s*[:：]\s*(.+)$/i);
      if (!m) { errors.push(where + "：「" + line + "」は「O4: 説明」の形で書いてください。"); return; }
      var k = m[1].toUpperCase() === "I" ? "I" : "O" + m[1].replace(/^O/i, "");
      out[k] = m[2];
    });
    return out;
  }
  function collectPlan() {
    var errors = [], plan = { options: [], decisions: [] };
    $all("#planForm .opt-row").forEach(function (row) {
      var g = function (k) { return row.querySelector('[data-f="' + k + '"]').value.trim(); };
      var id = row.getAttribute("data-oid");
      var o = { id: id, label: g("label"), description: g("description"), trigger: g("trigger") };
      if (g("step") !== "") o.step = +g("step");
      o.players = $all('[data-f="player"]:checked', row).map(function (c) { return c.value; });
      o.player_notes = parseNotes(g("notes"), o.label, errors);
      var def = OPT_DEF.filter(function (x) { return x[0] === id; })[0][1];
      if (o.description || o.trigger || o.step !== undefined || o.players.length || Object.keys(o.player_notes).length || o.label !== def) plan.options.push(o);
    });
    $all("#planForm .dec-row").forEach(function (row, i) {
      var g = function (k) { return row.querySelector('[data-f="' + k + '"]').value.trim(); };
      var q = { step: g("step") === "" ? null : +g("step"), stopped: g("stopped"), message: g("message"), question: g("question"),
        choices: $all('[data-f="choice"]:checked', row).map(function (c) { return c.value; }), answer: g("answer") };
      if (g("dstep") !== "") q.defense = { step: +g("dstep") };
      if (g("defender")) (q.defense = q.defense || { step: q.step }).defender = g("defender");
      if (g("pattern")) q.pattern_id = g("pattern");
      if (g("next_step") !== "") q.next_step = +g("next_step");
      q.player_notes = parseNotes(g("notes"), "判断 " + (i + 1), errors);
      plan.decisions.push(q);
    });
    return { plan: plan, errors: errors };
  }

  function nextVariantId(baseId) {
    var used = {};
    allVariants().forEach(function (y) { used[y.v.id] = true; });
    for (var i = 1; ; i++) if (!used["TEAM-" + baseId + "-" + i]) return "TEAM-" + baseId + "-" + i;
  }

  /* ---------- ルーター ---------- */
  function route() {
    if (cleanup) { cleanup(); cleanup = null; }
    var parts = location.hash.replace(/^#\/?/, "").split("/").map(decodeURIComponent);
    document.title = "バスケ作戦盤";
    try {
      if (parts[0] === "t" && parts[1]) renderDetail("t", parts[1]);
      else if (parts[0] === "v" && parts[1]) renderDetail("v", parts[1]);
      else if (parts[0] === "edit" && parts[1]) renderEdit(parts[1]);
      else if (parts[0] === "lib") renderLibrary();
      else if (parts[0] === "src" && parts[1]) renderDetail("src", parts[1]);
      else if (parts[0] === "team" && parts[1]) renderEdit(parts[1], true);
      else if (parts[0] === "team") renderTeamList();
      else renderList();
    } catch (e) {
      // 1つの戦術のデータが壊れていても、アプリ全体は止めない
      if (cleanup) { cleanup(); cleanup = null; }
      app.innerHTML = '<div class="detail"><a class="back" href="#/">← 戦術一覧</a><section class="panel error"><h3>戦術データエラー（要修正）</h3>' +
        '<p>この画面を表示できませんでした。ほかの戦術は一覧から開けます。</p><p class="muted small">' + esc(e.message) + '</p></section></div>';
    }
    window.scrollTo(0, 0);
  }

  // 起動時の一括チェック（結果はコンソールと一覧の「要修正」表示に出る）
  function checkAll() {
    var bad = [];
    D.source.tactics.forEach(function (t) {
      var dg = D.diagrams.diagrams[t.id];
      if (dg && !check(dg, t).ok) bad.push(t.id);
    });
    allVariants().forEach(function (y) {
      var t = tacticById(y.v.base_id);
      if (t && y.v.diagram && !check(y.v.diagram, t).ok) bad.push(y.v.id);
    });
    if (bad.length && window.console) console.warn("要修正の戦術：" + bad.join(", "));
    return bad;
  }

  /* ---------- データ読み込み ---------- */
  function fetchJson(url) {
    return fetch(url, { cache: "no-store" }).then(function (r) {
      if (!r.ok) throw new Error(url + " : " + r.status);
      return r.json();
    });
  }
  Promise.all([fetchJson(FILES.source), fetchJson(FILES.diagrams)]).then(function (res) {
    return Promise.all([
      fetchJson(FILES.team).catch(function () { return { variants: [] }; }),
      fetchJson(FILES.library).catch(function () { return { patterns: [] }; }),
      fetchJson(FILES.teamTactics).catch(function () { return { tactics: {} }; }),
      fetchJson(FILES.models).catch(function () { return { tactics: [] }; }),
      fetchJson(FILES.defMap).catch(function () { return { tactics: {} }; })
    ]).then(function (r2) {
      return { source: res[0], diagrams: res[1], team: r2[0], library: r2[1], teamTactics: r2[2], models: r2[3], defMap: r2[4], from: "JSONファイル" };
    });
  }).catch(function (err) {
    // index.html をダブルクリックで開いた場合（file://）は bundle.js を使う
    var b = window.TB_BUNDLE;
    if (!b) throw err;
    return { source: b.source, diagrams: b.diagrams, team: b.team || { variants: [] }, library: b.library || { patterns: [] }, teamTactics: b.teamTactics || { tactics: {} }, models: b.models || { tactics: [] }, defMap: b.defMap || { tactics: {} }, from: "data/bundle.js（" + (b.built || "").slice(0, 16).replace("T", " ") + " 作成）" };
  }).then(function (data) {
    D = data;
    D.lib = TBValidate.libIndex(D.library);
    D.model = TBValidate.modelIndex(D.models);
    try { checkAll(); } catch (e) { /* チェック自体の失敗で起動を止めない */ }
    window.addEventListener("hashchange", route);
    route();
  }).catch(function (err) {
    app.innerHTML = '<div class="notice"><h2>データを読み込めませんでした</h2>' +
      '<p>ターミナルで <code>./run.sh</code> を実行して開いてください。</p><p class="muted small">' + esc(err.message) + '</p></div>';
  });
})();
