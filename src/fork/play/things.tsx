"use client";
// What a popout shows for each game thing a Cite or CardTag names: its kind,
// name and text, from upstream's data hooks.
import { useActionCards, useAgendas, useAllPlanets, useAttachments, useComponents, useLeaders, useRelics, useStrategyCards, useTechs } from "../../context/dataHooks";
import { useFactions } from "../../context/factionDataHooks";
import { useObjectives } from "../../context/objectiveDataHooks";
import { Optional } from "../../util/types/types";
import { kit, PopoutProvider, type Thing } from "../ui/kit";

const TECH_KIND: Record<string, string> = { GREEN: "Biotic technology", BLUE: "Propulsion technology", YELLOW: "Cybernetic technology", RED: "Warfare technology", UPGRADE: "Unit upgrade" };
const PREREQ: Record<string, string> = { GREEN: "green", BLUE: "blue", YELLOW: "yellow", RED: "red" };
const cap = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();

const Text = ({ children }: { children: React.ReactNode }) => <p className={kit.popText}>{children}</p>;
const Facts = ({ items }: { items: (string | false | undefined)[] }) => {
  const shown = items.filter(Boolean);
  return shown.length ? <p className={kit.sub}>{shown.join(" · ")}</p> : null;
};

type Info = Optional<{ kind: string; title: string; body: React.ReactNode }>;

export function useThingRender() {
  const strategyCards = useStrategyCards();
  const techs = useTechs();
  const relics = useRelics();
  const leaders = useLeaders();
  const objectives = useObjectives();
  const agendas = useAgendas();
  const actionCards = useActionCards();
  const attachments = useAttachments();
  const planets = useAllPlanets();
  const factions = useFactions();
  const components = useComponents();
  return (t: Thing): Info => {
    switch (t.kind) {
      case "strategyCard": {
        const c = strategyCards[t.id as StrategyCardId];
        if (!c) return;
        return {
          kind: `Strategy card ${c.order}`, title: c.name,
          body: <><p className={kit.eyebrow}><span>Primary</span></p><Text>{c.primary}</Text><p className={kit.eyebrow}><span>Secondary</span></p><Text>{c.secondary}</Text></>,
        };
      }
      case "tech": {
        const x = techs[t.id as TechId];
        if (!x) return;
        const pre = x.prereqs.map((p) => PREREQ[p] ?? p.toLowerCase());
        return { kind: TECH_KIND[x.type] ?? "Technology", title: x.name, body: <><Facts items={[pre.length ? `Needs ${pre.join(", ")}` : "No prerequisites"]} /><Text>{x.description}</Text></> };
      }
      case "relic": {
        const x = relics[t.id as RelicId];
        return x ? { kind: "Relic", title: x.name, body: <Text>{x.description}</Text> } : undefined;
      }
      case "leader": {
        const x = leaders[t.id as LeaderId];
        if (!x) return;
        return { kind: cap(x.type), title: x.name, body: <>{x.unlock ? <Facts items={[`Unlock: ${x.unlock}`]} /> : null}<Text>{x.description}</Text></> };
      }
      case "objective": {
        const x = objectives[t.id as ObjectiveId];
        if (!x) return;
        const kind = x.type === "SECRET" ? "Secret objective" : x.type === "STAGE ONE" ? "Stage I objective" : x.type === "STAGE TWO" ? "Stage II objective" : "Objective";
        return { kind, title: x.name, body: <><Facts items={[`${x.points} point${x.points === 1 ? "" : "s"}`, x.type === "SECRET" && x.phase ? `Scored in the ${x.phase.toLowerCase()} phase` : undefined]} /><Text>{x.description}</Text></> };
      }
      case "agenda": {
        const x = agendas[t.id as AgendaId];
        if (!x) return;
        return { kind: x.type === "LAW" ? "Law" : "Directive", title: x.name, body: <><Facts items={[x.elect === "For/Against" ? "For or against" : `Elect a ${x.elect.toLowerCase()}`]} /><Text>{x.passedText ?? x.description}</Text></> };
      }
      case "actionCard": {
        const x = actionCards[t.id as ActionCardId] ?? Object.values(actionCards).find((c) => c?.name === t.id);
        return x ? { kind: "Action card", title: x.name, body: <Text>{x.description}</Text> } : undefined;
      }
      case "attachment": {
        const x = attachments[t.id as AttachmentId];
        if (!x) return;
        const skip = x.attribute?.endsWith("-skip") ? `${cap(x.attribute.replace("-skip", ""))} technology skip` : x.attribute === "legendary" ? "Legendary" : undefined;
        return { kind: "Attachment", title: x.name, body: <Facts items={[x.resources || x.influence ? `+${x.resources ?? 0} resources, +${x.influence ?? 0} influence` : undefined, skip, x.required.type ? `On ${x.required.type.toLowerCase()} planets` : undefined]} /> };
      }
      case "planet": {
        const x = planets[t.id as PlanetId];
        if (!x) return;
        return { kind: x.attributes.includes("legendary") ? "Legendary planet" : "Planet", title: x.name, body: <><Facts items={[`${x.resources} resources, ${x.influence} influence`, ...x.types.map(cap)]} />{x.ability ? <Text>{x.ability}</Text> : null}</> };
      }
      case "ability": {
        // id is "faction|ability name"
        const [fid, name] = t.id.split("|");
        const a = factions[fid as FactionId]?.abilities?.find((x) => x.name === name);
        return a ? { kind: "Faction ability", title: a.name, body: <Text>{a.description}</Text> } : undefined;
      }
      case "breakthrough": {
        const b = factions[t.id as FactionId]?.breakthrough;
        return b?.name ? { kind: "Breakthrough", title: b.name, body: <Text>{b.description}</Text> } : undefined;
      }
      case "component": {
        const x = Object.values(components).find((c) => c?.name === t.id);
        return x ? { kind: "Component", title: x.name, body: <Text>{x.description}</Text> } : undefined;
      }
    }
  };
}

export function PlayPopouts({ children }: { children: React.ReactNode }) {
  const render = useThingRender();
  return <PopoutProvider render={render}>{children}</PopoutProvider>;
}
