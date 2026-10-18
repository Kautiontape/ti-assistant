# Self-hosting

Runs the app in Docker against a Firebase project you own. Upstream's code
still talks to Firestore; only the project changes. Why the fork is laid out
this way is in [`FORK.md`](../FORK.md).

## 1. Firebase project

1. Create a project in the [Firebase console](https://console.firebase.google.com).
2. Use the **Blaze** plan and set a budget alert (around $1/month) under
   Google Cloud Billing → Budgets & alerts. Every phone downloads the whole
   action log when it connects, and again after it sleeps for more than 30
   minutes. A game night with everyone on their own phone can go past Spark's
   daily free reads, and on Spark the app then stops until the next day. Blaze
   has the same free quota; going over costs fractions of a cent.
3. Build → Firestore Database → Create database (Standard edition, production
   mode, a region near you).
4. Project settings → General → Your apps → add a **Web** app. Copy its config
   into `selfhost/.env` (start from `.env.example`).

## 2. Rules, index, and auto-delete

From `selfhost/firebase/`:

```sh
npx firebase-tools login
npx firebase-tools deploy --only firestore:rules,firestore:indexes --project <project-id>
./setup-ttl.sh <project-id>   # needs gcloud; or add the same policies in the console
```

- **Rules:** browsers can read single game and timer documents and their
  action logs, and nothing else. Passwords, sessions and fork data stay
  server-only. All writes go through the app's API, which isn't subject to
  the rules.
- **Index:** the `actionLog` query the server uses to find the current turn.
- **Auto-delete (TTL):** live games, timers, passwords and log entries are
  deleted 30 days after creation, and sessions after 14 days, same as upstream.
  Finished games are copied to `archive` first by the daily cron.

## 3. Service account (vault)

The server signs in with a service account key, stored in the vault per
`~/.dotfiles/secrets/README.md`. It is never in the repo or your home
directory. Docker does keep a copy inside the container (that's how Compose
delivers secrets), and the copy goes away when you remove the container.

1. Project settings → Service accounts → Firebase Admin SDK → **Generate new
   private key**.
2. Store it as one line, then delete the download:

   ```sh
   key=~/Downloads/<the-downloaded-file>.json
   printf '%s\n\n%s\n' "$(jq -c . "$key")" "kind: gcp-service-account
   expires: never
   used_by: ti-assistant self-host (selfhost/compose)
   rotate_url: https://console.firebase.google.com/project/<project-id>/settings/serviceaccounts/adminsdk
   migrated: $(date +%F) from Firebase console download" \
     | rbw add --folder "Machine Tokens" personal/ti-assistant-firebase-sa firebase-adminsdk
   shred -u "$key"
   ```

`selfhost/compose` reads it with `secret` at startup and hands it to the
container as a Compose secret (`/run/secrets/firebase_sa`).

## 4. Run

```sh
cp selfhost/.env.example selfhost/.env   # then fill it in
selfhost/compose up -d --build
selfhost/compose logs -f app
```

`NEXT_PUBLIC_*` values are compiled into the browser bundle, so rebuild
(`--build`) after changing them.

The `cron` service calls `/api/process-games` once a day on the internal
network. That archives finished games and feeds `/stats`.

## 5. Reverse proxy

Point your proxy at `127.0.0.1:3000` (`TI_BIND` / `TI_PORT` in `.env`), and make
it **strip the `X-Appengine-Cron` header** from outside requests. The cron
routes only check that this header exists. App Engine strips it for upstream;
here the proxy has to. Blocking the two routes as well doesn't hurt.

Caddy:

```caddy
ti.example.com {
	request_header -X-Appengine-Cron
	@cron path /api/process-games /api/update-games
	respond @cron 404
	reverse_proxy 127.0.0.1:3000
}
```

nginx:

```nginx
location ~ ^/api/(process|update)-games { return 404; }
location / {
    proxy_set_header X-Appengine-Cron "";
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_pass http://127.0.0.1:3000;
}
```

Don't set `TI_BIND=0.0.0.0` unless the port is otherwise firewalled, because
that skips the proxy.

## 6. Check it

- **Your project:** create a game and open it on two devices. Changes show up
  on both. In DevTools → Network, the Firestore `Listen` requests name your
  project ID.
- **Links:** the QR code and share links use `NEXT_PUBLIC_BASE_URL`.
- **Cron is closed:** `curl -H 'X-Appengine-Cron: 1' https://<host>/api/process-games`
  from outside gets a 404 or an error, never a run.
- **Rules:** in the Firebase console, Firestore → Rules → Rules Playground, a
  `get` on `passwords/anything` is denied and a `get` on `games/anything` is
  allowed.
