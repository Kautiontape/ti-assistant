import { NextResponse } from "next/server";
import { changeTfDraft, handOf, startTfGame, TfDraftError } from "../../../../../src/fork/tfdraft/server";

function fail(e: unknown) {
  if (e instanceof TfDraftError) return NextResponse.json({ error: e.message }, { status: e.status });
  console.error(e);
  return NextResponse.json({ error: "The server couldn't do that. Try again." }, { status: 500 });
}

// One player's own cards (?player=N). Hands aren't readable from the browser.
export async function GET(req: Request, { params }: RouteContext<"/api/fork/tfdraft/[draftId]">) {
  const { draftId } = await params;
  try {
    return NextResponse.json(await handOf(draftId, Number(new URL(req.url).searchParams.get("player"))));
  } catch (e) {
    return fail(e);
  }
}

// A pick, a secret pick, an undo, or creating the game once the draft is done.
export async function POST(req: Request, { params }: RouteContext<"/api/fork/tfdraft/[draftId]">) {
  const { draftId } = await params;
  try {
    const body = await req.json();
    if (body.action === "start") return NextResponse.json({ gameId: await startTfGame(draftId) });
    return NextResponse.json(await changeTfDraft(draftId, body));
  } catch (e) {
    return fail(e);
  }
}
