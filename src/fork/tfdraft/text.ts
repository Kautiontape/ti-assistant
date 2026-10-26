// Words for the Twilight's Fall draft's steps, shared by the new-draft screen
// (what will happen) and the live draft (what's happening).
import type { Step, TfRules } from "./draft";
import type { Style } from "./layouts";

const list = (a: string[]) => (a.length < 2 ? a.join("") : `${a.slice(0, -1).join(", ")} and ${a.at(-1)}`);

export const KIND_NAMES = { slice: "a slice", seat: "a seat", pack: "a card pack", king: "a King" } as const;

// The whole draft in order, one line per step: [name, what happens].
export function runThrough(style: Style, rules: TfRules): [string, string][] {
  const out: [string, string][] = [];
  if (rules.cards === "pass") out.push(["Reference cards", "Each player is dealt 3 faction reference cards. Everyone keeps 1 in secret and passes 2 on, then keeps 1 of those and passes the last on."]);
  const kinds = ["a slice", ...(style === "nucleus" ? ["a seat"] : []), ...(rules.cards === "packs" ? ["a pack of 3 reference cards"] : []), ...(rules.kings === "snake" ? ["a King"] : [])];
  out.push(["Snake draft", `${kinds.length} round${kinds.length > 1 ? "s" : ""} in snake order. Each player takes ${list(kinds)}.`]);
  out.push(["Priority", style === "nucleus"
    ? "Everyone picks one of their cards in secret, then all are shown. The lowest priority number is speaker. Players keep the seats they drafted."
    : "Everyone picks one of their cards in secret, then all are shown. The lowest priority number is speaker, and players sit clockwise in priority order, each slice in front of its owner."]);
  out.push(["Home system", rules.home === "open"
    ? "Speaker first, then clockwise: each player shows one of their two other cards. That faction's home system is theirs."
    : "Everyone picks one of their two other cards in secret, then all are shown. That faction's home system is theirs."]);
  if (rules.keleres) out.push(["Council Keleres", "If someone uses Keleres for their home, the app draws a faction no one holds and gives them that faction's home system."]);
  if (rules.kings === "order") out.push(["Kings", "The player to the speaker's right chooses a Mahact King first, then counter-clockwise. The speaker chooses last."]);
  out.push(["Starting units", "Each player's last card sets their starting units."]);
  out.push(["Game", "The app creates the game with the map, seats, speaker, Kings, home systems and starting units filled in. The inaugural splice is the game's first step."]);
  return out;
}

export function stepName(step: Step | undefined) {
  if (!step) return "All picked";
  switch (step.id) {
    case "cards1": return "Cards: keep 1 of 3";
    case "cards2": return "Cards: keep 1 of 2";
    case "snake": return "Snake draft";
    case "priority": return "Priority";
    case "home": return "Home systems";
    case "kings": return "Kings";
  }
}
