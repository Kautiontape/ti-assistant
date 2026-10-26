import { NextResponse } from "next/server";
import { changeDraft, DraftError, startGame } from "../../../../../src/fork/draft/server";

// A pick, an undo, a reroll, or creating the game once the draft is done.
export async function POST(req: Request, { params }: RouteContext<"/api/fork/draft/[draftId]">) {
  const { draftId } = await params;
  try {
    const body = await req.json();
    if (body.action === "start") return NextResponse.json({ gameId: await startGame(draftId) });
    return NextResponse.json(await changeDraft(draftId, body));
  } catch (e) {
    if (e instanceof DraftError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error(e);
    return NextResponse.json({ error: "The server couldn't do that. Try again." }, { status: 500 });
  }
}
