/*
 * 画面の処理（戦術の中身は data/tactics.js にあります）
 */
(function () {
  "use strict";

  var TACTICS = window.TACTICS || [];
  var CATEGORIES = window.CATEGORIES || [];
  var SVG_NS = "http://www.w3.org/2000/svg";
  var CIRCLED = { "1": "①", "2": "②", "3": "③", "4": "④", "5": "⑤" };
  var BASKET = [75, 16];
  var R = 5.5;              // 選手の丸の半径
  var MOVE_MS = 1000;       // 移動アニメーションの時間
  var PASS_MS = 700;        // パスのアニメーションの時間
  var AUTO_WAIT_MS = 2500;  // 再生中、次のSTEPへ進むまでの待ち時間

  var app = document.getElementById("app");
  var teacherMode = loadTeacherMode();
  var detail = null; // 戦術詳細画面の状態

  /* ---------- 小さな道具 ---------- */
  function h(tag, attrs, children) {
    var el = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === "text") el.textContent = attrs[k];
        else if (k === "class") el.className = attrs[k];
        else if (k.indexOf("on") === 0) el.addEventListener(k.slice(2), attrs[k]);
        else el.setAttribute(k, attrs[k]);
      });
    }
    (children || []).forEach(function (c) {
      if (c == null) return;
      el.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return el;
  }
  function s(tag, attrs, parent) {
    var el = document.createElementNS(SVG_NS, tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === "text") el.textContent = attrs[k];
      else el.setAttribute(k, attrs[k]);
    });
    if (parent) parent.appendChild(el);
    return el;
  }
  function circled(id) { return CIRCLED[id] || id; }
  function stars(n) { return "★★★".slice(0, n) + "☆☆☆".slice(0, 3 - n); }
  function categoryOf(id) {
    return CATEGORIES.filter(function (c) { return c.id === id; })[0] || { id: id, name: id };
  }
  function sourceLabel(src) {
    var type = src && src.type;
    if (type === "jba") return { text: "JBA公式資料に基づく", cls: "badge-jba" };
    if (type === "book") return { text: "出典あり", cls: "badge-book" };
    return { text: "出典未確認・サンプル", cls: "badge-sample" };
  }
  function loadTeacherMode() {
    try { return localStorage.getItem("teacherMode") === "1"; } catch (e) { return false; }
  }
  function saveTeacherMode() {
    try { localStorage.setItem("teacherMode", teacherMode ? "1" : "0"); } catch (e) { /* 保存できなくても動作する */ }
  }

  /* ---------- 教師モード切替 ---------- */
  var teacherBtn = document.getElementById("teacherToggle");
  function updateTeacherBtn() {
    teacherBtn.textContent = "教師モード：" + (teacherMode ? "ON" : "OFF");
    teacherBtn.setAttribute("aria-pressed", teacherMode ? "true" : "false");
    document.body.classList.toggle("is-teacher", teacherMode);
  }
  teacherBtn.addEventListener("click", function () {
    teacherMode = !teacherMode;
    saveTeacherMode();
    updateTeacherBtn();
    route();
  });
  updateTeacherBtn();

  /* ---------- 画面切替（URLの # で管理） ---------- */
  function route() {
    stopPlay();
    cancelAnim();
    detail = null;
    var hash = location.hash.replace(/^#\/?/, "");
    var parts = hash.split("/");
    app.innerHTML = "";
    window.scrollTo(0, 0);
    if (parts[0] === "cat" && parts[1]) renderList(parts[1]);
    else if (parts[0] === "t" && parts[1]) renderDetail(decodeURIComponent(parts[1]));
    else renderHome();
  }
  window.addEventListener("hashchange", route);

  /* ---------- 1. ホーム ---------- */
  function renderHome() {
    document.title = "バスケットボール 作戦ボード";
    var grid = h("div", { class: "card-grid" });
    CATEGORIES.forEach(function (c) {
      var count = TACTICS.filter(function (t) { return t.category === c.id; }).length;
      grid.appendChild(h("a", { class: "card cat-card", href: "#/cat/" + c.id }, [
        h("span", { class: "cat-en", text: c.en || "" }),
        h("span", { class: "cat-name", text: c.name }),
        h("span", { class: "cat-desc", text: c.desc || "" }),
        h("span", { class: "cat-count", text: count + " 件の戦術" })
      ]));
    });
    app.appendChild(h("section", { class: "page" }, [
      h("h1", { class: "page-title", text: "バスケットボール 作戦ボード" }),
      h("h2", { class: "section-label", text: "攻撃" }),
      grid
    ]));
  }

  /* ---------- 2. 戦術一覧 ---------- */
  function renderList(catId) {
    var cat = categoryOf(catId);
    document.title = cat.name + "｜作戦ボード";
    var list = TACTICS.filter(function (t) { return t.category === catId; });
    var grid = h("div", { class: "card-grid" });
    list.forEach(function (t) {
      var src = sourceLabel(t.source);
      grid.appendChild(h("a", { class: "card tactic-card", href: "#/t/" + encodeURIComponent(t.id) }, [
        h("span", { class: "tactic-name", text: t.name }),
        h("span", { class: "tactic-meta" }, [
          h("span", { class: "stars", text: "難易度 " + stars(t.difficulty || 1) }),
          h("span", { class: "badge " + src.cls, text: src.text })
        ]),
        h("span", { class: "tactic-row" }, [h("b", { text: "狙い：" }), t.purpose || ""]),
        h("span", { class: "tactic-row" }, [h("b", { text: "得点方法：" }), t.scoring || ""])
      ]));
    });
    if (!list.length) {
      grid.appendChild(h("p", { class: "empty", text: "まだ戦術が登録されていません（data/tactics.js に追加できます）。" }));
    }
    app.appendChild(h("section", { class: "page" }, [
      h("a", { class: "back", href: "#/", text: "← カテゴリへ戻る" }),
      h("h1", { class: "page-title", text: cat.name }),
      grid
    ]));
  }

  /* ---------- 3. 戦術詳細 ---------- */
  function renderDetail(id) {
    var t = TACTICS.filter(function (x) { return x.id === id; })[0];
    if (!t) {
      app.appendChild(h("section", { class: "page" }, [
        h("a", { class: "back", href: "#/", text: "← ホームへ" }),
        h("p", { class: "empty", text: "戦術が見つかりません。" })
      ]));
      return;
    }
    document.title = t.name + "｜作戦ボード";
    detail = {
      t: t,
      states: buildStates(t),
      step: 0,
      me: null,
      view: "all",
      playing: false,
      timer: null,
      anim: null
    };

    var src = sourceLabel(t.source);
    var cat = categoryOf(t.category);

    // 上部
    var head = h("div", { class: "detail-head" }, [
      h("a", { class: "back", href: "#/cat/" + t.category, text: "← " + cat.name + "の一覧へ" }),
      h("h1", { class: "page-title", text: t.name }),
      h("p", { class: "purpose" }, [h("b", { text: "目的：" }), t.purpose || ""]),
      h("p", { class: "detail-badges" }, [
        h("span", { class: "stars", text: "難易度 " + stars(t.difficulty || 1) }),
        h("span", { class: "badge " + src.cls, text: src.text })
      ])
    ]);

    // 作戦盤
    var viewBar = h("div", { class: "view-bar", role: "group", "aria-label": "表示の切り替え" }, [
      h("button", { type: "button", "data-view": "all", text: "全体を見る", onclick: function () { setView("all"); } }),
      h("button", { type: "button", "data-view": "me", text: "自分の動きを見る", onclick: function () { setView("me"); } }),
      h("button", { type: "button", "data-view": "ball", text: "ボールを見る", onclick: function () { setView("ball"); } })
    ]);
    var svg = buildCourt();
    var coord = h("div", { class: "coord", text: "コートをクリックすると座標を表示" });
    var controls = h("div", { class: "controls" }, [
      h("button", { type: "button", id: "btnPlay", class: "btn-play", text: "▶ 再生", onclick: togglePlay }),
      h("button", { type: "button", text: "⏮ 最初", onclick: function () { stopPlay(); goTo(0, false); } }),
      h("button", { type: "button", text: "← 1つ戻る", onclick: function () { stopPlay(); goTo(detail.step - 1, false); } }),
      h("button", { type: "button", text: "1つ進む →", onclick: function () { stopPlay(); goTo(detail.step + 1, true); } }),
      h("button", { type: "button", text: "↻ リセット", onclick: resetAll })
    ]);
    var legend = h("div", { class: "legend" }, [
      h("span", { class: "lg lg-move", text: "移動" }),
      h("span", { class: "lg lg-pass", text: "パス" }),
      h("span", { class: "lg lg-screen", text: "スクリーン" }),
      h("span", { class: "lg lg-shot", text: "シュート" })
    ]);
    var boardMain = h("div", { class: "board-main" }, [viewBar, h("div", { class: "court-wrap" }, [svg]), coord, controls, legend]);

    var stepPanel = h("div", { class: "step-panel", id: "stepPanel" });
    var board = h("section", { class: "board" }, [boardMain, stepPanel]);

    // ポジション確認
    var posSection = h("section", { class: "panel", id: "posSection" }, [
      h("button", { type: "button", class: "btn-big", text: "自分のポジションを確認", onclick: function () {
        document.getElementById("posPicker").classList.toggle("open");
      } }),
      h("div", { class: "pos-picker", id: "posPicker" }, ["1", "2", "3", "4", "5"].map(function (pid) {
        return h("button", { type: "button", "data-pid": pid, text: circled(pid), "aria-label": pid + "番を選ぶ", onclick: function () { selectMe(pid); } });
      })),
      h("div", { id: "roleBox" })
    ]);

    app.appendChild(h("section", { class: "page detail" }, [
      head,
      board,
      posSection,
      teacherMode ? buildTeacherPanel(t) : null,
      buildQuiz(t),
      h("p", { class: "source-note" }, [
        h("b", { text: "出典：" }), (t.source && t.source.text) || "未記入",
        t.treatment ? h("br") : null,
        t.treatment || ""
      ])
    ]));

    // 教師モード：クリックで座標表示
    if (teacherMode) {
      coord.classList.add("show");
      svg.addEventListener("click", function (e) {
        var pt = svg.createSVGPoint();
        pt.x = e.clientX; pt.y = e.clientY;
        var p = pt.matrixTransform(svg.getScreenCTM().inverse());
        coord.textContent = "座標：[" + Math.round(p.x) + ", " + Math.round(p.y) + "]（data/tactics.js に入力できます）";
      });
    }

    createEntities();
    goTo(0, false);
  }

  /* ---------- 各STEP後の位置を計算 ---------- */
  function buildStates(t) {
    var pos = {};
    Object.keys(t.players || {}).forEach(function (k) { pos[k] = t.players[k].slice(); });
    Object.keys(t.defense || {}).forEach(function (k) { pos[k] = t.defense[k].slice(); });
    var states = [{ pos: clonePos(pos), ball: t.ball }];
    var ball = t.ball;
    (t.steps || []).forEach(function (st) {
      if (st.pass) ball = st.pass.to;
      (st.moves || []).forEach(function (m) {
        var pts = movePoints(m);
        if (pos[m.id] && pts.length) pos[m.id] = pts[pts.length - 1].slice();
      });
      states.push({ pos: clonePos(pos), ball: ball });
    });
    return states;
  }
  function clonePos(pos) {
    var o = {};
    Object.keys(pos).forEach(function (k) { o[k] = pos[k].slice(); });
    return o;
  }
  function movePoints(m) { return m.path ? m.path : (m.to ? [m.to] : []); }

  /* ---------- コートを描く ---------- */
  function buildCourt() {
    var svg = s("svg", { viewBox: "-16 -16 182 136", class: "court", role: "img", "aria-label": "バスケットボールのハーフコート" });
    var defs = s("defs", {}, svg);
    [["arMove", "#1d4ed8"], ["arPass", "#b45309"], ["arMine", "#ea580c"], ["arShot", "#dc2626"]].forEach(function (a) {
      var mk = s("marker", { id: a[0], viewBox: "0 0 10 10", refX: "8", refY: "5", markerWidth: "4", markerHeight: "4", orient: "auto-start-reverse" }, defs);
      s("path", { d: "M0,0 L10,5 L0,10 z", fill: a[1] }, mk);
    });

    s("rect", { x: -16, y: -16, width: 182, height: 136, class: "floor-out" }, svg);
    var g = s("g", { class: "lines" }, svg);
    s("rect", { x: 0, y: 0, width: 150, height: 130, class: "floor" }, g);
    s("rect", { x: 50.5, y: 0, width: 49, height: 58, class: "paint" }, g);
    s("path", { d: "M57,58 A18,18 0 0,0 93,58", class: "line" }, g);
    s("path", { d: "M57,58 A18,18 0 0,1 93,58", class: "line dashed" }, g);
    s("path", { d: "M9,0 L9,30 A67.5,67.5 0 0,0 141,30 L141,0", class: "line" }, g);
    s("path", { d: "M62.5,16 A12.5,12.5 0 0,0 87.5,16", class: "line" }, g);
    s("line", { x1: 66, y1: 12, x2: 84, y2: 12, class: "line board-line" }, g);
    s("circle", { cx: BASKET[0], cy: BASKET[1], r: 2.3, class: "rim" }, g);
    s("text", { x: 75, y: -9, class: "court-label", text: "エンドライン" }, g);

    s("g", { id: "gRoute" }, svg);
    s("g", { id: "gArrows" }, svg);
    s("g", { id: "gMarks" }, svg);
    s("g", { id: "gPlayers" }, svg);
    s("circle", { id: "ball", r: 2.4, class: "ball" }, svg);
    return svg;
  }

  function createEntities() {
    var gp = document.getElementById("gPlayers");
    var pos = detail.states[0].pos;
    Object.keys(pos).forEach(function (id) {
      var isDef = id.charAt(0) === "x";
      var g = s("g", { class: "player" + (isDef ? " defense" : ""), "data-id": id }, gp);
      s("circle", { r: R }, g);
      s("text", { y: 0.5, text: isDef ? "×" : id }, g);
      g.addEventListener("click", function () { if (!isDef) selectMe(id); });
    });
  }

  /* ---------- 表示を更新 ---------- */
  function placeAll(pos, ballHolder) {
    Object.keys(pos).forEach(function (id) { placePlayer(id, pos[id]); });
    if (ballHolder && pos[ballHolder]) placeBall(pos[ballHolder]);
  }
  function placePlayer(id, p) {
    var g = document.querySelector('#gPlayers [data-id="' + id + '"]');
    if (g) g.setAttribute("transform", "translate(" + p[0].toFixed(2) + "," + p[1].toFixed(2) + ")");
  }
  function placeBall(p) {
    var b = document.getElementById("ball");
    b.setAttribute("cx", (p[0] + 4.2).toFixed(2));
    b.setAttribute("cy", (p[1] - 4.2).toFixed(2));
  }

  function goTo(n, animate) {
    if (!detail) return;
    var max = detail.states.length - 1;
    n = Math.max(0, Math.min(max, n));
    cancelAnim();
    var prev = detail.step;
    detail.step = n;
    drawArrows(n);
    renderStepPanel();
    if (animate && n === prev + 1) {
      animateStep(n);
    } else {
      placeAll(detail.states[n].pos, detail.states[n].ball);
      drawMarks(n);
    }
  }

  function cancelAnim() {
    if (detail && detail.anim) { cancelAnimationFrame(detail.anim); detail.anim = null; }
  }

  function ease(x) { return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2; }

  // STEP n の動き：パス → 移動 の順で動かす
  function animateStep(n) {
    var st = detail.t.steps[n - 1];
    var from = detail.states[n - 1];
    var to = detail.states[n];
    var passMs = st.pass ? PASS_MS : 0;
    var moveMs = (st.moves && st.moves.length) ? MOVE_MS : 0;
    var routes = {};
    (st.moves || []).forEach(function (m) {
      routes[m.id] = [from.pos[m.id]].concat(movePoints(m));
    });
    placeAll(from.pos, from.ball);
    clearMarks();
    applyFocus();
    var start = null;
    function frame(ts) {
      if (!detail) return;
      if (start === null) start = ts;
      var e = ts - start;
      // パス
      if (st.pass) {
        var pp = Math.min(1, e / PASS_MS);
        var a = from.pos[st.pass.from], b = from.pos[st.pass.to];
        placeBall([a[0] + (b[0] - a[0]) * ease(pp), a[1] + (b[1] - a[1]) * ease(pp)]);
      }
      // 移動
      if (moveMs && e >= passMs) {
        var mp = ease(Math.min(1, (e - passMs) / moveMs));
        Object.keys(routes).forEach(function (id) {
          var p = pointOnRoute(routes[id], mp);
          placePlayer(id, p);
          if (to.ball === id) placeBall(p);
        });
      }
      if (e < passMs + moveMs) {
        detail.anim = requestAnimationFrame(frame);
      } else {
        detail.anim = null;
        placeAll(to.pos, to.ball);
        drawMarks(n);
        if (detail.playing) scheduleNext();
      }
    }
    detail.anim = requestAnimationFrame(frame);
  }

  function pointOnRoute(pts, t) {
    var lens = [], total = 0;
    for (var i = 1; i < pts.length; i++) {
      var d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      lens.push(d); total += d;
    }
    if (!total) return pts[pts.length - 1];
    var target = total * t;
    for (var j = 0; j < lens.length; j++) {
      if (target <= lens[j] || j === lens.length - 1) {
        var r = lens[j] ? Math.min(1, target / lens[j]) : 1;
        var p0 = pts[j], p1 = pts[j + 1];
        return [p0[0] + (p1[0] - p0[0]) * r, p0[1] + (p1[1] - p0[1]) * r];
      }
      target -= lens[j];
    }
    return pts[pts.length - 1];
  }

  /* ---------- 矢印（そのSTEPの動き） ---------- */
  function drawArrows(n) {
    var ga = document.getElementById("gArrows");
    var gr = document.getElementById("gRoute");
    ga.innerHTML = "";
    gr.innerHTML = "";
    var me = detail.me;
    var view = detail.view;

    // 「自分の動きを見る」：自分の全体の道のりをうすく表示
    if (view === "me" && me) {
      detail.t.steps.forEach(function (st, i) {
        (st.moves || []).forEach(function (m) {
          if (m.id !== me) return;
          var pts = [detail.states[i].pos[m.id]].concat(movePoints(m));
          s("polyline", { points: pts.map(function (p) { return p.join(","); }).join(" "), class: "route-ghost" }, gr);
        });
      });
    }

    if (n === 0) return;
    var st = detail.t.steps[n - 1];
    var from = detail.states[n - 1];

    if (st.pass) {
      var a = from.pos[st.pass.from], b = from.pos[st.pass.to];
      var involved = me && (st.pass.from === me || st.pass.to === me);
      var cls = "arrow-pass" + (view === "ball" ? " strong" : "") + (view === "me" && me && !involved ? " dim" : "");
      var seg = shorten(a, b, R + 1, R + 1.5);
      s("line", { x1: seg[0][0], y1: seg[0][1], x2: seg[1][0], y2: seg[1][1], class: cls, "marker-end": "url(#arPass)" }, ga);
    }

    (st.moves || []).forEach(function (m) {
      var pts = [from.pos[m.id]].concat(movePoints(m));
      if (pts.length < 2) return;
      var mine = me && m.id === me;
      var cls = "arrow-move" + (m.type === "cut" ? " cut" : "") + (m.type === "screen" ? " screen" : "");
      if (view === "me" && me) cls += mine ? " mine" : " dim";
      if (view === "ball") cls += " dim";
      var last = pts[pts.length - 1];
      var prev = pts[pts.length - 2];
      var drawPts = pts.slice(0, -1);
      drawPts.push(shorten(prev, last, 0, m.type === "screen" ? R + 0.5 : R + 1.5)[1]);
      var attrs = { points: drawPts.map(function (p) { return p[0].toFixed(1) + "," + p[1].toFixed(1); }).join(" "), class: cls };
      if (m.type !== "screen") attrs["marker-end"] = mine && view === "me" ? "url(#arMine)" : "url(#arMove)";
      s("polyline", attrs, ga);
    });
  }

  // a→b の線を両端で少し短くする（丸と重ならないように）
  function shorten(a, b, startCut, endCut) {
    var dx = b[0] - a[0], dy = b[1] - a[1];
    var len = Math.hypot(dx, dy) || 1;
    var ux = dx / len, uy = dy / len;
    return [[a[0] + ux * startCut, a[1] + uy * startCut], [b[0] - ux * endCut, b[1] - uy * endCut]];
  }

  /* ---------- スクリーン記号・シュート表示（動きが終わった後） ---------- */
  function clearMarks() { document.getElementById("gMarks").innerHTML = ""; }
  function drawMarks(n) {
    clearMarks();
    applyFocus();
    if (n === 0) return;
    var gm = document.getElementById("gMarks");
    var st = detail.t.steps[n - 1];
    var from = detail.states[n - 1];
    var to = detail.states[n];
    var me = detail.me, view = detail.view;

    // このSTEPのスクリーン＋前のSTEPのスクリーン（このSTEPで使われるもの）
    var screens = (st.moves || []).filter(function (m) { return m.type === "screen"; }).map(function (m) { return { m: m, base: from }; });
    if (n >= 2) {
      var movers = (st.moves || []).map(function (m) { return m.id; });
      (detail.t.steps[n - 2].moves || []).forEach(function (m) {
        if (m.type === "screen" && movers.indexOf(m["for"]) >= 0 && movers.indexOf(m.id) < 0) {
          screens.push({ m: m, base: detail.states[n - 2] });
        }
      });
    }
    screens.forEach(function (sc) {
      var m = sc.m;
      var pts = [sc.base.pos[m.id]].concat(movePoints(m));
      var last = pts[pts.length - 1], prev = pts[pts.length - 2];
      var dx = last[0] - prev[0], dy = last[1] - prev[1];
      var len = Math.hypot(dx, dy) || 1;
      var ux = dx / len, uy = dy / len;
      var cx = last[0] - ux * (R + 0.5), cy = last[1] - uy * (R + 0.5);
      var dim = (view === "me" && me && m.id !== me && m["for"] !== me) || view === "ball";
      var g = s("g", { class: "screen-mark" + (dim ? " dim" : "") }, gm);
      s("line", { x1: cx - uy * 5, y1: cy + ux * 5, x2: cx + uy * 5, y2: cy - ux * 5 }, g);
      var label = "スクリーン" + (m["for"] ? "（" + circled(m["for"]) + "のため）" : "");
      s("text", { x: last[0], y: last[1] - R - 3, text: label }, g);
    });

    if (st.shot && to.pos[st.shot]) {
      var p = to.pos[st.shot];
      var dimShot = view === "me" && me && st.shot !== me;
      var gs = s("g", { class: "shot-mark" + (dimShot ? " dim" : "") }, gm);
      var seg = shorten(p, BASKET, R + 1, 2.5);
      s("line", { x1: seg[0][0], y1: seg[0][1], x2: seg[1][0], y2: seg[1][1], "marker-end": "url(#arShot)" }, gs);
      s("circle", { cx: p[0], cy: p[1], r: R + 2.5 }, gs);
      s("text", { x: p[0], y: p[1] + R + 7, text: "シュート！" }, gs);
    }
  }

  /* ---------- 表示モード（全体／自分／ボール） ---------- */
  function setView(v) {
    if (v === "me" && !detail.me) {
      document.getElementById("posPicker").classList.add("open");
      document.getElementById("posSection").scrollIntoView({ behavior: "smooth", block: "center" });
      var box = document.getElementById("roleBox");
      box.innerHTML = "";
      box.appendChild(h("p", { class: "hint", text: "まず①〜⑤から自分のポジションを選んでください。" }));
      return;
    }
    detail.view = v;
    drawArrows(detail.step);
    if (detail.anim) applyFocus(); else drawMarks(detail.step);
    renderStepPanel();
  }

  function applyFocus() {
    var me = detail.me, view = detail.view;
    var holder = detail.states[detail.step].ball;
    document.querySelectorAll(".view-bar button").forEach(function (b) {
      b.classList.toggle("active", b.getAttribute("data-view") === view);
    });
    document.querySelectorAll("#gPlayers .player").forEach(function (g) {
      var id = g.getAttribute("data-id");
      var isMe = me && id === me;
      g.classList.toggle("me", !!isMe);
      var dim = (view === "me" && me && !isMe) || (view === "ball" && id !== holder);
      g.classList.toggle("dim", !!dim);
    });
    document.getElementById("ball").classList.toggle("strong", view === "ball");
  }

  /* ---------- ポジション選択 ---------- */
  function selectMe(pid) {
    if (!detail) return;
    detail.me = pid;
    document.querySelectorAll("#posPicker button").forEach(function (b) {
      b.classList.toggle("active", b.getAttribute("data-pid") === pid);
    });
    document.getElementById("posPicker").classList.add("open");
    var roles = (detail.t.roles && detail.t.roles[pid]) || ["（役割のデータが未入力です）"];
    var box = document.getElementById("roleBox");
    box.innerHTML = "";
    box.appendChild(h("p", { class: "you-are", text: "あなたは" + circled(pid) + "です" }));
    box.appendChild(h("h3", { text: "【" + circled(pid) + "の役割】" }));
    box.appendChild(h("ol", { class: "role-list" }, roles.map(function (r) { return h("li", { text: r }); })));
    setView("me");
  }

  /* ---------- STEPの説明パネル ---------- */
  function renderStepPanel() {
    var panel = document.getElementById("stepPanel");
    if (!panel) return;
    var t = detail.t, n = detail.step, total = t.steps.length;
    panel.innerHTML = "";
    var dots = h("div", { class: "step-dots" });
    for (var i = 0; i <= total; i++) {
      (function (k) {
        dots.appendChild(h("button", {
          type: "button",
          class: "dot" + (k === n ? " active" : "") + (k < n ? " done" : ""),
          text: k === 0 ? "開始" : String(k),
          "aria-label": k === 0 ? "最初の配置" : "STEP " + k,
          onclick: function () { stopPlay(); goTo(k, k === detail.step + 1); }
        }));
      })(i);
    }
    panel.appendChild(dots);

    if (n === 0) {
      panel.appendChild(h("div", { class: "step-no", text: "最初の配置" }));
      panel.appendChild(h("p", { class: "step-action", text: "全員の位置を確認しよう" }));
      panel.appendChild(h("div", { class: "info-box teacher-say" }, [
        h("h3", { text: "【先生の説明】" }),
        h("p", { text: "「まず、自分がどこに立つかを確認します。ボールを持っているのは" + circled(t.ball) + "です。」" })
      ]));
      panel.appendChild(h("div", { class: "info-box point" }, [
        h("h3", { text: "【シュートを狙う場所】" }),
        h("p", { text: t.shotSpot || "—" })
      ]));
      return;
    }
    var st = t.steps[n - 1];
    panel.appendChild(h("div", { class: "step-no", text: "STEP " + n + " / " + total }));
    panel.appendChild(h("p", { class: "step-action", text: st.action || "" }));
    if (st.teacher) {
      panel.appendChild(h("div", { class: "info-box teacher-say" }, [h("h3", { text: "【先生の説明】" }), h("p", { text: "「" + st.teacher + "」" })]));
    }
    if (st.point) {
      panel.appendChild(h("div", { class: "info-box point" }, [h("h3", { text: "【ポイント】" }), h("p", { text: st.point })]));
    }
    if (detail.view === "me" && detail.me) {
      panel.appendChild(h("div", { class: "info-box mine-box" }, [
        h("h3", { text: "【" + circled(detail.me) + "はこのSTEPで】" }),
        h("p", { text: myActionText(n, detail.me) })
      ]));
    }
  }

  function myActionText(n, me) {
    var st = detail.t.steps[n - 1];
    var before = n >= 2 ? (detail.t.steps[n - 2].moves || []) : [];
    var list = [];
    (st.moves || []).forEach(function (m) {
      if (m.id === me) {
        // 前のSTEPで自分のためにかけられたスクリーンを使う場合
        var sc = before.filter(function (b) { return b.type === "screen" && b["for"] === me; })[0];
        if (m.type === "screen") list.push(m["for"] ? circled(m["for"]) + "のためにスクリーンをかける" : "スクリーンをかける");
        else list.push((sc ? circled(sc.id) + "のスクリーンを使って" : "") + (m.type === "cut" ? "カットする" : "移動する"));
      }
      if (m["for"] === me) list.push(circled(m.id) + "のスクリーンを使う");
    });
    if (st.pass && st.pass.from === me) list.push(circled(st.pass.to) + "へパスを出す");
    if (st.pass && st.pass.to === me) list.push(circled(st.pass.from) + "からパスを受ける");
    if (st.shot === me) list.push("シュートを打つ");
    return list.length ? list.join("／") : "その場で待つ（周りの動きを見る）";
  }

  /* ---------- 再生 ---------- */
  function togglePlay() {
    if (detail.playing) { stopPlay(); return; }
    detail.playing = true;
    updatePlayBtn();
    if (detail.step >= detail.states.length - 1) {
      goTo(0, false);
      scheduleNext();
    } else {
      goTo(detail.step + 1, true);
    }
  }
  function scheduleNext() {
    clearTimeout(detail.timer);
    detail.timer = setTimeout(function () {
      if (!detail || !detail.playing) return;
      if (detail.step >= detail.states.length - 1) { stopPlay(); return; }
      goTo(detail.step + 1, true);
    }, detail.step === 0 ? 800 : AUTO_WAIT_MS);
  }
  function stopPlay() {
    if (!detail) return;
    detail.playing = false;
    clearTimeout(detail.timer);
    updatePlayBtn();
  }
  function updatePlayBtn() {
    var b = document.getElementById("btnPlay");
    if (b) b.textContent = detail && detail.playing ? "⏸ 一時停止" : "▶ 再生";
  }
  function resetAll() {
    stopPlay();
    detail.me = null;
    detail.view = "all";
    document.getElementById("roleBox").innerHTML = "";
    document.querySelectorAll("#posPicker button").forEach(function (b) { b.classList.remove("active"); });
    document.getElementById("posPicker").classList.remove("open");
    goTo(0, false);
  }

  // キーボード操作（← → スペース）
  document.addEventListener("keydown", function (e) {
    if (!detail) return;
    if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    if (e.key === "ArrowRight") { stopPlay(); goTo(detail.step + 1, true); e.preventDefault(); }
    else if (e.key === "ArrowLeft") { stopPlay(); goTo(detail.step - 1, false); e.preventDefault(); }
    else if (e.key === " " && e.target === document.body) { togglePlay(); e.preventDefault(); }
  });

  /* ---------- 教師用パネル ---------- */
  function buildTeacherPanel(t) {
    var notes = t.teacherNotes || {};
    var roleRows = ["1", "2", "3", "4", "5"].map(function (pid) {
      return h("tr", {}, [h("th", { text: circled(pid) }), h("td", { text: ((t.roles || {})[pid] || ["未入力"]).join(" → ") })]);
    });
    var stepItems = (t.steps || []).map(function (st, i) {
      return h("li", {}, [
        h("b", { text: "STEP " + (i + 1) + "：" + (st.action || "") }),
        h("div", { class: "small", text: "先生の説明：" + (st.teacher || "—") }),
        h("div", { class: "small", text: "ポイント：" + (st.point || "—") })
      ]);
    });
    var src = sourceLabel(t.source);
    return h("section", { class: "panel teacher-panel" }, [
      h("h2", { text: "教師用メモ" }),
      h("dl", { class: "t-dl" }, [
        h("dt", { text: "戦術の目的" }), h("dd", { text: t.purpose || "—" }),
        h("dt", { text: "この教材での扱い" }), h("dd", { text: t.treatment || "—" }),
        h("dt", { text: "対象年代" }), h("dd", { text: t.target || "—" }),
        h("dt", { text: "主な得点方法" }), h("dd", { text: (t.scoring || "—") + "（" + (t.shotSpot || "—") + "）" }),
        h("dt", { text: "出典" }), h("dd", {}, [h("span", { class: "badge " + src.cls, text: src.text }), " ", (t.source && t.source.text) || ""])
      ]),
      h("h3", { text: "各選手の役割" }),
      h("table", { class: "role-table" }, [h("tbody", {}, roleRows)]),
      h("h3", { text: "STEPごとの説明" }),
      h("ol", { class: "t-steps" }, stepItems),
      h("h3", { text: "指導上のポイント" }),
      h("ul", {}, (notes.points || ["未入力"]).map(function (x) { return h("li", { text: x }); })),
      h("h3", { text: "よくあるミス" }),
      h("ul", {}, (notes.mistakes || ["未入力"]).map(function (x) { return h("li", { text: x }); }))
    ]);
  }

  /* ---------- クイズ ---------- */
  function buildQuiz(t) {
    var qs = t.quiz || [];
    var sec = h("section", { class: "panel quiz" }, [h("h2", { text: "確認クイズ" })]);
    if (!qs.length) { sec.appendChild(h("p", { class: "empty", text: "クイズは未入力です。" })); return sec; }
    qs.forEach(function (q, qi) {
      var result = h("div", { class: "quiz-result", "aria-live": "polite" });
      var btns = h("div", { class: "quiz-choices" });
      q.choices.forEach(function (c, ci) {
        btns.appendChild(h("button", {
          type: "button",
          text: "ABCD".charAt(ci) + "　" + c,
          onclick: function (e) {
            btns.querySelectorAll("button").forEach(function (b) { b.classList.remove("correct", "wrong"); });
            var ok = ci === q.answer;
            e.currentTarget.classList.add(ok ? "correct" : "wrong");
            result.innerHTML = "";
            result.className = "quiz-result " + (ok ? "ok" : "ng");
            result.appendChild(h("b", { text: ok ? "⭕ 正解！" : "❌ 不正解… 正解は " + "ABCD".charAt(q.answer) + "「" + q.choices[q.answer] + "」" }));
            result.appendChild(h("p", { text: q.explain || "" }));
          }
        }));
      });
      sec.appendChild(h("div", { class: "quiz-item" }, [h("p", { class: "quiz-q", text: "Q" + (qi + 1) + ". " + q.q }), btns, result]));
    });
    return sec;
  }

  route();
})();
