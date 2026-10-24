"use client";
// The laws in effect, as upstream's header lists them (Header.tsx PassedLaws),
// and repealing one (REPEAL_AGENDA).
import { useIntl } from "react-intl";
import { translateOutcome } from "../../components/VoteBlock/VoteBlock";
import { useAgendas, usePlanets, useStrategyCards } from "../../context/dataHooks";
import { useObjectives } from "../../context/objectiveDataHooks";
import { Events } from "../../util/api/events";
import type { Ctx } from "./ui";
import { Button, kit, RowLink, Rows, Sheet as KitSheet } from "../ui/kit";

function useLaws() {
  const agendas = useAgendas();
  return Object.values(agendas).filter((a): a is Agenda => !!a && !!a.passed && a.type === "LAW").sort((a, b) => a.name.localeCompare(b.name));
}

function useTargetLabel(ctx: Ctx) {
  const intl = useIntl();
  const agendas = useAgendas();
  const planets = usePlanets();
  const objectives = useObjectives();
  const strategyCards = useStrategyCards();
  return (a: Agenda) => {
    if (!a.target || a.target === "For") return undefined;
    if (ctx.isFaction(a.target)) return ctx.short(a.target);
    return translateOutcome(a.target, a.elect, planets, ctx.factions, objectives, agendas, strategyCards, intl) ?? a.target;
  };
}

export function LawsCard({ ctx }: { ctx: Ctx }) {
  const laws = useLaws();
  const target = useTargetLabel(ctx);
  return (
    <section className={kit.card} aria-label="Laws in effect">
      <p className={kit.eyebrow}><span>Laws in effect</span><span className={kit.num}>{laws.length}</span></p>
      {laws.length ? (
        <Rows flush>
          {laws.map((a) => (
            <RowLink key={a.id} onClick={() => ctx.open({ kind: "law", agenda: a.id })} title={a.name}
              detail={target(a) ? `Elected: ${target(a)}` : (a.passedText ?? a.description).split("\n")[0]} />
          ))}
        </Rows>
      ) : <p className={kit.sub}>No law has passed yet.</p>}
    </section>
  );
}

export function LawSheet({ agenda: id, close, ctx }: { agenda: AgendaId; close: () => void; ctx: Ctx }) {
  const agendas = useAgendas();
  const target = useTargetLabel(ctx);
  const a = agendas[id];
  if (!a) return null;
  const elected = target(a);
  return (
    <KitSheet title={a.name} close={close}>
      {elected ? <p className={kit.sub}><b>Elected: {elected}.</b></p> : null}
      <p style={{ whiteSpace: "pre-line", margin: 0 }}>{a.passedText ?? a.description}</p>
      {a.passed && a.target ? (
        <div className={kit.section}>
          <p className={kit.confirm}>Repeal {a.name}? It stops applying from now on.</p>
          <Button block disabled={ctx.w.pending} onClick={async () => {
            if (await ctx.w.write([Events.RepealAgendaEvent(a.id, a.target!)], `Law repealed: ${a.name}`)) close();
          }}>Repeal it</Button>
        </div>
      ) : null}
    </KitSheet>
  );
}
