"use client";
// Now, setup phase: starting choices (technologies, Council Keleres' home
// system), the speaker reveals two stage I objectives, then the game starts.
// When the game can start comes from upstream's setupPhaseComplete; the rest of
// setup happens on the board. Twilight's Fall choices stay on the table screen.
import { useState } from "react";
import { setupPhaseComplete } from "../../../app/[locale]/game/[gameId]/main/phase/setup/SetupPhase";
import { useLogEntries, useOptions, useTechs, useViewOnly } from "../../context/dataHooks";
import { useNumFactions } from "../../context/factionDataHooks";
import { useOrderedFactionIds } from "../../context/gameDataHooks";
import { useObjectives } from "../../context/objectiveDataHooks";
import { useSpeaker } from "../../context/stateDataHooks";
import { useChangeOption } from "../../util/api/changeOption";
import { Events } from "../../util/api/events";
import { processMapString } from "../../util/map";
import { Optional } from "../../util/types/types";
import { startingTechChoices } from "./logic";
import type { Ctx } from "./ui";
import { Button, Chip, Choices, kit, RowAction, RowLink, Rows, Sheet as KitSheet, Tag } from "../ui/kit";

const TECH_TYPE: Record<string, string> = { GREEN: "Biotic", BLUE: "Propulsion", YELLOW: "Cybernetic", RED: "Warfare", UPGRADE: "Unit upgrade" };

function useRevealed() {
  return useLogEntries<RevealObjectiveData>("REVEAL_OBJECTIVE").map((e) => e.data.event.objective);
}

// What a faction still has to choose, or undefined when it has no choice.
function useChoice() {
  const techs = useTechs();
  const options = useOptions();
  const hideTechs = !!options.hide?.includes("TECHS");
  return (f: Optional<Faction>) => {
    if (!f) return undefined;
    const home = !!f.startswith?.planetchoice;
    const homeLeft = home && !(f.startswith?.planets ?? []).length;
    const tech = !hideTechs && !!f.startswith?.choice;
    if (!home && !tech) return undefined;
    const t = startingTechChoices(f, techs, options);
    return { home, homeLeft, tech, ...t, done: !homeLeft && (!tech || t.left === 0) };
  };
}

export default function NowSetup(ctx: Ctx) {
  const { factions, short, seat, w, open, gameId } = ctx;
  const options = useOptions();
  const order = useOrderedFactionIds("SPEAKER");
  const speaker = useSpeaker();
  const objectives = useObjectives();
  const revealed = useRevealed();
  const choiceOf = useChoice();
  const hideObjectives = !!options.hide?.includes("OBJECTIVES");
  const tf = options.expansions.includes("TWILIGHTS FALL");
  const choosers = [...order].sort((a, b) => Number(b === seat) - Number(a === seat)).filter((id) => choiceOf(factions[id]));
  const choicesLeft = choosers.filter((id) => !choiceOf(factions[id])?.done);
  const ready = setupPhaseComplete(factions, revealed, options);
  const speakerJob = speaker === seat ? "Your job as speaker" : `${short(speaker)}'s job as speaker`;

  return (
    <>
      <section className={kit.card} aria-label="Setup">
        <p className={kit.eyebrow}><span>Setup</span></p>
        <h2 className={kit.title}>Set up the game</h2>
        <details>
          <summary className={kit.sub} style={{ minHeight: 44, display: "flex", alignItems: "center", cursor: "pointer" }}>On the board (not tracked)</summary>
          <p className={kit.sub}>
            Build the galaxy and shuffle the decks. Everyone takes their starting units, planets and technologies.
            Each player draws 2 secret objectives and keeps 1, then the secret deck is reshuffled. Draw 5 stage I and 5 stage II objectives.
          </p>
        </details>
        <MapString ctx={ctx} />
      </section>

      {choosers.length ? (
        <section className={kit.card} aria-label="Starting choices">
          <p className={kit.eyebrow}><span>Starting choices</span><span className={kit.num}>{choosers.length - choicesLeft.length} of {choosers.length}</span></p>
          <Rows flush>
            {choosers.map((id) => {
              const c = choiceOf(factions[id])!;
              const parts = [
                c.home ? (factions[id]?.startswith?.faction ? `${short(factions[id]?.startswith?.faction)} home system` : "Home system to choose") : null,
                c.tech ? (c.chosen.length ? c.chosen.map((t) => t.name).join(", ") : null) : null,
                c.tech && c.left ? `${c.left} technolog${c.left === 1 ? "y" : "ies"} to choose` : null,
              ].filter(Boolean);
              return (
                <RowLink key={id} onClick={() => open({ kind: "setupChoice", faction: id })} label={`${short(id)}: starting choices`}
                  title={<Chip faction={id} factions={factions} short={short} small />} detail={parts.join(" · ")}
                  end={c.done ? <Tag tone="done">Done</Tag> : <Tag tone="now">To choose</Tag>} />
              );
            })}
          </Rows>
        </section>
      ) : null}

      {hideObjectives ? null : (
        <section className={kit.card} aria-label="Stage I objectives">
          <p className={kit.eyebrow}><span>Stage I objectives</span><span className={kit.num}>{revealed.length} of 2</span></p>
          <p className={kit.sub}>{speakerJob}: reveal two stage I objectives.</p>
          {revealed.length ? (
            <Rows>
              {revealed.map((id) => (
                <RowAction key={id} verb="Take back" disabled={w.pending} title={objectives[id]?.name ?? id} detail={objectives[id]?.description}
                  onClick={() => w.write([Events.HideObjectiveEvent(id)], `Took back ${objectives[id]?.name ?? id}`, speaker)} />
              ))}
            </Rows>
          ) : null}
          {revealed.length < 2 ? (
            <Button block forOther={speaker !== seat} disabled={w.pending} onClick={() => open({ kind: "reveal", as: speaker })}>
              {speaker === seat ? "Reveal an objective" : `Reveal for ${short(speaker)}`}
            </Button>
          ) : null}
        </section>
      )}

      {tf ? (
        <section className={kit.card} aria-label="Twilight's Fall">
          <p className={kit.sub}>Twilight's Fall choices (planet and unit factions, the inaugural splice) are on the table screen.</p>
          <Rows><RowLink href={`/game/${gameId}/main`} external title="Open the table screen" /></Rows>
        </section>
      ) : null}

      <section className={kit.card} aria-label="Start the game">
        {!ready ? (
          <p className={kit.sub}>
            {[choicesLeft.length ? `Waiting on starting choices: ${choicesLeft.map(short).join(", ")}.` : null,
              !hideObjectives && revealed.length < 2 ? `Reveal ${2 - revealed.length} more stage I objective${revealed.length === 1 ? "" : "s"}.` : null].filter(Boolean).join(" ")}
          </p>
        ) : null}
        <Button kind="primary" size="tall" block disabled={w.pending || !ready}
          onClick={() => w.write([Events.AdvancePhaseEvent()], "The game started")}>Start the game</Button>
      </section>
    </>
  );
}

// The galaxy's map string, which the Map tab draws (upstream's MapStringInput).
// It's a game option, saved through changeOption rather than the action log.
function MapString({ ctx }: { ctx: Ctx }) {
  const options = useOptions();
  const numFactions = useNumFactions();
  const changeOption = useChangeOption();
  const viewOnly = useViewOnly();
  const saved = options["map-string"] ?? "";
  const [value, setValue] = useState(saved);
  const [busy, setBusy] = useState(false);
  const valid = !value.trim() || /^((([0-9]{1,4}((A|B)[0-5]?)?)|(P[1-8])|(-1))(\s+|$))+$/.test(value.trim());
  const save = async () => {
    if (viewOnly) return ctx.open({ kind: "unlock" });
    const v = value.trim().replace(/\s+/g, " ");
    setBusy(true);
    await changeOption(ctx.gameId, "map-string", v);
    await changeOption(ctx.gameId, "processed-map-string", v ? processMapString(v, options["map-style"], numFactions, options.expansions.includes("THUNDERS EDGE")) : "");
    setBusy(false);
    ctx.w.setToast({ id: Date.now(), text: v ? "Map saved. The Map tab shows it." : "Map string cleared." });
  };
  return (
    <div className={kit.section}>
      <p className={kit.label}>Map string</p>
      <input className={kit.search} type="text" inputMode="text" autoCapitalize="characters" autoComplete="off" spellCheck={false} aria-label="Map string"
        placeholder="The tile numbers, from a map builder" value={value} onChange={(e) => setValue(e.target.value)} />
      {!valid ? <p className={kit.sub} role="alert">That doesn't look like a map string: tile numbers separated by spaces.</p> : null}
      {value.trim() !== saved ? <Button block disabled={busy || !valid} onClick={save}>{busy ? "Saving…" : "Save the map"}</Button>
        : <p className={kit.sub}>{saved ? "The Map tab draws this map." : "Without one, the Map tab has no map to show."}</p>}
    </div>
  );
}

export function SetupChoiceSheet({ faction: id, close, ctx }: { faction: FactionId; close: () => void; ctx: Ctx }) {
  const { factions, short, w } = ctx;
  const choiceOf = useChoice();
  const f = factions[id];
  const c = choiceOf(f);
  const current = f?.startswith?.faction;
  const [home, setHome] = useState<Optional<string>>(current);
  if (!f || !c) return null;
  const homes = f.startswith?.planetchoice?.options ?? [];
  return (
    <KitSheet title={`${short(id)}: starting choices`} close={close}>
      {c.home ? (
        <div className={kit.section}>
          <Choices label="Which home system?" value={home} onChange={setHome}
            options={homes.map((h) => ({ value: h as string, label: `${short(h)}'s` }))} />
          {home && home !== current ? (
            <>
              <p className={kit.confirm}>{short(id)} takes the {short(home)} home system{current ? ` instead of the ${short(current)} one` : ""}?</p>
              <Button kind="primary" block disabled={w.pending}
                onClick={() => w.write([Events.ChooseSubFactionEvent("Council Keleres", home as SubFaction)], `${short(id)} took the ${short(home)} home system`, id)}>Confirm</Button>
            </>
          ) : null}
        </div>
      ) : null}
      {c.tech ? (
        <div className={kit.section}>
          <p className={kit.eyebrow}><span>Starting technologies</span>{c.left ? <span className={kit.num}>{c.left} to choose</span> : null}</p>
          {f.startswith?.choice?.description ? <p className={kit.sub}>{f.startswith.choice.description}</p> : null}
          {c.chosen.length ? (
            <Rows label="Chosen">
              {c.chosen.map((t) => (
                <RowAction key={t.id} verb="Take back" disabled={w.pending} title={t.name} detail={TECH_TYPE[t.type] ?? t.type}
                  onClick={() => w.write([Events.RemoveStartingTechEvent(id, t.id)], `${short(id)} took back ${t.name}`, id)} />
              ))}
            </Rows>
          ) : null}
          {c.left ? (
            <Rows label="Can choose">
              {c.choices.map((t) => (
                <RowAction key={t.id} verb="Choose" disabled={w.pending} title={t.name} detail={TECH_TYPE[t.type] ?? t.type}
                  onClick={() => w.write([Events.ChooseStartingTechEvent(id, t.id)], `${short(id)} chose ${t.name}`, id)} />
              ))}
            </Rows>
          ) : c.chosen.length ? <p className={kit.sub}>All chosen. Take one back to change it.</p>
            : c.homeLeft ? <p className={kit.sub}>Choose the home system first: the technologies depend on it.</p> : null}
        </div>
      ) : null}
      <Button kind={c.done ? "primary" : "secondary"} block onClick={close}>Done</Button>
    </KitSheet>
  );
}
