"use client";
// Popout content for Twilight's Fall cards: abilities, genomes, unit upgrades,
// paradigms and edicts. /play's popouts (src/fork/play/things.tsx) fall back
// to this for kinds they don't know.
import { useAbilities, useEdicts, useGenomes, useParadigms, useUpgrades } from "../../context/dataHooks";
import { useFactions } from "../../context/factionDataHooks";
import { Optional } from "../../util/types/types";
import { kit, type Thing } from "../ui/kit";
import { tfNames, type TfType } from "./tf";

export const THING_KIND: Record<TfType, string> = { ABILITY: "tfAbility", GENOME: "tfGenome", UNIT_UPGRADE: "tfUpgrade", PARADIGM: "tfParadigm" };
const TECH_COLOUR: Record<string, string> = { GREEN: "Biotic", BLUE: "Propulsion", YELLOW: "Cybernetic", RED: "Warfare" };
const cap = (s: string) => s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, " ");

const Text = ({ children }: { children: React.ReactNode }) => <p className={kit.popText} style={{ whiteSpace: "pre-line" }}>{children}</p>;
const Facts = ({ items }: { items: (string | false | undefined)[] }) => {
  const shown = items.filter(Boolean);
  return shown.length ? <p className={kit.sub}>{shown.join(" · ")}</p> : null;
};

type Info = Optional<{ kind: string; title: string; body: React.ReactNode }>;

// One card's name, whatever its type.
export function useTfCards() {
  const abilities = useAbilities();
  const genomes = useGenomes();
  const upgrades = useUpgrades();
  const paradigms = useParadigms();
  const byType = { ABILITY: abilities, GENOME: genomes, UNIT_UPGRADE: upgrades, PARADIGM: paradigms } as Record<TfType, Partial<Record<string, { id: string; name: string; owner?: FactionId; origin?: FactionId }>>>;
  const name = (type: TfType, id: string) => byType[type][id]?.name ?? id;
  return { byType, name };
}

// Teaches log sentences (tfSentence) the cards' and edicts' names; call once, high up.
export function useRegisterTfNames() {
  const lists = [useAbilities(), useGenomes(), useUpgrades(), useParadigms(), useEdicts()] as Record<string, { id: string; name: string } | undefined>[];
  for (const l of lists) for (const c of Object.values(l)) if (c?.name) tfNames.set(c.id, c.name);
}

export function useTfThingRender() {
  const abilities = useAbilities();
  const genomes = useGenomes();
  const upgrades = useUpgrades();
  const paradigms = useParadigms();
  const edicts = useEdicts();
  const factions = useFactions();
  const holder = (owner: Optional<FactionId>) => (owner ? `Held by ${factions[owner]?.shortname ?? owner}` : undefined);
  const from = (origin: Optional<FactionId>) => (origin ? `From the ${origin}` : undefined);
  return (t: Thing): Info => {
    switch (t.kind) {
      case "tfAbility": {
        const a = abilities[t.id as TFAbilityId];
        if (!a) return;
        return { kind: `Ability${TECH_COLOUR[a.type] ? ` · ${TECH_COLOUR[a.type]}` : ""}`, title: a.name, body: <><Text>{a.description}</Text><Facts items={[a.timing && cap(a.timing), from(a.origin), holder(a.owner)]} /></> };
      }
      case "tfGenome": {
        const g = genomes[t.id as TFGenomeId];
        if (!g) return;
        return { kind: `Genome · ${g.subName}`, title: g.name, body: <><Text>{g.description}</Text><Facts items={[g.timing && cap(g.timing), from(g.origin), holder(g.owner)]} /></> };
      }
      case "tfUpgrade": {
        const u = upgrades[t.id as TFUnitUpgradeId];
        if (!u) return;
        const st = u.stats ?? {};
        const stats = [st.cost !== undefined && `Cost ${st.cost}`, st.combat !== undefined && `Combat ${st.combat}`, st.move !== undefined && `Move ${st.move}`, st.capacity !== undefined && `Capacity ${st.capacity}`];
        return { kind: `Unit upgrade · ${cap(u.unitType)}`, title: u.name, body: <>{u.description ? <Text>{u.description}</Text> : null}{u.abilities?.length ? <Text>{u.abilities.join("\n")}</Text> : null}<Facts items={stats} /><Facts items={[from(u.origin), holder(u.owner)]} /></> };
      }
      case "tfParadigm": {
        const p = paradigms[t.id as TFParadigmId];
        if (!p) return;
        return { kind: "Paradigm", title: p.name, body: <><Text>{p.description}</Text><Facts items={[p.timing && cap(p.timing), holder(p.owner)]} /></> };
      }
      case "tfEdict": {
        const e = edicts[t.id as TFEdictId];
        if (!e) return;
        return { kind: "Edict", title: e.name, body: <Text>{e.description}</Text> };
      }
    }
  };
}
