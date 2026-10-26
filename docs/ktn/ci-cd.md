# CI/CD and hosting

**What:** how ti.kautiontape.com is built, deployed and kept in sync with upstream.
**Surface:** `.github/workflows/ktn-*.yml`, `deploy/ktn/`.
**Upstream potential:** No. This is fork infrastructure.

## Flow

1. A push to `ktn` runs **ktn build & publish** on a GitHub runner. It builds
   `deploy/ktn/Dockerfile` and pushes `ghcr.io/kautiontape/ti-assistant:latest`
   and `sha-*`. ktn never builds images; it doesn't have the memory.
2. When the build succeeds, **ktn deploy** runs on the ktn runner. It copies
   `deploy/ktn/docker-compose.yml` to `/opt/services/ti-assistant/` and runs
   `docker compose pull && up -d`.
3. nginx on ktn serves `ti.kautiontape.com` (`deploy/ktn/ti.kautiontape.com.conf`)
   and proxies to `127.0.0.1:8119`.

The browser's Firebase config and public URL are compiled into the image. They
come from the repo's Actions **variables** (`NEXT_PUBLIC_FIREBASE_*`,
`NEXT_PUBLIC_BASE_URL`). They aren't secrets; every browser gets them.

## Host files on ktn

In `/opt/services/ti-assistant/`, next to the synced compose file:

- `.env`: `GOOGLE_CLOUD_PROJECT=<project-id>`, and for photos, exports and
  Discord (see [storage-and-discord.md](storage-and-discord.md)):
  `FORK_STORAGE_BUCKET=<project-id>.firebasestorage.app` and
  `FORK_DISCORD_WEBHOOK=<the forum channel's webhook>`. Leaving either out
  turns that feature off.
- `firebase-sa.json`: the service account key, mode 0600, owned by shawn
  (uid 1000, the same as the container's `node` user). It comes from the vault:

  ```sh
  secret personal/ti-assistant-firebase-sa \
    | ssh ktn 'umask 077; cat > /opt/services/ti-assistant/firebase-sa.json'
  ```

The container is capped at 384 MB with a 256 MB Node heap, the same as
upstream's App Engine setting. ktn is short on RAM.

## Repo settings this depends on

- `ktn` is the default branch. Scheduled and `workflow_run` workflows only
  run from the default branch.
- Actions variables hold the `NEXT_PUBLIC_*` values (`gh variable list`).
- Fork-PR workflows need approval for **all** outside contributors. This repo
  is public and can reach the self-hosted ktn runner.
- When fleet plan D5 moves deploys to Komodo, `ktn-deploy.yml` goes with the
  other runner deploys.

## Upstream sync

**ktn upstream sync** runs Mondays (and by hand):

1. It fast-forwards `main` to upstream's `main`.
2. It merges upstream into a `sync/upstream` branch, runs `npm run build`, and
   opens or updates a PR into `ktn`. The PR body lists files both sides changed;
   re-check those seams against [README.md](README.md) before merging.
3. If the merge conflicts, it opens an issue listing the files instead.

Merge the PR with a merge commit, never a rebase. Merging into `ktn` deploys it.

What upstream had as of 2026-10-26, and the order to merge in: [upstream-merge-plan.md](upstream-merge-plan.md).

## Firebase project (one-time)

The project, the service account in the vault, the rules, the index and the TTL
policies were set up on 2026-10-18. To redo any of it, from `deploy/ktn/firebase/`:

```sh
npx firebase-tools deploy --only firestore:rules,firestore:indexes --project <project-id>
./setup-ttl.sh <project-id>
```

- **Rules:** browsers can read single game and timer documents and their action
  logs, and single drafts (`forkDrafts`, for `/draft`), and nothing else.
  Passwords, sessions and other fork data stay server-only. All writes go
  through the app's API, which isn't subject to the rules. Redeploy the rules
  whenever `firestore.rules` changes; the draft rule was added on 2026-10-18
  and isn't deployed until someone runs the command above.
- **Index:** the `actionLog` query the server uses to find the current turn.
- **Auto-delete (TTL):** live games, timers, passwords and log entries go after
  30 days, sessions after 14, same as upstream. Drafts go after 30 days once
  `setup-ttl.sh` has been run again for `forkDrafts`; the same goes for
  `forkPrivate` (each game's Discord settings and export time). The daily cron copies finished
  games to `archive` first.
- **Plan:** Blaze with a budget alert. Every phone re-downloads the action log
  when it connects, and the free Spark quota (50k reads a day) can run out mid
  game. On Blaze the overage is a few cents a night.

## Checks after a deploy

- `https://ti.kautiontape.com` loads. A game opened on two phones stays in sync.
- `curl -H 'X-Appengine-Cron: 1' https://ti.kautiontape.com/api/process-games`
  and `…/api/fork/export` return 404.
- `ssh ktn docker stats --no-stream ti-assistant` shows memory well under the cap.
