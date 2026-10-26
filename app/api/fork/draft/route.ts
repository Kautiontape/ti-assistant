import { NextResponse } from "next/server";
import { createDraft, DraftError } from "../../../../src/fork/draft/server";

// Makes a draft from slices a phone generated (src/fork/draft/NewDraft.tsx).
export async function POST(req: Request) {
  try {
    const id = await createDraft(await req.json());
    return NextResponse.json({ id });
  } catch (e) {
    if (e instanceof DraftError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
