// The Twilight's Fall draft's layouts on upstream's own map templates. Kept
// apart from layouts.ts, which stays free of upstream imports for Node checks.
import { getDefaultMapString } from "../../util/map";
import { layoutFor, mapStyleFor, type Style } from "./layouts";

export const boardLayout = (style: Style, players: number) => layoutFor(style, players, getDefaultMapString(players, mapStyleFor(players), true));
