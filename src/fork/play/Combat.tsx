"use client";
// Combat (task 4, version 1): start one from a tactical action with the opponent
// and place, a banner with a clock on every phone while it's open, and an end
// with a winner or no winner. The events are the fork's own (src/fork/actions).
import { useState } from "react";
import { useActionLog, useCurrentTurn, usePlanets } from "../../context/dataHooks";
import { getClaimedPlanets } from "../../util/actionLog";
import { Optional } from "../../util/types/types";
import { fmtDuration, openCombat } from "./logic";
import styles from "./play.module.scss";
import { useNow, type Ctx } from "./ui";
import { Button, Chip, Choices, cx, kit, RowLink, Sheet as KitSheet } from "../ui/kit";

export function useOpenCombat() {
  return openCombat(useActionLog());
}

export function CombatBanner({ ctx }: { ctx: Ctx }) {
  const { factions, short, open } = ctx;
  const combat = useOpenCombat();
  const now = useNow();
  if (!combat) return null;
  return (
    <section className={cx(kit.card, styles.hero)} aria-label="Combat">
      <p className={kit.eyebrow}><span>⚔ {combat.kind === "space" ? "Space combat" : `Ground combat${combat.planet ? ` on ${combat.planet}` : ""}`}</span><span className={kit.num}>{combat.end ? fmtDuration(combat.end - combat.start) : now ? fmtDuration(now - combat.start) : ""}</span></p>
      <div className={kit.line} style={{ flexWrap: "wrap", gap: 8 }}>
        <Chip faction={combat.attacker} factions={factions} short={short} small player={false} />
        <span className={kit.sub}>vs</span>
        <Chip faction={combat.defender} factions={factions} short={short} small player={false} />
      </div>
      <p className={kit.sub}>{combat.endedWithTurn ? "Its clock stopped when the turn ended. Record who won." : "The combat clock counts for both players, apart from their turns."}</p>
      <Button kind="primary" block onClick={() => open({ kind: "endCombat" })}>End combat</Button>
    </section>
  );
}

export function StartCombatButton({ attacker, ctx }: { attacker: FactionId; ctx: Ctx }) {
  if (useOpenCombat()) return null;
  return <RowLink onClick={() => ctx.open({ kind: "combat", attacker })} title="Start a combat" detail="Space or ground" />;
}

export function StartCombatSheet({ attacker, close, ctx }: { attacker: FactionId; close: () => void; ctx: Ctx }) {
  const { factions, short, w } = ctx;
  const planets = usePlanets();
  const currentTurn = useCurrentTurn();
  const [defender, setDefender] = useState<Optional<FactionId>>();
  const [kind, setKind] = useState<"space" | "ground">("space");
  const [planet, setPlanet] = useState<Optional<PlanetId>>();
  const [q, setQ] = useState("");
  const others = Object.values(factions).filter((f): f is Faction => !!f && f.id !== attacker).sort((a, b) => a.order - b.order).map((f) => f.id);
  const claimed = getClaimedPlanets(currentTurn, attacker).map((c) => c.planet);
  // Suggested: planets taken this turn and the defender's planets; search finds any other.
  const planetList = Object.values(planets).filter((p): p is Planet => !!p)
    .filter((p) => (q ? p.name.toLowerCase().includes(q.toLowerCase()) : claimed.includes(p.id) || (!!defender && p.owner === defender)))
    .sort((a, b) => Number(!claimed.includes(a.id)) - Number(!claimed.includes(b.id)) || a.name.localeCompare(b.name))
    .slice(0, 30);
  const ready = !!defender && (kind === "space" || !!planet);
  const start = async () => {
    if (!defender) return;
    const event: StartCombatEvent = { faction: attacker, defender, kind, ...(kind === "ground" && planet ? { planet } : {}) };
    const label = `${short(attacker)} started a ${kind} combat with ${short(defender)}${kind === "ground" && planet ? ` on ${planets[planet]?.name ?? planet}` : ""}`;
    if (await w.write([{ action: "START_COMBAT", event } as unknown as GameUpdateData], label, attacker)) close();
  };
  return (
    <KitSheet title={`${short(attacker)} starts a combat`} close={close}>
      <Choices label="Against whom?" value={defender} onChange={(v) => setDefender(v as FactionId)}
        options={others.map((id) => ({ value: id as string, label: <Chip faction={id} factions={factions} short={short} small player={false} /> }))} />
      <Choices label="Where?" value={kind} onChange={setKind} options={[{ value: "space", label: "Space" }, { value: "ground", label: "Ground" }]} />
      {kind === "ground" ? (
        <>
          <input className={kit.search} type="search" placeholder="Find the planet" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find the planet" />
          {planetList.length ? (
            <Choices list label="On which planet?" value={planet} onChange={(v) => setPlanet(v as PlanetId)}
              options={planetList.map((p) => ({ value: p.id as string, label: <b>{p.name}</b>, note: claimed.includes(p.id) ? "taken this turn" : p.owner ? short(p.owner) : undefined }))} />
          ) : <p className={kit.sub}>{defender ? "Search for the planet." : "Choose the opponent, or search for the planet."}</p>}
        </>
      ) : null}
      {ready ? (
        <>
          <p className={kit.confirm}>
            {short(attacker)} starts a {kind} combat with {short(defender)}{kind === "ground" && planet ? ` on ${planets[planet]?.name ?? planet}` : ""}?
          </p>
          <Button kind="primary" size="tall" block disabled={w.pending} onClick={start}>Start the combat</Button>
        </>
      ) : null}
    </KitSheet>
  );
}

export function EndCombatSheet({ before, close, ctx }: { before?: string; close: () => void; ctx: Ctx }) {
  const { factions, short, w } = ctx;
  const combat = useOpenCombat();
  if (!combat) return <KitSheet title="End combat" close={close}><p className={kit.sub}>No combat is open.</p></KitSheet>;
  const end = async (winner: FactionId | "None") => {
    const event: EndCombatEvent = { faction: combat.attacker, defender: combat.defender, winner };
    const label = winner === "None" ? `${short(combat.attacker)} and ${short(combat.defender)}: no winner` : `${short(winner)} won the combat`;
    if (await w.write([{ action: "END_COMBAT", event } as unknown as GameUpdateData], label, combat.attacker)) close();
  };
  return (
    <KitSheet title="Who won?" close={close}>
      {before ? <p className={kit.sub}>{short(combat.attacker)} vs {short(combat.defender)} is still open. Record who won before {before}, then carry on.</p> : null}
      <div className={kit.buttons}>
        {[combat.attacker, combat.defender].map((id) => (
          <Button key={id} disabled={w.pending} onClick={() => end(id)}><span className={kit.line} style={{ gap: 6 }}><Chip faction={id} factions={factions} short={short} small player={false} /> won</span></Button>
        ))}
      </div>
      <Button block disabled={w.pending} onClick={() => end("None")}>No winner (a retreat or a draw)</Button>
    </KitSheet>
  );
}
