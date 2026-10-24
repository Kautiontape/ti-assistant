// The units a player fields: their faction's unique units, with unit upgrades
// they have researched, from upstream's faction and tech data. Plain
// functions so they can be tested without the browser.

// Small copies of upstream's hasTech and getCombatValues (util/api/techs.ts,
// util/techs.ts): those modules pull in React contexts, which a node test can't load.
const hasTech = (f: Faction, t?: Tech) => !!t && t.state !== "purged" && !!f.techs?.[t.id] && f.techs[t.id]?.state !== "purged";
const getCombatValues = (c: string | number | undefined) => typeof c === "string" ? { combat: parseInt(c.split("(x")[0] ?? "0"), num: parseInt(c.split("(x")[1]?.split(")")[0] ?? "0") } : { combat: c ?? 0, num: 0 };

export type UnitRow = {
  key: string; name: string; type: UnitType; stats: UnitStats; abilities: string[]; text?: string;
  // "unique" is a faction unit, "upgrade" a researched unit upgrade
  source: "unique" | "upgrade"; upgraded?: boolean;
};

type UpgradeTech = Extract<Tech, { type: "UPGRADE" }>;

// Twilight's Fall unit upgrades that change a unique unit (mirrors FactionPanel).
function adjusted(unit: Unit, owns: (name: string) => boolean): UnitStats {
  const s = { ...unit.stats };
  if (unit.type === "Flagship" && owns("Echo of Ascension")) {
    const { combat, num } = getCombatValues(s.combat);
    s.capacity = (s.capacity ?? 0) + 2; s.move = (s.move ?? 0) + 1;
    s.combat = `${combat - 1}(x${num + 1})`;
  }
  if (unit.type === "Mech") {
    const { combat, num } = getCombatValues(s.combat);
    if (owns("Eidolon Landwaster")) s.combat = `${combat}(x${num + 1})`;
    else if (owns("Eidolon Terminus")) s.combat = num > 0 ? `${combat - 1}(x${num})` : combat - 1;
    else if (owns("Valefar Prime")) s.cost = 1;
  }
  return s;
}

export function unitRows(faction: Pick<Faction, "id" | "techs"> & { units?: Unit[] }, techs: Partial<Record<TechId, Tech>>, owns: (name: string) => boolean = () => false): UnitRow[] {
  const rows: UnitRow[] = [];
  const shown = new Set<string>();
  const have = (t?: Tech) => hasTech(faction as Faction, t);
  for (const unit of faction.units ?? []) {
    const up = unit.upgrade ? techs[unit.upgrade] : undefined;
    if (up && up.type === "UPGRADE" && have(up)) {
      shown.add(up.id);
      rows.push({ key: up.id, name: up.name, type: unit.type, stats: up.stats, abilities: up.abilities, text: up.description || undefined, source: "unique", upgraded: true });
    } else {
      rows.push({ key: unit.name, name: unit.name, type: unit.type, stats: adjusted(unit, owns), abilities: unit.abilities ?? [], text: unit.description || undefined, source: "unique" });
    }
  }
  const owned = Object.keys(faction.techs ?? {}).map((t) => techs[t as TechId]).filter((t): t is UpgradeTech => !!t && t.type === "UPGRADE" && have(t) && !shown.has(t.id));
  // An upgrade that replaces another one the player also owns hides the older one.
  const replaced = new Set(owned.map((t) => t.replaces).filter(Boolean));
  for (const t of owned) {
    if (replaced.has(t.id)) continue;
    rows.push({ key: t.id, name: t.name, type: t.unitType, stats: t.stats, abilities: t.abilities, text: t.description || undefined, source: "upgrade", upgraded: true });
  }
  return rows;
}

// "9(x2)" reads "9 ×2"; blank stats show a dash.
export const statText = (v: number | string | undefined) => v === undefined || v === 0 || v === "" ? "–" : String(v).replace(/\(x(\d)\)/, " ×$1");

// "SPACE CANNON 5(x3)" reads "Space cannon 5 ×3".
export const abilityText = (a: string) => { const t = statText(a).toLowerCase(); return t.charAt(0).toUpperCase() + t.slice(1); };
