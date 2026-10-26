// Twilight's Fall reference cards: which factions are in the deck and each
// card's priority number (top right of the card). Numbers from the rulebook's
// list as quoted by the Twilight Imperium Wiki ("Twilight's Fall", Set-Up).
// Firmament and Obsidian share one card; the deck uses Firmament's side.

export const PRIORITY: Record<string, number> = {
  "Mahact Gene-Sorcerers": 1,
  Nomad: 2,
  "Federation of Sol": 3,
  "Yin Brotherhood": 4,
  "L1Z1X Mindnet": 5,
  "Vuil'raith Cabal": 6,
  "Deepwrought Scholarate": 7,
  "Barony of Letnev": 8,
  Empyrean: 9,
  "Sardakk N'orr": 10,
  "Yssaril Tribes": 11,
  "Ral Nel Consortium": 12,
  "Titans of Ul": 13,
  "Embers of Muaat": 14,
  "Mentak Coalition": 15,
  "Crimson Rebellion": 16,
  "Clan of Saar": 17,
  "Emirates of Hacan": 18,
  "Naaz-Rokha Alliance": 19,
  "Ghosts of Creuss": 20,
  "Last Bastion": 21,
  "Nekro Virus": 22,
  "Council Keleres": 23,
  "Universities of Jol-Nar": 24,
  "Argent Flight": 25,
  "Xxcha Kingdom": 26,
  Winnu: 27,
  "Naalu Collective": 28,
  Arborec: 29,
  Firmament: 30,
};

export const KELERES = "Council Keleres";

// The 8 Mahact Kings (upstream's Twilight's Fall factions).
export const KINGS = [
  "A Sickening Lurch",
  "Avarice Rex",
  "El Nen Janovet",
  "Il Na Viroset",
  "Il Sai Lakoe",
  "Radiant Aur",
  "The Ruby Monarch",
  "The Saint of Swords",
];

export function deck(keleres: boolean) {
  return Object.keys(PRIORITY).filter((f) => keleres || f !== KELERES).sort((a, b) => PRIORITY[a]! - PRIORITY[b]!);
}

export const byPriority = (a: string, b: string) => (PRIORITY[a] ?? 99) - (PRIORITY[b] ?? 99);
