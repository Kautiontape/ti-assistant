# ktn fork notes

This is the Kautiontape fork of [ti-assistant/ti-assistant](https://github.com/ti-assistant/ti-assistant),
served at https://ti.kautiontape.com from ktn. `ktn` is the deployed (default)
branch; `main` is an exact mirror of upstream. Build, deploy and sync are in
[ci-cd.md](ci-cd.md).

## The rule

New code goes in new places. Upstream files are only edited at the seams
listed below, so an upstream merge can only conflict in those spots.

- Fork-only paths: `deploy/ktn/`, `docs/ktn/`, `.github/`, `src/fork/`,
  `app/[locale]/play/`, `app/[locale]/draft/`, `app/[locale]/start/`, `app/api/fork/`, `sidecar/`,
  `prototype/` (design prototypes, published as private claude.ai pages; never deployed).
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
| S4 | `app/api/[gameId]/dataUpdate/route.ts`, `src/util/api/gameLog.ts` (`getHandler`), `src/util/api/opposite.ts` (`getOppositeHandler`), `src/components/LogEntry.tsx`, `src/util/types/api.d.ts` (`GameUpdateData`) | Fork action registry: each switch falls back to `src/fork/actions/registry.ts` for actions it doesn't know, LogEntry draws them with `ForkLogEntry`, and the union gains `ForkUpdateData` (`src/fork/actions/types.d.ts`). One import and one line per file, marked `ktn seam S4`. A new fork action never touches these files again. | No (fork-only actions) |
| S7 | `app/[locale]/inner-layout.tsx` | Wraps upstream's NavBar in `HideOnPlay` (`src/fork/play/HideOnPlay.tsx`), so `/play` can use its own top bar. Three lines: one import and the wrapper's open and close tags. | No (fork-only screen) |
| S8 | `proxy.ts` | The site's base address (`/<locale>`) shows the fork's start page (`src/fork/home/StartPage.tsx`, route `app/[locale]/start/`) instead of upstream's home: a rewrite from `forkStart` in `src/fork/home/proxy.ts`. One import and one changed `return`, marked `ktn seam S8`. Upstream's home links Archive, Stats, Supporters and "Help support", which this copy doesn't run. | No (fork-only page) |

Planned, not yet added:

- **S6, archive fix.** `processGames` in `app/[locale]/stats/processor.ts` fires
  every game at once with unawaited writes. Better sent upstream than carried here.

## Upstream internals `/play` imports

Not seams (no upstream file is edited), but if an upstream merge breaks the
build in `src/fork/play/`, these are where to look. Beyond the event
constructors and data hooks:

- Rules helpers: `computeRemainingVotes`, `canFactionVote`, `getTargets` and
  `translateOutcome` from `src/components/VoteBlock/VoteBlock.tsx`;
  `computeVotes` from the page file
  `app/[locale]/game/[gameId]/main/phase/agenda/AgendaPhase.tsx`; `computeVPs`
  (`src/util/factions.ts`); `getSelectedActionFromLog` (`src/util/api/data.ts`);
  `getClaimedPlanets`, `getActiveAgenda` and `getAllVotes`
  (`src/util/actionLog.ts`); `getCurrentPhasePreviousLogEntries`
  (`src/util/api/actionLog.ts`); `sortStrategyCards`; `getStrategyCardsForFaction`.
- `setupPhaseComplete` from the page file
  `app/[locale]/game/[gameId]/main/phase/setup/SetupPhase.tsx`, for when the
  game can start; the starting-technology choices are copied from
  `StartingComponents.tsx` (`startingTechChoices` in `logic.ts`).
- `DBConnection` and `useUndo`, for undo's check against the server's newest
  entries.
- `RepealAgendaHandler` (`src/util/model/resolveAgenda.ts`), which the fork
  actions `UNRESOLVE_AGENDA` and `UNREVEAL_SUB_AGENDA`
  (`src/fork/actions/agendaUndo.ts`) run when /play undoes a resolve that had
  riders or Covert Legislation's hidden agenda. Upstream's own undo misses both
  because `RESOLVE_AGENDA` is a turn boundary; if upstream fixes that, drop the
  fork actions.
- The Map tab draws upstream's `GameMap` (`src/components/Map/`) with the same
  inputs as the footer's map (`getMapString`, `getWormholeNexusSystemNumber`,
  `fracturePlanetsOwned`). It reads taps from the tile images' alt text
  (`System 25 Tile`, set in `SystemImage.tsx`), so if upstream changes that text,
  tapping a system stops opening its sheet. The planet-to-tile match is copied
  from `PlanetOverlay.tsx` (`planetsInSystem` in `src/fork/play/logic.ts`).
- Log-entry shapes: `/play` reads `END_TURN`'s `prevFaction`, and relies on
  upstream storing each event as sent except for `REVEAL_OBJECTIVE`,
  `HIDE_OBJECTIVE` and `REMOVE_TECH`, which are rebuilt from `event` alone
  (`src/fork/play/useWrite.ts` handles those).
- Some upstream rules are copied rather than imported, because upstream keeps
  them inline in components: the claim rule (`ActionPhase.tsx`), status-phase
  scoring and reveal (`StatusPhase.tsx`), Checks and Balances
  (`StrategyPhase.tsx`), the voting order (`VotingColumn.tsx`) which bonus
  votes a player is offered and which riders a player may play (`VoteBlock.tsx`). Each copy in
  `src/fork/play/logic.ts` names its source.

## Upstream internals `/draft` uses

The Milty draft (`src/fork/draft/`) adds no seam. It keeps drafts in its own
collection, `forkDrafts`, which browsers may read one document at a time
(`deploy/ktn/firebase/firestore.rules`). If an upstream merge breaks it, look at:

- Upstream's `create-game` route handler, which `src/fork/draft/server.ts`
  calls in-process with `{factions, speaker, options}`. It relies on the
  `factions` array order becoming `mapPosition` (P1 first), `speaker` being an
  index into that array, and each faction needing `id`, `name` and `color`.
- `getDefaultMapString` and `getFactionSystemNumber` (`src/util/map.ts`): the
  6-player standard map with `P1`…`P6` homes at indices 19, 22, 25, 28, 31
  and 34, which `wedges()` in `src/fork/draft/milty.ts` turns into slices.
- `BASE_OPTIONS` (`server/data/options.ts`), `getFactions`, base data through
  `DatabaseFnsContext.getBaseValue`, and `GameMap` for the preview.
- Copied rather than imported: the hex spiral (`hexGrid.ts`), optimal value
  (`computeNearbyValues` in `MapBuilder.tsx`), the faction filter and colour
  choice (`setup-page.tsx`). The anomaly list in `milty.ts` comes from the
  tile art, since upstream's data has none.

## Things that need no seam

- **Cron.** `/api/process-games` only checks that an `X-Appengine-Cron` header
  exists. nginx strips that header and blocks the path; the `cron` service in
  `deploy/ktn/docker-compose.yml` calls it on the Docker network.
- **Docker.** Everything lives in `deploy/ktn/`, so upstream adding its own
  Dockerfile won't collide.

## Local development

Same as upstream's README (Firestore emulator on port 8020). On a machine with a
system libvips (Arch has one), install with `SHARP_IGNORE_GLOBAL_LIBVIPS=1 npm ci`
or sharp tries to compile itself and fails.
