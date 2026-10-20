"use client";
// Primary abilities of Twilight's Fall strategy cards that change the game.
// Upstream's are in main/phase/action/StrategicActions/ (Noctis, Tyrannus,
// Calamitas, Magus, Aeterna). Lux, Civitas and Amicus happen on the board.
import { useEffect, useState } from "react";
import { useCurrentTurn, usePlanets } from "../../context/dataHooks";
import { useOrderedFactionIds } from "../../context/gameDataHooks";
import { useObjectives } from "../../context/objectiveDataHooks";
import { useSpeaker, useTyrant } from "../../context/stateDataHooks";
import { getNewSpeakerEventFromLog, getNewTyrantEventFromLog } from "../../util/api/data";
import { Events } from "../../util/api/events";
import { Optional } from "../../util/types/types";
import { scoredThisPhase } from "../play/logic";
import type { Ctx } from "../play/ui";
import { Button, Chip, Choices, kit } from "../ui/kit";
import { SpliceButton } from "./NowSplice";
import { TfCardsSheet } from "./TfCards";
import { gainedIn, SPLICE_CARDS } from "./tf";
import { useTfCards } from "./TfThings";

export const TF_CARDS_WITH_CONTROLS = new Set<string>(["Noctis", "Tyrannus", "Calamitas", "Magus", "Aeterna"]);

export function TfCardControls({ card, active, ctx }: { card: string; active: FactionId; ctx: Ctx }) {
  const splice = SPLICE_CARDS[card];
  if (splice) {
    return (
      <div style={{ display: "grid", gap: 8 }}>
        <SpliceButton type={splice} initiator={active} ctx={ctx} primary />
        <p className={kit.sub}>{card === "Noctis" ? "Then ready up to 2 planets at the table." : card === "Calamitas" ? "Then use PRODUCTION in 1 system at the table." : "Others join by following the secondary."}</p>
      </div>
    );
  }
  if (card === "Tyrannus") return <TyrannusPrimary active={active} ctx={ctx} />;
  if (card === "Aeterna") return <AeternaPrimary active={active} ctx={ctx} />;
  return null;
}

// Tyrannus: a new speaker, then the benediction token (the tyrant) to someone
// who is neither the speaker nor the tyrant. Each is a transfer, so it confirms.
function TyrannusPrimary({ active, ctx }: { active: FactionId; ctx: Ctx }) {
  const { factions, short, w } = ctx;
  const currentTurn = useCurrentTurn();
  const speaker = useSpeaker();
  const tyrant = useTyrant();
  const order = useOrderedFactionIds("MAP");
  const speakerChange = getNewSpeakerEventFromLog(currentTurn);
  const tyrantChange = getNewTyrantEventFromLog(currentTurn);
  const [newSpeaker, setNewSpeaker] = useState<Optional<FactionId>>(speakerChange?.newSpeaker);
  const [newTyrant, setNewTyrant] = useState<Optional<FactionId>>(tyrantChange?.newTyrant);
  useEffect(() => setNewSpeaker(speakerChange?.newSpeaker), [speakerChange?.newSpeaker]);
  useEffect(() => setNewTyrant(tyrantChange?.newTyrant), [tyrantChange?.newTyrant]);
  const speakerBefore = speakerChange?.prevSpeaker ?? speaker;
  const tyrantBefore = tyrantChange ? tyrantChange.prevTyrant : tyrant;
  const notTyrant = new Set<FactionId>([speaker, ...(tyrantBefore ? [tyrantBefore] : [])]);
  const chip = (id: FactionId) => <Chip faction={id} factions={factions} short={short} small player={false} />;
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <Choices label={speakerChange ? `New speaker: ${short(speakerChange.newSpeaker)}` : "Who is the new speaker?"} value={newSpeaker} onChange={(v) => setNewSpeaker(v as FactionId)}
        options={order.map((id) => ({ value: id as string, disabled: id === speakerBefore, note: id === speakerBefore ? "speaker" : undefined, label: chip(id) }))} />
      {newSpeaker && newSpeaker !== speakerChange?.newSpeaker ? (
        <>
          <p className={kit.confirm}>{short(speakerBefore)} gives {short(newSpeaker)} the speaker token?</p>
          <Button kind="primary" block disabled={w.pending} onClick={() => w.write([Events.SetSpeakerEvent(newSpeaker)], `${short(newSpeaker)} is the new speaker`, active)}>Make {short(newSpeaker)} the speaker</Button>
        </>
      ) : null}
      <Choices label={tyrantChange?.newTyrant ? `New tyrant: ${short(tyrantChange.newTyrant)}` : "Who gets the benediction token (the tyrant)?"} value={newTyrant} onChange={(v) => setNewTyrant(v as FactionId)}
        options={order.map((id) => ({ value: id as string, disabled: notTyrant.has(id) && id !== tyrantChange?.newTyrant, note: id === speaker ? "speaker" : id === tyrantBefore ? "tyrant" : undefined, label: chip(id) }))} />
      {newTyrant && newTyrant !== tyrantChange?.newTyrant ? (
        <>
          <p className={kit.confirm}>{short(active)} gives {short(newTyrant)} the benediction token, making them the tyrant?</p>
          <Button kind="primary" block disabled={w.pending} onClick={() => w.write([Events.SetTyrantEvent(newTyrant)], `${short(newTyrant)} is the tyrant`, active)}>Make {short(newTyrant)} the tyrant</Button>
        </>
      ) : null}
      <p className={kit.sub}>Then draw 2 action cards at the table.</p>
    </div>
  );
}

// Aeterna: score a public objective if they can, otherwise draw a paradigm.
// The point for holding Mecatol Rex is added by upstream when Aeterna is chosen.
function AeternaPrimary({ active, ctx }: { active: FactionId; ctx: Ctx }) {
  const { short, open } = ctx;
  const currentTurn = useCurrentTurn();
  const objectives = useObjectives();
  const planets = usePlanets();
  const { name } = useTfCards();
  const [paradigm, setParadigm] = useState(false);
  const scored = scoredThisPhase(currentTurn, objectives, active).publics;
  const gotParadigm = gainedIn(currentTurn, active).filter((g) => g.type === "PARADIGM");
  const mecatol = planets["Mecatol Rex"]?.owner === active;
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <Button kind={scored.length || gotParadigm.length ? "secondary" : "primary"} block onClick={() => open({ kind: "score", faction: active, which: "public", anyPhase: true })}
        detail={scored.length ? "Change it" : "If they meet its requirements"}>{scored.length ? `Scored ${scored.map((id) => objectives[id]?.name ?? id).join(", ")}` : "Score a public objective"}</Button>
      {!scored.length ? (
        <Button block onClick={() => setParadigm(true)} detail={gotParadigm.length ? undefined : "If they can't score one"}>
          {gotParadigm.length ? `Drew ${gotParadigm.map((g) => name("PARADIGM", g.id)).join(", ")}` : "Draw a paradigm instead"}
        </Button>
      ) : null}
      <p className={kit.sub}>{mecatol ? `${short(active)} holds Mecatol Rex, so their point was added when Aeterna was chosen.` : `${short(active)} doesn't hold Mecatol Rex, so they draw a secret objective instead.`}</p>
      {paradigm ? <TfCardsSheet faction={active} ctx={ctx} close={() => setParadigm(false)} types={["PARADIGM"]} title={`${short(active)} draws a paradigm`} /> : null}
    </div>
  );
}
