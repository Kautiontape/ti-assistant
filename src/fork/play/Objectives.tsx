"use client";
// Every objective in the game, from the Table tab: upstream's objectives page
// and the faction page's objectives tab (src/components/ObjectiveModal). Stage I
// and II with who scored each, reveal and hide, scoring for any player; each
// player's secrets; and the other point sources. Upstream's own events throughout.
import { useState } from "react";
import { useObjectives } from "../../context/objectiveDataHooks";
import { Events } from "../../util/api/events";
import { Optional } from "../../util/types/types";
import { SFTT } from "./logic";
import type { Ctx } from "./ui";
import { Button, Choices, kit, RowAction, RowLink, Rows, Sheet as KitSheet } from "../ui/kit";

type Tab = "STAGE ONE" | "STAGE TWO" | "SECRET" | "OTHER";
const TABS: [Tab, string][] = [["STAGE ONE", "Stage I"], ["STAGE TWO", "Stage II"], ["SECRET", "Secrets"], ["OTHER", "Other"]];

const scorerNames = (o: Objective, short: Ctx["short"]) => {
  const counts = new Map<string, number>();
  for (const f of o.scorers ?? []) counts.set(f, (counts.get(f) ?? 0) + 1);
  return [...counts].map(([f, n]) => (n > 1 ? `${short(f)} ×${n}` : short(f))).join(", ");
};

export function ObjectivesCard({ ctx }: { ctx: Ctx }) {
  const objectives = useObjectives();
  if (!ctx.tracks("OBJECTIVES")) return null;
  const revealed = Object.values(objectives).filter((o): o is Objective => !!o && !!o.selected && (o.type === "STAGE ONE" || o.type === "STAGE TWO"));
  const secrets = Object.values(objectives).filter((o) => o?.type === "SECRET" && (o.scorers ?? []).length).length;
  return (
    <section className={kit.card} aria-label="Objectives">
      <Rows flush>
        <RowLink onClick={() => ctx.open({ kind: "objectives" })} title="Objectives"
          detail={`${revealed.filter((o) => o.type === "STAGE ONE").length} stage I and ${revealed.filter((o) => o.type === "STAGE TWO").length} stage II revealed, ${secrets} secret${secrets === 1 ? "" : "s"} scored. Who scored what; reveal, score or take back for anyone`} />
      </Rows>
    </section>
  );
}

export function ObjectivesSheet({ close, ctx }: { close: () => void; ctx: Ctx }) {
  const { factions, short } = ctx;
  const objectives = useObjectives();
  const [tab, setTab] = useState<Tab>("STAGE ONE");
  const [open, setOpen] = useState<Optional<ObjectiveId>>();
  const [revealing, setRevealing] = useState(false);
  const [player, setPlayer] = useState<Optional<FactionId>>();
  const all = Object.values(objectives).filter((o): o is Objective => !!o);
  const ids = Object.values(factions).filter((f): f is Faction => !!f).sort((a, b) => a.mapPosition - b.mapPosition).map((f) => f.id);
  const reset = () => { setOpen(undefined); setRevealing(false); setPlayer(undefined); };
  const o = open ? objectives[open] : undefined;

  let body: React.ReactNode;
  if (o) body = <ObjectiveScorers o={o} ids={ids} ctx={ctx} back={() => setOpen(undefined)} />;
  else if (revealing) body = <Reveal stage={tab as "STAGE ONE" | "STAGE TWO" | "SECRET"} all={all} ctx={ctx} back={() => setRevealing(false)} />;
  else if (tab === "SECRET" && player) body = <Secrets who={player} all={all} ctx={ctx} back={() => setPlayer(undefined)} />;
  else if (tab === "SECRET") {
    const asPublic = all.filter((x) => x.type === "SECRET" && x.selected);
    body = (
      <>
      <Rows label="Secrets by player">
        {ids.map((id) => {
          const n = all.filter((x) => x.type === "SECRET" && (x.scorers ?? []).includes(id)).length;
          return <RowLink key={id} onClick={() => setPlayer(id)} title={short(id)} detail={`${n} secret${n === 1 ? "" : "s"} scored`} />;
        })}
      </Rows>
      {asPublic.length ? (
        <Rows label="Revealed as public">
          {asPublic.map((x) => <RowLink key={x.id} onClick={() => setOpen(x.id)} title={x.name} detail={scorerNames(x, short) ? `Scored by ${scorerNames(x, short)}` : "Nobody has scored it"} />)}
        </Rows>
      ) : null}
      <Rows><RowLink onClick={() => setRevealing(true)} title="Reveal a secret as public" detail="When a card turns one face up" /></Rows>
      </>
    );
  } else if (tab === "OTHER") {
    const other = all.filter((x) => x.type === "OTHER" && x.id !== SFTT).sort((a, b) => Number(!(b.scorers ?? []).length) - Number(!(a.scorers ?? []).length) || a.name.localeCompare(b.name));
    body = (
      <>
        <p className={kit.sub}>Support for the Throne moves from "Points changed?" on Now.</p>
        <Rows label="Other points">
          {other.map((x) => <RowLink key={x.id} onClick={() => setOpen(x.id)} title={x.name} detail={scorerNames(x, short) || "Nobody"} />)}
        </Rows>
      </>
    );
  } else {
    const shown = all.filter((x) => x.type === tab && x.selected).sort((a, b) => (a.revealOrder ?? 0) - (b.revealOrder ?? 0));
    body = (
      <>
        {shown.length ? (
          <Rows label="Revealed">
            {shown.map((x) => <RowLink key={x.id} onClick={() => setOpen(x.id)} title={x.name} detail={scorerNames(x, short) ? `Scored by ${scorerNames(x, short)}` : "Nobody has scored it"} />)}
          </Rows>
        ) : <p className={kit.sub}>None revealed yet.</p>}
        <Rows><RowLink onClick={() => setRevealing(true)} title={`Reveal a ${tab === "STAGE ONE" ? "stage I" : "stage II"} objective`} /></Rows>
      </>
    );
  }
  return (
    <KitSheet title="Objectives" close={close}>
      <Choices label="Which objectives" hideLabel value={tab} onChange={(v) => { setTab(v); reset(); }} options={TABS.map(([value, label]) => ({ value, label }))} />
      {body}
    </KitSheet>
  );
}

// One objective: its text, then score or take back for each player. Each change
// is confirmed in a sentence first, as other transfers are.
function ObjectiveScorers({ o, ids, ctx, back }: { o: Objective; ids: FactionId[]; ctx: Ctx; back: () => void }) {
  const { w, short } = ctx;
  const [ask, setAsk] = useState<Optional<{ id: FactionId; score: boolean }>>();
  const scorers = o.scorers ?? [];
  const n = (id: FactionId) => scorers.filter((s) => s === id).length;
  const go = async () => {
    if (!ask) return;
    const { id, score } = ask;
    const ok = await w.write([score ? Events.ScoreObjectiveEvent(id, o.id) : Events.UnscoreObjectiveEvent(id, o.id)], score ? `${short(id)} scored ${o.name}` : `${short(id)} took back ${o.name}`, id);
    if (ok) setAsk(undefined);
  };
  return (
    <>
      <div className={kit.section}>
        <p className={kit.label}>{o.name} · {o.points} point{o.points === 1 ? "" : "s"}</p>
        <p className={kit.sub} style={{ margin: 0 }}>{o.description}</p>
      </div>
      <Rows label="Players">
        {ids.map((id) => n(id) && !o.repeatable ? (
          <RowAction key={id} verb="Take back" disabled={w.pending} title={short(id)} detail="Scored" onClick={() => setAsk({ id, score: false })} />
        ) : (
          <RowAction key={id} verb={n(id) ? "Score again" : "Score"} disabled={w.pending} title={short(id)} detail={n(id) ? `Scored ${n(id)} times` : undefined} onClick={() => setAsk({ id, score: true })} />
        ))}
        {o.repeatable ? ids.filter((id) => n(id)).map((id) => (
          <RowAction key={`${id}-back`} verb="Take one back" disabled={w.pending} title={short(id)} onClick={() => setAsk({ id, score: false })} />
        )) : null}
      </Rows>
      {ask ? (
        <>
          <p className={kit.confirm}>{ask.score ? `${short(ask.id)} scores ${o.name} for ${o.points} point${o.points === 1 ? "" : "s"}?` : `${short(ask.id)} loses the ${o.points} point${o.points === 1 ? "" : "s"} from ${o.name}?`}</p>
          <Button kind="primary" block disabled={w.pending} onClick={go}>Confirm</Button>
          <Button block onClick={() => setAsk(undefined)}>Never mind</Button>
        </>
      ) : null}
      {o.id === "Mutiny" ? (
        <Rows label="Mutiny">
          <RowAction verb="Switch" disabled={w.pending} title={o.points === 1 ? "Passed: 1 point" : "Voted down: -1 point"}
            detail={o.points === 1 ? "Change it to voted down" : "Change it to passed"}
            onClick={() => w.write([Events.SetObjectivePointsEvent("Mutiny", o.points === 1 ? -1 : 1)], `Mutiny now counts ${o.points === 1 ? "-1" : "1"} point`)} />
        </Rows>
      ) : null}
      {(o.type === "STAGE ONE" || o.type === "STAGE TWO" || (o.type === "SECRET" && o.selected)) && !scorers.length ? (
        <Rows><RowAction verb="Hide" disabled={w.pending} title="Put it back" detail="Revealed by mistake; nobody has scored it"
          onClick={async () => { if (await w.write([Events.HideObjectiveEvent(o.id)], `${o.name} went back to the deck`)) back(); }} /></Rows>
      ) : null}
      <Button block onClick={back}>Back to the list</Button>
    </>
  );
}

function Reveal({ stage, all, ctx, back }: { stage: "STAGE ONE" | "STAGE TWO" | "SECRET"; all: Objective[]; ctx: Ctx; back: () => void }) {
  const { w } = ctx;
  const [q, setQ] = useState("");
  const left = all.filter((x) => x.type === stage && !x.selected && (!q || x.name.toLowerCase().includes(q.toLowerCase()))).sort((a, b) => a.name.localeCompare(b.name));
  return (
    <>
      <p className={kit.sub}>{stage === "SECRET" ? "A secret objective that a card turns face up becomes a public one. Find it here." : "Usually the speaker reveals one in each status phase. Reveal another here when a card says so, or to fix a mistake."}</p>
      <input className={kit.search} type="search" placeholder="Find an objective" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find an objective" />
      <Rows label="Not revealed">
        {left.map((x) => <RowAction key={x.id} verb="Reveal" disabled={w.pending} title={x.name} detail={x.description}
          onClick={async () => { if (await w.write([Events.RevealObjectiveEvent(x.id)], `${x.name} was revealed`)) back(); }} />)}
      </Rows>
      <Button block onClick={back}>Back to the list</Button>
    </>
  );
}

function Secrets({ who, all, ctx, back }: { who: FactionId; all: Objective[]; ctx: Ctx; back: () => void }) {
  const { w, short } = ctx;
  const [q, setQ] = useState("");
  const [ask, setAsk] = useState<Optional<{ x: Objective; score: boolean }>>();
  const scored = all.filter((x) => x.type === "SECRET" && (x.scorers ?? []).includes(who));
  const left = all.filter((x) => x.type === "SECRET" && !(x.scorers ?? []).length && (!q || x.name.toLowerCase().includes(q.toLowerCase()))).sort((a, b) => a.name.localeCompare(b.name));
  const go = async () => {
    if (!ask) return;
    const { x, score } = ask;
    const ok = await w.write([score ? Events.ScoreObjectiveEvent(who, x.id) : Events.UnscoreObjectiveEvent(who, x.id)], score ? `${short(who)} scored ${x.name}` : `${short(who)} took back ${x.name}`, who);
    if (ok) setAsk(undefined);
  };
  return (
    <>
      {ask ? (
        <>
          <p className={kit.confirm}>{ask.score ? `${short(who)} scores the secret ${ask.x.name}?` : `${short(who)} loses the points from ${ask.x.name}?`}</p>
          <Button kind="primary" block disabled={w.pending} onClick={go}>Confirm</Button>
          <Button block onClick={() => setAsk(undefined)}>Never mind</Button>
        </>
      ) : null}
      {scored.length ? (
        <Rows label={`${short(who)}'s secrets`}>
          {scored.map((x) => <RowAction key={x.id} verb="Take back" disabled={w.pending} title={x.name} detail={x.description} onClick={() => setAsk({ x, score: false })} />)}
        </Rows>
      ) : <p className={kit.sub}>{short(who)} hasn't scored a secret.</p>}
      <p className={kit.label}>Score a secret for {short(who)}</p>
      <input className={kit.search} type="search" placeholder="Find a secret" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find a secret" />
      <Rows label="Unscored secrets">
        {left.slice(0, 60).map((x) => <RowAction key={x.id} verb="Score" disabled={w.pending} title={x.name} detail={x.description} onClick={() => setAsk({ x, score: true })} />)}
      </Rows>
      <Button block onClick={back}>Back to the list</Button>
    </>
  );
}
