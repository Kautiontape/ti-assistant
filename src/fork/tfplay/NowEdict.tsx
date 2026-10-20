"use client";
// The edict phase (Twilight's Fall's replacement for the agenda phase): the
// tyrant draws 3 edicts and resolves 1; Radiant Aur may resolve 1 more; then
// the next round starts. Upstream's screen is main/phase/edict/EdictPhase.tsx.
import { useState } from "react";
import { useCurrentTurn, useEdicts } from "../../context/dataHooks";
import { useOrderedFactionIds } from "../../context/gameDataHooks";
import { useTyrant } from "../../context/stateDataHooks";
import { getLogEntries } from "../../util/actionLog";
import { Events } from "../../util/api/events";
import { Optional } from "../../util/types/types";
import { HelpBanner, type Ctx } from "../play/ui";
import { Button, Choices, Chip, Cite, kit, RowAction, Rows, Sheet, Swatch } from "../ui/kit";
import { SpliceButton } from "./NowSplice";
import { TfCardsSheet } from "./TfCards";
import { gainedIn, TYPE_NAMES, type SpliceType, type TfType } from "./tf";
import { useTfCards } from "./TfThings";

const AUR = "Radiant Aur" as FactionId;

export default function NowEdict(ctx: Ctx) {
  const { factions, short, w, controls, setHelping, helping } = ctx;
  const currentTurn = useCurrentTurn();
  const edicts = useEdicts();
  const tyrant = useTyrant();
  const chosen = getLogEntries<ChooseEdictData>(currentTurn, "CHOOSE_EDICT");
  const tyrantEdict = chosen.find((e) => e.data.event.tyrant)?.data.event.edictId;
  const aurEdict = chosen.find((e) => !e.data.event.tyrant)?.data.event.edictId;
  const aur = factions[AUR];
  const [picking, setPicking] = useState<Optional<"tyrant" | "aur">>();

  return (
    <>
      {helping ? <HelpBanner who={helping} short={short} stop={() => setHelping(undefined)} /> : null}
      {tyrant ? (
        <section className={kit.card} aria-label="The tyrant's edict" style={{ ["--c" as string]: `var(--p-${(factions[tyrant]?.color ?? "black").toLowerCase()})` }}>
          <p className={kit.eyebrow}><span>Tyrant</span></p>
          <Chip faction={tyrant} factions={factions} short={short} />
          {tyrantEdict ? (
            <>
              <h2 className={kit.title}><Cite thing={{ kind: "tfEdict", id: tyrantEdict }}>{edicts[tyrantEdict]?.name ?? tyrantEdict}</Cite></h2>
              <EdictControls edict={tyrantEdict} resolver={tyrant} ctx={ctx} />
              <Button kind="quiet" disabled={w.pending} onClick={() => w.write([Events.HideEdictEvent(tyrantEdict, true)], `${short(tyrant)} took back ${edicts[tyrantEdict]?.name ?? tyrantEdict}`, tyrant)}>Choose a different edict</Button>
            </>
          ) : (
            <>
              <h2 className={kit.title}>{short(tyrant)} draws 3 edicts and resolves 1</h2>
              {controls(tyrant) ? <Button kind="primary" block onClick={() => setPicking("tyrant")}>Choose the edict</Button>
                : <Button forOther block onClick={() => setHelping(tyrant)}>Do it for {short(tyrant)}</Button>}
            </>
          )}
        </section>
      ) : (
        <section className={kit.card}>
          <h2 className={kit.title}>No tyrant this round</h2>
          <p className={kit.sub}>Without a tyrant there's no edict to resolve.</p>
        </section>
      )}

      {aur ? (
        <section className={kit.card} aria-label="Radiant Aur's edict">
          <p className={kit.eyebrow}><span>Radiant Aur&apos;s edict</span></p>
          {aurEdict ? (
            <>
              <h2 className={kit.title}><Cite thing={{ kind: "tfEdict", id: aurEdict }}>{edicts[aurEdict]?.name ?? aurEdict}</Cite></h2>
              <EdictControls edict={aurEdict} resolver={AUR} ctx={ctx} />
              <Button kind="quiet" disabled={w.pending} onClick={() => w.write([Events.HideEdictEvent(aurEdict, false)], `Radiant Aur took back ${edicts[aurEdict]?.name ?? aurEdict}`, AUR)}>Take it back</Button>
            </>
          ) : (
            <>
              <p className={kit.sub}>At the end of the edict phase, if Radiant Aur&apos;s flagship is on the board, they draw and resolve 1 edict.</p>
              <Button block forOther={!controls(AUR)} disabled={!!tyrant && !tyrantEdict} onClick={() => setPicking("aur")}>Radiant Aur draws an edict</Button>
            </>
          )}
        </section>
      ) : null}

      <section className={kit.card} aria-label="Next round">
        <p className={kit.eyebrow}><span>Edict phase done?</span></p>
        <Button kind="primary" size="tall" block disabled={w.pending || (!!tyrant && !tyrantEdict)}
          onClick={() => w.write([Events.AdvancePhaseEvent()], "The next round has started")}>Start the next round</Button>
        {tyrant && !tyrantEdict ? <p className={kit.sub}>The tyrant resolves an edict first.</p> : null}
      </section>

      {picking ? (
        <Sheet title={picking === "tyrant" ? `${short(tyrant)}'s edict` : "Radiant Aur's edict"} close={() => setPicking(undefined)}>
          <p className={kit.sub}>{picking === "tyrant" ? "Draw 3 edicts at the table and choose 1. Tap the one chosen." : "Tap the edict drawn."}</p>
          <Rows>
            {Object.values(edicts).filter((e): e is TFEdict => !!e).sort((a, b) => a.name.localeCompare(b.name)).map((e) => (
              <RowAction key={e.id} verb="Resolve" disabled={w.pending} title={e.name} detail={firstLine(e.description)}
                onClick={async () => {
                  const who = picking === "tyrant" ? tyrant! : AUR;
                  if (await w.write([Events.ChooseEdictEvent(e.id, picking === "tyrant")], `${short(who)} resolves ${e.name}`, who)) setPicking(undefined);
                }} />
            ))}
          </Rows>
        </Sheet>
      ) : null}
    </>
  );
}

const firstLine = (s: string) => (s.split("\n")[0] ?? "").slice(0, 110);

// What each edict asks the app to record. Upstream's EdictDetails.
function EdictControls({ edict, resolver, ctx }: { edict: TFEdictId; resolver: FactionId; ctx: Ctx }) {
  const edicts = useEdicts();
  const text = edicts[edict]?.description ?? "";
  const body = <p className={kit.sub} style={{ whiteSpace: "pre-line" }}>{text}</p>;
  switch (edict) {
    case "Splice": return <>{body}<SpliceEdict resolver={resolver} ctx={ctx} /></>;
    case "Arbitrate": return <>{body}<GainList who="all" resolver={resolver} ctx={ctx} types={["ABILITY", "GENOME", "UNIT_UPGRADE"]} discard note="Discard any spliced cards, then draw one card of the same type for each." /></>;
    case "Convene": return <>{body}<GainList who="all" resolver={resolver} ctx={ctx} types={["ABILITY"]} target={{ ABILITY: 1 }} note="Each player gains 1 of the revealed abilities." /></>;
    case "Artifice": return <>{body}<Artifice resolver={resolver} ctx={ctx} /></>;
    case "Legacy of Ixth": return <>{body}<Legacy resolver={resolver} ctx={ctx} /></>;
    default: return <>{body}<p className={kit.sub}>Resolve it at the table; nothing here to record.</p></>;
  }
}

function SpliceEdict({ resolver, ctx }: { resolver: FactionId; ctx: Ctx }) {
  const currentTurn = useCurrentTurn();
  const started = getLogEntries<RevealTFCardData>(currentTurn, "REVEAL_TF_CARD")[0]?.data.event.type as Optional<SpliceType>;
  const [type, setType] = useState<SpliceType>(started ?? "ABILITY");
  const t = started ?? type;
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {!started ? <Choices label="Splice type" value={type} onChange={setType} options={(["ABILITY", "GENOME", "UNIT_UPGRADE"] as SpliceType[]).map((v) => ({ value: v, label: cap(TYPE_NAMES[v].many) }))} /> : null}
      <SpliceButton type={t} initiator={resolver} allPlayers ctx={ctx} primary />
    </div>
  );
}

// One row per player: what they've gained this phase, and a button to record more.
function GainList({ who, resolver, ctx, types, target, discard, note }: { who: "all" | "resolver"; resolver: FactionId; ctx: Ctx; types: TfType[]; target?: Partial<Record<TfType, number>>; discard?: boolean; note?: string }) {
  const { factions, short } = ctx;
  const currentTurn = useCurrentTurn();
  const order = useOrderedFactionIds("SPEAKER", undefined, resolver);
  const { name } = useTfCards();
  const [editing, setEditing] = useState<Optional<FactionId>>();
  const players = who === "all" ? order : [resolver];
  return (
    <div style={{ display: "grid", gap: 6 }}>
      {note ? <p className={kit.sub}>{note}</p> : null}
      <Rows>
        {players.map((id) => {
          const got = gainedIn(currentTurn, id).filter((g) => types.includes(g.type));
          return (
            <RowAction key={id} verb={got.length ? "Change" : "Record"} onClick={() => setEditing(id)}
              lead={<Swatch faction={id} color={factions[id]?.color} />} title={short(id)}
              detail={got.length ? got.map((g) => name(g.type, g.id)).join(", ") : "Nothing recorded yet"} />
          );
        })}
      </Rows>
      {editing ? <TfCardsSheet faction={editing} ctx={ctx} close={() => setEditing(undefined)} types={types} discard={discard} limit={target} /> : null}
    </div>
  );
}

function Artifice({ resolver, ctx }: { resolver: FactionId; ctx: Ctx }) {
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <Button block onClick={() => ctx.open({ kind: "relic", faction: resolver })}>Record the relic {ctx.short(resolver)} keeps</Button>
      <GainList who="resolver" resolver={resolver} ctx={ctx} types={["PARADIGM"]} target={{ PARADIGM: 1 }} />
    </div>
  );
}

function Legacy({ resolver, ctx }: { resolver: FactionId; ctx: Ctx }) {
  const [roll, setRoll] = useState<"1-5" | "6-9" | "10">();
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <Choices label="The roll" value={roll} onChange={setRoll} options={[{ value: "1-5", label: "1 to 5" }, { value: "6-9", label: "6 to 9" }, { value: "10", label: "10" }]} />
      {roll === "1-5" ? <p className={kit.sub}>Units are destroyed at the table; nothing to record.</p> : null}
      {roll === "6-9" ? <GainList who="all" resolver={resolver} ctx={ctx} types={["ABILITY", "GENOME", "UNIT_UPGRADE"]} note="Each player draws 1 spliced card from any deck." /> : null}
      {roll === "10" ? <GainList who="resolver" resolver={resolver} ctx={ctx} types={["ABILITY", "GENOME", "UNIT_UPGRADE"]} note={`${ctx.short(resolver)} draws up to 2 spliced cards from any decks.`} /> : null}
    </div>
  );
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
