"use client";
import { usePathname } from "next/navigation";
import { PropsWithChildren } from "react";

// Seam helper (see docs/ktn/README.md, S7): /play, /draft and the start page
// have their own top bar, so upstream's NavBar steps aside there and shows
// everywhere else. The start page is served at /<locale> (seam S8), which is
// the path the browser sees.
export default function HideOnPlay({ children }: PropsWithChildren) {
  const pathname = usePathname() ?? "";
  if (/^\/[^/]+(\/(play|draft|start)(\/|$)|\/?$)/.test(pathname)) return null;
  return <>{children}</>;
}
