import { Atkinson_Hyperlegible, IBM_Plex_Mono, Michroma } from "next/font/google";
import { Suspense } from "react";
import "server-only";
import {
  getGameData,
  getGamePassword,
  getSession,
  getTimers,
  TIASession,
} from "../../../../server/util/fetch";
import DataInitializer from "../../../../src/context/DataWrapper";
import { getSessionIdFromCookie } from "../../../../src/util/server";
import { Optional } from "../../../../src/util/types/types";

const display = Michroma({ weight: "400", subsets: ["latin"], variable: "--play-display" });
const body = Atkinson_Hyperlegible({ weight: ["400", "700"], subsets: ["latin"], variable: "--play-body" });
const mono = IBM_Plex_Mono({ weight: ["500", "600"], subsets: ["latin"], variable: "--play-mono" });

// Same loading as upstream's game layout (app/[locale]/game/[gameId]/layout.tsx),
// without its sidebars. Keep in step with it when upstream changes how games load.
async function fetchGameData(gameId: string, sessionId: Optional<string>) {
  const [storedData, timers, password, session] = await Promise.all([
    getGameData(gameId, "games"),
    getTimers(gameId, "timers"),
    getGamePassword(gameId),
    sessionId ? getSession(sessionId) : Promise.resolve<Optional<TIASession>>(undefined),
  ]);
  storedData.timers = timers;
  storedData.gameId = gameId;
  if (password) {
    storedData.viewOnly = !session || !(session.games ?? []).includes(gameId);
  }
  return storedData;
}

export default async function PlayLayout({
  children,
  params,
}: LayoutProps<"/[locale]/play/[gameId]">) {
  const { gameId } = await params;
  const sessionId = await getSessionIdFromCookie();
  return (
    <div className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <Suspense fallback={<p style={{ padding: 24 }}>Loading the game…</p>}>
        <DataInitializer gameId={gameId} data={fetchGameData(gameId, sessionId)}>
          {children}
        </DataInitializer>
      </Suspense>
    </div>
  );
}
