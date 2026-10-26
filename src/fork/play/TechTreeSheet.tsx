"use client";
// A player's technology tree, like upstream's TechSummary/TechTree: each colour's
// technologies by how many prerequisites they need, marked owned, researchable or
// missing prerequisites (upstream's canResearchTech). Faction technologies sit
// with their colour. Tapping a name shows its text.
import { useState } from "react";
import { useAttachments, useOptions, usePlanets, useRelics, useTechs } from "../../context/dataHooks";
import { hasTech } from "../../util/api/techs";
import { applyAllPlanetAttachments } from "../../util/planets";
import { canResearchTech, getFactionPreReqs } from "../../util/techs";
import { Optional } from "../../util/types/types";
import type { Ctx } from "./ui";
import { Button, Choices, Cite, kit, Sheet as KitSheet, Tag } from "../ui/kit";

const COLOURS: [TechType, string][] = [["GREEN", "Biotic"], ["BLUE", "Propulsion"], ["YELLOW", "Cybernetic"], ["RED", "Warfare"], ["UPGRADE", "Unit upgrades"]];

export function TechTreeSheet({ faction: id, close, ctx }: { faction: FactionId; close: () => void; ctx: Ctx }) {
  const { factions, short, open } = ctx;
  const techs = useTechs();
  const options = useOptions();
  const planets = usePlanets();
  const attachments = useAttachments();
  const relics = useRelics();
  const [colour, setColour] = useState<TechType>("GREEN");
  const f = factions[id];
  if (!f) return null;
  const prereqs = getFactionPreReqs(f, techs, options, applyAllPlanetAttachments(Object.values(planets).filter((p): p is Planet => !!p && p.owner === id), attachments), relics);
  const owned = (t: Tech) => hasTech(f, t);
  const all = Object.values(techs).filter((t): t is Tech => !!t && t.type === colour && (!t.faction || t.faction === id))
    .sort((a, b) => a.prereqs.length - b.prereqs.length || Number(!!a.faction) - Number(!!b.faction) || a.name.localeCompare(b.name));
  const levels = colour === "UPGRADE" ? [all] : [0, 1, 2, 3].map((n) => all.filter((t) => t.prereqs.length === n)).filter((l) => l.length);
  const count = (type: TechType) => Object.values(techs).filter((t): t is Tech => !!t && t.type === type && owned(t)).length;
  const state = (t: Tech): Optional<{ text: string; tone?: "done" }> =>
    owned(t) ? { text: "Owned", tone: "done" } : canResearchTech(t, options, prereqs, f, false, techs) ? { text: "Can research" } : undefined;
  return (
    <KitSheet title={`${short(id)}: technology`} close={close} dock>
      <Choices label="Colour" hideLabel value={colour} onChange={setColour}
        options={COLOURS.map(([type, label]) => ({ value: type, label, note: String(count(type)) }))} />
      {levels.map((level, i) => (
        <div key={i} className={kit.section}>
          {colour !== "UPGRADE" ? <p className={kit.label}>{i === 0 && level[0]?.prereqs.length === 0 ? "No prerequisites" : `${level[0]?.prereqs.length} prerequisite${level[0]?.prereqs.length === 1 ? "" : "s"}`}</p> : null}
          <ul className={kit.sub} style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 6 }}>
            {level.map((t) => {
              const s = state(t);
              return (
                <li key={t.id} className={kit.line} style={{ gap: 8, minHeight: 32, opacity: s ? 1 : 0.7 }}>
                  <span className={kit.grow}><Cite thing={{ kind: "tech", id: t.id }}>{t.name}</Cite>{t.faction ? " (faction)" : ""}</span>
                  {s ? <Tag tone={s.tone}>{s.text}</Tag> : <span>Missing prerequisites</span>}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      <Button block onClick={() => open({ kind: "research", faction: id })}>Add a technology</Button>
    </KitSheet>
  );
}
