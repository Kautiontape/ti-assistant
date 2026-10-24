import { NextResponse } from "next/server";
import { exportChangedGames } from "../../../../src/fork/server/exportGame";

// The daily job (the cron service in deploy/ktn/docker-compose.yml) exports
// every game changed since its last export. Like upstream's process-games,
// it needs App Engine's cron header, which nginx strips from outside requests.
export async function GET(req: Request) {
  if (!req.headers.get("X-Appengine-Cron")) return new Response("Not found", { status: 404 });
  return NextResponse.json(await exportChangedGames());
}
