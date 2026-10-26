# Upstream merge plan (2026-10-26)

**What:** what upstream has changed since the fork started, and how to bring it in.
**Surface:** `main`, `ktn`, `play/design-language`; [CI/CD notes](ci-cd.md) (Upstream sync), the [seams](README.md#seams).

## What upstream has

Checked on 2026-10-26 with `git fetch upstream` and `git ls-remote upstream`.

- **`main`: no commits since the fork base.** Upstream's `main` is still
  5c34942 (2026-09-26, "Add ability to use primaries when using Mathis
  Mathinus, and fix Sins of the Father", #196), which is the merge base of
  `main`, `ktn` and `play/design-language`. Our `main` is the same commit.
- **Open PR #148, branch `system-images`** (2026-01-25, two commits): new art
  for 31 system tiles (`public/images/systems/ST_92.png` to `ST_118`, `ST_96A/B`,
  `ST_666` to `ST_668`), with no code. It branches from d495ada, older than
  the fork base. Neither upstream's `main` nor the fork has touched those files
  since then, and `git merge-tree` merges it into `play/design-language`
  without conflicts.

## Plan

1. **Nothing to merge now.** The weekly `ktn-upstream-sync.yml` run finds
   `behind=0` and only re-mirrors `main`.
2. **PR #148: wait for upstream.** Taking it now (by cherry-pick or merge)
   would put upstream's January art on `ktn` ahead of upstream. If upstream
   later squashes the PR or re-exports the images, the fork ends up with binary
   conflicts that have to be settled by picking a side file by file. Once it
   lands on upstream's `main`, the sync PR brings it in like any other change.
3. **Land `play/design-language` on `ktn` before the next upstream merge.**
   The sync job merges into `ktn`, which is 114 commits behind this branch. Its
   "files both sides changed" list compares against `ktn`, so until this branch
   is on `ktn`, it misses seams S4 and S7 to S9 (`ktn` has only S1 to S3),
   and the PR's build doesn't cover `/play`, `/draft` or `/draft/tf`.
4. **When upstream does move**, review the sync PR as follows:
   - The upstream files this branch edits are exactly the seams S1 to S4 and
     S7 to S9 in [the seams table](README.md#seams) (12 files; checked with
     `git diff --name-only 5c34942 play/design-language`). Any of them in the
     PR's overlap list needs its seam re-applied by hand, keeping the
     `ktn seam` markers.
   - Read the upstream commits against "Upstream internals `/play` imports",
     "`/draft` uses" and "`/draft/tf` uses" in the README. Those break without
     a conflict: a renamed helper, a changed log-entry shape, the tile alt text
     the Map tab reads, `create-game`'s argument order, or a map template
     `miltyLayout()` no longer matches.
   - Locally, on the merge branch: `npm run build`, then the harness's
     `scripts/run-suite.sh` against `next dev --webpack`, then
     `parity-results-check.cjs` on its own (the suite leaves it out).
   - Merge the PR into `ktn` with a merge commit, as the CI/CD notes say. That
     deploys it.
