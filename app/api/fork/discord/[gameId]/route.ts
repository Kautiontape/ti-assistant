import { NextResponse } from "next/server";
import { canEditGame } from "../../../../../server/util/fetch";
import { changeDiscord, discordSettings, validWebhook } from "../../../../../src/fork/server/discord";
import { DISCORD_EVENTS, DiscordEvent } from "../../../../../src/fork/server/private";
import { validGameId } from "../../../../../src/fork/server/storage";
import { getFirestoreAdmin } from "../../../../../src/util/server";

// A game's Discord settings (src/fork/play/DiscordSettings.tsx). The webhook
// address itself never leaves the server: GET only says whether there is one.
export async function GET(_req: Request, { params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await params;
  if (!validGameId(gameId)) return NextResponse.json({ error: "There's no such game." }, { status: 404 });
  return NextResponse.json(await discordSettings(gameId), { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request, { params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await params;
  if (!validGameId(gameId)) return NextResponse.json({ error: "There's no such game." }, { status: 404 });
  if (!(await canEditGame(gameId))) return NextResponse.json({ error: "This game is locked." }, { status: 403 });
  const db = await getFirestoreAdmin();
  if (!(await db.collection("games").doc(gameId).get()).exists) return NextResponse.json({ error: "There's no such game." }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as { on?: unknown; events?: unknown; webhook?: unknown };
  const change: { on?: boolean; events?: DiscordEvent[]; webhook?: string | null } = {};
  if (typeof body.on === "boolean") change.on = body.on;
  if (Array.isArray(body.events)) change.events = body.events.filter((e): e is DiscordEvent => DISCORD_EVENTS.includes(e));
  if (body.webhook === null || body.webhook === "") change.webhook = null;
  else if (typeof body.webhook === "string") {
    if (!validWebhook(body.webhook)) return NextResponse.json({ error: "That isn't a Discord webhook address (https://discord.com/api/webhooks/…)." }, { status: 400 });
    change.webhook = body.webhook;
  }
  await changeDiscord(gameId, change);
  return NextResponse.json(await discordSettings(gameId));
}
