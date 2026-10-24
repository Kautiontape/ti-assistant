"use client";
// /start/new: a new game, the fork's copy of upstream's setup page
// (app/[locale]/setup/setup-page.tsx). The rules for seats, colours,
// expansions, variants and map types are upstream's, copied; the game is made
// by upstream's /api/create-game and opens on /play, with the game's Discord
// choice saved right after (/api/fork/discord). Twilight's Fall isn't
// offered here: /play doesn't run it yet (the tfall branch owns that).
import { useRouter } from "next/navigation";
import { use, useState } from "react";
import GameMap from "../../components/Map/GameMap";
import { DatabaseFnsContext } from "../../context/contexts";
import { extractFactionIds, processMapString } from "../../util/map";
import { Optional } from "../../util/types/types";
import styles from "../play/play.module.scss";
import { Button, Choices, cx, kit, pcolor, RowLink, Rows, rootAttrs, Sheet, Stepper, Swatch, Switch, useDevicePrefs } from "../ui/kit";
import { DiscordChoice, DiscordFields, saveDiscord, useDiscordStatus, WEBHOOK } from "../play/DiscordSettings";

type Seat = { id?: FactionId; color?: FactionColor; playerName?: string; alliancePartner?: number };
type Hidden = "TECHS" | "PLANETS" | "OBJECTIVES" | "RELICS";

const CODICES: Expansion[] = ["CODEX ONE", "CODEX TWO", "CODEX THREE", "CODEX FOUR"];
const START_EXPANSIONS: Expansion[] = ["POK", ...CODICES, "THUNDERS EDGE"];
// Upstream hides these by default; PLANET_STATE and STRUCTURES aren't built.
// Command tokens stay hidden: /play doesn't track them (Shawn, 2026-10-18).
const START_HIDE: AppSection[] = ["COMMAND_COUNTERS", "PLANET_STATE", "STRUCTURES"];
const TRACK: [Hidden, string, string][] = [
  ["TECHS", "Technologies", "Who has researched what"],
  ["PLANETS", "Planets", "Who controls which planets, for resources and influence"],
  ["OBJECTIVES", "Objectives", "Revealed objectives and who scored them"],
  ["RELICS", "Relics", "Who holds which relic"],
];
const MAP_STYLES: Record<number, MapStyle[]> = { 3: ["standard"], 4: ["standard", "warp", "skinny"], 5: ["standard", "warp", "skinny"], 6: ["standard", "large"], 7: ["standard", "warp"], 8: ["standard", "warp"] };
const STYLE_NAMES: Record<MapStyle, string> = { standard: "Standard", warp: "Warp", skinny: "Skinny", large: "Large" };
const VARIANTS: [GameVariant, string, number][] = [["normal", "Normal", 10], ["alliance-separate", "Alliance, separate points", 14], ["alliance-combined", "Alliance, combined points", 22]];
const EXPANSION_NAMES: Partial<Record<Expansion, string>> = { POK: "Prophecy of Kings", "CODEX ONE": "Codex I", "CODEX TWO": "Codex II", "CODEX THREE": "Codex III", "CODEX FOUR": "Codex IV", "THUNDERS EDGE": "Thunder's Edge", "DISCORDANT STARS": "Discordant Stars" };
const MAP_STRING = /^((([0-9]{1,4}((A|B)[0-5]?)?)|(P[1-8])|(-1))(\s+|$))+$/;

export default function NewGame() {
  const router = useRouter();
  const { prefs } = useDevicePrefs();
  const db = use(DatabaseFnsContext);
  const baseFactions: Partial<Record<FactionId, BaseFaction>> = db.getBaseValue("factions") ?? {};
  const baseEvents: Partial<Record<EventId, TIEvent>> = db.getBaseValue("events") ?? {};
  const allColours: FactionColor[] = db.getBaseValue("colors") ?? [];

  const [count, setCount] = useState(6);
  const [seats, setSeats] = useState<Seat[]>(Array.from({ length: 8 }, () => ({})));
  const [speaker, setSpeaker] = useState(0);
  const [expansions, setExpansions] = useState<Set<Expansion>>(new Set(START_EXPANSIONS));
  const [events, setEvents] = useState<Set<EventId>>(new Set());
  const [hide, setHide] = useState<Set<AppSection>>(new Set(START_HIDE));
  const [variant, setVariant] = useState<GameVariant>("normal");
  const [vp, setVp] = useState(10);
  const [vp2, setVp2] = useState(10);
  const [mapStyle, setMapStyle] = useState<MapStyle>("standard");
  const [mapString, setMapString] = useState("");
  const [password, setPassword] = useState("");
  const [sheet, setSheet] = useState<"events" | number>();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [discordStatus] = useDiscordStatus();
  const [discord, setDiscord] = useState<DiscordChoice>();
  const discordChoice = discord ?? (discordStatus ? { on: discordStatus.on, events: discordStatus.events } : undefined);

  const has = (e: Expansion) => expansions.has(e);
  const max = has("POK") ? 8 : 6;
  const active = seats.slice(0, count);
  const colours = allColours.filter((c) => has("POK") || (c !== "Magenta" && c !== "Orange"));
  // Upstream's faction filter: locked factions and ones an expansion replaces are out.
  const allowed = (set: Set<Expansion>) => (f: Optional<BaseFaction>): f is BaseFaction =>
    !!f && !f.locked && !(f.removedIn && set.has(f.removedIn)) && (f.expansion === "BASE" || set.has(f.expansion));
  const pickable = Object.values(baseFactions).filter(allowed(expansions)).sort((a, b) => a.name.localeCompare(b.name));
  const eventList = Object.values(baseEvents).filter((e): e is TIEvent => !!e && has(e.expansion)).sort((a, b) => a.name.localeCompare(b.name));
  const variants = count % 2 === 0 ? VARIANTS : VARIANTS.slice(0, 1);
  const alliance = variant.startsWith("alliance");
  const seatName = (i: number) => {
    const s = seats[i];
    return s?.playerName?.trim() || (s?.id ? baseFactions[s.id]?.shortname ?? s.id : `Seat ${i + 1}`);
  };

  // A faction's own colour, else the first free one from its list (upstream's getBestRemainingColor).
  function bestColour(id: FactionId, used: Set<string>, set = expansions) {
    const f = baseFactions[id];
    if (f?.color && !used.has(f.color)) return f.color;
    return f?.colorList?.find((c) => (set.has("POK") || (c !== "Magenta" && c !== "Orange")) && !used.has(c));
  }
  function assign(picks: Record<number, FactionId>) {
    setSeats((prev) => {
      const used = new Set(prev.map((s, i) => (picks[i] ? undefined : s.color)).filter((c): c is FactionColor => !!c));
      return prev.map((s, i) => {
        const id = picks[i];
        if (!id) return Object.values(picks).includes(s.id as FactionId) ? { ...s, id: undefined, color: undefined } : s;
        const color = s.color && !used.has(s.color) ? s.color : bestColour(id, used);
        if (color) used.add(color);
        return { ...s, id, color };
      });
    });
  }
  function setSeat(i: number, patch: Partial<Seat>) { setSeats((prev) => prev.map((s, j) => (j === i ? { ...s, ...patch } : s))); }
  function pickColour(i: number, color: FactionColor) {
    // Taking a colour another seat has swaps the two, as upstream does.
    setSeats((prev) => prev.map((s, j) => (j === i ? { ...s, color } : s.color === color ? { ...s, color: prev[i]?.color } : s)));
  }
  function partner(i: number, p: number) {
    setSeats((prev) => prev.map((s, j) => {
      if (j === i) return { ...s, alliancePartner: p };
      if (j === p) return { ...s, alliancePartner: i };
      if (s.alliancePartner === i || s.alliancePartner === p) return { ...s, alliancePartner: undefined };
      return s;
    }));
  }
  function processed(str: string, style = mapStyle, n = count) {
    return str ? processMapString(str, style, n, has("THUNDERS EDGE")) : "";
  }
  function readMap(str: string, style: MapStyle) {
    if (!str.trim() || !MAP_STRING.test(str.trim())) return;
    const ids = extractFactionIds(str.trim(), style, count, has("THUNDERS EDGE"));
    if (ids && Object.keys(ids).length) assign(ids);
  }
  function changeCount(n: number) {
    setCount(n);
    setMapStyle("standard");
    if (n % 2) setVariant("normal");
    if (speaker >= n) setSpeaker(0);
  }
  function toggleExpansion(e: Expansion, on: boolean) {
    const next = new Set(expansions);
    if (on) {
      next.add(e);
      // Thunder's Edge brings the codices; some of its components need them.
      if (e === "THUNDERS EDGE") CODICES.forEach((c) => next.add(c));
    } else next.delete(e);
    setExpansions(next);
    setEvents((prev) => new Set([...prev].filter((id) => { const ev = baseEvents[id]; return ev && next.has(ev.expansion); })));
    const ok = allowed(next);
    setSeats((prev) => prev.map((s) => {
      let out = s;
      if (!next.has("POK") && (s.color === "Magenta" || s.color === "Orange")) out = { ...out, color: undefined };
      if (s.id && !ok(baseFactions[s.id])) out = { ...out, id: undefined, color: undefined };
      return out;
    }));
    if (!next.has("POK") && count > 6) changeCount(6);
  }
  function randomFactions() {
    const taken = new Set(active.map((s) => s.id).filter(Boolean));
    const pool = pickable.map((f) => f.id).filter((id) => !taken.has(id));
    const picks: Record<number, FactionId> = {};
    active.forEach((s, i) => {
      if (s.id || !pool.length) return;
      picks[i] = pool.splice(Math.floor(Math.random() * pool.length), 1)[0]!;
    });
    assign(picks);
  }
  function reset() {
    setCount(6); setSeats(Array.from({ length: 8 }, () => ({}))); setSpeaker(0);
    setExpansions(new Set(START_EXPANSIONS)); setEvents(new Set()); setHide(new Set(START_HIDE));
    setVariant("normal"); setVp(10); setVp2(10); setMapStyle("standard"); setMapString(""); setPassword(""); setError("");
  }

  const missing = active.findIndex((s) => !s.id || !s.color || (alliance && s.alliancePartner === undefined));
  const mapOk = !mapString.trim() || MAP_STRING.test(mapString.trim());
  const blocker = missing >= 0
    ? `${seatName(missing)} needs ${!active[missing]?.id ? "a faction" : !active[missing]?.color ? "a colour" : "an alliance partner"}.`
    : !mapOk ? "The map string isn't valid."
    : discord?.on && (discord.webhook?.trim() ? !WEBHOOK.test(discord.webhook.trim()) : !discordStatus?.serverWebhook) ? "Discord needs a webhook address, or turn its posts off."
    : "";

  async function start() {
    setError("");
    setPending(true);
    const str = mapString.trim().replace(/\s+/g, " ");
    const options: Options = {
      expansions: [...expansions], events: [...events], hide: [...hide],
      "game-variant": variant, "map-style": mapStyle, "map-string": str, "processed-map-string": processed(str),
      "victory-points": vp, "secondary-victory-points": vp2,
    };
    try {
      const res = await fetch("/api/create-game", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ factions: active.map((s) => ({ ...s, name: s.id, playerName: s.playerName?.trim() || undefined })), speaker, options, password: password || undefined }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.gameid) { setError("The game wasn't made. Check the connection and try again."); setPending(false); return; }
      // The game exists either way; if this doesn't save, game settings can change it.
      if (discord) await saveDiscord(json.gameid, discord).catch(() => {});
      router.push(`/play/${json.gameid}`);
    } catch {
      setError("The game wasn't made. Check the connection and try again.");
      setPending(false);
    }
  }

  const seat = typeof sheet === "number" ? sheet : undefined;
  return (
    <div className={cx(kit.root, styles.root)} {...rootAttrs(prefs)}>
      <header className={styles.top}>
        <div className={styles.phase}><span className={styles.phaseName}>New game</span><span className={styles.round}>TI Assistant</span></div>
        <span className={styles.turn} />
        <Button kind="quiet" size="small" href="/">Back</Button>
      </header>
      <main className={styles.main}>
        <section className={kit.card} aria-label="Players">
          <p className={kit.eyebrow}><span>Players</span><span className={kit.num}>{count}</span></p>
          <Choices label="How many players" hideLabel value={String(count)} onChange={(v) => changeCount(Number(v))}
            options={Array.from({ length: max - 2 }, (_, i) => ({ value: String(i + 3), label: String(i + 3), name: `${i + 3} players` }))} />
          <p className={kit.sub}>Seats go clockwise around the table, starting from the top of the map.</p>
          <Rows label="Seats">
            {active.map((s, i) => (
              <RowLink key={i} onClick={() => setSheet(i)} label={`Seat ${i + 1}`}
                lead={s.id ? <Swatch faction={s.id} color={s.color} /> : undefined}
                title={s.id ? baseFactions[s.id]?.name ?? s.id : `Seat ${i + 1}: choose a faction`}
                detail={[s.playerName?.trim() || (s.id ? undefined : "No faction yet"), s.color, speaker === i ? "Speaker" : undefined,
                  alliance && s.alliancePartner !== undefined ? `Allied with ${seatName(s.alliancePartner)}` : undefined].filter(Boolean).join(" · ")} />
            ))}
          </Rows>
          <div className={kit.buttons}>
            <Button onClick={randomFactions} disabled={active.every((s) => s.id)}>Random factions</Button>
            <Button onClick={() => setSpeaker(Math.floor(Math.random() * count))}>Random speaker</Button>
          </div>
          <Choices label="Speaker" value={String(speaker)} onChange={(v) => setSpeaker(Number(v))}
            options={active.map((_, i) => ({ value: String(i), label: seatName(i) }))} />
        </section>

        <section className={kit.card} aria-label="Game">
          <p className={kit.eyebrow}><span>Game</span></p>
          <Switch label={EXPANSION_NAMES.POK} checked={has("POK")} onChange={(on) => toggleExpansion("POK", on)} />
          <Switch label="Thunder's Edge" detail="Includes the four codices" checked={has("THUNDERS EDGE")} onChange={(on) => toggleExpansion("THUNDERS EDGE", on)} />
          {!has("THUNDERS EDGE") ? CODICES.map((c) => (
            <Switch key={c} label={EXPANSION_NAMES[c]} checked={has(c)} onChange={(on) => toggleExpansion(c, on)} />
          )) : null}
          <Switch label="Discordant Stars" detail="Homebrew factions" checked={has("DISCORDANT STARS")} onChange={(on) => toggleExpansion("DISCORDANT STARS", on)} />
          {variants.length > 1 ? (
            <Choices label="Variant" value={variant} onChange={(v) => { const x = VARIANTS.find(([id]) => id === v)!; setVariant(x[0]); setVp(x[2]); setVp2(10); }}
              options={variants.map(([id, label]) => ({ value: id, label }))} />
          ) : null}
          <div className={kit.section}>
            <p className={kit.label}>{variant === "alliance-separate" ? "Points to win, for the alliance" : "Points to win"}</p>
            <Stepper value={vp} min={1} max={40} less="One point fewer" more="One point more" onChange={setVp} />
          </div>
          {variant === "alliance-separate" ? (
            <div className={kit.section}>
              <p className={kit.label}>And for each player</p>
              <Stepper value={vp2} min={1} max={20} less="One player point fewer" more="One player point more" onChange={setVp2} />
            </div>
          ) : null}
          {eventList.length ? (
            <Rows><RowLink onClick={() => setSheet("events")} title="Events" detail={events.size ? [...events].map((id) => baseEvents[id]?.name ?? id).join(", ") : "None"} /></Rows>
          ) : null}
        </section>

        <section className={kit.card} aria-label="Map">
          <p className={kit.eyebrow}><span>Map</span></p>
          {(MAP_STYLES[count] ?? []).length > 1 ? (
            <Choices label="Map type" value={mapStyle} onChange={(v) => { setMapStyle(v); readMap(mapString, v); }}
              options={(MAP_STYLES[count] ?? []).map((s) => ({ value: s, label: STYLE_NAMES[s] }))} />
          ) : null}
          <div className={kit.section}>
            <p className={kit.label}>Map string</p>
            <input className={kit.search} type="text" autoCapitalize="characters" autoComplete="off" spellCheck={false} aria-label="Map string"
              placeholder="The tile numbers, from a map builder" value={mapString} onChange={(e) => { setMapString(e.target.value); readMap(e.target.value, mapStyle); }} />
            {!mapOk ? <p className={kit.sub} role="alert">That doesn't look like a map string: tile numbers separated by spaces.</p>
              : <p className={kit.sub}>Optional. With one, planets that aren't on the map can't be claimed, and home systems on it set the factions.</p>}
          </div>
          {mapString.trim() && mapOk ? (
            <div className={styles.board}>
              <div className={styles.boardInner}>
                <GameMap mapStyle={mapStyle} mapString={processed(mapString.trim())} wormholeNexus={has("POK") ? "A" : undefined}
                  factions={active} hideLegend hideFracture expansions={[...expansions]} />
              </div>
            </div>
          ) : null}
        </section>

        <section className={kit.card} aria-label="Track">
          <p className={kit.eyebrow}><span>Track</span></p>
          {TRACK.map(([id, label, detail]) => (
            <Switch key={id} label={label} detail={detail} checked={!hide.has(id)}
              onChange={(on) => setHide((prev) => { const n = new Set(prev); if (on) n.delete(id); else n.add(id); return n; })} />
          ))}
        </section>

        {discordStatus && discordChoice ? (
          <section className={kit.card} aria-label="Discord">
            <p className={kit.eyebrow}><span>Discord</span></p>
            <DiscordFields value={discordChoice} onChange={setDiscord} serverWebhook={discordStatus.serverWebhook} />
          </section>
        ) : null}

        <section className={kit.card} aria-label="Password">
          <p className={kit.eyebrow}><span>Password</span></p>
          <input className={kit.search} type="password" autoComplete="new-password" aria-label="Password" placeholder="Optional"
            value={password} onChange={(e) => setPassword(e.target.value)} />
          <p className={kit.sub}>With a password, only devices that enter it can change the game. Anyone with the code can still watch.</p>
        </section>

        <section className={kit.card} aria-label="Start">
          {blocker ? <p className={kit.sub}>{blocker}</p> : null}
          {error ? <p className={kit.sub} role="alert">{error}</p> : null}
          <Button kind="primary" size="tall" block disabled={!!blocker || pending} onClick={start}>{pending ? "Making the game…" : "Start the game"}</Button>
          <Button kind="quiet" block onClick={reset}>Start over</Button>
        </section>
      </main>

      {seat !== undefined ? (
        <SeatSheet i={seat} seats={seats} count={count} alliance={alliance} factions={pickable} colours={colours} seatName={seatName} close={() => setSheet(undefined)}
          setName={(n) => setSeat(seat, { playerName: n })} pickFaction={(id) => assign({ [seat]: id })}
          clearFaction={() => setSeat(seat, { id: undefined, color: undefined })} pickColour={(c) => pickColour(seat, c)} pickPartner={(p) => partner(seat, p)} />
      ) : null}
      {sheet === "events" ? (
        <Sheet title="Events" close={() => setSheet(undefined)}>
          <p className={kit.sub}>Events change the rules for this game.</p>
          {eventList.map((e) => (
            <Switch key={e.id} label={e.name} detail={e.description} checked={events.has(e.id)}
              onChange={(on) => setEvents((prev) => { const n = new Set(prev); if (on) n.add(e.id); else n.delete(e.id); return n; })} />
          ))}
          <Button block onClick={() => setSheet(undefined)}>Done</Button>
        </Sheet>
      ) : null}
    </div>
  );
}

function SeatSheet({ i, seats, count, alliance, factions, colours, seatName, close, setName, pickFaction, clearFaction, pickColour, pickPartner }: {
  i: number; seats: Seat[]; count: number; alliance: boolean; factions: BaseFaction[]; colours: FactionColor[]; seatName: (i: number) => string; close: () => void;
  setName: (n: string) => void; pickFaction: (id: FactionId) => void; clearFaction: () => void; pickColour: (c: FactionColor) => void; pickPartner: (p: number) => void;
}) {
  const s = seats[i] ?? {};
  const [q, setQ] = useState("");
  const [changing, setChanging] = useState(!s.id);
  const at = (pred: (x: Seat) => boolean) => seats.slice(0, count).findIndex((x, j) => j !== i && pred(x));
  const shown = factions.filter((f) => !q || f.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <Sheet title={`Seat ${i + 1}`} close={close}>
      <input className={kit.search} type="text" placeholder="Player's name" aria-label="Player's name" value={s.playerName ?? ""} onChange={(e) => setName(e.target.value)} />
      <div className={kit.section}>
        <p className={kit.label}>Faction</p>
        {s.id && !changing ? (
          <>
            <div className={kit.line}><Swatch faction={s.id} color={s.color} /><b>{factions.find((f) => f.id === s.id)?.name ?? s.id}</b></div>
            <div className={kit.buttons}>
              <Button onClick={() => setChanging(true)}>Change</Button>
              <Button onClick={() => { clearFaction(); setChanging(true); }}>No faction</Button>
            </div>
          </>
        ) : (
          <>
            <input className={kit.search} type="search" placeholder="Find a faction" aria-label="Find a faction" value={q} onChange={(e) => setQ(e.target.value)} />
            <Choices label="Faction" hideLabel list value={s.id} onChange={(id) => { pickFaction(id); setChanging(false); setQ(""); }}
              options={shown.map((f) => {
                const other = at((x) => x.id === f.id);
                return { value: f.id, name: f.name, note: other >= 0 ? `${seatName(other)} has it` : f.expansion !== "BASE" ? EXPANSION_NAMES[f.expansion] : undefined,
                  label: <span className={kit.line} style={{ gap: 8 }}><Swatch faction={f.id} small />{f.name}</span> };
              })} />
          </>
        )}
      </div>
      <Choices label="Colour" value={s.color} onChange={pickColour}
        options={colours.map((c) => {
          const other = at((x) => x.color === c);
          return { value: c, name: c, note: other >= 0 ? `${seatName(other)}; swaps` : undefined,
            label: <span className={kit.line} style={{ gap: 6 }}><span aria-hidden="true" style={{ width: 14, height: 14, borderRadius: 7, background: pcolor(c) }} />{c}</span> };
        })} />
      {alliance ? (
        <Choices label="Alliance partner" value={s.alliancePartner === undefined ? undefined : String(s.alliancePartner)} onChange={(v) => pickPartner(Number(v))}
          options={seats.slice(0, count).map((_, j) => j).filter((j) => j !== i).map((j) => ({ value: String(j), label: seatName(j) }))} />
      ) : null}
      <Button block onClick={close}>Done</Button>
    </Sheet>
  );
}
