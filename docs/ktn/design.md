# Fork design kit

The fork's screens (`/play`, `/draft`) share one kit: `src/fork/ui/kit.tsx`
and `src/fork/ui/kit.module.scss`. There is no UI library. Adding one would
change upstream's `package.json` and lockfile, which conflict on every
upstream dependency bump. Behaviour that a library would give (dialogs,
popovers) is built on plain React and fixed positioning.

Screen layout (top bar, columns, tabs, map, draft slices) stays in each
screen's own module, today `src/fork/play/play.module.scss`. Every root element
carries `kit.root` and its screen's `.root`.

## One look per job

| Job | Look | Component | Examples |
|---|---|---|---|
| Act: does the step, or asks to confirm it | A rectangle with a verb. One primary (filled) per step; the rest are secondary. Dashed when acting for another player. | `Button` | Tactical, End turn, Pass, Confirm, Take it back, Do it for Sol |
| Open: shows the next step's options or more about something | A full-width row with a chevron (›), or an arrow (↗) for another page or a file to save (`download`) | `RowLink` in `Rows` | Points changed?, Take a planet, Start a combat, a player in the race |
| Pick and act: a list where a tap acts at once | A row with an accent verb at the end | `RowAction` | planets to take, objectives to score, techs to research |
| Choose: sets something on this screen; never writes to the game | Pills with a radio mark, under a question; the chosen one is filled. Rows with a radio mark for long lists. A switch for on or off. | `Choices`, `Switch` | Whose points changed?, Against whom?, the map overlay, theme |
| Learn: a game thing's text | The name with a dotted underline; opens a popout (a bottom sheet on a phone, beside the name on a wider screen, a preview on mouse hover) | `Cite` | techs, relics, leaders and abilities in a player's sheet |
| State: shows status | A flat, borderless tag; never tappable. "Now" has a dot. | `Tag` | Passed, Speaker, Played, Up: Sol |

Two kinds of change confirm before writing, with a sentence that says who gains
what: transfers between players (Support for the Throne, Checks and Balances,
Thunder's Edge on a tie, a new speaker) and anything chosen from pills.

## Strategy cards

`CardTag` draws a card in its colour (upstream's `card.color`): filled while
it's available (unpicked in the strategy phase, unplayed in the action phase),
an outline once it's picked, played or out of play. A tap shows its text.
Inside a row or button it's drawn `still`, since a button can't hold another.

## Colours

- Player colours are `--p-<colour>`. TI has no white pieces, so black is drawn
  near-white on the dark theme and near-black on the light one.
- Strategy cards are `--sc-<card.color>`, with `-ink` (text on the fill) and
  `-line` (outline). Fills carry their text at 4.5:1 or more; lines sit on the
  panel at 6:1 or more.
- The accent is a neutral tinted blue (Shawn's pick, 2026-10-24): light on the
  dark theme, slate on the light one. The tint keeps it apart from the black
  player's near-white, and it's far from Trade's turquoise, which the earlier
  teal wasn't. Its text and fills hold 8:1 or more in both themes.

## Charts

The results views (`src/fork/play/Results.tsx`) draw plain SVG: 2px lines in
each player's colour, a dot on the chosen round with a 2px ring in the panel
colour, hairline gridlines, axis text in `--faint`. The player colours are the
game's and some sit close together (blue and purple fail a colour-blind check),
so a chart never relies on colour alone: the legend lists every player with
their value, tapping one highlights their line and labels it by name, and each
chart has a table view.

## Sheets

`Sheet` is a bottom sheet on a phone and a centred dialog from 700px. On a
screen 1180px or wider, a sheet about a thing (`dock`: a player, a system)
opens as a column beside the screen, unless the device setting says "Over the
screen". Escape closes it; focus returns to what opened it.

## Device settings

Kept in localStorage per device, not per game, in the sheet behind the top
bar's seat button:

- `play-always-actions`: "Always show actions", for a shared iPad or laptop.
  The Now tab shows whoever is up's controls, and the log marks those writes
  as from the shared screen (`actor.table`).
- `kit-dock`: where details open on a wide screen.
- `kit-text`: text size. Upstream's `site.css` sets the root font size to
  `clamp(16px, 1.25vw, 32px)`, so the kit sizes text from its own `--fs`
  (16px; 15px on a desktop window; 14, 16 or 18px by the setting).
