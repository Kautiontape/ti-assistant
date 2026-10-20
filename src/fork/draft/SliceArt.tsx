// A slice as it sits in front of its owner: the home at the bottom, Mecatol
// above. Tiles come in Milty's slice order (MILTY_SLOTS); a missing tile is
// drawn as an empty hex with its label (the slot number in the setup guide).
import styles from "../play/play.module.scss";
import { toPixel, type Cube } from "./milty";

export function SliceArt({ tiles, canonical, size, home, labels }: { tiles: (string | undefined)[]; canonical: Cube[]; size: number; home?: string; labels?: string[] }) {
  const cells = [{ c: [0, 0, 0] as Cube, id: home, label: "Home" }, ...canonical.map((c, j) => ({ c, id: tiles[j], label: labels?.[j] ?? "" }))]
    .map((x) => ({ ...x, ...toPixel([-x.c[0], -x.c[1], -x.c[2]], size) }));
  const hw = size, hh = (Math.sqrt(3) / 2) * size;
  const minX = Math.min(...cells.map((p) => p.x)) - hw, maxX = Math.max(...cells.map((p) => p.x)) + hw;
  const minY = Math.min(...cells.map((p) => p.y)) - hh, maxY = Math.max(...cells.map((p) => p.y)) + hh;
  return (
    <div className={styles.sliceArt} style={{ width: maxX - minX, height: maxY - minY }} aria-hidden="true">
      {cells.map((p, k) => p.id ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={k} src={`/images/systems/ST_${p.id}.png`} alt="" style={{ left: p.x - hw - minX, top: p.y - hh - minY, width: 2 * hw, height: 2 * hh }} />
      ) : (
        <span key={k} className={styles.hexHome} style={{ left: p.x - hw - minX, top: p.y - hh - minY, width: 2 * hw, height: 2 * hh }}>{p.label}</span>
      ))}
    </div>
  );
}
