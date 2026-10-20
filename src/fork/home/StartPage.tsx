"use client";
// The fork's start page at the site's base address (seam S8 in proxy.ts): back
// to the last game, join one on /play by its code, or start a game or a Milty
// draft. Upstream's home page also links Archive, Stats, Supporters and "Help
// support"; this copy doesn't run those (Stats reads upstream's own storage).
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import styles from "../play/play.module.scss";
import { Button, cx, kit, RowLink, Rows, rootAttrs, useDevicePrefs } from "../ui/kit";

type Recent = { gameId: string; seat: string };

// Games this device has a seat in (PlayApp's useSeat keeps "play-seat-<id>"),
// the last one opened first ("play-last").
function useRecentGames() {
  const [games, setGames] = useState<Recent[]>([]);
  const [last, setLast] = useState<string>();
  useEffect(() => {
    try {
      const out: Recent[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i) ?? "";
        const m = k.match(/^play-seat-(.+)$/);
        if (m) out.push({ gameId: m[1]!, seat: localStorage.getItem(k) ?? "" });
      }
      const l = localStorage.getItem("play-last") ?? undefined;
      setGames(out.sort((a, b) => Number(b.gameId === l) - Number(a.gameId === l) || a.gameId.localeCompare(b.gameId)));
      setLast(l);
    } catch { /* private mode: no recent games */ }
  }, []);
  return { games, last };
}

export default function StartPage() {
  const router = useRouter();
  const { prefs } = useDevicePrefs();
  const { games, last } = useRecentGames();
  const [code, setCode] = useState("");
  const join = () => { if (code) router.push(`/play/${code}`); };
  return (
    <div className={cx(kit.root, styles.root)} {...rootAttrs(prefs)}>
      <header className={styles.top}>
        <div className={styles.phase}><span className={styles.phaseName}>TI Assistant</span><span className={styles.round}>Kautiontape</span></div>
      </header>
      <main className={styles.main}>
        <section className={kit.card} aria-label="Play">
          <p className={kit.eyebrow}><span>Play</span></p>
          {last ? <Button kind="primary" size="tall" block href={`/play/${last}`} detail={games.find((g) => g.gameId === last)?.seat}>Back to game {last}</Button> : null}
          <form className={kit.line} onSubmit={(e) => { e.preventDefault(); join(); }}>
            <input className={kit.search} id="start-game-code" placeholder="Game code" value={code} onChange={(e) => setCode(e.target.value.trim())}
              aria-label="Game code" autoCapitalize="off" autoCorrect="off" spellCheck={false} />
            <Button size="small" type="submit" disabled={!code}>Join</Button>
          </form>
          {games.filter((g) => g.gameId !== last).length ? (
            <Rows label="Games on this device">
              {games.filter((g) => g.gameId !== last).map((g) => <RowLink key={g.gameId} href={`/play/${g.gameId}`} title={`Game ${g.gameId}`} detail={g.seat || "Watching"} />)}
            </Rows>
          ) : null}
        </section>
        <section className={kit.card} aria-label="Start">
          <p className={kit.eyebrow}><span>Start</span></p>
          <Rows>
            <RowLink href="/draft" title="Milty draft" detail="Draft slices, factions and seats, then the game is set up from them" />
            <RowLink href="/setup" external title="New game" detail="Choose factions, colours, the map and options on upstream's setup page" />
            <RowLink href="/map-builder" external title="Map builder" detail="Upstream's map builder" />
            <RowLink href="/FAQ" external title="FAQ" detail="Upstream's answers to common questions about the app" />
          </Rows>
        </section>
        <p className={kit.sub}>Built on <a href="https://www.ti-assistant.com" style={{ color: "inherit" }}>TI Assistant</a>. Not affiliated with Fantasy Flight Games.</p>
      </main>
    </div>
  );
}
