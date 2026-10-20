"use client";
// Exploring a frontier token, as upstream's FrontierExploration.tsx records it:
// the explorer gains a relic (relic fragments come later, on the board) or
// finds Mirage and takes control of it. Offered after a tactical action, and
// after Exploration Probe or Circlet of the Void.
import { useCurrentTurn, useOptions, usePlanets } from "../../context/dataHooks";
import { getClaimedPlanets, getGainedRelic } from "../../util/actionLog";
import { Events } from "../../util/api/events";
import type { Ctx } from "./ui";
import { Button, kit, RowAction, RowLink, Rows, Sheet as KitSheet } from "../ui/kit";

export const FRONTIER_COMPONENTS = new Set(["Exploration Probe", "Circlet of the Void"]);

export function FrontierRow({ active, ctx }: { active: FactionId; ctx: Ctx }) {
  const currentTurn = useCurrentTurn();
  const relic = getGainedRelic(currentTurn);
  const mirage = getClaimedPlanets(currentTurn, active).some((c) => c.planet === "Mirage");
  return <RowLink onClick={() => ctx.open({ kind: "frontier", faction: active })} title="Explored a frontier?"
    detail={mirage ? "Found Mirage" : relic ? `Gained ${relic}` : "A relic, or Mirage"} />;
}

export function FrontierSheet({ faction: id, close, ctx }: { faction: FactionId; close: () => void; ctx: Ctx }) {
  const { short, w, open } = ctx;
  const currentTurn = useCurrentTurn();
  const planets = usePlanets();
  const options = useOptions();
  const mirageTaken = getClaimedPlanets(currentTurn, id).some((c) => c.planet === "Mirage");
  const mirageFound = !!planets["Mirage"]?.owner;
  const relic = getGainedRelic(currentTurn);
  const planetsHidden = !!options.hide?.includes("PLANETS");
  return (
    <KitSheet title={`${short(id)} explores a frontier`} close={close}>
      <p className={kit.sub}>Draw a frontier exploration card. Most are resolved on the board; these two are recorded.</p>
      <Rows>
        <RowLink onClick={() => open({ kind: "relic", faction: id })} title={relic ? `Gained ${relic}` : "Gain a relic"} detail="From relic fragments, or the card says so" />
        {!planetsHidden && (mirageTaken || !mirageFound) ? (
          <RowAction verb={mirageTaken ? "Take back" : "Take"} disabled={w.pending} title="Mirage" detail={mirageTaken ? `${short(id)} found it this turn` : "Found Mirage: place it, take control of it"}
            onClick={() => w.write([mirageTaken ? Events.UnclaimPlanetEvent(id, "Mirage") : Events.ClaimPlanetEvent(id, "Mirage")], mirageTaken ? `${short(id)} gave back Mirage` : `${short(id)} found Mirage`, id)} />
        ) : null}
      </Rows>
      <Button block onClick={close}>Done</Button>
    </KitSheet>
  );
}
