# Fork notes

This is the Kautiontape fork of [ti-assistant/ti-assistant](https://github.com/ti-assistant/ti-assistant).
It adds self-hosting and features for our group, and merges upstream regularly.

## The rule

New code goes in new places. Upstream files are only edited at the seams
listed below, so an upstream merge can only conflict in those spots.

- Fork-only directories: `selfhost/`, `src/fork/`, `app/[locale]/play/`,
  `app/[locale]/draft/`, `app/api/fork/`, `sidecar/`, `.github/`.
- New UI imports upstream's engine (`src/util/api/events.ts`,
  `useDataUpdate`, the `src/context/*DataHooks.ts` hooks, `src/components/*`)
  instead of changing it.
- Adding a seam means adding a row here in the same commit.

## Seams

| # | Where | What and why | Upstream PR? |
|---|-------|--------------|--------------|
| S1 | `src/util/server.ts` (`getAdminCredential`) | Use `GOOGLE_APPLICATION_CREDENTIALS` when set; otherwise read upstream's key file at runtime instead of importing it, so builds don't need the key. | Candidate |
| S2 | `src/data/DBConnection.ts` | Firebase web config from `NEXT_PUBLIC_FIREBASE_*`, defaulting to upstream's project. `NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST` overrides the dev emulator address (`off` disables it). | Candidate |
| S3 | `src/components/Header/Header.tsx`, `src/components/QRCode/QRCodeButtonWrapper.tsx`, `app/[locale]/archive/[gameId]/layout.tsx` | `NEXT_PUBLIC_BASE_URL` for share links and QR codes, falling back to upstream's URLs. | Candidate |

Planned, not yet added:

- **S4, fork action registry.** One `default:` fallback in the action switches
  (`app/api/[gameId]/dataUpdate/route.ts`, `src/util/api/gameLog.ts`,
  `src/util/api/opposite.ts`, `src/components/LogEntry.tsx`) and one union member
  in `src/util/types/api.d.ts`. When it lands, also check `cleanLogData`,
  `TURN_BOUNDARIES` and the `REPLACE`/`REWIND` paths pass unknown actions through.
- **S6, archive fix.** `processGames` in `app/[locale]/stats/processor.ts` fires
  every game at once with unawaited writes. Better sent upstream than carried here.

## Things that need no seam

- **Cron.** `/api/process-games` only checks that an `X-Appengine-Cron` header
  exists. The reverse proxy strips that header and blocks the path; the `cron`
  service in `selfhost/docker-compose.yml` calls it on the internal network.
- **Docker.** Everything lives in `selfhost/`, so upstream adding its own
  Dockerfile won't collide.

## Merging upstream

`.github/workflows/upstream-sync.yml` runs weekly (or by hand). It merges
`upstream/main` into a branch called `upstream-sync`, runs the build, and opens
a PR. If the merge conflicts, it opens an issue listing the files instead. The PR
body lists files both sides changed; re-check those seams before merging.

By hand:

```sh
git fetch upstream
git switch main && git merge upstream/main   # merge, never rebase
npm ci && npm run build
```

## Local development

Same as upstream's README (Firestore emulator on port 8020). On a machine with a
system libvips (Arch has one), install with `SHARP_IGNORE_GLOBAL_LIBVIPS=1 npm ci`
or sharp tries to compile itself and fails.
