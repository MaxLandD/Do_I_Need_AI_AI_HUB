/* HOME-07 "Do I need AI for this?" - deterministic animation.
 * window.render(t) draws the frame at video time t (seconds).
 * Every cue is derived from the aligned voice-over (timing.js), so pictures
 * follow the voice: each card lands on the words that name its tool.
 */
(function () {
  "use strict";
  const T = window.TIMING, IC = window.ICONS;
  const $ = (id) => document.getElementById(id);
  const qs = new URLSearchParams(location.search);
  const NOCAP = qs.has("nocap");

  // ---------- maths ----------
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const P = (t, t0, d) => clamp((t - t0) / d);
  const lerp = (a, b, p) => a + (b - a) * p;
  const E = {
    outCubic: (p) => 1 - Math.pow(1 - p, 3),
    outQuart: (p) => 1 - Math.pow(1 - p, 4),
    inCubic: (p) => p * p * p,
    inOutCubic: (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2),
    inOutSine: (p) => -(Math.cos(Math.PI * p) - 1) / 2,
    outBack: (p, s = 1.70158) => 1 + (s + 1) * Math.pow(p - 1, 3) + s * Math.pow(p - 1, 2),
  };
  const bump = (p) => (p <= 0 || p >= 1 ? 0 : Math.sin(Math.PI * p));
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const mix = (a, b, p) => a.map((v, i) => v + (b[i] - v) * p);
  const rgb = (c, a) => (a === undefined ? `rgb(${c.map(Math.round).join(",")})` : `rgba(${c.map(Math.round).join(",")},${a})`);
  const COL = {
    dark: hex("#0C4A54"), teal: hex("#12707E"), mid: hex("#3E8893"), tint: hex("#EAF3F4"), white: hex("#FFFFFF"),
    idleBorder: hex("#D6DEE0"), soft: hex("#8FC3CA"), doneBg: hex("#F4FAFA"), doneCirc: hex("#CFE6E9"),
    actCirc: hex("#388792"),
  };

  // ---------- icons ----------
  const icon = (name) => { const i = IC[name]; return `<svg class="icon" viewBox="${i.vb}"><path d="${i.d}"/></svg>`; };
  const SPARKLE = '<svg class="icon" viewBox="0 0 24 24"><path d="M9.5 1.5C10.2 6.6 12.4 8.8 17.5 9.5C12.4 10.2 10.2 12.4 9.5 17.5C8.8 12.4 6.6 10.2 1.5 9.5C6.6 8.8 8.8 6.6 9.5 1.5Z M18.5 14.2C18.8 16.6 19.9 17.7 22.3 18C19.9 18.3 18.8 19.4 18.5 21.8C18.2 19.4 17.1 18.3 14.7 18C17.1 17.7 18.2 16.6 18.5 14.2Z"/></svg>';
  const ico = (name) => (name === "sparkle" ? SPARKLE : icon(name));

  // ---------- cues from the voice ----------
  function w(line, word, occ = 0, which = "start") {
    let n = 0;
    for (const x of T.words) if (x.line === line - 1 && x.w === word) { if (n === occ) return x[which]; n++; }
    throw new Error(`missing cue ${line}:${word}`);
  }
  const lineEnd = (l) => { const ws = T.words.filter((x) => x.line === l - 1); return ws[ws.length - 1].end; };

  const TRAVEL = [0.6, 0.6, 0.6, 0.78, 0.6];
  const C = {};
  C.introOut = lineEnd(2) + 0.05;
  C.darkOut = C.introOut + 0.22;
  C.panelIn = C.introOut + 0.50;
  C.rows = [0, 1, 2, 3, 4].map((i) => w(3, "five") - 0.10 + i * 0.17);
  C.side1 = w(4, "and");
  C.side2 = C.side1 + 0.28;
  C.shimmer = w(4, "every");
  C.click = w(4, "use") + 0.14;
  C.cursorFrom = C.click - 0.78;
  C.lift = lineEnd(4) + 0.08;
  C.slotsIn = C.lift + 0.55;
  C.land = [
    w(6, "calculator") + 0.50,
    w(8, "guideline") + 0.05,
    w(9, "just") + 0.45,
    w(11, "you") + 0.16,
    w(14, "ai") + 0.02,
  ];
  C.depart = C.land.map((l, i) => l - TRAVEL[i]);
  C.swap = [lineEnd(6) + 0.10, lineEnd(8) + 0.06, lineEnd(10) + 0.12, lineEnd(12) + 0.08];
  C.typeStart = C.swap[1] + 0.34;
  C.youCheck = w(15, "you");
  C.away = lineEnd(15) + 0.05;
  C.kicker = w(16, "before") - 0.12;
  C.title = C.kicker + 0.45;
  C.chips = [w(17, "a"), w(17, "already"), w(18, "does"), w(18, "quicker")].map((x) => x - 0.06);
  C.closing = w(19, "four") - 0.02;
  C.twinkle = w(19, "then");
  C.outro = lineEnd(19) - 0.04;          // 18-frame fade through dark teal starts here
  C.outroIn = C.outro + 0.30;
  C.pauseAsk = w(20, "pause") - 0.06;
  C.hub = w(21, "you") - 0.06;
  C.logo = C.hub + 0.62;
  C.finalChord = w(21, "msf") + 0.32;   // the music resolves under "MSF AI Hub"
  C.end = T.duration;
  window.CUES = C;

  // ---------- content ----------
  const TASKS = [
    { txt: "Add up three invoices", icon: "file-invoice" },
    { txt: "Check the cold chain procedure", icon: "snowflake" },
    { txt: "Reply ‘Yes, see you at 3’", icon: "reply", typed: "Yes, see you at 3" },
    { txt: "Write a colleague's evaluation", icon: "clipboard-list" },
    { txt: "Summarise a 40-page report", icon: "file-lines", stack: true },
  ];
  const SLOTS = [
    { lbl: "Calculator", icon: "calculator" },
    { lbl: "MSF guideline", icon: "book-medical" },
    { lbl: "Just type it", icon: "keyboard" },
    { lbl: "You", icon: "user" },
    { lbl: "AI", icon: "sparkle", ai: true },
  ];
  const SLOT_X = [148, 480, 812, 1144, 1476];
  const SLOT_W = 298, SLOT_H = 228, SLOT_Y = 601;
  const CHIPS = [
    { txt: "A simpler tool?", icon: "screwdriver-wrench" },
    { txt: "Already written down?", icon: "book-open" },
    { txt: "Does it need me?", icon: "user-check" },
    { txt: "Quicker to do it myself?", icon: "bolt" },
  ];

  const el = {};
  function make(tag, cls, parent, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    if (parent) parent.appendChild(e);
    return e;
  }

  // deterministic PRNG for the background motif
  function rng(seed) {
    return function () {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function build() {
    // background motif: the speed lines of the Accelerator logo, drifting slowly
    const R = rng(11);
    el.bars = [];
    for (let i = 0; i < 24; i++) {
      const b = make("div", "bar", $("motif"));
      const len = 140 + R() * 360, th = 12 + Math.round(R() * 12);
      b.style.width = len + "px";
      b.style.height = th + "px";
      b.style.borderRadius = th / 2 + "px";
      el.bars.push({ e: b, s0: R() * 3400, o0: R() * 2600 - 700, sp: 16 + R() * 22, op: 0.12 + R() * 0.18 });
    }

    // intro title words
    $("introTitle").innerHTML = "Do I need AI for this?".split(" ").map((x) => `<span class="will">${x}</span>`).join(" ");
    el.introWords = [...$("introTitle").children];

    // scene 2 rows
    el.rows = TASKS.map((tk, i) => {
      const r = make("div", "row will", $("rows"));
      r.style.top = 185 + i * 114 + "px";
      if (i < 4) make("div", "sep", r);
      const c = make("div", "circ", r, ico(tk.icon));
      const tx = make("div", "txt", r, tk.txt);
      const b = make("div", "askBtn", r);
      const halo = make("div", "halo", b), pulse = make("div", "pulse", b);
      const face = make("div", "face", b);
      const sheen = make("div", "sheen", face);
      const lbl = make("div", "lbl", face, SPARKLE + "<span>Ask AI</span>");
      return { r, c, tx, b, halo, pulse, face, sheen, lbl };
    });

    // trails (dotted curves from card to slot)
    const svg = $("trails");
    let defs = `<defs>`, body = "";
    el.trailD = SLOT_X.map((x) => {
      const cx = x + SLOT_W / 2;
      return `M960 358 C960 470 ${cx} 470 ${cx} 589`;
    });
    el.trailD.forEach((d, k) => {
      defs += `<mask id="mk${k}" maskUnits="userSpaceOnUse" x="0" y="0" width="1920" height="1080"><path id="mp${k}" d="${d}" stroke="#fff" stroke-width="16" fill="none" stroke-linecap="round"/></mask>`;
      body += `<g id="tr${k}" opacity="0"><path id="tp${k}" d="${d}" stroke="#3E8893" stroke-width="4.6" fill="none" stroke-linecap="round" stroke-dasharray="0 12.5" mask="url(#mk${k})"/>` +
        `<circle id="td${k}" cx="${SLOT_X[k] + SLOT_W / 2}" cy="589" r="0" fill="#3E8893"/></g>`;
    });
    svg.innerHTML = defs + "</defs>" + body;

    // slots
    el.slots = SLOTS.map((s, i) => {
      const o = make("div", "slot will", $("slots"));
      o.style.left = SLOT_X[i] + "px";
      o.style.zIndex = String(5 - i);       // ticks stay above the neighbour on the right
      const parts = { o };
      if (s.ai) {
        parts.ring2 = make("div", "ring", o); parts.ring2.style.background = "#D8E9EA";
        parts.ring1 = make("div", "ring", o); parts.ring1.style.background = "#B4D3D6";
      }
      parts.ripple = make("div", "ripple", o);
      parts.bg = make("div", "bg", o);
      if (s.ai) {
        parts.bg.style.borderColor = "transparent";
        parts.dash = make("div", "dash", o,
          `<svg width="${SLOT_W}" height="${SLOT_H}"><rect x="1" y="1" width="${SLOT_W - 2}" height="${SLOT_H - 2}" rx="21" fill="none" stroke="#D6DEE0" stroke-width="2" stroke-dasharray="7 5"/></svg>`);
        parts.flash = make("div", "ripple", o);
        parts.flash.style.border = "none";
        parts.flash.style.background = "#fff";
      }
      parts.circ = make("div", "circ", o, ico(s.icon));
      parts.lbl = make("div", "lbl", o, s.lbl);
      parts.tick = make("div", "tick", o, `<div class="g">${icon("check")}</div>`);
      return parts;
    });

    // tokens (the task travelling to its tool)
    el.tokens = TASKS.map((tk) => make("div", "token will", $("tokens"), `<div class="c"></div>${ico(tk.icon)}`));

    // cards
    el.cards = TASKS.map((tk, k) => {
      const c = make("div", "card will", $("cards"));
      const parts = { c };
      if (tk.stack) {
        parts.p2 = make("div", "page", c);
        parts.p1 = make("div", "page", c);
      }
      make("div", "shadow", c);
      make("div", "circ", c, ico(tk.icon));
      if (tk.typed) {
        parts.tx = make("div", "txt", c, `Reply ‘<span class="typed">${tk.typed}</span><span class="caret"></span>’`);
        parts.typed = parts.tx.querySelector(".typed");
        parts.caret = parts.tx.querySelector(".caret");
      } else {
        parts.tx = make("div", "txt", c, tk.txt);
      }
      return parts;
    });

    // sparkle burst for the AI moment
    const R2 = rng(5);
    el.sparks = [];
    for (let j = 0; j < 12; j++) {
      const s = make("div", "spark will", $("sparks"), SPARKLE);
      const size = 22 + R2() * 20;
      s.style.width = s.style.height = size + "px";
      s.style.color = j % 3 === 1 ? "#3E8893" : "#12707E";
      const ang = (j / 12) * Math.PI * 2 + (R2() - 0.5) * 0.4;
      el.sparks.push({ e: s, ang, dist: 80 + R2() * 80, size, delay: R2() * 0.10 });
    }

    // scene 8
    $("qTitle").innerHTML = "Do I need AI for this?".split(" ").map((x) => `<span class="will">${x}</span>`).join(" ");
    el.qWords = [...$("qTitle").children];
    el.chips = CHIPS.map((c) => {
      const e = make("div", "chip will", $("chips"), `<div class="c will">${ico(c.icon)}</div><span>${c.txt}</span>`);
      return { e, c: e.querySelector(".c") };
    });
    $("closing").querySelector(".sp").insertAdjacentHTML("beforeend", SPARKLE);
    el.closeSpark = $("closing").querySelector(".sp svg");
    el.closeGlow = $("closing").querySelector(".glow");

    // outro
    $("hubCard").querySelector(".circ").innerHTML = icon("diagram-project");
    el.hubIcon = $("hubCard").querySelector(".circ svg");
  }

  function measure() {
    el.cardX = el.cards.map((p) => {
      const wdt = p.c.offsetWidth;
      p.c.style.width = wdt + "px";            // freeze width (typing must not resize)
      return Math.round(960 - wdt / 2);
    });
    el.trailLen = el.trailD.map((_, k) => $("tp" + k).getTotalLength());
    el.cards[2].typed.textContent = "";
  }

  // ---------- scene renderers ----------
  const vis = (e, on) => { e.style.visibility = on ? "visible" : "hidden"; };
  const show = (e, on) => { e.style.display = on ? "" : "none"; };   // whole layers

  function renderDark(t) {
    let op;
    if (t < C.outro) op = 1 - E.inOutSine(P(t, C.darkOut, 0.40));
    else op = E.inOutSine(P(t, C.outro, 0.30));
    $("dark").style.opacity = op;
    show($("dark"), op > 0);
    if (op <= 0) return;
    const dx = Math.cos((-38 * Math.PI) / 180), dy = Math.sin((-38 * Math.PI) / 180);
    const nx = -dy, ny = dx;                   // normal to travel direction
    for (const b of el.bars) {
      const s = ((b.s0 + b.sp * t) % 3400) - 900;          // along direction
      const x = 960 + dx * (s - 1250) + nx * b.o0 * 0.55;
      const y = 540 + dy * (s - 1250) + ny * b.o0 * 0.55;
      b.e.style.opacity = b.op;
      b.e.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) rotate(-38deg)`;
    }
  }

  function renderIntro(t) {
    const on = t < C.introOut + 0.6;
    show($("intro"), on);
    if (!on) return;
    const out = E.inCubic(P(t, C.introOut, 0.30));
    $("intro").style.opacity = 1 - out;
    $("intro").style.transform = `scale(${1 + 0.035 * out})`;
    el.introWords.forEach((s, i) => {
      const p = E.outCubic(P(t, 0.10 + i * 0.05, 0.62));
      s.style.opacity = p;
      s.style.transform = `translateY(${(30 * (1 - p)).toFixed(2)}px)`;
    });
    let p = E.outCubic(P(t, 0.30, 0.6));            // subtitle 6 frames after the title
    $("introSub").style.opacity = p;
    $("introSub").style.transform = `translateY(${(18 * (1 - p)).toFixed(2)}px)`;
    p = E.inOutCubic(P(t, 0.58, 0.5));               // divider draws left to right
    $("introDivider").style.transform = `scaleX(${p})`;
    $("introDivider").style.opacity = p > 0 ? 1 : 0;
    p = P(t, 0.88, 0.8);                             // logo settles along its own arrow
    const e = E.outBack(p, 1.25);
    $("introLogo").style.opacity = E.outCubic(clamp(p * 2));
    $("introLogo").style.transform = `translate(${(-30 * (1 - e)).toFixed(2)}px, ${(30 * (1 - e)).toFixed(2)}px)`;
    p = E.outCubic(P(t, 1.02, 0.6));
    $("introName").style.opacity = p;
    $("introName").style.transform = `translateX(${(-18 * (1 - p)).toFixed(2)}px)`;
  }

  function renderS2(t) {
    const on = t > C.introOut && t < C.lift + 0.5;
    show($("s2"), on);
    show($("cursorLayer"), on);
    if (!on) return;
    const pin = E.outCubic(P(t, C.panelIn, 0.62));
    const q = E.inOutSine(P(t, C.lift, 0.30));       // everything but the first task leaves
    const tx = -90 * (1 - pin);
    for (const id of ["panel", "panelHead", "panelRule"]) {
      $(id).style.opacity = pin * (1 - q);
      $(id).style.transform = `translateX(${tx.toFixed(2)}px)`;
    }
    el.rows.forEach((r, i) => {
      const p = E.outCubic(P(t, C.rows[i], 0.38));
      const out = i === 0 ? P(t, C.lift, 0.16) : q;
      r.r.style.opacity = p * (1 - out);
      r.r.style.transform = `translateX(${(tx - 44 * (1 - p)).toFixed(2)}px)`;
      // shimmer: every task, the same button
      const s = P(t, C.shimmer + i * 0.09, 0.5);
      r.sheen.style.transform = `translateX(${lerp(0, 330, E.inOutSine(s)).toFixed(1)}px)`;
      r.sheen.style.opacity = s > 0 && s < 1 ? 1 : 0;
      let scale = 1 + 0.045 * bump(s);
      let border = mix(COL.soft, COL.teal, bump(s));
      let face = COL.tint, txt = COL.teal, haloIn = 0, pulseOp = 0, pulseIn = 0;
      if (i === 0) {
        const c = E.outCubic(P(t, C.click, 0.28));
        scale *= 1 - 0.06 * bump(P(t, C.click - 0.02, 0.24));
        face = mix(COL.tint, COL.teal, c);
        txt = mix(COL.teal, COL.white, c);
        border = mix(border, COL.teal, c);
        haloIn = 10 * c;
        const pp = P(t, C.click + 0.05, 0.65);
        pulseOp = pp > 0 && pp < 1 ? 0.55 * (1 - pp) : 0;
        pulseIn = 6 + 30 * E.outCubic(pp);
      }
      r.b.style.transform = `scale(${scale.toFixed(4)})`;
      r.face.style.background = rgb(face);
      r.face.style.borderColor = rgb(border);
      r.lbl.style.color = rgb(txt);
      r.halo.style.inset = `-${haloIn.toFixed(2)}px`;
      r.halo.style.borderRadius = `${(28 + haloIn).toFixed(1)}px`;
      r.halo.style.opacity = haloIn > 0 ? 1 : 0;
      r.pulse.style.inset = `-${pulseIn.toFixed(2)}px`;
      r.pulse.style.borderRadius = `${(28 + pulseIn).toFixed(1)}px`;
      r.pulse.style.opacity = pulseOp;
    });
    for (const [id, t0] of [["side1", C.side1], ["side2", C.side2]]) {
      const p = E.outCubic(P(t, t0, 0.5));
      $(id).style.opacity = p * (1 - q);
      $(id).style.transform = `translateY(${(24 * (1 - p)).toFixed(2)}px)`;
    }
    // cursor glides to the first button and clicks
    const m = E.inOutCubic(P(t, C.cursorFrom, 0.72));
    const A = [1460, 800], K = [1420, 330], B = [1086, 252];
    const x = (1 - m) * (1 - m) * A[0] + 2 * (1 - m) * m * K[0] + m * m * B[0];
    const y = (1 - m) * (1 - m) * A[1] + 2 * (1 - m) * m * K[1] + m * m * B[1];
    const press = 1 - 0.14 * bump(P(t, C.click - 0.02, 0.22));
    const cur = $("cursor");
    cur.style.opacity = E.outCubic(P(t, C.cursorFrom, 0.18)) * (1 - q);
    cur.style.transform = `translate(${(x - 4).toFixed(1)}px, ${(y - 3.5).toFixed(1)}px) scale(${press.toFixed(3)})`;
  }

  function renderSort(t) {
    const on = t > C.lift - 0.05 && t < C.away + 0.9;
    show($("sort"), on);
    if (!on) return;

    // ---- cards ----
    el.cards.forEach((p, k) => {
      let op, X = el.cardX[k], Y = 150, sc = 1, sh = 1;
      if (k === 0) {
        const a = P(t, C.lift, 0.18);
        const m = E.inOutCubic(P(t, C.lift + 0.08, 0.64));
        const s0 = 0.64;
        sc = lerp(s0, 1, m);
        X = lerp(220 - 108 * s0, el.cardX[0], m);
        Y = lerp(242 - 94 * s0, 150, m);
        op = a; sh = m;
      } else {
        const i = E.outCubic(P(t, C.swap[k - 1] + 0.16, 0.36));
        op = i; Y += 28 * (1 - i);
      }
      if (k < 4) { const o = E.inOutSine(P(t, C.swap[k], 0.22)); op *= 1 - o; Y -= 24 * o; }
      else { const o = E.inCubic(P(t, C.away, 0.36)); op *= 1 - o; Y -= 44 * o; }
      p.c.style.opacity = op;
      vis(p.c, op > 0.001);
      p.c.style.transform = `translate(${X.toFixed(2)}px, ${Y.toFixed(2)}px) scale(${sc.toFixed(4)})`;
      p.c.querySelector(".shadow").style.opacity = 0.0 + sh;
      if (p.p1) {
        const s = E.outBack(P(t, C.swap[3] + 0.42, 0.5), 1.6);
        p.p1.style.transform = `translate(${(7 * s).toFixed(2)}px, ${(9 * s).toFixed(2)}px)`;
        p.p2.style.transform = `translate(${(14 * s).toFixed(2)}px, ${(18 * s).toFixed(2)}px)`;
      }
      if (p.typed) {
        const full = TASKS[2].typed;
        const n = Math.round(full.length * clamp((t - C.typeStart) / 0.62));
        const txt = full.slice(0, n);
        if (p.typed.textContent !== txt) p.typed.textContent = txt;
        const since = t - (C.typeStart + 0.62);
        const caretOn = t > C.typeStart - 0.3 && (since < 0 || (since < 0.9 && Math.floor(since / 0.3) % 2 === 1));
        p.caret.style.opacity = caretOn ? 1 : 0;
      }
    });

    // ---- tokens + trails ----
    el.tokens.forEach((tok, k) => {
      const p = P(t, C.depart[k], TRAVEL[k]);
      const e = E.inOutCubic(p);
      const path = $("tp" + k), L = el.trailLen[k];
      const show = t >= C.depart[k] && t <= C.land[k] + 0.02;
      vis(tok, show);
      if (show) {
        const pt = path.getPointAtLength(L * e);
        const sc = p < 0.18 ? lerp(0.5, 1, E.outCubic(p / 0.18)) : p > 0.82 ? lerp(1, 0.6, (p - 0.82) / 0.18) : 1;
        const op = p < 0.12 ? p / 0.12 : p > 0.86 ? 1 - (p - 0.86) / 0.14 : 1;
        tok.style.opacity = op;
        tok.style.transform = `translate(${pt.x.toFixed(1)}px, ${pt.y.toFixed(1)}px) scale(${sc.toFixed(3)})`;
      }
      // trail reveal follows the token, then stays with its card
      const mp = $("mp" + k);
      mp.setAttribute("stroke-dasharray", `${L} ${L}`);
      mp.setAttribute("stroke-dashoffset", (L * (1 - e)).toFixed(2));
      const out = k < 4 ? P(t, C.swap[k], 0.22) : P(t, C.away, 0.3);
      $("tr" + k).setAttribute("opacity", (p > 0 ? 1 - out : 0).toFixed(3));
      const dot = E.outBack(P(t, C.land[k] - 0.03, 0.32), 2.4);
      $("td" + k).setAttribute("r", (6 * dot).toFixed(2));
    });

    // ---- slots ----
    el.slots.forEach((s, i) => {
      const def = SLOTS[i];
      const ein = P(t, C.slotsIn + i * 0.07, 0.6);
      const ey = 96 * (1 - E.outBack(ein, 1.25));
      const eo = E.outCubic(clamp(ein * 1.8));
      const aw = E.inCubic(P(t, C.away + i * 0.05, 0.42));
      const L = C.land[i];
      const isYou = i === 3;
      const a = E.outCubic(P(t, L, isYou ? 0.42 : 0.28));                  // fill
      const raise = E.outBack(P(t, L - 0.02, isYou ? 0.85 : 0.55), isYou ? 1.6 : 2.4);
      const d = i < 4 ? E.inOutCubic(P(t, C.swap[i], 0.42)) : 0;        // becomes "done"
      const y = ey + 96 * aw - 12 * raise * (1 - d);
      s.o.style.opacity = eo * (1 - aw);
      s.o.style.transform = `translateY(${y.toFixed(2)}px)`;

      const act = def.ai ? COL.dark : COL.teal;
      const actCirc = def.ai ? COL.teal : COL.actCirc;
      let bg = mix(mix(COL.white, act, a), COL.doneBg, d);
      let border = mix(mix(def.ai ? COL.white : COL.idleBorder, act, a), COL.soft, d);
      let circ = mix(mix(COL.tint, actCirc, a), COL.doneCirc, d);
      const fg = mix(mix(COL.teal, COL.white, a), COL.teal, d);
      const lbl = mix(mix(COL.dark, COL.white, a), COL.dark, d);
      // "You still check it": the You slot answers once more
      if (isYou) {
        const pc = P(t, C.youCheck - 0.04, 1.0);
        border = mix(border, COL.teal, bump(pc));
        circ = mix(circ, mix(COL.doneCirc, COL.teal, 0.35), bump(pc));
      }
      s.bg.style.background = rgb(bg);
      if (!def.ai) s.bg.style.borderColor = rgb(border);
      else s.bg.style.borderColor = a > 0 ? rgb(act, a) : "transparent";
      const shA = a * (1 - d);
      s.bg.style.boxShadow = shA > 0 ? `0 ${(18 * shA).toFixed(1)}px ${(34 * shA).toFixed(1)}px ${rgb(def.ai ? COL.dark : COL.teal, (0.30 * shA).toFixed(3))}` : "none";
      s.circ.style.background = rgb(circ);
      s.circ.style.color = rgb(fg);
      s.lbl.style.color = rgb(lbl);
      if (def.ai) {
        s.dash.style.opacity = 1 - a;
        const g = E.outCubic(P(t, L + 0.04, 0.6));
        s.ring1.style.inset = `-${(14 * g).toFixed(2)}px`;
        s.ring1.style.borderRadius = `${22 + 14 * g}px`;
        s.ring2.style.inset = `-${(30 * g).toFixed(2)}px`;
        s.ring2.style.borderRadius = `${22 + 30 * g}px`;
        s.ring1.style.opacity = s.ring2.style.opacity = g;
        const f = P(t, L, 0.5);
        s.flash.style.opacity = f > 0 && f < 1 ? 0.28 * (1 - f) : 0;
        const tw = P(t, L + 0.1, 0.7);
        s.circ.querySelector("svg").style.transform = `scale(${(1 + 0.3 * bump(tw)).toFixed(3)})`;
      }
      // landing ripple (and a softer, slower one for "You")
      let rp = P(t, L, isYou ? 0.95 : 0.62);
      let rOp = rp > 0 && rp < 1 ? (isYou ? 0.38 : 0.5) * (1 - rp) : 0;
      let rSc = 1 + (def.ai ? 0.2 : 0.11) * E.outCubic(rp);
      if (isYou) {
        const pc = P(t, C.youCheck - 0.04, 0.95);
        if (pc > 0 && pc < 1) { rOp = 0.4 * (1 - pc); rSc = 1 + 0.10 * E.outCubic(pc); }
      }
      s.ripple.style.opacity = rOp;
      s.ripple.style.transform = `scale(${rSc.toFixed(4)})`;
      // tick
      const tk = P(t, L + (isYou ? 0.12 : 0.08), isYou ? 0.6 : 0.4);
      const tsc = E.outBack(tk, isYou ? 2.0 : 2.8) * (isYou ? 1.14 : 1);
      s.tick.style.opacity = clamp(tk * 4);
      s.tick.style.transform = `scale(${Math.max(0, tsc).toFixed(4)})`;
    });

    // ---- sparkle burst: the one bright beat ----
    const L4 = C.land[4];
    const cx = SLOT_X[4] + SLOT_W / 2, cy = SLOT_Y - 12 + SLOT_H / 2;
    for (const sp of el.sparks) {
      const p = P(t, L4 + 0.03 + sp.delay, 0.95);
      const on2 = p > 0 && p < 1;
      vis(sp.e, on2);
      if (!on2) continue;
      const ex = Math.cos(sp.ang), ey = Math.sin(sp.ang);
      const r0x = 150 * ex * 0.92, r0y = 114 * ey * 0.92;
      const dd = sp.dist * E.outQuart(p);
      const x = cx + r0x + ex * dd - sp.size / 2, y = cy + r0y + ey * dd - sp.size / 2;
      const sc = p < 0.25 ? E.outBack(p / 0.25, 2) : 1 - E.inCubic((p - 0.25) / 0.75) * 0.6;
      sp.e.style.opacity = p < 0.15 ? p / 0.15 : 1 - E.inCubic((p - 0.15) / 0.85);
      sp.e.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${sc.toFixed(3)})`;
    }
  }

  function renderS8(t) {
    const on = t > C.away && t < C.outro + 0.4;
    show($("s8"), on);
    if (!on) return;
    let p = E.outCubic(P(t, C.kicker, 0.75));
    $("kicker").style.opacity = p;
    $("kicker").style.letterSpacing = lerp(16, 6.5, p).toFixed(2) + "px";
    $("kicker").style.transform = `translateY(${(10 * (1 - p)).toFixed(2)}px)`;
    el.qWords.forEach((s, i) => {
      const q = E.outCubic(P(t, C.title + i * 0.07, 0.62));
      s.style.opacity = q;
      s.style.transform = `translateY(${(48 * (1 - q)).toFixed(2)}px)`;
    });
    el.chips.forEach((c, j) => {
      const q = P(t, C.chips[j], 0.5);
      const sc = 0.82 + 0.18 * E.outBack(q, 1.6);
      c.e.style.opacity = E.outCubic(clamp(q * 2.2));
      c.e.style.transform = `translateY(${(14 * (1 - E.outCubic(q))).toFixed(2)}px) scale(${sc.toFixed(4)})`;
      const ci = P(t, C.chips[j] + 0.08, 0.45);
      c.c.style.transform = `scale(${Math.max(0, E.outBack(ci, 2.2)).toFixed(4)})`;
    });
    p = E.outCubic(P(t, C.closing, 0.6));
    $("closing").style.opacity = p;
    $("closing").style.transform = `translateY(${(16 * (1 - p)).toFixed(2)}px)`;
    const tw = P(t, C.twinkle - 0.05, 0.85);
    el.closeSpark.style.transform = `scale(${(1 + 0.32 * bump(tw)).toFixed(3)})`;
    el.closeGlow.style.opacity = (0.15 + 0.85 * bump(tw)) * p;
  }

  function renderOutro(t) {
    const on = t > C.outro;
    show($("outro"), on);
    if (!on) return;
    let p = P(t, C.outroIn, 0.55);
    const pp = P(t, C.pauseAsk, 1.0);
    const icSc = (0.6 + 0.4 * E.outBack(p, 1.8)) * (1 + 0.07 * bump(clamp(pp * 2.2)));
    $("pauseIcon").style.opacity = E.outCubic(clamp(p * 2.5));
    $("pauseIcon").style.transform = `scale(${icSc.toFixed(4)})`;
    const pulse = $("pauseIcon").querySelector(".pulse");
    pulse.style.opacity = pp > 0 && pp < 1 ? 0.7 * (1 - pp) : 0;
    pulse.style.transform = `scale(${(1 + 0.45 * E.outCubic(pp)).toFixed(4)})`;
    for (const [id, t0] of [["outroL1", C.outroIn + 0.08], ["outroL2", C.pauseAsk]]) {
      const q = E.outCubic(P(t, t0, 0.55));
      $(id).style.opacity = q;
      $(id).style.transform = `translateX(${(-26 * (1 - q)).toFixed(2)}px)`;
    }
    p = P(t, C.hub, 0.65);
    $("hubCard").style.opacity = E.outCubic(clamp(p * 2));
    $("hubCard").style.transform = `translateY(${(48 * (1 - E.outBack(p, 1.3))).toFixed(2)}px)`;
    const hi = P(t, C.hub + 0.16, 0.5);
    el.hubIcon.style.transform = `scale(${Math.max(0, E.outBack(hi, 2.2)).toFixed(4)})`;
    p = P(t, C.logo, 0.85);
    const e = E.outBack(p, 1.2);
    $("outroLogo").style.opacity = E.outCubic(clamp(p * 1.8));
    $("outroLogo").style.transform = `translate(${(-36 * (1 - e)).toFixed(2)}px, ${(36 * (1 - e)).toFixed(2)}px)`;
  }

  function renderCaption(t) {
    const cap = $("cap"), cs = T.captions;
    let cur = -1;
    for (let i = 0; i < cs.length; i++) if (t >= cs[i].start && t < cs[i].end) cur = i;
    if (cur < 0 || NOCAP) { cap.style.opacity = 0; return; }
    const c = cs[cur];
    const joinedPrev = cur > 0 && Math.abs(cs[cur - 1].end - c.start) < 1e-3;
    const joinedNext = cur < cs.length - 1 && Math.abs(cs[cur + 1].start - c.end) < 1e-3;
    let op = 1;
    if (!joinedPrev) op = Math.min(op, clamp((t - c.start) / 0.15));
    if (!joinedNext) op = Math.min(op, clamp((c.end - t) / 0.2));
    if (cap.textContent !== c.text) cap.textContent = c.text;
    cap.style.opacity = op;
  }

  function render(t) {
    renderDark(t);
    renderIntro(t);
    renderS2(t);
    renderSort(t);
    renderS8(t);
    renderOutro(t);
    renderCaption(t);
  }

  async function init() {
    build();
    await document.fonts.load('700 56px "Arimo"');
    await document.fonts.load('400 38px "Arimo"');
    await document.fonts.ready;
    await Promise.all([...document.images].map((im) => im.decode().catch(() => {})));
    measure();
    window.render = render;
    render(qs.has("t") ? parseFloat(qs.get("t")) : 0);
    return true;
  }
  window.ready = init();
})();
