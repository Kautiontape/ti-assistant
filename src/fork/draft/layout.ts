// The draft's map for a player count: Milty's layout (milty.ts) on upstream's
// template for that count. Shared by the setup page, the draft and the server.
import { getDefaultMapString } from "../../util/map";
import { MAP_STYLE, miltyLayout } from "./milty";

export const layoutFor = (players: number, expansions: string[]) =>
  miltyLayout(players, getDefaultMapString(players, MAP_STYLE[players] ?? "standard", expansions.includes("THUNDERS EDGE")));

// Every count but 6 uses hyperlanes, which come with Prophecy of Kings; upstream
// also allows 7 and 8 players only with it (seven or eight colours).
export const needsPok = (players: number) => players !== 6;
