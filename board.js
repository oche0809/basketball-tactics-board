/*
 * 作戦盤（SVG）の描画とアニメーション
 * データ（diagrams.json の1戦術分）を受け取り、STEPごとの位置を計算して描く。
 * 戦術ごとの処理はここに書かない（データだけで動く）。
 */
(function () {
  "use strict";
  var NS = "http://www.w3.org/2000/svg";
  var COURT_W = 150;
  var PIDS = ["1", "2", "3", "4", "5"];
  var R = 5.2; // 選手の円の半径
  var TRAY_Y = 132;

  function el(tag, attrs, parent, text) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) if (attrs[k] !== undefined && attrs[k] !== null) e.setAttribute(k, attrs[k]);
    if (text !== undefined) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  }
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function ease(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
  function dist(a, b) { return Math.hypot(b[0] - a[0], b[1] - a[1]); }
  function lerp(a, b, u) { return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]; }

  function pointAt(pts, u) {
    if (pts.length === 1) return pts[0];
    var total = 0, i, segs = [];
    for (i = 1; i < pts.length; i++) { segs.push(dist(pts[i - 1], pts[i])); total += segs[i - 1]; }
    if (total === 0) return pts[pts.length - 1];
    var d = u * total;
    for (i = 0; i < segs.length; i++) {
      if (d <= segs[i] || i === segs.length - 1) return lerp(pts[i], pts[i + 1], segs[i] ? Math.min(1, d / segs[i]) : 1);
      d -= segs[i];
    }
    return pts[pts.length - 1];
  }

  // 線の端を r だけ縮める（矢印が選手の円に隠れないように）
  function trimEnd(pts, r) {
    var out = pts.slice(), n = out.length;
    if (n < 2) return out;
    var a = out[n - 2], b = out[n - 1], d = dist(a, b);
    if (d > r + 0.5) out[n - 1] = lerp(b, a, r / d);
    return out;
  }
  function trimStart(pts, r) { return trimEnd(pts.slice().reverse(), r).reverse(); }

  /* ---------- STEPごとの状態（位置・ボール保持者）を計算 ---------- */
  // 攻撃：コート上の選手（players）＋ スローイン担当（inbound の位置）。守備：defense.players
  function computeStates(d) {
    var ib = d.inbounder === null || d.inbounder === undefined ? null : String(d.inbounder);
    var pos0 = {};
    PIDS.forEach(function (p) {
      var v = ib === p ? d.inbound : (d.players || {})[p];
      pos0[p] = Array.isArray(v) ? v.slice() : null;
    });
    var def = window.TBValidate ? window.TBValidate.defenseOf(d) : null;
    var dpos0 = {};
    ((def && def.players) || []).forEach(function (x) { if (Array.isArray(x.pos)) dpos0[x.id] = x.pos.slice(); });
    var dsteps = {};
    dsteps = window.TBValidate ? window.TBValidate.groupDefSteps(def) : {}; // app_step ごと
    var V = window.TBValidate, mu0 = {};
    Object.keys((def && def.matchups) || {}).forEach(function (k) { mu0[k] = V.normO(def.matchups[k]); });
    var states = [{ pos: pos0, dpos: dpos0, mu: mu0, dmoves: [], holder: ib || d.ball, chain: [] }];
    (d.steps || []).forEach(function (s, i) {
      var base = states[s.reset_to !== undefined ? s.reset_to : i];
      var pos = {}, dpos = {}, mu = {};
      Object.keys(base.pos).forEach(function (k) { pos[k] = base.pos[k] ? base.pos[k].slice() : null; });
      Object.keys(base.dpos).forEach(function (k) { dpos[k] = base.dpos[k].slice(); });
      Object.keys(base.mu).forEach(function (k) { mu[k] = base.mu[k]; });
      (s.moves || []).forEach(function (m) { pos[m.p] = m.to.slice(); });
      // 守備：登録された動作だけを動かす（登録がなければ動かさない）
      var ds = dsteps[i + 1] || null, dmoves = [], switched = [], exchanged = [];
      ((ds && ds.moves) || []).forEach(function (m) {
        if (!dpos[m.id]) return;
        dmoves.push({ id: m.id, from: base.dpos[m.id], via: m.via || [], to: m.to.slice() });
        dpos[m.id] = m.to.slice();
      });
      ((ds && ds.actions) || []).forEach(function (a) {
        var id = a.defender, from = base.dpos[id];
        if (!from) return;
        var t = V.normO(a.target), to = null, via = [];
        var na = V.normAction(a), act = na.act;
        a = { action: a.action, method: na.method, screen_by: a.screen_by ? String(a.screen_by).split(",")[0].trim() : a.screen_by, to: a.to, exchange: a.exchange };
        if (act === "switch") {
          var partner = V.applySwitch(mu, id, t, a.exchange === true);
          switched.push(id);
          if (partner) exchanged.push({ id: partner, to: mu[partner] });
        }
        if (act === "switch_back") { mu[id] = mu0[id]; t = mu0[id]; }
        if (act === "matchup_recover") mu[id] = t;
        if (["follow", "closeout", "recover", "switch", "switch_back", "screen_avoid", "matchup_recover"].indexOf(act) >= 0) {
          t = t || mu[id];
          if (pos[t]) to = V.guardPos(pos[t]);
        }
        if (act === "screen_avoid" && a.method === "trail") { // ロック＆トレイル：相手の通った道を追う
          (s.moves || []).forEach(function (m) { if (m.p === t) via = (m.via || []).map(function (p) { return p.slice(); }); });
        } else if (act === "screen_avoid") {
          var sc = pos[V.normO(a.screen_by)];
          if (sc) {
            var bx = 75 - sc[0], by = 15.75 - sc[1], bl = Math.hypot(bx, by) || 1, sgn = a.method === "over" ? -6 : 6;
            via = a.method === "go_through" && pos[t] ? [[(sc[0] + pos[t][0]) / 2, (sc[1] + pos[t][1]) / 2]] : [[sc[0] + bx / bl * sgn, sc[1] + by / bl * sgn]];
          }
        }
        if (Array.isArray(a.to)) to = a.to.slice(); // 教師が位置を登録した場合はそれを使う
        if (to) { dmoves.push({ id: id, from: from, via: via, to: to }); dpos[id] = to; }
      });
      var holder = base.holder;
      (s.passes || []).forEach(function (ps) { holder = ps.to; });
      states.push({ pos: pos, dpos: dpos, mu: mu, dmoves: dmoves, dstep: ds, switched: switched, exchanged: exchanged, holder: holder, base: base, chain: base.chain.concat([i]) });
    });
    states.defense = def;
    states.inbounder = ib;
    return states;
  }

  /* ---------- コート ---------- */
  function drawCourt(g) {
    el("rect", { x: -22, y: -20, width: 194, height: 162, class: "ct-out" }, g);
    el("rect", { x: 0, y: 0, width: 150, height: 140, class: "ct-floor" }, g);
    el("rect", { x: 50.5, y: 0, width: 49, height: 58, class: "ct-paint" }, g);
    var L = "ct-line";
    el("rect", { x: 0, y: 0, width: 150, height: 140, class: L }, g);
    el("rect", { x: 50.5, y: 0, width: 49, height: 58, class: L }, g);
    el("path", { d: "M57 58 A18 18 0 0 0 93 58", class: L }, g);
    el("path", { d: "M57 58 A18 18 0 0 1 93 58", class: L + " ct-dash" }, g);
    el("path", { d: "M9 0 L9 29.9 A67.5 67.5 0 0 0 141 29.9 L141 0", class: L }, g);
    el("path", { d: "M62.5 12 L62.5 15.75 A12.5 12.5 0 0 0 87.5 15.75 L87.5 12", class: L + " ct-thin" }, g);
    el("path", { d: "M57 140 A18 18 0 0 1 93 140", class: L }, g);
    el("line", { x1: 66, y1: 12, x2: 84, y2: 12, class: "ct-board" }, g);
    el("circle", { cx: 75, cy: 15.75, r: 2.25, class: "ct-rim" }, g);
  }

  function markers(defs) {
    ["cut", "move", "pass", "option", "unc", "def"].forEach(function (k) {
      var m = el("marker", { id: "mk-" + k, viewBox: "0 0 10 10", refX: 8, refY: 5, markerWidth: 4.2, markerHeight: 4.2, orient: "auto", class: "mk mk-" + k }, defs);
      el("path", { d: "M0 0 L10 5 L0 10 z" }, m);
    });
  }

  function polyD(pts) {
    return pts.map(function (p, i) { return (i ? "L" : "M") + p[0].toFixed(2) + " " + p[1].toFixed(2); }).join(" ");
  }
  function zigzagD(pts) {
    var out = [pts[0]], step = 2.6, amp = 1.6, side = 1;
    for (var i = 1; i < pts.length; i++) {
      var a = pts[i - 1], b = pts[i], d = dist(a, b);
      if (d === 0) continue;
      var ux = (b[0] - a[0]) / d, uy = (b[1] - a[1]) / d;
      var stop = i === pts.length - 1 ? Math.max(0, d - 5) : d;
      for (var s = step; s < stop; s += step) {
        out.push([a[0] + ux * s - uy * amp * side, a[1] + uy * s + ux * amp * side]);
        side = -side;
      }
      out.push(b);
    }
    return polyD(out);
  }

  /* ---------- Board ---------- */
  function Board(svg) {
    this.svg = svg;
    svg.setAttribute("viewBox", "-22 -20 194 162");
    this.d = null;
    this.states = [];
    this.opts = { mirror: false, mode: "all", focus: null, positions: {} };
    this.onCoord = null;
    var self = this;
    svg.addEventListener("click", function (ev) {
      if (!self.onCoord) return;
      var pt = svg.createSVGPoint();
      pt.x = ev.clientX; pt.y = ev.clientY;
      var p = pt.matrixTransform(svg.getScreenCTM().inverse());
      var x = self.opts.mirror ? COURT_W - p.x : p.x;
      self.onCoord([Math.round(x), Math.round(p.y)]);
    });
  }

  Board.prototype.setData = function (d) { this.d = d; this.states = computeStates(d); };
  Board.prototype.setOptions = function (o) { for (var k in o) this.opts[k] = o[k]; };
  Board.prototype.stepCount = function () { return this.d ? this.d.steps.length : 0; };
  Board.prototype.stateAt = function (k) { return this.states[k]; };
  Board.prototype.trayIds = function () {
    var s0 = this.states[0];
    return PIDS.filter(function (p) { return !s0.pos[p]; });
  };
  Board.prototype.X = function (p) { return this.opts.mirror ? [COURT_W - p[0], p[1]] : [p[0], p[1]]; };

  // k = 表示するSTEP（0 = 初期配置）、t = そのSTEPのアニメーション進行（0〜1）
  Board.prototype.draw = function (k, t) {
    var svg = this.svg, self = this, d = this.d, o = this.opts;
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    markers(el("defs", {}, svg));
    var root = el("g", {}, svg);
    drawCourt(root);
    if (!d) return;

    var st = this.states[k];
    var step = k > 0 ? d.steps[k - 1] : null;
    var start = k > 0 ? st.base : st;
    t = step ? clamp01(t) : 1;

    // タイムライン：移動 → パス
    var moves = step ? step.moves || [] : [];
    var passes = step ? step.passes || [] : [];
    var moveEnd = moves.length && passes.length ? 0.55 : 1;
    var um = moves.length ? ease(clamp01(t / moveEnd)) : 1;
    var up = passes.length ? clamp01(moves.length ? (t - moveEnd) / (1 - moveEnd) : t) : 1;

    var pos = {}, paths = {};
    Object.keys(start.pos).forEach(function (p) { pos[p] = start.pos[p]; });
    moves.forEach(function (m) {
      var pts = [start.pos[m.p]].concat(m.via || []).concat([m.to]);
      paths[m.p] = pts;
      pos[m.p] = pointAt(pts, um);
    });

    // ボール
    var holder = start.holder, flight = null;
    for (var i = 0; i < passes.length; i++) {
      var seg = 1 / passes.length, u = clamp01((up - i * seg) / seg);
      if (u <= 0) break;
      if (u >= 1) { holder = passes[i].to; continue; }
      flight = lerp(pos[passes[i].from], pos[passes[i].to], ease(u));
      break;
    }

    function alphaMove(m) {
      if (o.mode === "me" && o.focus) return m.p === o.focus ? 1 : m["for"] === o.focus ? 0.75 : 0.2;
      if (o.mode === "ball") return m.type === "dribble" ? 1 : 0.25;
      return 1;
    }
    function alphaPass(from, to) {
      if (o.mode === "me" && o.focus) return from === o.focus || to === o.focus ? 1 : 0.25;
      return 1;
    }
    function alphaPlayer(p) {
      if (o.mode === "me" && o.focus) return p === o.focus ? 1 : 0.28;
      if (o.mode === "ball") return p === holder ? 1 : 0.4;
      return 1;
    }

    // 過去のSTEPの軌跡（薄く）
    var trail = el("g", { class: "trail" }, root);
    st.chain.slice(0, step ? -1 : undefined).forEach(function (si) {
      var s = d.steps[si], b = self.states[si + 1].base;
      (s.moves || []).forEach(function (m) {
        var pts = [b.pos[m.p]].concat(m.via || []).concat([m.to]).map(self.X, self);
        el("path", { d: m.type === "dribble" ? zigzagD(pts) : polyD(pts), class: "ln ln-trail" }, trail);
      });
    });

    // 今のSTEPの矢印
    var arrows = el("g", {}, root);
    moves.forEach(function (m) {
      var pts = paths[m.p].map(self.X, self);
      var cls = m.uncertain ? "unc" : m.type;
      var total = 0;
      for (var i = 1; i < pts.length; i++) total += dist(pts[i - 1], pts[i]);
      var g = el("g", { opacity: alphaMove(m) }, arrows);
      if (m.type === "screen") {
        // スクリーン：線の先に「T」の横棒
        var endP = pts[pts.length - 1], dir;
        if (total > 0.5) {
          var prev = pts[pts.length - 2];
          dir = [endP[0] - prev[0], endP[1] - prev[1]];
        } else {
          var f = self.X(start.pos[m["for"]]);
          dir = [f[0] - endP[0], f[1] - endP[1]];
        }
        var dl = Math.hypot(dir[0], dir[1]) || 1, ux = dir[0] / dl, uy = dir[1] / dl;
        var tip = [endP[0] + ux * (R + 1.4), endP[1] + uy * (R + 1.4)];
        if (total > 0.5) el("path", { d: polyD(pts.slice(0, -1).concat([tip])), class: "ln ln-screen" }, g);
        el("line", { x1: tip[0] - uy * 5.5, y1: tip[1] + ux * 5.5, x2: tip[0] + uy * 5.5, y2: tip[1] - ux * 5.5, class: "ln-screenbar" }, g);
      } else {
        var tp = trimEnd(pts, R + 0.8);
        el("path", { d: m.type === "dribble" ? zigzagD(tp) : polyD(tp), class: "ln ln-" + cls, "marker-end": "url(#mk-" + (m.uncertain ? "unc" : m.type === "move" ? "move" : "cut") + ")" }, g);
        if (m.uncertain) {
          var mid = pointAt(pts, 0.5);
          el("text", { x: mid[0] + 2.5, y: mid[1] - 2, class: "unc-q" }, g, "?");
        }
      }
    });

    // パス（ボールが動く）
    passes.forEach(function (ps) {
      var a = self.X(pos[ps.from]), b = self.X(pos[ps.to]);
      var g = el("g", { opacity: alphaPass(ps.from, ps.to) }, arrows);
      el("path", { d: polyD(trimStart(trimEnd([a, b], R + 0.8), R + 0.8)), class: "ln ln-pass", "marker-end": "url(#mk-pass)" }, g);
      if (ps.type === "handoff") {
        var mid = lerp(a, b, 0.5);
        el("text", { x: mid[0], y: mid[1] - 7, class: "opt-label" }, g, "ハンドオフ");
      }
    });

    // 選択肢（線だけ。ボールは動かない）
    ((step && step.options) || []).forEach(function (op) {
      if (!pos[op.from] || !pos[op.to]) return;
      var a = self.X(pos[op.from]), b = self.X(pos[op.to]);
      var g = el("g", { opacity: (t < 1 ? 0.3 : 1) * alphaPass(op.from, op.to) }, arrows);
      el("path", { d: polyD(trimStart(trimEnd([a, b], R + 0.8), R + 0.8)), class: "ln ln-option", "marker-end": "url(#mk-option)" }, g);
      if (op.label) {
        var mid = lerp(a, b, 0.5);
        el("text", { x: mid[0], y: mid[1] - 2.2, class: "opt-label" }, g, op.label);
      }
    });

    // 守備：defenseMode = "off" / "pos"（初期位置のまま）/ "move"（登録された動作だけ動く）
    var dm = o.defenseMode || "off";
    if (dm !== "off" && this.states.defense) {
      var s0 = this.states[0];
      var moveMode = dm === "move";
      var dFrom = moveMode ? start : s0, dEnd = moveMode ? st : s0;
      var dg = el("g", { class: "def" }, root);
      var dmoves = moveMode && step ? st.dmoves || [] : [];
      var dAlpha = function (id) {
        if (o.dfocus) return id === o.dfocus ? 1 : 0.3;
        return o.mode === "all" ? 1 : 0.55;
      };
      dmoves.forEach(function (m) {
        var pts = [m.from].concat(m.via || []).concat([m.to]).map(self.X, self);
        el("path", { d: polyD(trimEnd(pts, 4.6)), class: "ln ln-def", "marker-end": "url(#mk-def)", opacity: dAlpha(m.id) }, dg);
      });
      Object.keys(dEnd.dpos).forEach(function (id) {
        var mv = null;
        dmoves.forEach(function (m) { if (m.id === id) mv = m; });
        var dp = mv ? pointAt([mv.from].concat(mv.via || []).concat([mv.to]), um) : (step && moveMode ? dFrom.dpos[id] : dEnd.dpos[id]);
        var q = self.X(dp);
        var focus = o.dfocus === id;
        var gd = el("g", { opacity: dAlpha(id), class: focus ? "def-focus" : "" }, dg);
        if (focus) { // マッチアップ相手への点線
          var tgt = (moveMode ? st : s0).mu[id];
          if (tgt && pos[tgt]) { var tq = self.X(pos[tgt]); el("line", { x1: q[0], y1: q[1], x2: tq[0], y2: tq[1], class: "ln-matchup" }, gd); }
        }
        el("circle", { cx: q[0], cy: q[1], r: 4.3, class: "def-body" }, gd);
        el("text", { x: q[0], y: q[1] + 1.4, class: "def-num" }, gd, id);
      });
    }

    // 選手（攻撃）。位置が不明な選手はコート外の「位置要確認」欄（編集画面のプレビュー用）
    var screeners = {};
    moves.forEach(function (m) { if (m.type === "screen") screeners[m.p] = true; });
    var ib = this.states.inbounder;
    var tray = this.trayIds();
    if (tray.length) el("text", { x: 2, y: TRAY_Y - 8, class: "tray-label" }, root, "位置要確認（資料文に記載なし）");
    PIDS.forEach(function (p) {
      var inTray = tray.indexOf(p) >= 0;
      var pp = inTray ? [12 + tray.indexOf(p) * 16, TRAY_Y] : self.X(pos[p]);
      var focus = o.mode === "me" && o.focus === p;
      var cls = "pl" + (inTray ? " pl-unknown" : "") + (focus ? " pl-focus" : "") + (screeners[p] ? " pl-screener" : "");
      var g = el("g", { class: cls, opacity: inTray ? (focus || o.mode === "all" ? 0.95 : 0.4) : alphaPlayer(p) }, root);
      if (focus) el("circle", { cx: pp[0], cy: pp[1], r: R + 2.8, class: "pl-halo" }, g);
      el("circle", { cx: pp[0], cy: pp[1], r: R, class: "pl-body" }, g);
      el("text", { x: pp[0], y: pp[1] + 1.9, class: "pl-num" }, g, p);
      if (p === ib) { // スローイン担当の「I」
        el("circle", { cx: pp[0] - 4.6, cy: pp[1] - 4.6, r: 2.6, class: "ib-badge" }, g);
        el("text", { x: pp[0] - 4.6, y: pp[1] - 3.5, class: "ib-text" }, g, "I");
      }
      var label = o.positions && o.positions[p];
      if (label && !inTray) el("text", { x: pp[0], y: pp[1] + R + 4.4, class: "pl-pos" }, g, label);
    });

    // ボール
    var bp = null;
    if (flight) bp = self.X(flight);
    else if (holder && pos[holder]) { var h = self.X(pos[holder]); bp = [h[0] + 4.3, h[1] - 4.3]; }
    if (bp) el("circle", { cx: bp[0], cy: bp[1], r: o.mode === "ball" ? 3.3 : 2.6, class: "ball" + (o.mode === "ball" ? " ball-hi" : "") }, root);
  };

  window.TBBoard = { Board: Board, computeStates: computeStates, PIDS: PIDS };
})();
