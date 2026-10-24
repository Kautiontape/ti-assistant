#!/usr/bin/env bash
# Enables the auto-delete policies upstream relies on, plus the fork's drafts
# and its server-only game state (forkPrivate: Discord settings, export times,
# seat keys; forkNotes: players' private notes).
# Each document stores its own expiry time in `deleteAt` (30 days for games
# and drafts, 14 for sessions), so no offset is needed. Archived log entries
# have deleteAt stripped (app/[locale]/stats/processor.ts), so the actionLog
# policy leaves them alone.
#   ./setup-ttl.sh <project-id>
set -euo pipefail
project="${1:?usage: $0 <project-id>}"
for group in games timers passwords sessions actionLog forkDrafts forkPrivate forkNotes; do
  gcloud firestore fields ttls update deleteAt \
    --project="$project" --collection-group="$group" --enable-ttl --async
done
gcloud firestore fields ttls list --project="$project"
