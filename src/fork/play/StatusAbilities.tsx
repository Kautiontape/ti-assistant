"use client";
// Abilities at the start and end of the status phase, from upstream's
// StatusPhase.tsx (getStartOfStatusPhaseAbilities, getEndOfStatusPhaseAbilities,
// EntropicScarResearch, RadicalAdvancement). Reminders stay reminders, as there;
// what upstream records (technologies, the Crown's point, The Oracle) is recorded
// with the same events.
import { useState } from "react";
import { useAgenda, useCurrentTurn, useLeaders, useOptions, usePlanets, useRelics, useTechs } from "../../context/dataHooks";
import { useCompleteOrderedFactionIds } from "../../context/gameDataHooks";
import { useFactionsWithTech } from "../../context/techDataHooks";
import { getLogEntries, getPlayedRelic, getReplacedTechs, getResearchedTechs } from "../../util/actionLog";
import { Events } from "../../util/api/events";
import { hasTech } from "../../util/api/techs";
import { hasLeader } from "../../util/factions";
import { Optional } from "../../util/types/types";
import type { Ctx } from "./ui";
import { Button, Chip, Choices, kit, RowAction, RowLink, Rows, Sheet as KitSheet } from "../ui/kit";

export type StatusAbility = "Entropic Scar" | "Radical Advancement";

type Reminder = { faction: FactionId; name: string; text: string };

function useStatusAbilities(ctx: Ctx) {
  const { factions } = ctx;
  const options = useOptions();
  const currentTurn = useCurrentTurn();
  const relics = useRelics();
  const planets = usePlanets();
  const leaders = useLeaders();
  const techs = useTechs();
  const order = useCompleteOrderedFactionIds("INITIATIVE");
  const wormhole = useFactionsWithTech("Wormhole Generator");
  const hydro = useFactionsWithTech("Hydrothermal Mining");
  const bioplasmosis = useFactionsWithTech("Bioplasmosis");
  const radicalOwners = useFactionsWithTech("Radical Advancement");
  const ministerOfPolicy = useAgenda("Minister of Policy");
  const te = options.expansions.includes("THUNDERS EDGE");
  const hideTechs = !!options.hide?.includes("TECHS");

  const start: Reminder[] = [];
  const end: Reminder[] = [];
  for (const id of order) {
    if (id === "Arborec") start.push({ faction: id, name: "Mitosis", text: "Place 1 infantry from reinforcements on a planet they control." });
    if (!options.expansions.includes("CODEX ONE") && !te && wormhole.has(id)) start.push({ faction: id, name: "Wormhole Generator", text: "Place or move a Creuss wormhole token." });
    if (hydro.has(id)) start.push({ faction: id, name: "Hydrothermal Mining", text: "Gain 1 trade good for each ocean card in play." });
    if (id === "Federation of Sol") end.push({ faction: id, name: "Genesis", text: "The flagship places 1 infantry in its system's space area." });
    if (bioplasmosis.has(id)) end.push({ faction: id, name: "Bioplasmosis", text: "May move infantry between their planets in the same or adjacent systems." });
    if (ministerOfPolicy?.resolved && ministerOfPolicy.target === id) end.push({ faction: id, name: "Minister of Policy", text: "Draws 1 action card." });
  }

  const crown = relics["The Crown of Emphidia"];
  const crownUsed = !!getPlayedRelic(currentTurn, "The Crown of Emphidia");
  const tomb = !!crown?.owner && Object.values(planets).some((p) => p?.owner === crown.owner && p.attachments?.includes("Tomb of Emphidia"));
  const crownOwner = crown?.owner && tomb && (crown.state !== "purged" || crownUsed) ? (crown.owner as FactionId) : undefined;

  const oracleUsed = getLogEntries<PlayLeaderData>(currentTurn, "PLAY_LEADER").some((e) => e.data.event.leader === "The Oracle");
  const naalu = factions["Naalu Collective"];
  const oracle = !!naalu && (hasLeader("The Oracle", naalu, leaders) || oracleUsed);

  // Radical Advancement: its owners, plus Deepwrought or Nekro when they copied it this turn.
  const radical = techs["Radical Advancement"];
  const radicalFactions = new Set(radicalOwners);
  for (const id of ["Deepwrought Scholarate", "Nekro Virus"] as FactionId[]) if (getReplacedTechs(currentTurn, id).includes("Radical Advancement")) radicalFactions.add(id);
  const radicalOn = !hideTechs && !!radical && radical.state !== "purged" && radicalFactions.size > 0;

  return { start, end, crownOwner, crownUsed, oracle, oracleUsed, entropic: te && !hideTechs, radicalOn, radicalFactions: [...radicalFactions], order };
}

export function StatusAbilities({ ctx }: { ctx: Ctx }) {
  const { short, open, w } = ctx;
  const a = useStatusAbilities(ctx);
  const line = (r: Reminder) => <li key={`${r.faction}-${r.name}`}><b>{short(r.faction)}: {r.name}.</b> {r.text}</li>;
  const hasStart = a.start.length > 0 || a.entropic || a.radicalOn;
  const hasEnd = a.end.length > 0 || !!a.crownOwner || a.oracle;
  if (!hasStart && !hasEnd) return null;
  return (
    <>
      {hasStart ? (
        <div className={kit.section} aria-label="Start of the status phase">
          <p className={kit.label}>At the start of the phase</p>
          {a.start.length ? <ul className={kit.sub} style={{ margin: 0, paddingLeft: 18 }}>{a.start.map(line)}</ul> : null}
          {a.entropic || a.radicalOn ? (
            <Rows>
              {a.entropic ? <RowLink onClick={() => open({ kind: "statusAbility", ability: "Entropic Scar" })} title="Entropic Scar" detail="A player with ships in it may gain a faction technology" /> : null}
              {a.radicalOn ? <RowLink onClick={() => open({ kind: "statusAbility", ability: "Radical Advancement" })} title="Radical Advancement" detail={`${a.radicalFactions.map(short).join(", ")}: swap a technology for one with one more prerequisite`} /> : null}
            </Rows>
          ) : null}
        </div>
      ) : null}
      {hasEnd ? (
        <div className={kit.section} aria-label="End of the status phase">
          <p className={kit.label}>At the end of the phase</p>
          {a.end.length ? <ul className={kit.sub} style={{ margin: 0, paddingLeft: 18 }}>{a.end.map(line)}</ul> : null}
          {a.crownOwner || a.oracle ? (
            <Rows>
              {a.crownOwner ? (
                <RowAction verb={a.crownUsed ? "Take back" : "Score"} disabled={w.pending} title={`The Crown of Emphidia (${short(a.crownOwner)})`}
                  detail={a.crownUsed ? "Purged for 1 point" : "They control the Tomb of Emphidia: purge it for 1 point"}
                  onClick={() => w.write([{ action: a.crownUsed ? "UNPLAY_RELIC" : "PLAY_RELIC", event: { relic: "The Crown of Emphidia" } } as unknown as GameUpdateData],
                    a.crownUsed ? `${short(a.crownOwner)} took back The Crown of Emphidia` : `${short(a.crownOwner)} purged The Crown of Emphidia for 1 point`, a.crownOwner)} />
              ) : null}
              {a.oracle ? (
                <RowAction verb={a.oracleUsed ? "Take back" : "Use"} disabled={w.pending} title="The Oracle (Naalu)"
                  detail={a.oracleUsed ? "Used: each other player gave Naalu a promissory note" : "Each other player gives Naalu a promissory note; then purge it"}
                  onClick={() => w.write([a.oracleUsed ? Events.UnplayLeaderEvent("The Oracle") : Events.PlayLeaderEvent("The Oracle")],
                    a.oracleUsed ? "Naalu took back The Oracle" : "Naalu used The Oracle", "Naalu Collective")} />
              ) : null}
            </Rows>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

export function StatusAbilitySheet({ ability, close, ctx }: { ability: StatusAbility; close: () => void; ctx: Ctx }) {
  return ability === "Entropic Scar" ? <EntropicScarSheet close={close} ctx={ctx} /> : <RadicalSheet close={close} ctx={ctx} />;
}

// Each faction gains its own faction technologies here, at most two in all
// (upstream skips the Nekro Virus and anyone who has both).
function EntropicScarSheet({ close, ctx }: { close: () => void; ctx: Ctx }) {
  const { factions, short, w } = ctx;
  const techs = useTechs();
  const currentTurn = useCurrentTurn();
  const order = useCompleteOrderedFactionIds("INITIATIVE");
  const [who, setWho] = useState<Optional<FactionId>>();
  const factionTechs = (id: FactionId) => Object.values(techs).filter((t): t is Tech => !!t && t.faction === id);
  const gained = (id: FactionId) => getResearchedTechs(currentTurn, id).filter((t) => !!techs[t]?.faction) as TechId[];
  const eligible = order.filter((id) => id !== "Nekro Virus" && (factionTechs(id).filter((t) => hasTech(factions[id], t)).length < 2 || gained(id).length > 0));
  const list = who ? factionTechs(who).filter((t) => !hasTech(factions[who], t)) : [];
  return (
    <KitSheet title="Entropic Scar" close={close}>
      <p className={kit.sub}>A player with ships in the Entropic Scar may gain one of their faction technologies.</p>
      <Choices label="Who gains one?" value={who} onChange={(v) => setWho(v as FactionId)}
        options={eligible.map((id) => ({ value: id as string, label: <Chip faction={id} factions={factions} short={short} small /> }))} />
      {who && gained(who).length ? (
        <Rows label="Gained">
          {gained(who).map((t) => (
            <RowAction key={t} verb="Take back" disabled={w.pending} title={techs[t]?.name ?? t}
              onClick={() => w.write([Events.RemoveTechEvent(who, t)], `${short(who)} took back ${techs[t]?.name ?? t}`, who)} />
          ))}
        </Rows>
      ) : who && list.length ? (
        <Rows label="Can gain">
          {list.map((t) => (
            <RowAction key={t.id} verb="Gain" disabled={w.pending} title={t.name}
              onClick={() => w.write([Events.AddTechEvent(who, t.id)], `${short(who)} gained ${t.name} (Entropic Scar)`, who)} />
          ))}
        </Rows>
      ) : who ? <p className={kit.sub}>{short(who)} has no faction technology left to gain.</p> : null}
      <Button block onClick={close}>Done</Button>
    </KitSheet>
  );
}

// Return a technology (not a unit upgrade), then gain one of the same colour
// with one more prerequisite. Taking back restores the returned one.
function RadicalSheet({ close, ctx }: { close: () => void; ctx: Ctx }) {
  const { factions, short, w } = ctx;
  const techs = useTechs();
  const currentTurn = useCurrentTurn();
  const a = useStatusAbilities(ctx);
  const [who, setWho] = useState<Optional<FactionId>>(a.radicalFactions.length === 1 ? a.radicalFactions[0] : undefined);
  const f = who ? factions[who] : undefined;
  const returned = who ? (getReplacedTechs(currentTurn, who)[0] as Optional<TechId>) : undefined;
  const returnedTech = returned ? techs[returned] : undefined;
  const gained = who ? (getResearchedTechs(currentTurn, who) as TechId[]) : [];
  const canReturn = f ? Object.values(techs).filter((t): t is Tech => !!t && t.type !== "UPGRADE" && hasTech(f, t)) : [];
  const canGain = f && returnedTech ? Object.values(techs).filter((t): t is Tech => !!t && t.type === returnedTech.type && t.prereqs.length - 1 === returnedTech.prereqs.length
    && (!t.faction || t.faction === who) && !hasTech(f, t)) : [];
  return (
    <KitSheet title="Radical Advancement" close={close}>
      {a.radicalFactions.length > 1 ? (
        <Choices label="Whose?" value={who} onChange={(v) => setWho(v as FactionId)}
          options={a.radicalFactions.map((id) => ({ value: id as string, label: <Chip faction={id} factions={factions} short={short} small /> }))} />
      ) : null}
      {who && !returned ? (
        <>
          <p className={kit.sub}>{short(who)} returns a technology, then gains one of the same colour with one more prerequisite.</p>
          <Rows label="Return">
            {canReturn.map((t) => (
              <RowAction key={t.id} verb="Return" disabled={w.pending} title={t.name} detail={`${t.prereqs.length} prerequisite${t.prereqs.length === 1 ? "" : "s"}`}
                onClick={() => w.write([Events.RemoveTechEvent(who, t.id)], `${short(who)} returned ${t.name} (Radical Advancement)`, who)} />
            ))}
          </Rows>
        </>
      ) : null}
      {who && returned ? (
        <>
          <Rows label="Returned">
            <RowAction verb="Take back" disabled={w.pending} title={returnedTech?.name ?? returned} detail={gained.length ? `Gained ${gained.map((t) => techs[t]?.name ?? t).join(", ")}` : "Choose what to gain below"}
              onClick={() => w.write([...gained.map((t) => Events.RemoveTechEvent(who, t)), Events.AddTechEvent(who, returned)], `${short(who)} took back Radical Advancement`, who)} />
          </Rows>
          {!gained.length ? (
            canGain.length ? (
              <Rows label="Gain">
                {canGain.map((t) => (
                  <RowAction key={t.id} verb="Gain" disabled={w.pending} title={t.name}
                    onClick={() => w.write([Events.AddTechEvent(who, t.id)], `${short(who)} gained ${t.name} (Radical Advancement)`, who)} />
                ))}
              </Rows>
            ) : <p className={kit.sub}>Nothing of that colour with one more prerequisite is left to gain.</p>
          ) : null}
        </>
      ) : null}
      <Button block onClick={close}>Done</Button>
    </KitSheet>
  );
}
