"use client";
import { usePathname } from "next/navigation";
import { PropsWithChildren } from "react";

// Seam helper (see docs/ktn/README.md, S7): /play has its own top bar, so
// upstream's NavBar steps aside there and shows everywhere else.
export default function HideOnPlay({ children }: PropsWithChildren) {
  const pathname = usePathname() ?? "";
  if (/^\/[^/]+\/play(\/|$)/.test(pathname)) return null;
  return <>{children}</>;
}
