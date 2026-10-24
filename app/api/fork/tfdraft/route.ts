import { NextResponse } from "next/server";
import { createTfDraft, TfDraftError } from "../../../../src/fork/tfdraft/server";

// Makes a Twilight's Fall draft from slices a phone generated (src/fork/tfdraft/NewTfDraft.tsx).
export async function POST(req: Request) {
  try {
    const id = await createTfDraft(await req.json());
    return NextResponse.json({ id });
  } catch (e) {
    if (e instanceof TfDraftError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
