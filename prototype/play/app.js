import { html, render, useState, useEffect, useReducer, useMemo, useRef } from "https://unpkg.com/htm@3.1.1/preact/standalone.module.js";
import * as M from "./model.js";
import * as A from "./actions.js";

const ICONS = {
  "Federation of Sol": "assets/sol.webp", "Ghosts of Creuss": "assets/creuss.webp", "Mahact Gene-Sorcerers": "assets/mahact.webp",
  "Naaz-Rokha Alliance": "assets/naaz.webp", "Universities of Jol-Nar": "assets/jolnar.webp", "Vuil'raith Cabal": "assets/vuilraith.webp",
};
const PCOLOR = (c) => `var(--p-${(c || "black").toLowerCase()})`;
const store = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch {} } };

// ---------------- state ----------------

function startAt(data, frame, seat, mode) {
  const f = data.frames[frame];
  return { mode, frame, seat, game: M.clone(f.state), log: data.log.slice(0, f.i + 1), history: [], startedAt: Date.now(), extra: 0, combat: null, helping: null };
}

function reducer(s, a) {
  switch (a.type) {
    case "loaded": {
      const scenario = "action";
      const seat = store.get("seat") || "Federation of Sol";
      return { ...s, data: a.data, scenario, ...startAt(a.data, a.data.scenarios[scenario].frame, seat, "play") };
    }
    case "scenario":
      return { ...s, scenario: a.name, ...startAt(s.data, s.data.scenarios[a.name].frame, s.seat, "play"), sheet: null, toast: null, tab: "now" };
    case "watch": {
      const frame = a.frame ?? s.data.window[0];
      return { ...s, scenario: "watch", ...startAt(s.data, frame, s.seat, "watch"), sheet: null, toast: null, tab: "now" };
    }
    case "step": {
      const w = s.data.window;
      const frame = Math.min(w[w.length - 1], Math.max(w[0], a.frame));
      const f = s.data.frames[frame];
      return { ...s, frame, game: M.clone(f.state), log: s.data.log.slice(0, f.i + 1) };
    }
    case "fork": // keep playing from the watched moment
      return { ...s, mode: "play", scenario: "watch-fork", history: [], startedAt: Date.now(), extra: 0 };
    case "seat":
      store.set("seat", a.id || "");
      return { ...s, seat: a.id, helping: null, sheet: null };
    case "tab": return { ...s, tab: a.tab, sheet: null };
    case "sheet": return { ...s, sheet: a.sheet };
    case "help": return { ...s, helping: a.id, sheet: null };
    case "tick": return s.mode === "play" ? { ...s, extra: Math.floor((Date.now() - s.startedAt) / 1000) } : s;
    case "do": {
      if (s.mode !== "play") return s;
      const ctx = ctxOf(s);
      const op = a.op;
      const game = M.clone(s.game);
      op.mutate(game, ctx);
      const t = M.clock(ctx);
      const actor = { seat: s.seat, as: a.as && a.as !== s.seat ? a.as : undefined };
      const stamp = (e, k) => ({ ...e, i: s.log.length + k, t, turnOf: M.active(ctx), actor, local: true, at: { round: s.game.state.round, phase: s.game.state.phase }, after: { round: game.state.round, phase: game.state.phase } });
      const entries = op.entries.map(stamp);
      let combat = s.combat;
      for (const e of entries) {
        if (e.action === "COMBAT_START") combat = { ...e.event, since: t };
        if (e.action === "COMBAT_END") combat = null;
      }
      const helping = op.endsHelp ? null : s.helping;
      return {
        ...s, game, log: [...s.log, ...entries], combat, helping, sheet: a.keepSheet ? s.sheet : null,
        history: [...s.history, { label: op.label, game: s.game, logLen: s.log.length, combat: s.combat, helping: s.helping }],
        toast: { label: a.as && a.as !== s.seat ? `${op.label} (you helped)` : op.label, undo: true, id: Date.now() },
      };
    }
    case "undo": {
      const last = s.history[s.history.length - 1];
      if (!last) return s;
      return { ...s, game: last.game, log: s.log.slice(0, last.logLen), combat: last.combat, helping: last.helping, history: s.history.slice(0, -1), toast: { label: `Undid: ${last.label}`, undo: false, id: Date.now() } };
    }
    case "toast": return { ...s, toast: a.toast };
    default: return s;
  }
}

function ctxOf(s) {
  return { base: s.data.base, meta: s.data.meta, state: s.game, log: s.log, extraSeconds: s.mode === "play" ? s.extra : 0 };
}

// ---------------- small parts ----------------

function Chip({ ctx, id, size, player, label }) {
  if (!id) return html`<span class="chip"><span class=${`sw ${size || ""}`}></span><span class="nm">${label || "Nobody"}</span></span>`;
  const f = M.faction(ctx, id);
  return html`<span class="chip">
    <span class=${`sw ${size || ""}`} data-c=${f.color} style=${`--c:${PCOLOR(f.color)}`}><img src=${ICONS[id]} alt="" /></span>
    <span class="nm">${label || f.short}</span>${player !== false && f.player ? html`<span class="pl">${f.player}</span>` : null}
  </span>`;
}

function Swatch({ ctx, id, size }) {
  const f = M.faction(ctx, id);
  return html`<span class=${`sw ${size || ""}`} data-c=${f.color} style=${`--c:${PCOLOR(f.color)}`} title=${f.short}><img src=${ICONS[id]} alt=${f.short} /></span>`;
}

const Icon = {
  now: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>`,
  table: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16M4 12h16M4 18h16"/></svg>`,
  map: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3l7.8 4.5v9L12 21l-7.8-4.5v-9z"/></svg>`,
  log: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 4h14v16H5zM8 8h8M8 12h8M8 16h5"/></svg>`,
};

function Sheet({ title, onClose, children, lead }) {
  const ref = useRef(null);
  useEffect(() => { ref.current?.querySelector("button, input")?.focus(); }, []);
  return html`<div class="scrim" onClick=${(e) => e.target === e.currentTarget && onClose()}>
    <section class="sheet" role="dialog" aria-modal="true" aria-label=${title} ref=${ref}>
      <span class="grab" aria-hidden="true"></span>
      <header>${lead}<h2>${title}</h2><button class="close" onClick=${onClose} aria-label="Close">✕</button></header>
      ${children}
    </section>
  </div>`;
}

// ---------------- Now: shared blocks ----------------

function Race({ ctx, compact, onOpen }) {
  const vp = ctx.meta.victoryPoints || 10;
  const rows = M.race(ctx);
  return html`<section class="card" aria-label="Score race">
    <p class="eyebrow"><span>Race to ${vp}</span></p>
    <ul class="list race">${rows.map((r) => html`<li>
      <button class="opt" style="border:0;min-height:44px;padding:0" onClick=${() => onOpen(r.id)} aria-label=${`${M.faction(ctx, r.id).short}: ${r.total} points`}>
        <${Chip} ctx=${ctx} id=${r.id} size="sm" player=${!compact} />
        <span class="grow" style="display:grid;gap:4px;flex:1;min-width:60px">
          <span class="bar" style=${`--c:${PCOLOR(M.faction(ctx, r.id).color)}`}><i style=${`width:${Math.min(100, (r.total / vp) * 100)}%`}></i></span>
          ${!compact ? html`<span class="srcs">${r.groups.map((g, k) => html`<span>${k ? "· " : ""}${g.label} ${g.points}</span>`)}</span>` : null}
        </span>
        <span class="vp">${r.total}</span>
      </button></li>`)}</ul>
  </section>`;
}

function Recent({ ctx, count = 3, onLog }) {
  const items = [];
  for (let i = ctx.log.length - 1; i >= 0 && items.length < count; i--) {
    const s = M.sentence(ctx, ctx.log[i]);
    if (s) items.push({ e: ctx.log[i], s });
  }
  return html`<section class="card" aria-label="What just happened">
    <p class="eyebrow"><span>Just happened</span><button class="linkbtn" onClick=${onLog}>Full log</button></p>
    <ul class="feed">${items.map(({ e, s }) => html`<${FeedRow} ctx=${ctx} e=${e} s=${s} />`)}</ul>
  </section>`;
}

function FeedRow({ ctx, e, s }) {
  const who = M.subject(ctx, e);
  const capital = /^[A-Z]/.test(s);
  const helped = e.actor?.as && e.actor.seat && e.actor.seat !== e.actor.as;
  return html`<li>
    ${who ? html`<${Swatch} ctx=${ctx} id=${who} size="sm" />` : html`<span></span>`}
    <span>${who && !capital ? html`<b>${M.faction(ctx, who).short}</b> ` : null}${s}${helped ? html`<span class="by">${M.faction(ctx, e.actor.seat).short} did this for ${M.faction(ctx, e.actor.as).short}</span>` : null}</span>
    <span class="t">${e.t != null ? M.fmtClock(e.t, true) : ""}</span>
  </li>`;
}

function CardBoard({ ctx, onCard }) {
  const cards = Object.entries(ctx.base.strategycards).sort((a, b) => a[1].order - b[1].order);
  const picked = cards.filter(([id]) => ctx.state.strategycards[id]?.faction);
  const left = picked.filter(([id]) => !ctx.state.strategycards[id].used).length;
  return html`<section class="card" aria-label="Strategy cards">
    <p class="eyebrow"><span>Strategy cards</span><span class="num">${left ? `${left} left` : "All played"}</span></p>
    <div>${picked.map(([id, c]) => {
      const st = ctx.state.strategycards[id];
      return html`<button class=${`sc ${st.used ? "used" : ""}`} onClick=${() => onCard(id)}>
        <span class="n">${c.order}</span>
        <span class="row"><span class="nm2"><b>${c.name}</b></span><${Chip} ctx=${ctx} id=${st.faction} size="sm" player=${false} /></span>
        <span class="pill">${st.used ? "Played" : M.hasPassed(ctx, st.faction) ? "Passed" : "Ready"}</span>
      </button>`;
    })}</div>
  </section>`;
}

function OnDeck({ ctx }) {
  const next = M.onDeck(ctx);
  const passed = M.seatIds(ctx).filter((id) => M.hasPassed(ctx, id));
  if (!next && !passed.length) return null;
  return html`<div class="row" style="flex-wrap:wrap;gap:8px 14px">
    ${next ? html`<span class="row" style="gap:6px"><span class="muted">Next</span> <${Chip} ctx=${ctx} id=${next} size="sm" /></span>` : null}
    ${passed.length ? html`<span class="row" style="gap:4px"><span class="muted">Passed</span> ${passed.map((id) => html`<${Swatch} ctx=${ctx} id=${id} size="sm" />`)}</span>` : null}
  </div>`;
}

function CombatBanner({ s, ctx, dispatch, open }) {
  if (!s.combat) return null;
  const c = s.combat;
  const secs = M.clock(ctx) - c.since;
  return html`<div class="banner" role="status">
    <span class="grow"><b>Combat in ${c.place}</b><br /><span class="row" style="gap:6px;flex-wrap:wrap"><${Chip} ctx=${ctx} id=${c.attacker} size="sm" player=${false} /> vs <${Chip} ctx=${ctx} id=${c.defender} size="sm" player=${false} /></span></span>
    <span class="clock" aria-label="Combat clock">${M.fmtClock(secs)}</span>
    <button class="btn small" onClick=${() => open({ kind: "endCombat" })}>End</button>
  </div>`;
}

// ---------------- Now: per phase ----------------

function NowAction({ s, ctx, dispatch, open, me }) {
  const act = M.active(ctx);
  const mine = act && (act === s.seat || act === s.helping);
  const turn = M.currentTurn(ctx);
  const sel = M.selectedAction(ctx);
  const turnSecs = M.clock(ctx) - M.turnStartedAt(ctx);
  const doAs = (op) => dispatch({ type: "do", op, as: act });
  const cardsOfAct = act ? M.cardsOf(ctx, act) : [];
  const isCard = sel && ctx.base.strategycards[sel];
  const f = act ? M.faction(ctx, act) : null;

  const steps = turn.map((e) => M.sentence(ctx, e)).filter(Boolean).filter((x, i) => i > 0 || !/^took a|^played/.test(x));

  const yourTurn = html`<section class="card hero" style=${`--c:${PCOLOR(f?.color)}`} aria-label="Your turn">
    ${s.helping && s.helping !== s.seat ? html`<div class="banner"><span class="grow">You're helping <b>${f.short}</b>. Everything you do is logged as you, for ${f.short}.</span><button class="btn small" onClick=${() => dispatch({ type: "help", id: null })}>Stop</button></div>` : null}
    <p class="eyebrow"><span>${act === s.seat ? "Your turn" : `${f.short}'s turn`}</span><span class="clock">${M.fmtClock(turnSecs)}</span></p>
    ${!sel ? html`
      <h2 class="title">Choose an action</h2>
      <div class="actions">
        <button class="btn primary" onClick=${() => doAs(A.selectAction(ctx, act, "Tactical"))}>Tactical<span class="hint">Activate a system</span></button>
        <button class="btn" onClick=${() => open({ kind: "component", faction: act })}>Component<span class="hint">Ability, tech, relic, card</span></button>
        ${cardsOfAct.filter((c) => !c.used).map((c) => html`<button class="btn" onClick=${() => doAs(A.selectAction(ctx, act, c.card))}>${c.card}<span class="hint">Your strategy card</span></button>`)}
        <button class="btn" disabled=${!A.canPass(ctx, act)} onClick=${() => open({ kind: "confirmPass", faction: act })}>Pass<span class="hint">${A.canPass(ctx, act) ? "Done for the round" : "Play your card first"}</span></button>
      </div>` : html`
      <h2 class="title">${sel === "Tactical" ? "Tactical action" : sel === "Component" ? "Component action" : `${sel}: primary`}</h2>
      ${steps.length ? html`<ul class="list">${steps.map((t) => html`<li>${t}</li>`)}</ul>` : html`<p class="sub">Nothing recorded yet. Record what happens on the board, or just end the turn.</p>`}
      ${isCard ? html`<p class="text sub">${ctx.base.strategycards[sel].primary}</p>
        <p class="sub">The card's steps would open upstream's existing flow here (not in the prototype).</p>
        <button class="btn" onClick=${() => doAs(A.markPrimary(ctx, act, sel))} disabled=${!!ctx.state.strategycards[sel]?.used}>${ctx.state.strategycards[sel]?.used ? "Primary done" : "Mark primary done"}</button>` : null}
      <div class="grid2">
        <button class="btn" onClick=${() => open({ kind: "claim", faction: act })}>Take a planet</button>
        <button class="btn" onClick=${() => open({ kind: "combat", faction: act })} disabled=${!!s.combat}>Start combat</button>
        <button class="btn" onClick=${() => open({ kind: "score", faction: act, filter: "action" })}>Score objective</button>
        <button class="btn" onClick=${() => open({ kind: "research", faction: act })}>Research tech</button>
        <button class="btn" onClick=${() => open({ kind: "actionCard", faction: act })}>Play action card</button>
        ${isCard ? html`<button class="btn" onClick=${() => open({ kind: "secondaries" })}>Secondaries</button>` : null}
      </div>
      <button class="btn primary tall block" onClick=${() => dispatch({ type: "do", op: { ...A.endTurn(ctx, act), endsHelp: true }, as: act })}>End turn</button>`}
  </section>`;

  const watching = act ? html`<section class="card hero" style=${`--c:${PCOLOR(f.color)}`} aria-label="Now playing">
    <p class="eyebrow"><span>Now playing</span><span class="clock">${M.fmtClock(turnSecs)}</span></p>
    <div class="row"><${Chip} ctx=${ctx} id=${act} size="lg" /><span class="grow"></span></div>
    <p class="sentence">${sel ? (sel === "Tactical" ? "Tactical action" : sel === "Component" ? "Component action" : `Playing ${sel}`) : "Choosing an action"}${steps.length ? ":" : ""}</p>
    ${steps.length ? html`<ul class="list">${steps.map((t) => html`<li>${t}</li>`)}</ul>` : null}
    <${OnDeck} ctx=${ctx} />
    ${s.mode === "play" ? html`<button class="btn help block" onClick=${() => dispatch({ type: "help", id: act })}>Do it for ${f.short}</button>` : null}
  </section>` : null;

  const myPrompt = isCard && s.seat && s.seat !== act && (!ctx.state.factions[s.seat]?.secondary || ctx.state.factions[s.seat]?.secondary === "PENDING") && !turn.some((e) => e.action === "MARK_SECONDARY" && e.event.faction === s.seat)
    ? html`<section class="card" aria-label="Secondary">
        <p class="eyebrow"><span>${sel} was played</span></p>
        <h2 class="title">Follow the secondary?</h2>
        <p class="text sub">${ctx.base.strategycards[sel].secondary}</p>
        <div class="grid2">
          <button class="btn primary" disabled=${s.mode !== "play"} onClick=${() => dispatch({ type: "do", op: A.markSecondary(ctx, s.seat, "DONE") })}>Follow</button>
          <button class="btn" disabled=${s.mode !== "play"} onClick=${() => dispatch({ type: "do", op: A.markSecondary(ctx, s.seat, "SKIPPED") })}>Skip</button>
        </div>
      </section>` : null;

  return html`<${CombatBanner} s=${s} ctx=${ctx} dispatch=${dispatch} open=${open} />
    ${mine && s.mode === "play" ? yourTurn : watching}
    ${myPrompt}`;
}

function NowStrategy({ s, ctx, dispatch, open }) {
  const act = M.active(ctx);
  const order = M.speakerOrder(ctx);
  const mine = act && (act === s.seat || act === s.helping);
  const cards = Object.entries(ctx.base.strategycards).sort((a, b) => a[1].order - b[1].order);
  return html`<section class="card hero" style=${act ? `--c:${PCOLOR(M.faction(ctx, act).color)}` : ""}>
    <p class="eyebrow"><span>Pick order</span><span class="num">${order.filter((id) => M.cardsOf(ctx, id).length).length} of ${order.length}</span></p>
    <ul class="list">${order.map((id, k) => {
      const c = M.cardsOf(ctx, id)[0];
      return html`<li><span class="num faint">${k + 1}</span><${Chip} ctx=${ctx} id=${id} size="sm" /><span class="grow"></span>
        ${c ? html`<span class="pill">${c.card}</span>` : id === act ? html`<span class="pill now">Picking</span>` : html`<span class="faint">Waiting</span>`}</li>`;
    })}</ul>
    ${act && !mine && s.mode === "play" ? html`<button class="btn help block" onClick=${() => dispatch({ type: "help", id: act })}>Pick for ${M.faction(ctx, act).short}</button>` : null}
  </section>
  ${mine && s.mode === "play" ? html`<section class="card" aria-label="Pick a card">
    ${s.helping && s.helping !== s.seat ? html`<div class="banner"><span class="grow">Picking for <b>${M.faction(ctx, act).short}</b></span><button class="btn small" onClick=${() => dispatch({ type: "help", id: null })}>Stop</button></div>` : null}
    <p class="eyebrow"><span>${act === s.seat ? "Your pick" : `${M.faction(ctx, act).short}'s pick`}</span></p>
    <ul class="list">${cards.map(([id, c]) => {
      const st = ctx.state.strategycards[id] || {};
      return html`<li><button class="opt" disabled=${!!st.faction} onClick=${() => open({ kind: "card", card: id, pickFor: act })}>
        <span class="num faint">${c.order}</span><span><b>${c.name}</b>${st.faction ? html` <span class="faint">· ${M.faction(ctx, st.faction).short}</span>` : null}</span>
        <span class="meta">${st.tradeGoods ? `${st.tradeGoods} trade good${st.tradeGoods > 1 ? "s" : ""}` : ""}</span></button></li>`;
    })}</ul>
  </section>` : null}`;
}

function sinceAdvance(ctx) {
  const out = [];
  for (let i = ctx.log.length - 1; i >= 0; i--) { if (ctx.log[i].action === "ADVANCE_PHASE") break; out.unshift(ctx.log[i]); }
  return out;
}

function NowStatus({ s, ctx, dispatch, open }) {
  const me = s.seat;
  const phaseLog = sinceAdvance(ctx);
  const scoredNow = (id, kind) => phaseLog.filter((e) => e.action === "SCORE_OBJECTIVE" && e.event.faction === id && (ctx.base.objectives[e.event.objective]?.type === "SECRET") === (kind === "secret") && e.event.objective !== "Support for the Throne");
  const revealedNow = phaseLog.some((e) => e.action === "REVEAL_OBJECTIVE");
  const speaker = ctx.state.state.speaker;
  const given = me ? M.sfttGivenTo(ctx, me) : null;
  return html`
  ${me ? html`<section class="card hero" style=${`--c:${PCOLOR(M.faction(ctx, me).color)}`}>
    <p class="eyebrow"><span>Your scoring</span><span class="num">One public, one secret</span></p>
    <div class="grid2">
      <button class="btn tall" disabled=${s.mode !== "play"} onClick=${() => open({ kind: "score", faction: me, filter: "public" })}>${scoredNow(me, "public").length ? html`Public ✓<span class="hint">${scoredNow(me, "public")[0].event.objective}</span>` : html`Score public<span class="hint">Revealed objectives</span>`}</button>
      <button class="btn tall" disabled=${s.mode !== "play"} onClick=${() => open({ kind: "score", faction: me, filter: "secret" })}>${scoredNow(me, "secret").length ? html`Secret ✓<span class="hint">${scoredNow(me, "secret")[0].event.objective}</span>` : html`Score secret<span class="hint">Shown to all once scored</span>`}</button>
    </div>
    <div class="row"><span class="grow"><b>Support for the Throne</b><br /><span class="sub">${given ? html`In ${M.faction(ctx, given).short}'s play area` : "Still in your hand"}</span></span>
      <button class="btn small" disabled=${s.mode !== "play"} onClick=${() => open({ kind: "give", giver: me })}>${given ? "Move" : "Give"}</button></div>
  </section>` : null}
  <section class="card" aria-label="Table scoring">
    <p class="eyebrow"><span>Scoring so far</span></p>
    <ul class="list">${M.speakerOrder(ctx).map((id) => {
      const p = scoredNow(id, "public"), q = scoredNow(id, "secret");
      return html`<li><${Chip} ctx=${ctx} id=${id} size="sm" /><span class="grow"></span>
        <span class=${`pill ${p.length ? "on" : ""}`}>${p.length ? "Public ✓" : "Public"}</span><span class=${`pill ${q.length ? "on" : ""}`}>${q.length ? "Secret ✓" : "Secret"}</span></li>`;
    })}</ul>
  </section>
  <section class="card" aria-label="Table steps">
    <p class="eyebrow"><span>Table steps</span></p>
    <div class="row"><span class="grow"><b>Reveal a public objective</b><br /><span class="sub">The speaker's job${revealedNow ? ": done" : ""}</span></span>
      ${revealedNow ? html`<span class="pill on">Done</span>` : html`<button class="btn small" disabled=${s.mode !== "play"} onClick=${() => open({ kind: "reveal", as: speaker })}>${me === speaker ? "Reveal" : `Do it for ${M.faction(ctx, speaker).short}`}</button>`}</div>
    <details><summary class="sub" style="min-height:44px;display:flex;align-items:center;cursor:pointer">Then on the board (not tracked)</summary>
      <p class="sub">Draw action cards · remove command tokens · gain and redistribute tokens · ready cards · repair units · return strategy cards.</p></details>
  </section>`;
}

function NowAgenda({ s, ctx, dispatch, open }) {
  const ag = M.currentAgenda(ctx);
  const me = s.seat;
  if (!ag) return html`<section class="card"><h2 class="title">Waiting for the next agenda</h2><p class="sub">The speaker reveals it.</p></section>`;
  const a = ctx.base.agendas[ag.id] || { name: ag.id, description: "" };
  const voted = new Map(ag.votes.map((v) => [v.event.faction, v.event]));
  const tally = {};
  for (const v of ag.votes) if (v.event.votes && v.event.target !== "Abstain") tally[v.event.target] = (tally[v.event.target] || 0) + v.event.votes + (v.event.extraVotes || 0);
  const order = M.speakerOrder(ctx);
  const sp = order.indexOf(ctx.state.state.speaker);
  const votingOrder = [...order.slice(sp + 1), ...order.slice(0, sp + 1)];
  const nextVoter = votingOrder.find((id) => !voted.has(id));
  return html`<section class="card">
    <p class="eyebrow"><span>Agenda · ${a.type === "LAW" ? "Law" : "Directive"}</span><span>${!a.elect || a.elect === "For/Against" ? "For or against" : `Elect a ${a.elect.toLowerCase()}`}</span></p>
    <h2 class="title">${a.name}</h2>
    <p class="text sub">${a.description}</p>
  </section>
  ${me && !voted.has(me) ? html`<${VoteCard} s=${s} ctx=${ctx} dispatch=${dispatch} agenda=${a} who=${me} />` : null}
  <section class="card" aria-label="Votes">
    <p class="eyebrow"><span>Votes</span><span class="num">${voted.size} of ${order.length}</span></p>
    ${Object.keys(tally).length ? html`<div class="ticks">${Object.entries(tally).sort((x, y) => y[1] - x[1]).map(([t, v]) => html`<span class="pill on">${ctx.state.factions[t] ? M.faction(ctx, t).short : t}: <b class="num">${v}</b></span>`)}</div>` : null}
    <ul class="list">${votingOrder.map((id) => {
      const v = voted.get(id);
      return html`<li><${Chip} ctx=${ctx} id=${id} size="sm" /><span class="grow"></span>
        ${v ? html`<span class="pill on">${v.votes ? `${v.votes + (v.extraVotes || 0)} · ${ctx.state.factions[v.target] ? M.faction(ctx, v.target).short : v.target}` : "Abstained"}</span>`
          : id === nextVoter ? html`${id !== me && s.mode === "play" ? html`<button class="btn small help" onClick=${() => open({ kind: "voteFor", who: id })}>Vote for ${M.faction(ctx, id).short}</button>` : html`<span class="pill now">Voting</span>`}`
          : html`<span class="faint">Waiting</span>`}</li>`;
    })}</ul>
  </section>`;
}

function outcomes(ctx, agenda) {
  const elect = agenda.elect || "For/Against";
  if (elect === "For/Against") return ["For", "Against"];
  if (/Player/.test(elect)) return M.speakerOrder(ctx);
  if (/Planet/.test(elect)) return Object.keys(ctx.state.planets || {}).filter((p) => ctx.state.planets[p].owner).slice(0, 12);
  return ["For", "Against"];
}

function VoteCard({ s, ctx, dispatch, agenda, who, onDone }) {
  const max = M.availableVotes(ctx, who);
  const opts = outcomes(ctx, agenda);
  const [target, setTarget] = useState(null);
  const [n, setN] = useState(max);
  const label = (t) => (ctx.state.factions[t] ? M.faction(ctx, t).short : t);
  const cast = (votes) => { dispatch({ type: "do", op: A.castVotes(ctx, who, votes, votes ? target : "Abstain"), as: who }); onDone?.(); };
  return html`<section class="card hero" style=${`--c:${PCOLOR(M.faction(ctx, who).color)}`} aria-label="Your vote">
    <p class="eyebrow"><span>${who === s.seat ? "Your vote" : `${M.faction(ctx, who).short}'s vote`}</span><span class="num">${max} available</span></p>
    <div class="pick">${opts.map((t) => html`<button aria-pressed=${target === t} onClick=${() => setTarget(t)}>${ctx.state.factions[t] ? html`<${Chip} ctx=${ctx} id=${t} size="sm" player=${false} />` : html`<b>${t}</b>`}</button>`)}</div>
    <div class="stepper">
      <button aria-label="One fewer vote" onClick=${() => setN(Math.max(0, n - 1))} disabled=${n <= 0}>−</button>
      <output aria-live="polite">${n}</output>
      <button aria-label="One more vote" onClick=${() => setN(Math.min(max, n + 1))} disabled=${n >= max}>+</button>
    </div>
    <p class="sub">Counted from the influence of your planets (the prototype treats all as ready). Most groups vote everything or nothing, so the full count is preset.</p>
    <button class="btn primary tall block" disabled=${!target || s.mode !== "play"} onClick=${() => cast(n)}>${target ? `Cast ${n} vote${n === 1 ? "" : "s"} for ${label(target)}` : "Choose an outcome"}</button>
    <button class="btn ghost block" disabled=${s.mode !== "play"} onClick=${() => cast(0)}>Abstain</button>
  </section>`;
}

function NowEnd({ ctx, open }) {
  const times = M.timeByPlayer(ctx);
  return html`<section class="card"><p class="eyebrow"><span>Final score</span></p>
    <ul class="list">${M.race(ctx).map((r, k) => html`<li><span class="num faint">${k + 1}</span><button class="opt" style="border:0;padding:0" onClick=${() => open({ kind: "player", id: r.id })}>
      <${Chip} ctx=${ctx} id=${r.id} /><span class="meta"><span class="num" style="font-size:1.2rem;color:var(--ink)">${r.total}</span> pts · ${M.fmtClock(times.play[r.id], true)}</span></button></li>`)}</ul></section>`;
}

// ---------------- Table, Map, Log ----------------

function TableView({ s, ctx, open }) {
  const act = M.active(ctx);
  const laws = M.lawsInEffect(ctx);
  return html`<section class="card" aria-label="Players">
    <p class="eyebrow"><span>Players by points</span></p>
    <ul class="list">${M.race(ctx).map((r) => {
      const cards = M.cardsOf(ctx, r.id);
      return html`<li><button class="opt" style="border:0;padding:0" onClick=${() => open({ kind: "player", id: r.id })}>
        <${Chip} ctx=${ctx} id=${r.id} />
        <span class="meta row" style="gap:6px">
          ${r.id === act ? html`<span class="pill now">Playing</span>` : null}
          ${M.hasPassed(ctx, r.id) ? html`<span class="pill">Passed</span>` : null}
          ${ctx.state.state.speaker === r.id ? html`<span class="pill">Speaker</span>` : null}
          ${cards.map((c) => html`<span class=${`pill ${c.used ? "" : "on"}`}>${c.order} ${c.card}</span>`)}
          <span class="num" style="font-size:1.2rem;color:var(--ink);min-width:2ch;text-align:right">${r.total}</span>
        </span></button></li>`;
    })}</ul>
  </section>
  ${laws.length ? html`<section class="card" aria-label="Laws in effect"><p class="eyebrow"><span>Laws in effect</span></p>
    <ul class="list">${laws.map((l) => html`<li><button class="opt" style="border:0;padding:0" onClick=${() => open({ kind: "agenda", id: l.id })}><b>${l.id}</b><span class="meta">${ctx.state.factions[l.target] ? M.faction(ctx, l.target).short : l.target}</span></button></li>`)}</ul></section>` : null}`;
}

function PlayerSheet({ s, ctx, id, close, open }) {
  const f = M.faction(ctx, id);
  const pts = M.points(ctx, id);
  const planets = M.planetsOf(ctx, id);
  const techs = M.techsOf(ctx, id);
  const leaders = M.leadersOf(ctx, id);
  const relics = M.relicsOf(ctx, id);
  const area = M.playArea(ctx, id);
  const played = M.actionCardsPlayed(ctx, id);
  const times = M.timeByPlayer(ctx);
  const cards = M.cardsOf(ctx, id);
  const res = planets.reduce((n, p) => n + p.res, 0), inf = planets.reduce((n, p) => n + p.inf, 0);
  return html`<${Sheet} title=${f.name} onClose=${close} lead=${html`<${Swatch} ctx=${ctx} id=${id} size="lg" />`}>
    <p class="sub">${f.player}${ctx.state.state.speaker === id ? " · Speaker" : ""}${M.hasPassed(ctx, id) ? " · Passed" : ""}</p>
    <section><p class="eyebrow"><span>Points</span><span class="num">${pts.total} of ${ctx.meta.victoryPoints}</span></p>
      <ul class="list">${pts.groups.map((g) => html`<li><span class="grow"><b>${g.label}</b><br /><span class="sub">${g.items.join(", ")}</span></span><span class="num">${g.points}</span></li>`)}${!pts.groups.length ? html`<li class="sub">No points yet</li>` : null}</ul></section>
    <section><p class="eyebrow"><span>Strategy card</span></p>
      ${cards.length ? cards.map((c) => html`<button class="opt" onClick=${() => open({ kind: "card", card: c.card })}><span class="num faint">${c.order}</span><b>${c.card}</b><span class="meta">${c.used ? "Played" : "Not played yet"}</span></button>`) : html`<p class="sub">None this round</p>`}</section>
    <section><p class="eyebrow"><span>Technology</span><span class="num">${Object.values(techs).flat().length}</span></p>
      <div class="techs">${["BLUE", "GREEN", "YELLOW", "RED", "UPGRADE"].filter((k) => techs[k]).map((k) => html`<div class="grp"><span class="dot ${k}" aria-hidden="true"></span>${techs[k].map((t) => html`<button class="pill" style="min-height:36px;cursor:pointer" onClick=${() => open({ kind: "tech", id: t })}>${t}</button>`)}</div>`)}</div></section>
    <section><p class="eyebrow"><span>Planets</span><span class="num">${planets.length} · ${res} res · ${inf} inf</span></p>
      <p class="sub">${planets.map((p) => `${p.name}${p.attachments.length ? ` (+${p.attachments.join(", ")})` : ""}`).join(", ") || "None"}</p></section>
    <section><p class="eyebrow"><span>Leaders</span></p>
      <ul class="list">${leaders.map((l) => html`<li><span class="grow"><b>${l.name}</b> <span class="faint">${l.type.toLowerCase()}</span></span><span class=${`pill ${l.state === "readied" ? "on" : ""}`}>${l.state === "readied" ? "Unlocked" : l.state === "purged" ? "Used (purged)" : l.state === "exhausted" ? "Exhausted" : "Locked"}</span></li>`)}</ul></section>
    ${relics.length || area.length ? html`<section><p class="eyebrow"><span>In play</span></p><ul class="list">
      ${relics.map((r) => html`<li><button class="opt" style="border:0;padding:0" onClick=${() => open({ kind: "relic", id: r.name })}><b>${r.name}</b><span class="meta">Relic</span></button></li>`)}
      ${area.map((a) => html`<li><b>${a.card}</b><span class="grow"></span><span class="sub">from ${M.faction(ctx, a.from).short}</span></li>`)}
    </ul></section>` : null}
    <section><p class="eyebrow"><span>Action cards played</span><span class="num">${played.length}</span></p><p class="sub">${played.join(", ") || "None recorded"}</p></section>
    <section><p class="eyebrow"><span>Time</span></p><p class="sub"><span class="num">${M.fmtClock(times.play[id], true)}</span> on turns${times.combat[id] ? html` · <span class="num">${M.fmtClock(times.combat[id], true)}</span> in combat` : ""}</p></section>
  <//>`;
}

// Hex board: upstream's spiral (centre, then rings clockwise from the top), flat-top hexes.
function spiral(rings) {
  const dirs = [[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]];
  const out = [[0, 0]];
  for (let r = 1; r < rings; r++) {
    let q = 0, rr = -r;
    for (const [dq, dr] of dirs) for (let k = 0; k < r; k++) { out.push([q, rr]); q += dq; rr += dr; }
  }
  return out;
}

function MapView({ s, ctx, open }) {
  const tokens = ctx.meta.mapString.split(/\s+/);
  const rings = Math.ceil((3 + Math.sqrt(9 - 12 * (1 - tokens.length))) / 6);
  const pos = spiral(rings);
  const size = 34;
  const homeOf = (k) => {
    const seat = ctx.meta.seats.find((x) => x.mapPosition === k - 1);
    if (!seat) return null;
    const home = Object.values(ctx.base.planets).find((p) => p.faction === seat.id && p.home);
    return { system: home ? String(home.system) : null, faction: seat.id };
  };
  const tiles = tokens.map((tok, i) => {
    const [q, r] = pos[i] || [0, 0];
    const x = size * 1.5 * q, y = size * (Math.sqrt(3) / 2 * q + Math.sqrt(3) * r);
    const home = /^P\d$/.test(tok) ? homeOf(Number(tok.slice(1))) : null;
    const sys = home?.system || tok;
    const planets = ctx.base.systems[sys]?.planets?.length ? ctx.base.systems[sys].planets : i === 0 ? ["Mecatol Rex"] : [];
    return { i, x, y, sys: i === 0 ? "Mecatol Rex" : sys, home: home?.faction, planets };
  });
  const xs = tiles.map((t) => t.x), ys = tiles.map((t) => t.y);
  const pad = size + 4;
  const vb = `${Math.min(...xs) - pad} ${Math.min(...ys) - pad} ${Math.max(...xs) - Math.min(...xs) + pad * 2} ${Math.max(...ys) - Math.min(...ys) + pad * 2}`;
  const hex = (cx, cy) => Array.from({ length: 6 }, (_, k) => { const a = (Math.PI / 3) * k; return `${cx + (size - 1.5) * Math.cos(a)},${cy + (size - 1.5) * Math.sin(a)}`; }).join(" ");
  const owner = (p) => ctx.state.planets?.[p]?.owner;
  return html`<section class="card map" aria-label="Board">
    <p class="eyebrow"><span>Board</span><span>By owner</span></p>
    <svg viewBox=${vb} role="img" aria-label="Map of the board">
      ${tiles.map((t) => html`<g>
        <polygon class=${`tile ${t.home ? "home" : ""}`} points=${hex(t.x, t.y)} tabindex="0" role="button" aria-label=${`System ${t.sys}${t.planets.length ? `: ${t.planets.join(", ")}` : ""}`}
          onClick=${() => t.planets.length && open({ kind: "system", system: t.sys, planets: t.planets })}
          onKeyDown=${(e) => (e.key === "Enter" || e.key === " ") && t.planets.length && open({ kind: "system", system: t.sys, planets: t.planets })} />
        ${t.home ? html`<image href=${ICONS[t.home]} x=${t.x - 11} y=${t.y - 22} width="22" height="22" style="pointer-events:none" />` : null}
        ${t.planets.map((p, k) => {
          const o = owner(p);
          const n = t.planets.length;
          const px = t.x + (n > 1 ? (k - (n - 1) / 2) * 16 : 0), py = t.y + (t.home ? 9 : 0);
          return html`<circle cx=${px} cy=${py} r="6.5" style=${`pointer-events:none;fill:${o ? PCOLOR(M.faction(ctx, o).color) : "var(--raise)"};stroke:${o && M.faction(ctx, o).color === "Black" ? "var(--p-black-ring)" : "var(--line)"};stroke-width:1.5`} />`;
        })}
        ${!t.home ? html`<text x=${t.x} y=${t.y + size * 0.62} text-anchor="middle" style="pointer-events:none">${t.sys}</text>` : null}
      </g>`)}
    </svg>
    <p class="sub">Tap a system for its planets. A schematic, not the tile art.</p>
  </section>`;
}

function LogView({ s, ctx, dispatch }) {
  const [who, setWho] = useState(null);
  const rows = [];
  let lastHead = null;
  for (let i = ctx.log.length - 1; i >= 0 && rows.length < 400; i--) {
    const e = ctx.log[i];
    const sTxt = M.sentence(ctx, e);
    if (!sTxt) continue;
    if (who && M.subject(ctx, e) !== who) continue;
    const head = e.at ? `Round ${e.at.round} · ${M.PHASES[e.at.phase] || e.at.phase}` : "";
    if (head !== lastHead) { rows.push({ head }); lastHead = head; }
    rows.push({ e, s: sTxt });
  }
  const last = s.history[s.history.length - 1];
  return html`<section class="card" aria-label="Log">
    <p class="eyebrow"><span>Game log</span><span>Newest first</span></p>
    ${last && s.mode === "play" ? html`<div class="banner"><span class="grow">Last action: ${last.label}</span><button class="btn small" onClick=${() => dispatch({ type: "undo" })}>Undo</button></div>` : null}
    <div class="row" style="overflow-x:auto;gap:6px;padding-bottom:4px">
      <button class=${`pill ${who ? "" : "on"}`} style="min-height:44px;cursor:pointer;background:none" onClick=${() => setWho(null)}>Everyone</button>
      ${M.speakerOrder(ctx).map((id) => html`<button class=${`pill ${who === id ? "on" : ""}`} style="min-height:44px;cursor:pointer;background:none" onClick=${() => setWho(who === id ? null : id)}><${Swatch} ctx=${ctx} id=${id} size="sm" /> ${M.faction(ctx, id).short}</button>`)}
    </div>
    <ul class="feed">${rows.map((r) => (r.head ? html`<li><span class="hd">${r.head}</span></li>` : html`<${FeedRow} ctx=${ctx} e=${r.e} s=${r.s} />`))}</ul>
  </section>`;
}

// ---------------- sheets ----------------

function PickList({ items, onPick, placeholder, render: renderItem }) {
  const [q, setQ] = useState("");
  const shown = items.filter((it) => !q || it.label.toLowerCase().includes(q.toLowerCase()));
  return html`<input class="search" id="pick-search" type="search" placeholder=${placeholder || "Search"} value=${q} onInput=${(e) => setQ(e.target.value)} aria-label=${placeholder || "Search"} />
    ${shown.some((it) => it.group) ? null : null}
    <div>${shown.slice(0, 60).map((it, k) => html`${it.group && it.group !== shown[k - 1]?.group ? html`<p class="eyebrow" style="margin-top:8px"><span>${it.group}</span></p>` : null}
      <button class="opt" onClick=${() => onPick(it)} disabled=${it.disabled}>${renderItem ? renderItem(it) : html`<b>${it.label}</b>`}<span class="meta">${it.meta || ""}</span></button>`)}</div>`;
}

function Sheets({ s, ctx, dispatch }) {
  const sh = s.sheet;
  if (!sh) return null;
  const close = () => dispatch({ type: "sheet", sheet: null });
  const open = (sheet) => dispatch({ type: "sheet", sheet });
  const doAs = (op, as) => dispatch({ type: "do", op, as });
  const short = (id) => M.faction(ctx, id).short;
  switch (sh.kind) {
    case "player": return html`<${PlayerSheet} s=${s} ctx=${ctx} id=${sh.id} close=${close} open=${open} />`;
    case "card": {
      const c = ctx.base.strategycards[sh.card];
      return html`<${Sheet} title=${c.name} onClose=${close}>
        <p class="eyebrow"><span>Primary</span></p><p class="text">${c.primary}</p>
        <p class="eyebrow"><span>Secondary</span></p><p class="text">${c.secondary}</p>
        ${sh.pickFor && s.mode === "play" ? html`<button class="btn primary tall block" onClick=${() => doAs({ ...A.pickCard(ctx, sh.pickFor, sh.card), endsHelp: true }, sh.pickFor)}>${sh.pickFor === s.seat ? `Pick ${c.name}` : `Pick ${c.name} for ${short(sh.pickFor)}`}</button>` : null}
      <//>`;
    }
    case "tech": { const t = ctx.base.techs[sh.id] || {}; return html`<${Sheet} title=${sh.id} onClose=${close}><p class="text">${t.description || ""}</p><//>`; }
    case "relic": { const r = ctx.base.relics[sh.id] || {}; return html`<${Sheet} title=${sh.id} onClose=${close}><p class="text">${r.description || ""}</p><//>`; }
    case "agenda": { const a = ctx.base.agendas[sh.id] || {}; return html`<${Sheet} title=${sh.id} onClose=${close}><p class="text">${a.description || ""}</p><//>`; }
    case "claim": {
      const items = Object.values(ctx.base.planets)
        .filter((p) => ctx.state.planets?.[p.id]?.owner !== sh.faction && !(p.home && p.faction))
        .map((p) => { const o = ctx.state.planets?.[p.id]?.owner; return { id: p.id, label: p.id, group: o ? "Held by another player" : "Unclaimed", meta: `${p.resources}/${p.influence}${o ? ` · ${short(o)}` : ""}` }; })
        .sort((a, b) => (a.group === b.group ? a.label.localeCompare(b.label) : a.group === "Unclaimed" ? -1 : 1));
      return html`<${Sheet} title=${`${short(sh.faction)} takes control of…`} onClose=${close}>
        <${PickList} items=${items} placeholder="Find a planet" onPick=${(it) => doAs(A.claimPlanet(ctx, sh.faction, it.id), sh.faction)} />
      <//>`;
    }
    case "system": return html`<${Sheet} title=${`System ${sh.system}`} onClose=${close}>
      ${sh.planets.map((p) => { const o = ctx.state.planets?.[p]?.owner; const b = ctx.base.planets[p] || {};
        return html`<div class="row" style="min-height:52px"><span class="grow"><b>${p}</b> <span class="num faint">${b.resources}/${b.influence}</span><br />${o ? html`<${Chip} ctx=${ctx} id=${o} size="sm" />` : html`<span class="sub">Unclaimed</span>`}</span>
          ${s.mode === "play" && s.seat && o !== s.seat ? html`<button class="btn small" onClick=${() => doAs(A.claimPlanet(ctx, s.seat, p), s.seat)}>Take for ${short(s.seat)}</button>` : null}</div>`; })}
    <//>`;
    case "score": {
      const phaseOK = (o) => sh.filter === "secret" ? o.type === "SECRET" : sh.filter === "public" ? (o.type === "STAGE ONE" || o.type === "STAGE TWO") : true;
      const revealed = (id) => ctx.state.objectives?.[id]?.selected;
      const scored = (id) => (ctx.state.objectives?.[id]?.scorers || []).includes(sh.faction);
      const items = Object.values(ctx.base.objectives)
        .filter((o) => phaseOK(o) && (o.type === "SECRET" || revealed(o.id)) && o.type !== "OTHER" && !o.removedIn)
        .map((o) => ({ id: o.id, label: o.name, group: o.type === "SECRET" ? "Secret objectives" : o.type === "STAGE ONE" ? "Stage I" : "Stage II", meta: scored(o.id) ? "Scored" : `${o.points} pt`, disabled: scored(o.id) && !o.repeatable, desc: o.description }));
      return html`<${Sheet} title=${sh.filter === "secret" ? "Score a secret objective" : sh.filter === "public" ? "Score a public objective" : "Score an objective"} onClose=${close}>
        ${sh.filter === "secret" ? html`<p class="sub">Hands aren't tracked, so every secret is listed. It's public once scored.</p>` : null}
        <${PickList} items=${items} placeholder="Find an objective" render=${(it) => html`<span style="display:grid;text-align:left"><b>${it.label}</b><span class="sub">${it.desc}</span></span>`} onPick=${(it) => doAs(A.scoreObjective(ctx, sh.faction, it.id), sh.faction)} />
      <//>`;
    }
    case "research": {
      const owned = new Set(ctx.state.factions[sh.faction]?.techs || []);
      const items = Object.values(ctx.base.techs).filter((t) => !owned.has(t.id) && !t.removedIn && (!t.faction || t.faction === sh.faction))
        .map((t) => ({ id: t.id, label: t.name, group: { RED: "Warfare (red)", BLUE: "Propulsion (blue)", GREEN: "Biotic (green)", YELLOW: "Cybernetic (yellow)", UPGRADE: "Unit upgrades" }[t.type] || "Other", meta: (t.prereqs || []).map((p) => p[0]).join("") }));
      items.sort((a, b) => a.group.localeCompare(b.group) || a.label.localeCompare(b.label));
      return html`<${Sheet} title=${`${short(sh.faction)} researches…`} onClose=${close}><${PickList} items=${items} placeholder="Find a technology" onPick=${(it) => doAs(A.research(ctx, sh.faction, it.id), sh.faction)} /><//>`;
    }
    case "actionCard": {
      const items = Object.values(ctx.base.actionCards).filter((c) => !c.removedIn).map((c) => ({ id: c.id, label: c.name, desc: c.description, group: c.timing === "COMPONENT_ACTION" ? "Action cards (ACTION:)" : "Other timings" }));
      items.sort((a, b) => a.group.localeCompare(b.group) || a.label.localeCompare(b.label));
      return html`<${Sheet} title=${`${short(sh.faction)} plays an action card`} onClose=${close}>
        <p class="sub">A new feature: upstream can't record most action cards. Played cards show on the player's sheet.</p>
        <${PickList} items=${items} placeholder="Find a card" render=${(it) => html`<span style="display:grid;text-align:left"><b>${it.label}</b><span class="sub">${it.desc}</span></span>`} onPick=${(it) => doAs(A.playActionCard(ctx, sh.faction, it.id), sh.faction)} />
      <//>`;
    }
    case "component": return html`<${Sheet} title="Component action" onClose=${close}>
      <p class="sub">Faction abilities, techs, relics, leaders, promissory notes and ACTION cards. In the real build each one opens upstream's existing flow (55 special cases), so new expansions keep working.</p>
      <button class="btn primary block" onClick=${() => doAs(A.selectAction(ctx, sh.faction, "Component"), sh.faction)}>Record a component action</button>
      <button class="btn block" onClick=${() => { doAs(A.selectAction(ctx, sh.faction, "Component"), sh.faction); open({ kind: "actionCard", faction: sh.faction }); }}>It was an action card</button>
    <//>`;
    case "confirmPass": return html`<${Sheet} title="Pass for the round?" onClose=${close}>
      <p class="sentence">${short(sh.faction)} passes and takes no more turns this round.</p>
      <button class="btn primary tall block" onClick=${() => doAs({ ...A.pass(ctx, sh.faction), endsHelp: true }, sh.faction)}>Pass</button>
    <//>`;
    case "combat": {
      const others = M.speakerOrder(ctx).filter((id) => id !== sh.faction);
      return html`<${CombatPick} ctx=${ctx} attacker=${sh.faction} others=${others} close=${close} onStart=${(def, place) => doAs(A.startCombat(ctx, sh.faction, def, place), sh.faction)} />`;
    }
    case "endCombat": {
      const c = s.combat;
      return html`<${Sheet} title=${`End combat in ${c.place}`} onClose=${close}>
        <p class="sub">The combat clock counted for both players, separate from their turns.</p>
        <div class="pick">${[c.attacker, c.defender].map((id) => html`<button onClick=${() => doAs(A.endCombat(ctx, c, id), id)}><${Chip} ctx=${ctx} id=${id} size="sm" player=${false} /> won</button>`)}</div>
        <button class="btn block" onClick=${() => doAs(A.endCombat(ctx, c, null))}>No winner (retreat or draw)</button>
      <//>`;
    }
    case "secondaries": {
      const act = M.active(ctx);
      const sel = M.selectedAction(ctx);
      const done = new Map(M.currentTurn(ctx).filter((e) => e.action === "MARK_SECONDARY").map((e) => [e.event.faction, e.event.state]));
      return html`<${Sheet} title=${`${sel}: secondaries`} onClose=${close}>
        <p class="sub">Each player usually marks their own from their phone. Marking for someone is helping.</p>
        <ul class="list">${M.speakerOrder(ctx).filter((id) => id !== act).map((id) => html`<li><${Chip} ctx=${ctx} id=${id} size="sm" /><span class="grow"></span>
          ${done.has(id) ? html`<span class="pill on">${done.get(id) === "DONE" ? "Followed" : "Skipped"}</span>` : html`<button class="btn small" onClick=${() => dispatch({ type: "do", op: A.markSecondary(ctx, id, "DONE"), as: id, keepSheet: true })}>Followed</button><button class="btn small ghost" onClick=${() => dispatch({ type: "do", op: A.markSecondary(ctx, id, "SKIPPED"), as: id, keepSheet: true })}>Skipped</button>`}</li>`)}</ul>
      <//>`;
    }
    case "give": return html`<${GiveSheet} ctx=${ctx} giver=${sh.giver} close=${close} onGive=${(holder) => doAs(A.giveSftt(ctx, sh.giver, holder), sh.giver)} />`;
    case "reveal": {
      const items = Object.values(ctx.base.objectives).filter((o) => (o.type === "STAGE ONE" || o.type === "STAGE TWO") && !o.removedIn && !ctx.state.objectives?.[o.id]?.selected)
        .map((o) => ({ id: o.id, label: o.name, group: o.type === "STAGE ONE" ? "Stage I" : "Stage II", desc: o.description }));
      return html`<${Sheet} title="Reveal a public objective" onClose=${close}>
        <${PickList} items=${items} placeholder="Find the objective you flipped" render=${(it) => html`<span style="display:grid;text-align:left"><b>${it.label}</b><span class="sub">${it.desc}</span></span>`} onPick=${(it) => doAs(A.revealObjective(ctx, it.id), sh.as)} />
      <//>`;
    }
    case "voteFor": {
      const ag = M.currentAgenda(ctx);
      return html`<${Sheet} title=${`Vote for ${short(sh.who)}`} onClose=${close}>
        <${VoteCard} s=${s} ctx=${ctx} dispatch=${dispatch} agenda=${ctx.base.agendas[ag.id] || { name: ag.id }} who=${sh.who} onDone=${close} />
      <//>`;
    }
    case "seat": return html`<${Sheet} title="Whose phone is this?" onClose=${close}>
      <p class="sub">Your seat decides what this phone leads with. It doesn't limit what you can do.</p>
      <div class="pick">${M.speakerOrder(ctx).map((id) => html`<button aria-pressed=${s.seat === id} onClick=${() => dispatch({ type: "seat", id })}><${Chip} ctx=${ctx} id=${id} size="sm" /></button>`)}
        <button aria-pressed=${!s.seat} onClick=${() => dispatch({ type: "seat", id: null })}><b>Just watching</b></button></div>
    <//>`;
    case "proto": return html`<${ProtoSheet} s=${s} dispatch=${dispatch} close=${close} />`;
    default: return null;
  }
}

function CombatPick({ ctx, attacker, others, close, onStart }) {
  const [def, setDef] = useState(null);
  const [place, setPlace] = useState("");
  const recent = M.currentTurn(ctx).filter((e) => e.action === "CLAIM_PLANET").map((e) => e.event.planet);
  return html`<${Sheet} title=${`${M.faction(ctx, attacker).short} starts a combat`} onClose=${close}>
    <p class="eyebrow"><span>Against</span></p>
    <div class="pick">${others.map((id) => html`<button aria-pressed=${def === id} onClick=${() => setDef(id)}><${Chip} ctx=${ctx} id=${id} size="sm" player=${false} /></button>`)}</div>
    <p class="eyebrow"><span>Where</span></p>
    <input class="search" id="combat-place" placeholder="System or planet" value=${place} onInput=${(e) => setPlace(e.target.value)} aria-label="Where" />
    ${recent.length ? html`<div class="ticks">${recent.map((p) => html`<button class="pill" style="min-height:40px;cursor:pointer;background:none" onClick=${() => setPlace(p)}>${p}</button>`)}</div>` : null}
    <button class="btn primary tall block" disabled=${!def} onClick=${() => onStart(def, place.trim() || "the active system")}>Start the combat clock</button>
  <//>`;
}

function GiveSheet({ ctx, giver, close, onGive }) {
  const [to, setTo] = useState(null);
  const prev = M.sfttGivenTo(ctx, giver);
  const g = M.faction(ctx, giver).short;
  const t = to ? M.faction(ctx, to).short : null;
  return html`<${Sheet} title="Support for the Throne" onClose=${close}>
    <p class="sub">${prev ? `Now in ${M.faction(ctx, prev).short}'s play area. Choose who should hold it instead.` : `${g}'s card. Choose who receives it.`}</p>
    <div class="pick">${M.speakerOrder(ctx).filter((id) => id !== giver).map((id) => html`<button aria-pressed=${to === id} disabled=${id === prev} onClick=${() => setTo(id)}><${Chip} ctx=${ctx} id=${id} size="sm" player=${false} />${id === prev ? html`<span class="faint"> holds it</span>` : null}</button>`)}</div>
    ${to ? html`<p class="sentence">${prev ? `${g} moves Support for the Throne from ${M.faction(ctx, prev).short} to ${t}. ${M.faction(ctx, prev).short} loses 1 victory point and ${t} gains 1.` : `${g} gives ${t} Support for the Throne, granting ${t} +1 victory point.`}</p>
      <button class="btn primary tall block" onClick=${() => onGive(to)}>Confirm</button>` : null}
  <//>`;
}

function ProtoSheet({ s, dispatch, close }) {
  const sc = s.data.scenarios;
  const order = ["strategy", "action", "status", "agenda", "late", "end"];
  return html`<${Sheet} title="Prototype controls" onClose=${close}>
    <p class="sub">Not part of the design. Each scenario is the real replayed game at that moment. Your changes stay on this phone and can be undone.</p>
    <p class="eyebrow"><span>Jump to a moment</span></p>
    ${order.map((k) => html`<button class="opt" onClick=${() => dispatch({ type: "scenario", name: k })} aria-current=${s.scenario === k}><b>${sc[k].label}</b><span class="meta">${s.scenario === k ? "Here" : ""}</span></button>`)}
    <p class="eyebrow"><span>Watch the real game</span></p>
    <button class="opt" onClick=${() => dispatch({ type: "watch" })}><b>Step through round 3 as it was played</b><span class="meta">${s.data.window.length} steps</span></button>
    <p class="eyebrow"><span>Theme</span></p>
    <div class="grid2"><button class="btn" onClick=${() => document.documentElement.setAttribute("data-theme", "dark")}>Dark</button><button class="btn" onClick=${() => document.documentElement.setAttribute("data-theme", "light")}>Light</button></div>
  <//>`;
}

// ---------------- shell ----------------

function App() {
  const [s, dispatch] = useReducer(reducer, { data: null, tab: "now", sheet: null, toast: null });
  useEffect(() => {
    fetch("data/game.json").then((r) => r.json()).then((data) => {
      data.log = M.annotate(data.log);
      const w = data.frames.map((f, k) => [f, k]).filter(([f]) => f.state.state.round === 3 && ["ACTION", "STATUS", "AGENDA"].includes(f.state.state.phase)).map(([, k]) => k);
      data.window = w;
      dispatch({ type: "loaded", data });
    });
  }, []);
  useEffect(() => { const t = setInterval(() => dispatch({ type: "tick" }), 1000); return () => clearInterval(t); }, []);
  useEffect(() => {
    if (!s.toast) return;
    const t = setTimeout(() => dispatch({ type: "toast", toast: null }), 6000);
    return () => clearTimeout(t);
  }, [s.toast?.id]);
  if (!s.data) return html`<p style="padding:24px">Loading the game…</p>`;
  const ctx = ctxOf(s);
  const phase = ctx.state.state.phase;
  const act = M.active(ctx);
  const open = (sheet) => dispatch({ type: "sheet", sheet });
  const now = () => {
    if (phase === "STRATEGY") return html`<${NowStrategy} s=${s} ctx=${ctx} dispatch=${dispatch} open=${open} />`;
    if (phase === "ACTION") return html`<${NowAction} s=${s} ctx=${ctx} dispatch=${dispatch} open=${open} />`;
    if (phase === "STATUS") return html`<${NowStatus} s=${s} ctx=${ctx} dispatch=${dispatch} open=${open} />`;
    if (phase === "AGENDA") return html`<${NowAgenda} s=${s} ctx=${ctx} dispatch=${dispatch} open=${open} />`;
    return html`<${NowEnd} ctx=${ctx} open=${open} />`;
  };
  const side = html`
    ${phase === "ACTION" ? html`<${CardBoard} ctx=${ctx} onCard=${(card) => open({ kind: "card", card })} />` : null}
    <${Race} ctx=${ctx} onOpen=${(id) => open({ kind: "player", id })} />
    <${Recent} ctx=${ctx} onLog=${() => dispatch({ type: "tab", tab: "log" })} />`;
  const w = s.data.window;
  const pos = w.indexOf(s.frame);
  const scLabel = s.mode === "watch" ? "Watching the real round 3" : s.scenario === "watch-fork" ? "Playing on from the real game" : s.data.scenarios[s.scenario]?.label;
  return html`<div class="app">
    <div class="proto"><b>PROTOTYPE</b><span class="grow">${scLabel}</span><button onClick=${() => open({ kind: "proto" })}>Change</button></div>
    <header class="top">
      <div class="phase"><span class="p">${M.PHASES[phase] || phase}</span><span class="r">Round ${ctx.state.state.round} · <span class="clock">${M.fmtClock(M.clock(ctx), true)}</span></span></div>
      <div class="turn">${act && (phase === "ACTION" || phase === "STRATEGY") ? html`<span class="pill now" style="min-height:32px">${phase === "STRATEGY" ? "Picking:" : "Up:"} ${M.faction(ctx, act).short}</span>` : null}</div>
      <button class="seatbtn" onClick=${() => open({ kind: "seat" })} aria-label="Change seat">${s.seat ? html`<${Swatch} ctx=${ctx} id=${s.seat} size="sm" />` : null}<span><span class="you">You</span><br /><b>${s.seat ? M.faction(ctx, s.seat).short : "Watching"}</b></span></button>
    </header>
    ${s.tab === "now" ? html`<main class="split"><div class="cols">${now()}</div><div class="cols">${side}</div></main>` : null}
    ${s.tab === "table" ? html`<main><${TableView} s=${s} ctx=${ctx} open=${open} /></main>` : null}
    ${s.tab === "map" ? html`<main><${MapView} s=${s} ctx=${ctx} open=${open} /></main>` : null}
    ${s.tab === "log" ? html`<main><${LogView} s=${s} ctx=${ctx} dispatch=${dispatch} /></main>` : null}
    ${s.mode === "watch" ? html`<div class="replay" role="group" aria-label="Replay controls">
      <button aria-label="Back one step" onClick=${() => dispatch({ type: "step", frame: w[Math.max(0, pos - 1)] })}>◀</button>
      <span class="grow">Step ${pos + 1} of ${w.length}: ${(() => { const e = ctx.log[ctx.log.length - 1]; const who = M.subject(ctx, e); const t = M.sentence(ctx, e, { raw: true }); return `${who && !/^[A-Z]/.test(t || "") ? M.faction(ctx, who).short + " " : ""}${t || ""}`; })()}</span>
      <button aria-label="Forward one step" onClick=${() => dispatch({ type: "step", frame: w[Math.min(w.length - 1, pos + 1)] })}>▶</button>
      <button class="btn small" onClick=${() => dispatch({ type: "fork" })}>Play from here</button>
    </div>` : null}
    ${s.toast ? html`<div class="toast" role="status"><span>${s.toast.label}</span>${s.toast.undo && s.history.length ? html`<button onClick=${() => dispatch({ type: "undo" })}>Undo</button>` : null}</div>` : null}
    <nav class="tabs" aria-label="Sections">
      ${[["now", "Now"], ["table", "Table"], ["map", "Map"], ["log", "Log"]].map(([k, label]) => html`<button aria-current=${s.tab === k ? "page" : undefined} onClick=${() => dispatch({ type: "tab", tab: k })}>${Icon[k]}<span>${label}</span></button>`)}
    </nav>
    <${Sheets} s=${s} ctx=${ctx} dispatch=${dispatch} />
  </div>`;
}

render(html`<${App} />`, document.getElementById("app"));
