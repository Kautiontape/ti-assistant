"use client";
import { usePathname } from "next/navigation";
import { PropsWithChildren } from "react";

// Seam helper (see docs/ktn/README.md, S7): /play and /draft have their own
// top bar, so upstream's NavBar steps aside there and shows everywhere else.
export default function HideOnPlay({ children }: PropsWithChildren) {
  const pathname = usePathname() ?? "";
  if (/^\/[^/]+\/(play|draft)(\/|$)/.test(pathname)) return null;
  return <>{children}</>;
}
