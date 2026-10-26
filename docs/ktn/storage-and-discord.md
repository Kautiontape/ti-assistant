# Board photos, exports and Discord

Shawn's picks (2026-10-24): photos and exports go in the Firebase project's
Cloud Storage bucket (US region, no second copy), and Discord gets posts
through a webhook, one thread per game.

## Storage

`FORK_STORAGE_BUCKET` names the bucket. Without it, the photo card and the
status-phase reminder don't show, and nothing is exported. The server uses the
same service account as Firestore (`GOOGLE_APPLICATION_CREDENTIALS`); the
bucket is private, and the app's routes read it back.

| Path in the bucket | What |
|---|---|
| `games/<gameId>/photos/<id>.jpg` | A board photo, longest side 2048px. The round, phase, who took it and when are in the object's metadata, so the list survives the game's 30-day expiry in Firestore. |
| `games/<gameId>/photos/<id>-thumb.jpg` | Its 480px thumbnail. |
| `exports/<gameId>.json` | The whole game: the game document, timers, the full action log, and the photo paths. Overwritten by each export. |

- **Photos** (`src/fork/play/Photos.tsx`, `/api/fork/photos/<gameId>`): the
  phone shrinks a photo to 2048px JPEG before sending it; the server
  re-encodes it with sharp (which also drops EXIF, location included), makes
  the thumbnail, and refuses anything that isn't an image, or is over 15 MB or
  50 megapixels. Anyone who can change the game can add or delete a photo.
- **Exports** (`src/fork/server/exportGame.ts`): written after the save that
  ends the game (seam S9), and by the daily cron (`/api/fork/export`, cron
  header only, blocked by nginx) for every game changed since its last export.
  A game is saved within a day of any change, long before its 30 days run out.
  `forkPrivate/<gameId>.exportedUpdate` remembers what was exported.

**To turn it on in production:** create the default bucket in the Firebase
console (Storage, Get started, a US region such as us-east1), then set
`FORK_STORAGE_BUCKET` in `/opt/services/ti-assistant/.env` to its name
(`<project-id>.firebasestorage.app`). The service account already has access
to buckets in its own project. Copy the updated nginx site
(`client_max_body_size 16m`, the export route blocked) to ktn.

## Discord

`src/fork/server/discord.ts`. The server posts, never the phones, so each
post goes out once. After each save, it reads the log entries it hasn't seen
and posts those the game asked for:

| Setting | Posts |
|---|---|
| Scoreboard | an embed with everyone's points, with each phase post (or each new round when phase posts are off) |
| Phase changes | "Round 3 · Status phase" |
| Objectives | public objectives revealed, objectives scored, points by hand |
| Agenda results | the agenda and its outcome |
| Combats | who attacked whom, who won |
| Board photos | the photo itself |
| The final result | the winner and the final scoreboard |

Whose turn it is is never posted. A post whose log entry is undone is deleted
from Discord; deleting a photo deletes its post. Posts never ping anyone.

- **Where:** `FORK_DISCORD_WEBHOOK` is the server's webhook; every game posts
  there unless it turns posts off or sets a webhook of its own (game settings,
  or the new-game page). The address stays on the server, in
  `forkPrivate/<gameId>` (no rule lets a browser read it); phones only learn
  whether one is set. Only `https://discord.com/api/webhooks/…` addresses are
  accepted.
- **Threads need a forum channel.** A webhook can only start a thread in a
  forum (or media) channel. With a forum channel's webhook, each game's first
  post starts a thread named for the date, the game code and the factions,
  and everything after goes in it. With a text channel's webhook, posts go
  straight into the channel.
- **Defaults:** a game posts everything when the server has a webhook. Games
  made by a Milty or Twilight's Fall draft use the defaults; change them in
  game settings. Turning posts on mid-game doesn't replay what came before.
- **Rate limits:** one request at a time per webhook, 0.4 s apart, waiting out
  any 429.

**To turn it on in production:** in Discord, make a forum channel (for
example `#ti-games`), then Edit Channel, Integrations, Webhooks, New Webhook,
Copy Webhook URL. Put it in `/opt/services/ti-assistant/.env` as
`FORK_DISCORD_WEBHOOK=…` (or keep it in the vault and write it there the way
`firebase-sa.json` is), and rerun `setup-ttl.sh` so `forkPrivate` expires
with its game.

## Local development

`~/.cache/claude-work/ti-ui-audit/fakes/` has stand-ins, which
`.env.development.local` points the dev server at:

```sh
docker run -d --rm --name ti-gcs -p 127.0.0.1:4443:4443 fsouza/fake-gcs-server:1.52.2 \
  -scheme http -port 4443 -backend memory -public-host 127.0.0.1:4443
curl -X POST -H 'Content-Type: application/json' -d '{"name":"ti-dev"}' 'http://127.0.0.1:4443/storage/v1/b?project=demo-ti'
node ~/.cache/claude-work/ti-ui-audit/fakes/discord.cjs 4580 &
```

```
FORK_STORAGE_BUCKET=ti-dev
FORK_STORAGE_EMULATOR=http://127.0.0.1:4443
FORK_DISCORD_API=http://127.0.0.1:4580/api
FORK_DISCORD_WEBHOOK=https://discord.com/api/webhooks/900000000000000001/devforumtoken-devforumtoken
```

`FORK_STORAGE_EMULATOR` rather than the library's `STORAGE_EMULATOR_HOST`:
version 5 of `@google-cloud/storage` builds wrong paths from that one.
`FORK_DISCORD_API` replaces `https://discord.com/api` for every webhook. The
fake Discord treats webhook ids starting with 9 as a forum channel, and
`GET /_log` lists what it received. `photos-discord-check.cjs` in the harness
checks all of it.
