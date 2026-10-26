"use client";
// Says so when this phone has lost its connection, so nobody trusts a stale screen.
// Two honest signals: the browser's online/offline events, and Firestore's own
// view of the game document (fromCache stays true while its connection is down).
// A second listener on the same document shares upstream's connection.
import { doc, onSnapshot } from "firebase/firestore";
import { useEffect, useState } from "react";
import DBConnection from "../../data/DBConnection";
import { kit } from "../ui/kit";

export function useOffline(gameId: string) {
  const [browserOnline, setBrowserOnline] = useState(true);
  const [fromCache, setFromCache] = useState(false);
  useEffect(() => {
    const sync = () => setBrowserOnline(navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    let unlisten: (() => void) | undefined;
    try {
      unlisten = onSnapshot(doc(DBConnection.get(), "games", gameId), { includeMetadataChanges: true },
        (s) => setFromCache(s.metadata.fromCache), () => setFromCache(true));
    } catch { /* no listener: the browser signal alone */ }
    return () => { window.removeEventListener("online", sync); window.removeEventListener("offline", sync); unlisten?.(); };
  }, [gameId]);
  return !browserOnline || fromCache;
}

export function OfflineBanner({ gameId }: { gameId: string }) {
  const offline = useOffline(gameId);
  if (!offline) return null;
  return (
    <div className={kit.banner} role="alert" aria-label="Offline">
      <span className={kit.grow}>This phone is offline or reconnecting. What you see may be out of date, and changes may not go through.</span>
    </div>
  );
}
