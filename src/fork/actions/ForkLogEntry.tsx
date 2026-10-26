"use client";
// How fork actions read in upstream's game log (seam S4 in components/LogEntry.tsx).
import { useFactions } from "../../context/factionDataHooks";

export default function ForkLogEntry({ logEntry }: { logEntry: ActionLogEntry<GameUpdateData> }) {
  const factions = useFactions();
  const d = logEntry.data as unknown as ForkUpdateData;
  const name = (id: string) => factions[id as FactionId]?.shortname ?? id;
  let text: string | null = null;
  if (d.action === "START_COMBAT") text = `${name(d.event.faction)} started a ${d.event.kind} combat with ${name(d.event.defender)}${d.event.planet ? ` on ${d.event.planet}` : ""}`;
  if (d.action === "END_COMBAT") text = d.event.winner === "None" ? `${name(d.event.faction)} and ${name(d.event.defender)}: no winner` : `${name(d.event.winner)} won the combat`;
  if (!text) return null;
  return <div style={{ width: "100%", padding: "4px 8px", opacity: 0.85 }}>⚔ {text}</div>;
}
