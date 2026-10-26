import { Atkinson_Hyperlegible, IBM_Plex_Mono, Michroma } from "next/font/google";
import { PropsWithChildren } from "react";

// Same fonts as /play and /draft.
const display = Michroma({ weight: "400", subsets: ["latin"], variable: "--play-display" });
const body = Atkinson_Hyperlegible({ weight: ["400", "700"], subsets: ["latin"], variable: "--play-body" });
const mono = IBM_Plex_Mono({ weight: ["500", "600"], subsets: ["latin"], variable: "--play-mono" });

export default function StartLayout({ children }: PropsWithChildren) {
  return <div className={`${display.variable} ${body.variable} ${mono.variable}`}>{children}</div>;
}
