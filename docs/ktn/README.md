# ktn fork notes

This is the Kautiontape fork of [ti-assistant/ti-assistant](https://github.com/ti-assistant/ti-assistant),
served at https://ti.kautiontape.com from ktn. `ktn` is the deployed (default)
branch; `main` is an exact mirror of upstream. Build, deploy and sync are in
[ci-cd.md](ci-cd.md). Seat keys and private notes (`app/api/fork/seat/`,
`app/api/fork/notes/`, `src/fork/notes/`) are in [seats-and-notes.md](seats-and-notes.md).

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
| S1 | `src/util/server.ts` (`getAdminCredential`) | Use `GOOGLE_APPLICATION_CREDENTIALS` when set; otherwise read upstream's key file at runtime instead of importing it, so builds don't need the key. The credential is read once and awaited before `getApps()`, so parallel first requests on a fresh server can't both initialise the app. | Candidate |
| S2 | `src/data/DBConnection.ts` | Firebase web config from `NEXT_PUBLIC_FIREBASE_*`, defaulting to upstream's project. `NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST` overrides the dev emulator address (`off` disables it). `NEXT_PUBLIC_FIRESTORE_EMULATOR_TUNNEL` (a bare hostname) is where a dev page opened from anywhere but localhost finds the emulator, over HTTPS. A production build made with `NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST` set (local end-to-end runs only) uses the emulator too. | Candidate |
| S3 | `src/components/Header/Header.tsx`, `src/components/QRCode/QRCodeButtonWrapper.tsx`, `app/[locale]/archive/[gameId]/layout.tsx` | `NEXT_PUBLIC_BASE_URL` for share links and QR codes, falling back to upstream's URLs. | Candidate |
| S4 | `app/api/[gameId]/dataUpdate/route.ts`, `src/util/api/gameLog.ts` (`getHandler`), `src/util/api/opposite.ts` (`getOppositeHandler`), `src/components/LogEntry.tsx`, `src/util/types/api.d.ts` (`GameUpdateData`) | Fork action registry: each switch falls back to `src/fork/actions/registry.ts` for actions it doesn't know, LogEntry draws them with `ForkLogEntry`, and the union gains `ForkUpdateData` (`src/fork/actions/types.d.ts`). One import and one line per file, marked `ktn seam S4`. A new fork action never touches these files again. | No (fork-only actions) |
| S7 | `app/[locale]/inner-layout.tsx` | Wraps upstream's NavBar in `HideOnPlay` (`src/fork/play/HideOnPlay.tsx`), so `/play` can use its own top bar. Three lines: one import and the wrapper's open and close tags. | No (fork-only screen) |
| S8 | `proxy.ts` | The site's base address (`/<locale>`) shows the fork's start page (`src/fork/home/StartPage.tsx`, route `app/[locale]/start/`) instead of upstream's home: a rewrite from `forkStart` in `src/fork/home/proxy.ts`. One import and one changed `return`, marked `ktn seam S8`. Upstream's home links Archive, Stats, Supporters and "Help support", which this copy doesn't run. | No (fork-only page) |
| S9 | `app/api/[gameId]/dataUpdate/route.ts` | After every successful save, `after(() => forkAfterUpdate(gameId))` (`src/fork/server/afterUpdate.ts`): Discord posts and the export at game end run once the phone has its answer. Inside the save's transaction, `forkGuard` (`src/fork/server/guard.ts`) refuses with 409 a write whose `expect` (what the phone saw: phase, round, whose turn, no action or combat yet, the entry an undo means) no longer holds, so two phones tapping the same thing at once apply it once. Two imports, `after` added to the `next/server` import, and three lines, marked `ktn seam S9`. | Candidate (the double-advance race is upstream's too) |

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
- Upstream's timers: `TimerContext` (from `TimerProvider` in the shared
  layout), `useSetGlobalPause` and the `timers` document. `/play` activates
  the game timer and the active player's timer as upstream's `GameTimer` and
  `FactionTimer` do (`src/fork/play/Clock.tsx`).
- The results views (`src/fork/play/Results.tsx`) run upstream's replay worker,
  `main/phase/results/game-log.worker.tsx`, by URL, with the starting state
  built as `ResultsPhase.tsx` builds it (copied into `src/fork/play/results.ts`,
  since that page doesn't export it). Turbopack's dev server can't start the
  worker (upstream's results page fails there too); `next dev --webpack` and
  production builds can.
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
- `getDefaultMapString` and `getFactionSystemNumber` (`src/util/map.ts`). The
  draft's maps are milty.shenanigans.be's, laid over upstream's templates:
  the standard map for 6 players, the "warp" maps for 4, 5, 7 and 8 (whose
  hyperlanes it keeps), and Milty's own map for 3. `miltyLayout()` in
  `src/fork/draft/milty.ts` throws if upstream's template stops matching, and
  `draft-gen-check.mjs` checks every count. The game gets `map-style` "warp"
  for 4, 5, 7 and 8 players.
- `getSystems` (`server/data/systems.ts`), to check slices entered by hand.
- `BASE_OPTIONS` (`server/data/options.ts`), `getFactions`, base data through
  `DatabaseFnsContext.getBaseValue`, and `GameMap` for the preview.
- Copied rather than imported: the hex spiral (`hexGrid.ts`), optimal value
  (`computeNearbyValues` in `MapBuilder.tsx`), the faction filter and colour
  choice (`setup-page.tsx`). The anomaly list in `milty.ts` comes from the
  tile art, since upstream's data has none.

## Upstream internals `/draft/tf` uses

The Twilight's Fall draft (`src/fork/tfdraft/`, routes `app/[locale]/draft/tf/`
and `app/api/fork/tfdraft/`) adds no seam. Its drafts are `forkDrafts`
documents with `format: "twilightsFall"`, so the existing read rule and TTL
cover them. Dealt hands and secret picks sit in `forkDrafts/{id}/private/hands`,
which no rule lets a browser read; the API hands each player their own cards
and deletes the document when the game is created. If an upstream merge
breaks it, look at:

- Upstream's `create-game` route, called in-process as the Milty draft does,
  with the Kings as factions and `"TWILIGHTS FALL"` added to the expansions.
- Upstream's `dataUpdate` route, called in-process with `CHOOSE_TF_FACTION`
  (Planet, then Unit) for each King. The Planet choice gives the King that
  faction's home planets, and `getFactionSystemNumber` draws its home tile in
  the King's P# spot.
- `getDefaultMapString` for each player count (standard at 3 and 6, warp at
  4, 5, 7 and 8), through the Milty draft's `miltyLayout` in
  `src/fork/draft/milty.ts`, which throws if upstream's template stops matching
  Milty's map. The game gets the same map style.
- Not from upstream: the reference-card priority numbers (`cards.ts`, from the
  rulebook's list) and the Nucleus and Milty EQ layouts (`layouts.ts`, which
  drop places from Milty's slices and deal them before the draft).

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
