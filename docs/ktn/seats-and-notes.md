# Seats, private notes and direct messages

`/play` has two kinds of "who is this phone". They are kept apart on purpose.

- **The seat on the phone** (`play-seat-<gameId>` in localStorage) sets what the phone
  leads with: whose turn it highlights, who "You" is. It never limits where anyone can act.
  Anyone can still do anything for anyone, on any phone, or on the shared screen.
- **The seat key** (this page) proves to the server that a phone holds a seat. It only
  gates reading *private* things: the player's notes and direct messages.

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
   After that the server answers 429 until the window passes, or until the seat's own
   phone shows a new PIN, which lifts the lockout (so a player guessing someone else's PIN
   can't keep the owner's second phone out).
5. A phone that changes seat keeps the old one: the old key is set aside on the phone
   (`play-seat-key-<gameId>-<faction>`) and comes back if it switches back, so a mis-tap
   never costs the seat or its PIN. Seats aren't freed by switching; `DELETE` on the seat
   route still frees one that has no notes or messages.

The server code is `src/fork/server/seats.ts`; state is `forkPrivate/<gameId>.seats`
(`{ [factionId]: { keyHash, pinHash, claimedAt, moreKeyHashes? } }`). Routes read the key
from the `X-Seat-Key` header with `seatFromRequest(gameId, req)`, which returns the faction
or `undefined`. Features that read private things (notes, DMs) use that and never take a seat from a URL or body.

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

## Direct messages

One-to-one messages between two seats. There is no table channel and no group chat: players
talk over the table in public, and only secrets go to a DM.

- **Who can send:** a phone with a seat key, to any other seat in the game (even one nobody
  has claimed yet; they see it when they take the seat). The sender is the seat the key opens,
  never anything in the URL or body. Up to 1000 characters a message, 20 messages a minute
  per seat and game (in memory, like the PIN limit), 300 messages or 120,000 characters per
  conversation. No sending once the game is over.
- **Stored in** `forkMessages/<gameId>__<a>__<b>` (the two factions, sorted), one document per
  pair holding the conversation as an array `{f, t, at}`. Capped as above so it stays far
  under Firestore's 1 MB limit. Like `forkNotes`, `firestore.rules` has no rule for it, and
  `deleteAt` is copied from the game; `setup-ttl.sh` turns on its TTL policy (**run it once**).
- `GET`/`POST /api/fork/messages/<gameId>`: GET returns the caller's own conversations (one
  read per other seat); POST `{to, text}` sends. No key, or a key that opens no seat, is a 403.
- **Live updates:** phones can't listen to server-only documents, so they poll: every 6 s
  while the Messages sheet is open, every 30 s otherwise (the unread count on the Table tab),
  not at all while the page is hidden. What a phone has read is kept in localStorage
  (`play-dm-seen-<gameId>-<seat>`), so the unread count is per phone.
- **A seat with messages is kept** when its phone gives it up (like a seat with notes), so
  whoever claims it next can't read them.

### When messages open

- **During the game:** only the two seats in a conversation can read it. Not the other
  players, not the game document, the log, the replay, the download or Discord.
- **When the game ends** (phase END): every conversation is readable by any phone that holds
  a seat key for the game (any seat, claimed on that phone), in the sheet's "All messages"
  view in time order. A person with only the game code and no key still can't; but at that
  point a free seat can be claimed, which is how the code alone has always worked. This is
  deliberate: Shawn wanted them open at the end and will decide later if that is too
  invasive. To close them again, change `readSeat`/`readAll` use in
  `app/api/fork/messages/[gameId]/route.ts`.
- **The export:** the permanent copy (`exportGame.ts`) includes a `messages` list only when
  the game is in END, so a game exported mid-way never carries DMs. A finished game exports
  when it ends and again if it changes, so its DMs are in the permanent file from then on.

## What is private, and what is not

Private: a seat's notes and sketches, its direct messages (until the game ends), and the seat's key and PIN hashes. They are not in
the game document, the log, the replay, the download (`/api/<id>/download`) or the Discord
posts. The daily export (`src/fork/server/exportGame.ts`) copies the game and its log, plus the direct messages of a finished game.

Not private:

- Anyone with the PIN can read the seat's notes and messages, and the PIN is shown on screen.
- A seat's notes can be read by anyone who can read the Firestore project or the server
  (they are not encrypted).
- Acting: anyone can still act for anyone. Seats never restrict that.
- Seats are not accounts. Someone at the table who sees a phone's screen sees its notes.
