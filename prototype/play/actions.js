// Sandbox actions. Each returns { label, entries } and mutates the cloned game
// state it is given. The caller records the group so one Undo reverses it.
// Rules are simplified for the prototype and labelled as such in the UI.
import { active, onDeck, faction, speakerOrder, cardsOf, sfttGivenTo, hasPassed } from "./model.js";

const short = (ctx, id) => faction(ctx, id).short;

export function selectAction(ctx, f, action) {
  return { label: action === "Tactical" ? `${short(ctx, f)} took a tactical action` : action === "Component" ? `${short(ctx, f)} took a component action` : `${short(ctx, f)} played ${action}`, entries: [{ action: "SELECT_ACTION", event: { action } }], mutate() {} };
}

export function endTurn(ctx, f) {
  return {
    label: `${short(ctx, f)} ended their turn`,
    entries: [{ action: "END_TURN", event: {} }],
    mutate(g) { const next = onDeck(ctx); g.state.activeplayer = next || g.state.activeplayer; },
  };
}

export function pass(ctx, f) {
  return {
    label: `${short(ctx, f)} passed`,
    entries: [{ action: "SELECT_ACTION", event: { action: "Pass" } }, { action: "END_TURN", event: {} }],
    mutate(g) {
      g.factions[f].passed = true;
      const after = { ...ctx, state: g };
      g.state.activeplayer = onDeck(after) || f;
    },
  };
}

export function claimPlanet(ctx, f, planet) {
  const prev = ctx.state.planets?.[planet]?.owner;
  return {
    label: `${short(ctx, f)} took control of ${planet}${prev ? ` from ${short(ctx, prev)}` : ""}`,
    entries: [{ action: "CLAIM_PLANET", event: { faction: f, planet, prevOwner: prev } }],
    mutate(g) { g.planets[planet] = { ...(g.planets[planet] || {}), owner: f }; },
  };
}

export function scoreObjective(ctx, f, objective) {
  return {
    label: `${short(ctx, f)} scored ${objective}`,
    entries: [{ action: "SCORE_OBJECTIVE", event: { faction: f, objective } }],
    mutate(g) { const o = (g.objectives[objective] ||= {}); (o.scorers ||= []).push(f); },
  };
}

export function research(ctx, f, tech) {
  return {
    label: `${short(ctx, f)} researched ${tech}`,
    entries: [{ action: "ADD_TECH", event: { faction: f, tech } }],
    mutate(g) { const t = (g.factions[f].techs ||= []); if (!t.includes(tech)) t.push(tech); },
  };
}

export function markSecondary(ctx, f, state) {
  return {
    label: state === "DONE" ? `${short(ctx, f)} followed the secondary` : `${short(ctx, f)} skipped the secondary`,
    entries: [{ action: "MARK_SECONDARY", event: { faction: f, state } }],
    mutate(g) { g.factions[f].secondary = state; },
  };
}

export function markPrimary(ctx, f, card) {
  return {
    label: `${short(ctx, f)} finished ${card}'s primary`,
    entries: [{ action: "MARK_PRIMARY", event: { completed: true } }],
    mutate(g) { if (g.strategycards[card]) g.strategycards[card].used = true; },
  };
}

export function startCombat(ctx, attacker, defender, place) {
  return {
    label: `Combat: ${short(ctx, attacker)} attacked ${short(ctx, defender)} in ${place}`,
    entries: [{ action: "COMBAT_START", event: { attacker, defender, place } }],
    mutate() {},
  };
}

export function endCombat(ctx, fight, winner) {
  return {
    label: winner ? `${short(ctx, winner)} won the combat in ${fight.place}` : `Combat in ${fight.place} ended`,
    entries: [{ action: "COMBAT_END", event: { ...fight, winner } }],
    mutate() {},
  };
}

export function playActionCard(ctx, f, card) {
  return {
    label: `${short(ctx, f)} played ${card}`,
    entries: [{ action: "PLAY_ACTION_CARD", event: { faction: f, card } }],
    mutate() {},
  };
}

// Giving Support for the Throne: moving it from an earlier holder is one action.
export function giveSftt(ctx, giver, holder) {
  const prev = sfttGivenTo(ctx, giver);
  const entries = [];
  if (prev) entries.push({ action: "UNSCORE_OBJECTIVE", event: { faction: prev, objective: "Support for the Throne", key: giver } });
  entries.push({ action: "SCORE_OBJECTIVE", event: { faction: holder, objective: "Support for the Throne", key: giver } });
  return {
    label: prev ? `${short(ctx, giver)} moved Support for the Throne from ${short(ctx, prev)} to ${short(ctx, holder)}` : `${short(ctx, giver)} gave Support for the Throne to ${short(ctx, holder)}`,
    entries,
    mutate(g) {
      const o = (g.objectives["Support for the Throne"] ||= { selected: true });
      o.keyedScorers ||= {};
      o.scorers ||= [];
      if (prev) { const i = o.scorers.indexOf(prev); if (i >= 0) o.scorers.splice(i, 1); }
      o.keyedScorers[giver] = [holder];
      o.scorers.push(holder);
    },
  };
}

export function pickCard(ctx, f, card) {
  return {
    label: `${short(ctx, f)} picked ${card}`,
    entries: [{ action: "ASSIGN_STRATEGY_CARD", event: { id: card, assignedTo: f, pickedBy: f } }],
    mutate(g) {
      g.strategycards[card] = { ...(g.strategycards[card] || {}), faction: f };
      const after = { ...ctx, state: g };
      const order = speakerOrder(after);
      g.state.activeplayer = order.find((id) => !cardsOf(after, id).length) || "None";
    },
  };
}

export function castVotes(ctx, f, votes, target) {
  const what = ctx.state.factions[target] ? short(ctx, target) : target;
  return {
    label: votes ? `${short(ctx, f)} cast ${votes} vote${votes === 1 ? "" : "s"} for ${what}` : `${short(ctx, f)} abstained`,
    entries: [{ action: "CAST_VOTES", event: { faction: f, votes, target, extraVotes: 0 } }],
    mutate() {},
  };
}

export function revealObjective(ctx, objective) {
  return {
    label: `Revealed ${objective}`,
    entries: [{ action: "REVEAL_OBJECTIVE", event: { objective } }],
    mutate(g) { g.objectives[objective] = { ...(g.objectives[objective] || {}), selected: true }; },
  };
}

export function resolveAgenda(ctx, agenda, target) {
  const what = ctx.state.factions[target] ? short(ctx, target) : target;
  return {
    label: `${agenda} resolved: ${what}`,
    entries: [{ action: "RESOLVE_AGENDA", event: { agenda, target } }],
    mutate() {},
  };
}

export function canPass(ctx, f) {
  return cardsOf(ctx, f).every((c) => c.used) && !hasPassed(ctx, f);
}

export { active };
