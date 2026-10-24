"use client";
// A King's spliced cards: the player sheet's list (each name opens its text),
// and one sheet for recording cards gained or discarded, used by the edicts,
// the inaugural splice and corrections.
import { useState } from "react";
import { useCurrentTurn, useOptions } from "../../context/dataHooks";
import { Events } from "../../util/api/events";
import { Optional } from "../../util/types/types";
import type { Ctx } from "../play/ui";
import { Button, Cite, kit, RowAction, Rows, Section, Sheet } from "../ui/kit";
import { cardEvent, gainedIn, isTwilightsFall, TYPE_NAMES, type TfType } from "./tf";
import { THING_KIND, useTfCards } from "./TfThings";

const ORDER: TfType[] = ["ABILITY", "GENOME", "UNIT_UPGRADE", "PARADIGM"];

export function ownedBy(byType: ReturnType<typeof useTfCards>["byType"], faction: FactionId) {
  return ORDER.map((type) => ({ type, cards: Object.values(byType[type]).filter((c): c is NonNullable<typeof c> => !!c && c.owner === faction).sort((a, b) => a.name.localeCompare(b.name)) }));
}

// For the player sheet; nothing outside Twilight's Fall.
export function TfOwnedCards({ faction, ctx }: { faction: FactionId; ctx: Ctx }) {
  const { byType } = useTfCards();
  const options = useOptions();
  const [editing, setEditing] = useState(false);
  if (!isTwilightsFall(options)) return null;
  const groups = ownedBy(byType, faction);
  return (
    <>
      {groups.map(({ type, cards }) => (
        <Section key={type} title={cap(TYPE_NAMES[type].many)} count={cards.length}>
          {cards.length ? (
            <p className={kit.sub} style={{ display: "flex", flexWrap: "wrap", gap: "4px 12px" }}>
              {cards.map((c) => <Cite key={c.id} thing={{ kind: THING_KIND[type], id: c.id }}>{c.name}</Cite>)}
            </p>
          ) : <p className={kit.sub}>None</p>}
        </Section>
      ))}
      <Button block forOther={faction !== ctx.seat} onClick={() => setEditing(true)}>Change {ctx.short(faction)}&apos;s cards</Button>
      {editing ? <TfCardsSheet faction={faction} ctx={ctx} close={() => setEditing(false)} discard /> : null}
    </>
  );
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// Gain (and optionally discard) cards for one player. `types` limits what can
// be gained; `limit` counts what they've gained this turn against a target.
export function TfCardsSheet({ faction, ctx, close, types = ORDER, discard, title, note, limit }: {
  faction: FactionId; ctx: Ctx; close: () => void; types?: TfType[]; discard?: boolean; title?: string; note?: string;
  limit?: Partial<Record<TfType, number>>;
}) {
  const { short, w } = ctx;
  const { byType, name } = useTfCards();
  const currentTurn = useCurrentTurn();
  const [type, setType] = useState<TfType>(types[0]!);
  const [q, setQ] = useState("");
  // Taking a card someone else holds is a transfer: it asks first.
  const [taking, setTaking] = useState<Optional<{ id: string; owner: FactionId }>>();
  const gained = gainedIn(currentTurn, faction);
  const mine = ownedBy(byType, faction);
  const pool = Object.values(byType[type]).filter((c): c is NonNullable<typeof c> => !!c && c.owner !== faction && (!q || c.name.toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => Number(!!a.owner) - Number(!!b.owner) || a.name.localeCompare(b.name));
  const gain = (id: string, owner: Optional<FactionId>) => w.write([Events.GainTFCardEvent(faction, cardEvent(type, id))],
    owner ? `${short(faction)} took ${name(type, id)} from ${short(owner)}` : `${short(faction)} gained ${name(type, id)}`, faction);
  const lose = (t: TfType, id: string) => w.write([Events.LoseTFCardEvent(faction, cardEvent(t, id), true)], `${short(faction)} discarded ${name(t, id)}`, faction);
  return (
    <Sheet title={title ?? `${short(faction)}'s cards`} close={close}>
      {note ? <p className={kit.sub}>{note}</p> : null}
      {limit ? (
        <p className={kit.sub}>
          {Object.entries(limit).map(([t, n]) => `${gained.filter((g) => g.type === t).length} of ${n} ${TYPE_NAMES[t as TfType][n === 1 ? "one" : "many"]}`).join(", ")} recorded this turn.
        </p>
      ) : null}
      {discard ? (
        <Section title="Has now">
          <Rows>
            {mine.flatMap(({ type: t, cards }) => cards.map((c) => (
              <RowAction key={c.id} verb="Discard" disabled={w.pending} onClick={() => lose(t, c.id)} title={c.name} detail={cap(TYPE_NAMES[t].one)} />
            )))}
          </Rows>
        </Section>
      ) : null}
      <Section title="Gain a card">
        {taking ? (
          <div style={{ display: "grid", gap: 8 }}>
            <p className={kit.confirm}>{short(faction)} takes {name(type, taking.id)} from {short(taking.owner)}?</p>
            <div className={kit.buttons}>
              <Button kind="primary" disabled={w.pending} onClick={async () => { if (await gain(taking.id, taking.owner)) setTaking(undefined); }}>Take it</Button>
              <Button onClick={() => setTaking(undefined)}>Cancel</Button>
            </div>
          </div>
        ) : null}
        {types.length > 1 ? (
          <div className={kit.choices} role="radiogroup" aria-label="Card type">
            {types.map((t) => (
              <button key={t} type="button" role="radio" aria-checked={type === t} className={kit.choice} onClick={() => setType(t)}>
                <span className={kit.radio} aria-hidden="true" /><span>{cap(TYPE_NAMES[t].one)}</span>
              </button>
            ))}
          </div>
        ) : null}
        <input className={kit.search} type="search" placeholder={`Find ${TYPE_NAMES[type].one === "ability" ? "an" : "a"} ${TYPE_NAMES[type].one}`} value={q} onChange={(e) => setQ(e.target.value)} aria-label={`Find a card`} />
        <Rows>
          {pool.slice(0, 40).map((c) => (
            <RowAction key={c.id} verb={c.owner ? "Take" : "Gain"} disabled={w.pending} onClick={() => (c.owner ? setTaking({ id: c.id, owner: c.owner }) : gain(c.id, undefined))}
              title={c.name} detail={c.owner ? `Held by ${short(c.owner)}` : undefined} />
          ))}
        </Rows>
        {pool.length > 40 ? <p className={kit.sub}>{pool.length - 40} more: type part of the name to find one.</p> : null}
      </Section>
    </Sheet>
  );
}
