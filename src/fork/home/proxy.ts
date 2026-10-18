import { NextRequest, NextResponse } from "next/server";

// ktn seam S8 (proxy.ts, docs/ktn/README.md): the site's base address, /<locale>,
// shows the fork's start page (src/fork/home/StartPage.tsx) instead of upstream's.
export function forkStart(request: NextRequest) {
  const m = request.nextUrl.pathname.match(/^\/([^/]+)\/?$/);
  if (!m) return;
  const url = request.nextUrl.clone();
  url.pathname = `/${m[1]}/start`;
  return NextResponse.rewrite(url);
}
