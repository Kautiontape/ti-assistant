# Seats and private notes

`/play` has two kinds of "who is this phone". They are kept apart on purpose.

- **The seat on the phone** (`play-seat-<gameId>` in localStorage) sets what the phone
  leads with: whose turn it highlights, who "You" is. It never limits where anyone can act.
  Anyone can still do anything for anyone, on any phone, or on the shared screen.
- **The seat key** (this page) proves to the server that a phone holds a seat. It only
  gates reading *private* things: the player's notes today, direct messages later.

A phone with no key (watching, a shared screen, a server that can't be reached) plays
exactly the same. It just has no notes.

## How a seat is claimed

1. In the "This device" sheet, pick a seat. The phone asks the server to claim it
   (`POST /api/fork/seat/<gameId>` with `{faction}`).
2. **Free seat:** the server makes a random secret key and a 6-digit PIN, stores only
   their SHA-256 hashes, and returns the key and PIN. The key goes in localStorage
   `play-seat-key-<gameId>`. The PIN is shown once: "Another phone can join this seat
   with PIN 123456". The seat sheet and the notes sheet both offer "Show a PIN for another
   phone" (needs the key) if it was missed; that replaces the PIN.
3. **Taken seat:** the phone is asked for the PIN (`{faction, pin}`). If it is right, the
   server returns a *second* key for the same seat (keys are stored as hashes, so the
   first one can't be handed out again). Both phones keep working. A seat holds at most 8
   keys; the oldest ones drop off after that.
4. Wrong PINs: 5 per 10 minutes per game and seat, counted in memory (a restart resets it).
   After that the server answers 429 until the window passes.
5. A phone that changes seat gives its key up. The server frees the old seat unless it has
   notes, in which case the seat stays claimed and the PIN still opens it.

The server code is `src/fork/server/seats.ts`; state is `forkPrivate/<gameId>.seats`
(`{ [factionId]: { keyHash, pinHash, claimedAt, moreKeyHashes? } }`). Routes read the key
from the `X-Seat-Key` header with `seatFromRequest(gameId, req)`, which returns the faction
or `undefined`. Later features (DMs) should use that and never take a seat from a URL or body.

## Notes

- Text up to 20,000 characters, plus up to 12 sketches. A sketch is a list of strokes
  (colour, width, points) on a blank page or over the map. They are stored as vectors, not
  pictures: at most 300 strokes, 500 points per stroke and 20,000 points in all.
- Stored in `forkNotes/<gameId>__<factionId>` (the sketches as one JSON string).
  `deploy/ktn/firebase/firestore.rules` has no rule for `forkNotes` or `forkPrivate`, so a
  browser can't read either. `deleteAt` is copied from the game, and
  `deploy/ktn/firebase/setup-ttl.sh` turns on the TTL policy for `forkNotes`
  (**run it once**; it's idempotent).
- `GET`/`PUT /api/fork/notes/<gameId>` read and write the caller's own notes only, found
  from the key. No key, or a key that opens no seat, is a 403.
- The phone saves 0.8 s after the last change and shows "Saved". If the server can't be
  reached, the latest version is kept in localStorage (`play-notes-draft-<gameId>`) and
  retried every 5 seconds and when the phone is back online. If two phones of one seat
  edit at once, the later save wins.

## What is private, and what is not

Private: a seat's notes and sketches, and the seat's key and PIN hashes. They are not in
the game document, the log, the replay, the download (`/api/<id>/download`) or the Discord
posts. The daily export (`src/fork/server/exportGame.ts`) copies the game and its log only.

Not private:

- Anyone with the PIN can read the seat's notes, and the PIN is shown on screen.
- A seat's notes can be read by anyone who can read the Firestore project or the server
  (they are not encrypted).
- Acting: anyone can still act for anyone. Seats never restrict that.
- Seats are not accounts. Someone at the table who sees a phone's screen sees its notes.
