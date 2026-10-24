# /play parity with upstream

This lists what a player can do or see in upstream TI Assistant, and whether the fork's `/play` screen does it. It was built on 2026-10-20 by reading upstream's screens (upstream `5c34942`) and the fork's `src/fork` (branch `play/design-language`, `34ebc6b`). Re-check a row in the code before building on it, and update the row in the same commit that changes its status.

| Status | Rows | Meaning |
|---|---|---|
| Native | 196 | Works in `/play`. |
| Partial | 9 | Works in `/play`, with the gap named in Notes. |
| Table screen | 0 | `/play` links to upstream's table screen (`/game/<id>/main`) for it. |
| Via More controls | 0 | `/play`'s "More controls" row opens upstream's faction page, which has it, but only on that player's turn. |
| Missing | 0 | No way to do it from `/play`. |
| Not needed | 17 | Left out on purpose; the reason is in Notes. |

`/play` hides upstream's header (`HideOnPlay.tsx`), so everything upstream's header, footer and sidebars offer needs its own path in `/play`. Twilight's Fall rows in sections 1 to 7 point to section 8, which covers what a Twilight's Fall game does in `/play` in detail. The totals above count sections 1 to 7 only. Paths: SETUP is `app/[locale]/setup/setup-page.tsx`, AP is `app/[locale]/game/[gameId]/main/phase/action`, SP is `.../main/phase/strategy/StrategyPhase.tsx`; other upstream paths are under `app/[locale]/game/[gameId]/` unless they start with `src/`.

## 1. Game setup

| Feature | Upstream file | /play status | Notes |
|---|---|---|---|
| Entry to new game | SETUP page.tsx | Native | The start page's "New game" opens /start/new (NewGame.tsx), the fork's setup page; the game it makes opens on /play. Check: parity-newgame-check.cjs |
| Player count (3-8 chips) | SETUP (PlayerCount, ~l.182) | Native | NewGame.tsx: 3 to 8, or 3 to 6 without Prophecy of Kings; changing it resets the map type and, for odd counts, the variant (upstream's rules). Check: parity-newgame-check.cjs |
| Expansions: PoK, Thunder's Edge, Codex I-IV, Twilight's Fall | SETUP l.235-325 | Native | NewGame.tsx: Prophecy of Kings, Thunder's Edge (which brings the codices) and each codex when Thunder's Edge is off; turning one off clears factions and colours it allowed. Twilight's Fall isn't offered here yet: its games come from the Twilight's Fall draft or upstream's /setup. |
| Homebrew: Discordant Stars | SETUP l.359 | Native | NewGame.tsx switch; adds its factions to the faction list. |
| Events (shown when TF is off) | SETUP l.387 | Native | NewGame.tsx: an Events sheet lists the events of the chosen expansions with their text. |
| Game variant: normal / alliance-separate / alliance-combined (4, 6, 8 players only) | SETUP l.213, 539 | Native | NewGame.tsx: offered for 4, 6 and 8 players; picking one sets upstream's starting points (10, 14, 22). How /play runs an alliance game is not checked. |
| Victory points (+ secondary VP for separate alliance) | SETUP l.205 | Native | NewGame.tsx steppers; the second one shows for separate alliance points. Check: parity-newgame-check.cjs |
| Map type chips (standard/warp/skinny/large by player count) | SETUP l.447 | Native | NewGame.tsx: the types upstream allows for the player count. |
| Map string input, validates, filters non-claimable planets | SETUP l.479, 1952 | Native | NewGame.tsx: the same check as NowSetup, a map preview, and home systems on the map set the factions (upstream's extractFactionIds). The processed string is saved for the planet filter. Check: parity-newgame-check.cjs |
| Faction pick per seat (radial menu, filtered by expansions, removedIn) | SETUP l.1177, 1700 | Native | NewGame.tsx seat sheet: a searchable list with upstream's filter; taking another seat's faction moves it. Check: parity-newgame-check.cjs |
| Colour picker per seat (Magenta/Orange only with PoK) | setup/components/ColorPicker.tsx | Native | NewGame.tsx: a faction gets its own colour or the first free one from its list; taking another seat's colour swaps the two. Check: parity-newgame-check.cjs |
| Player name per seat | setup/components/PlayerNameInput.tsx | Native | NewGame.tsx seat sheet; the Milty draft collects names too. Check: parity-newgame-check.cjs |
| Speaker choice | SETUP l.2285 | Native | NewGame.tsx: speaker choice and a random speaker. Check: parity-newgame-check.cjs |
| Alliance partner pairing | SETUP l.961, 1239 | Native | NewGame.tsx seat sheet, in an alliance variant; pairing is mutual, as upstream's. |
| Randomize factions + Reset | SETUP l.2045-2078, 2441 | Native | NewGame.tsx: "Random factions" fills the empty seats; "Start over". Check: parity-newgame-check.cjs |
| "Select all factions and colors" gate | SETUP l.2381 | Native | NewGame.tsx: "Start the game" stays off and says which seat still needs a faction, colour or partner. Check: parity-newgame-check.cjs |
| Track toggles: Cards, Techs, Planets, Objectives, Relics | SETUP l.2148-2211 | Native | NewGame.tsx switches. Check: parity-newgame-check.cjs. Whether /play's screens respect them is the "Hidden app sections" row |
| Advanced tracking: Command Tokens (+ disclaimer) | SETUP l.2221-2272 | Not needed | Command token pools aren't tracked (Shawn, 2026-10-18); upstream tracks them only behind its advanced option and doesn't track trade goods or commodities at all |
| Password (optional) | SETUP l.2307 | Native | NewGame.tsx; create-game stores it hashed. Check: parity-newgame-check.cjs |
| Start Game button | SETUP l.2343 | Native | NewGame.tsx calls upstream's /api/create-game and opens /play/<id>; the Milty draft makes its games too. Check: parity-newgame-check.cjs |
| Language selector, theme | setup header | Not needed | Device settings sheet in /play covers theme/text size. |
| Game-phase SETUP (starting techs, speaker actions, reveal 2 stage I) | main/phase/setup | Native | NowSetup.tsx: starting technology choices (Winnu, Argent, Keleres, Deepwrought and the rest), Keleres' home system, the speaker's two stage I objectives (with take back), the map string, then Start the game once upstream's setupPhaseComplete allows. Twilight's Fall: the inaugural splice card shows above it (section 8); home systems and starting units link to the table screen. Check: parity-setup-check.cjs |

## 2. Strategy phase

| Feature | Upstream file | /play status | Notes |
|---|---|---|---|
| Strategy card list in pick order with trade goods | SP StrategyCardSelectList l.436 | Native | NowStrategy.tsx (card rows show "N trade goods on it"). |
| Pick a card for the active player | SP l.469 | Native | NowStrategy + card sheet in PlayApp (AssignStrategyCardEvent). |
| Card text (primary/secondary) before picking | StrategyCardElement | Native | Card sheet shows both. |
| Pick for another player (shared screen / helping) | SP (anyone can click) | Native | "Pick for X" in NowStrategy. |
| Card taken / invalid cards disabled | SP l.476 | Native | `disabled` on RowLink. |
| 4-and-fewer players pick two cards (2x picks) | SP haveAllFactionsPicked l.652 | Native | Order list shows several picks per player (picks(id)). Ending relies on `active` going empty. |
| Checks and Balances (picker gives card to another) | SP ChecksAndBalancesMenu l.42 | Native | PlayApp card sheet + logic.ts checksAndBalancesTargets. |
| Start-of-phase reminders (AI Revolution/Arms Reduction/New Constitution results, Council Patronage) | SP l.549-625, 695 | Native | StrategyAbilities.tsx StartOfStrategy: those laws in the round they apply, and Council Patronage. Check: parity-strategyabilities-check.cjs |
| Naalu: Gift of Prescience (swap 0-initiative card) | SP l.763-790 | Native | GiftSheet: who gets the 0 token, confirmed; "Naalu keeps it" takes it back |
| Hacan: Quantum Datahub Node (swap cards) | SP QuantumDatahubNode l.112 | Native | SwapSheet for Hacan, Nekro (with the tech) or the ability's owner: give one card, take another player's, confirmed |
| Imperial Arbiter swap (agenda) | SP ImperialArbiter l.272 | Native | SwapSheet with the arbiter flag; upstream's handler discards the law |
| Naalu 0-initiative card shown as separate "Naalu" token | SP l.679 | Native | Order 0 follows the gift (upstream's GIFT_OF_PRESCIENCE) |
| Active player / on deck, per-faction timer | SP l.828-880 (FactionTimer, StaticFactionTimer) | Native | The active player's upstream faction timer runs in the strategy phase too (Clock.tsx useUpstreamTimers); each player's total is on the Table tab's Game clock. Check: parity-player-check.cjs |
| End phase: "Advance to Action Phase" | SP l.941 | Native | "Start the action phase" button (AdvancePhaseEvent). |
| Undo last pick | UndoButton / ControlButtons | Native | Toast Undo + Undo in log (useWrite). |

## 3. Action phase

### 3a. Turn flow

| Feature | Upstream file | /play status | Notes |
|---|---|---|---|
| Active player / on-deck display | AP ActivePlayerColumn l.1672 | Native | NowAction hero + "Next" chip. |
| Choose action: Tactical / Component / each held strategy card / Pass | AP FactionActionButtons l.179 | Native | NowAction buttons; Pass only after playing own cards (canPass). |
| Un-select action (change mind) | AP l.24 UnselectActionEvent | Native | TurnControls.tsx "Change the action" (UNSELECT_ACTION). Check: parity-turn-check.cjs |
| Pass confirmation | AP | Native | "pass" sheet: SelectAction(Pass) + EndTurn. |
| End turn | AP NextPlayerButtons l.1546 | Native | End turn (blocks on open combat). |
| Skip turn (no action chosen) | AP l.1569 | Native | "Skip this turn" under the action buttons, confirmed (END_TURN skipTurn). Check: parity-turn-check.cjs |
| "Take Another Action" (samePlayer) | AP l.1615 | Native | "Take another action" row under End turn (END_TURN samePlayer). Check: parity-turn-check.cjs |
| Puppets on a String (jump to passed player) | AP l.1626 | Native | Row under End turn when someone has passed: pick who takes the next turn (END_TURN jumpToPlayer). Check: parity-turn-check.cjs |
| Ral Nel hero: unpass | AP UnpassSection l.1938 | Native | "Ral Nel unpasses" on the everyone-has-passed card while Director Nel is readied (UNPASS). Check: parity-rare-check.cjs |
| Faunus (Pass-turn faction ability) | AP/Actions/Faunus.tsx | Native | Pass sheet: take a non-home, non-legendary planet with no attachments, sent with the pass (Faunus.tsx rule). Check: parity-rare-check.cjs (upstream builds Faunus only when its system is on the map, or with no map string) |
| Prove Endurance (score on pass) | AP l.1435 | Native | Pass sheet switch for the last player to pass, sent with the pass. Check: parity-turn-check.cjs |
| Turn timer (per-turn clock) | AP FactionTimer, src/components/TurnTimer | Native | Hero clock for the turn, plus upstream's faction timer for the active player (totals on the Table tab). Secondary timers stay off: upstream starts them on MARK_PRIMARY, which /play doesn't send. Check: parity-player-check.cjs |
| Game timer pause/unpause, phase timer | src/components/GameTimer, TurnTimer | Native | Clock.tsx: /play runs upstream's game timer (it was frozen when everyone used /play, so log entries carried game time 0); Pause/Resume on the Table tab, a banner on Now while paused. Check: parity-player-check.cjs |
| Selected-action card board (who holds/played which cards) | StrategyCardColumn l.1825 | Native | CardBoard in PlayApp. |
| Advance to Status Phase | AP l.1905 | Native | "Start the status phase" (asks to end an open combat first). |
| Action log / undo | GameLog, UndoButton | Native | Log tab, Undo toast. |

### 3b. Tactical action

| Feature | Upstream file | /play status | Notes |
|---|---|---|---|
| Take control of planets (system-limited, ocean/Avernus rules) | src/components/ClaimPlanetsSection, TacticalAction l.114 | Native | "claim" sheet with claimablePlanets (logic.ts copies the rule). |
| Remove a claimed planet (unclaim) | ClaimPlanetsSection l.170 | Native | PlayerEdit.tsx "Planets": Lose (UNCLAIM_PLANET). Check: parity-player-check.cjs |
| Planet attachments on newly taken planets | ClaimPlanetsSection l.141; PlanetRow l.502 | Native | AttachButton in NowAction and Attachments in MapTab SystemSheet. |
| Mecatol Rex / Custodians token +1 VP | TacticalAction l.119 | Native | Claiming Mecatol records the point (upstream's data layer), and the turn's record says "took control of Mecatol Rex and the Custodians token (+1 point)" when nobody held it. Check: parity-rare-check.cjs |
| Space / ground combat (fork-only feature) | src/fork/actions/combat.ts | Native | Combat.tsx (start, banner clock, end). Not in upstream. |
| Score action-phase objectives (up to 4) | TacticalAction l.125-190 | Native | Every action-phase objective is a secret: "Scored a secret?" in the tactical action's rows opens the action-phase secrets (and "Points changed?" in any turn). Check: parity-player-check.cjs |
| Become a Martyr (score on losing home) | TacticalAction l.395 | Native | An action-phase secret: "Points changed?" → scored a secret (upstream also keeps it out of the tactical list) |
| Gain relic from frontier exploration | TacticalAction l.193; GainRelic | Native | RelicSheet, from a component action or the frontier sheet after a tactical action (Frontier.tsx) |
| Frontier exploration (explore token) | src/components/FrontierExploration | Native | Frontier.tsx: "Explored a frontier?" after a tactical action: gain a relic or find Mirage. Check: parity-player-check.cjs |
| Mirage claim (Mirage planet from frontier) | FrontierExploration l.52 | Native | Frontier sheet: take control of Mirage, with take back |
| Nekro Technological Singularity (copy 4 techs) | TacticalAction l.195 | Native | TacticalExtras.tsx: on Nekro's tactical action, a sheet of the technologies other players own and Nekro doesn't; gain up to 4, take back. Hidden when the game doesn't track technologies. Check: parity-rare-check.cjs |
| Embers of Muaat: Adjudicator Ba'al (replace system) | TacticalAction l.245 | Native | TacticalExtras.tsx: on Muaat's tactical action with Ba'al readied and a map string, pick a system (upstream's tile rule), confirm, and upstream's event makes it the supernova and purges its planets; take back on the row. Check: parity-rare-check.cjs |
| Thunder's Edge expedition (6 slots, tie-break owner) | src/components/Expedition | Native | NowExpedition.tsx (commit, take back, tie-break). |
| Breakthrough readied on first expedition | commitToExpedition handler | Native | Done in data layer; sheet text says so. |

### 3c. Component actions

| Feature | Upstream file | /play status | Notes |
|---|---|---|---|
| Pick component (search; groups for cards, techs, leaders, relics, promissory notes, abilities) | AP ComponentAction.tsx ComponentSelect l.87 | Native | NowComponent.tsx ComponentSheet (copies the filter). |
| Take back the played component | ComponentAction | Native | "Take it back" (`UNPLAY_COMPONENT`). |
| Component description | ComponentDetails l.545 | Native | Shown under component name. |
| Research a tech (Plagiarize, Focused Research, Enigmatic Device, Flayesh) | ComponentAction l.28-41, 185 | Native | "Record the technology" -> ResearchSheet. |
| Gain relic (Gain Relic, Black Market Forgery, Hesh and Prit, Create/Fabrication/Forge Legend) | ComponentAction l.79 | Native | Gain Relic, Black Market Forgery, Hesh and Prit and Fabrication offer "Record the relic" (RelicSheet). Create and Forge Legend are Twilight's Fall cards: they appear with other components, without their effect (section 8). Check: parity-components-check.cjs |
| Exploration Probe / Circlet of the Void (frontier) | ComponentAction l.58 | Native | The component's card offers the frontier sheet |
| Share Knowledge, Divert Funding, Dynamis Core, Visionaria Select | ComponentActions/*.tsx | Native | ComponentFollowUps.tsx: Share Knowledge (a Deepwrought technology), Divert Funding (return, then research, with take back), Visionaria Select (a technology for each player who takes it), Dynamis Core (trade goods shown). Check: parity-components-check.cjs |
| Stellar Converter, Conventions of War Abandoned (purge planet) | ComponentActions/PurgePlanet.tsx | Native | Purge a planet (upstream's targets), with take back. Check: parity-components-check.cjs |
| Nano-Forge, Terraform (attach to planet) | ComponentActions/AttachToPlanet.tsx | Native | Attach to one of the player's planets (upstream's targets), with take back |
| Dannel of the Tenth / Blessing of the Yin, Riftwalker Meian / Changing the Ways, Z'eu, Transpose | ComponentActions/*.tsx | Native | Z'eu is native (pick who takes the tactical action, then their planets and secrets). Dannel of the Tenth / Blessing of the Yin, Riftwalker Meian / Changing the Ways and Transpose are Twilight's Fall's: they appear with other components, without their effect (section 8). Check: parity-components-check.cjs |
| Planetary Rigs, Overrule, Sins of the Father, Mathis Mathinus, Strategize, Vaults of the Heir, Ta Zern, Silver Flame, Executive Order | ComponentActions/*.tsx | Partial | Native: Overrule and Mathis Mathinus (pick a card, run its primary with /play's card controls), Strategize (its secondary), Vaults of the Heir (purge a technology, gain a relic), Ta Zern (purge for everyone, replacements), The Silver Flame (point or purge the home system). Left: Planetary Rigs (Discordant Stars), Executive Order (a whole agenda inside the action), Sins of the Father (Twilight's Fall, recorded without its effect). Check: parity-components-check.cjs |
| Industrial / Mining Initiative, Total War, Book of Latvinia, Age of Exploration | ComponentActions/*.tsx | Native | Industrial and Mining Initiative show the trade goods, Total War and Book of Latvinia show what the component recorded (ComponentFollowUps.tsx). Age of Exploration adds a system next to two non-home systems (MapTiles.tsx). Check: parity-components-check.cjs |
| Star Chart / Azdel's Key (add system to map) | ComponentActions/AddSystemToMap.tsx | Native | MapTiles.tsx: pick an unused tile, then an open spot next to at least 2 systems (named by its neighbours), see the map with it, confirm. Upstream drags the tile onto its map builder, which needs a mouse; the write is the same SWAP_MAP_TILES, with take back. Check: parity-components-check.cjs |
| Action cards that are ACTIONS | ComponentAction | Native | Listed under "Action cards" in the component sheet. |
| Action cards played at other times (record who) | `PLAY_ACTION_CARD` (upstream logs only) | Native | NowActionCards.tsx (fork addition). Assassinate Representative and Ancient Burial Sites are on the agenda screen (AgendaCards.tsx); Engineer, Reverse and Thieve stay on the table screen. |
| Promissory note actions & Support for the Throne / alliances | src/components/PromissoryMenu | Native | Notes with component actions appear in the component sheet; Support for the Throne moves in any phase from "Points changed?" on Now; alliances change in PlayerEdit.tsx and show on the player sheet. Checks: points-check.cjs, parity-player-check.cjs |
| Exhaust/ready techs, leaders (agent/commander/hero) and relics when used | FactionPanel l.675 UpdateLeaderStateEvent; component handlers | Native | Leaders (ready, exhaust, unlock, purge) and relics (purge) by hand in PlayerEdit.tsx. Upstream has no event to exhaust a technology, so neither does /play. Check: parity-player-check.cjs |
| Breakthrough state (locked/readied/exhausted/purged) | FactionPanel FactionBreakthrough l.1132 | Native | PlayerEdit.tsx: lock and unlock, as upstream's faction panel |
| Twilight's Fall splice/genome/paradigm cards (Coerce, Elevate, Evolve, Genophage, Helix, Irradiate, Mutate, Devour World, Witching Hour...) | ComponentAction l.240-360; src/components/Splice | Partial | Section 8: the cards appear with other components and splices are native; using a genome isn't recorded. |
| Unravel (purge relic) / Repeal Law | ComponentAction l.354 | Native | Repeal in Laws.tsx, relic purge in PlayerEdit.tsx. Unravel is a Twilight's Fall card, recorded without its effect. Check: parity-laws-check.cjs |

### 3d. Strategic actions

| Feature | Upstream file | /play status | Notes |
|---|---|---|---|
| Play strategy card primary (select, mark primary "Done") | AP l.383-1385 (MarkPrimaryEvent toggle) | Not needed | Selecting is native. The "Done" toggle isn't sent, a decision from the first /play design: upstream uses it to collapse its panel and start the secondary timers, and /play's secondaries card doesn't wait for it |
| Secondary check for other players (Follow/Skip/Change) | AP SecondaryCheck l.141 | Native | SecondariesCard + per-player prompt (MarkSecondaryEvent). |
| Technology primary (1st free, 2nd for 6 resources) | StrategicActions/Technology.tsx | Native | TechnologyPrimary + ResearchSheet. |
| Technology secondary (follow + research; Jol-Nar 2 techs; Nekro excluded) | AP l.383 | Native | ResearchSheet follow mode, "2nd tech". Nekro: text says gains command tokens, no token UI. |
| Politics primary (new speaker, swap/undo) | StrategicActions/Politics.tsx | Native | PoliticsPrimary. Draw action cards: board. |
| Politics: End Turn blocked until speaker chosen | NextPlayerButtons l.1566 | Native | End turn waits for the new speaker, with a hint. Check: parity-turn-check.cjs |
| Imperial primary (score public obj or secret / Mecatol +1) | StrategicActions/Imperial.tsx | Native | ImperialPrimary + `score` sheet. |
| Imperial secondary (draw secret obj), Imperial points for Mecatol | AP l.1313 | Native | Upstream's Imperial.tsx has only a primary: the Imperial point for Mecatol Rex and a public objective to score, both in /play (ImperialPrimary). The secondary (draw a secret) records nothing upstream either. Check: cards-check.cjs (Imperial in round 5) |
| Diplomacy primary (Xxcha Peace Accords planet claim) | StrategicActions/Diplomacy.tsx | Native | A Peace Accords row on Diplomacy's primary when Xxcha plays it, and on the secondaries card when another player does; it opens the claim sheet without Mecatol Rex (Diplomacy.tsx's filter). Hidden when the game doesn't track planets. Check: parity-rare-check.cjs |
| Diplomacy primary/secondary (ready planets, refresh) | AP l.647 | Native | Upstream's Diplomacy.tsx records only Xxcha's Peace Accords (native, see the row above); readying planets isn't tracked, since upstream hides planet state by default. Check: parity-rare-check.cjs |
| Leadership (gain N command tokens, shown only with command-token tracking) | StrategicActions/Leadership.tsx | Not needed | Command token pools aren't tracked (Shawn, 2026-10-18); upstream tracks them only behind its advanced option and doesn't track trade goods or commodities at all. The Leadership card itself is native (select, text, secondaries) |
| Construction / Trade / Warfare (Warfare: score action-phase obj; Trade: commodities, Hacan etc.) | AP l.1080, 1155 | Native | Upstream has no Construction or Trade screen and doesn't track trade goods or commodities. Warfare with Thunder's Edge gets the tactical rows (take a planet, score an action-phase objective), as upstream's Warfare.tsx does. Check: parity-rare-check.cjs |
| Warfare primary objective scoring | StrategicActions/Warfare.tsx | Native | With Thunder's Edge, Warfare's primary gets the tactical rows: take a planet, frontier, scored a secret |
| Twilight's Fall cards (Noctis, Tyrannus, Calamitas, Magus, Aeterna, Lux, Civitas, Amicus): splice join/leave, new tyrant | StrategicActions/*.tsx | Native | Section 8 (`src/fork/tfplay/`). Lux, Civitas and Amicus need nothing recorded. Check: tf-play-check.cjs |
| Cards on table (who picked, played/ready) | AP StrategyCardColumn | Native | CardBoard. |

### 3e. Faction panels and sidebars

| Feature | Upstream file | /play status | Notes |
|---|---|---|---|
| Faction panel: leaders (agent/commander/hero) with ready/exhaust/purge | src/components/FactionPanel.tsx l.566-740 | Native | PlayerEdit.tsx "Leaders": exhaust and ready agents, unlock commanders and heroes, purge and unpurge heroes. Check: parity-player-check.cjs |
| Faction techs, unit upgrades, unit stats | FactionPanel l.756, 1023, 1097 | Partial | PlayerSheet lists techs by colour (cite popouts). Tech add/remove: ResearchSheet / Undo only. No unit stat blocks. |
| Faction abilities, promissory notes, genomes, paradigms | FactionPanel l.794-977 | Partial | Abilities listed in PlayerSheet (popout text), and Twilight's Fall genomes and paradigms (section 8); promissory notes not shown. |
| Planets owned with resources/influence totals, attachments, exhaust | Sidebars; PlanetRow; PlanetTab | Native | PlayerSheet lists planets and totals; the map tab shows owners and attachments. Exhausting planets and structures is not tracked (Shawn, 2026-10-18) |
| Add / remove tech manually | TechTab l.73, 104 | Native | PlayerEdit.tsx "Technology": add (research sheet) and remove. Check: parity-player-check.cjs |
| Claim/unclaim planet manually | PlanetTab l.51, 80; PlanetPanel | Native | Take from the claim sheet or map; lose in PlayerEdit.tsx "Planets". Check: parity-player-check.cjs |
| Objectives tab (reveal/score/unscore) | ObjectiveTab.tsx | Native | `score` sheet / NowPoints / NowStatus. |
| Relics owned, gain/purge | FactionPanel; GainRelic, PurgeRelic | Native | Gain in RelicSheet; purge, unpurge and lose in PlayerEdit.tsx "Relics". Check: parity-player-check.cjs |
| Commodities / trade goods / command tokens | Command-token tracking (option), Sidebars | Not needed | Command token pools aren't tracked (Shawn, 2026-10-18); upstream tracks them only behind its advanced option and doesn't track trade goods or commodities at all |
| Support for the Throne, alliances, fleet pool | PromissoryMenu l.99-280 | Native | Support for the Throne in Points/Status; alliances and Mahact's fleet pool tokens in PlayerEdit.tsx, confirmed. Check: parity-player-check.cjs |

## 4. Status phase

| Feature | Upstream file | /play status | Notes |
|---|---|---|---|
| Score a public objective per faction (any faction, helping) | main/phase/status/StatusPhase.tsx (MiddleColumn) | Native | NowStatus.tsx ScoreSheet; picks seat or "score for" another player; search; undo via "Take it back" |
| Score a secret objective | StatusPhase.tsx | Native | ScoreSheet which="secret"; lists all unscored secrets (hands not tracked, same as upstream) |
| Change/replace a scored objective | StatusPhase.tsx (Selector) | Native | Take it back, then score another |
| "Cannot score public objectives" when home planets are missing | StatusPhase.tsx (canScoreObjectives) | Partial | Sheet shows a warning (missingHomePlanets) but does not block scoring |
| Per-round scoring overview by initiative order | StatusPhase.tsx | Native | NowStatus "This round" list with Public/Secret tags |
| Scoring only objectives valid for the phase (phase-restricted secrets) | StatusPhase.tsx | Native | logic.ts scorablePublics / scorableSecrets |
| Reveal the stage I/II public objective (speaker) | StatusPhase.tsx (ObjectiveSelectHoverMenu) | Native | RevealSheet; stage picked by round; hidden when OBJECTIVES hidden |
| Un-reveal an objective (HideObjectiveEvent) | StatusPhase.tsx (removeObjective) | Native | "Take back" on the revealed objective in Table steps (and in setup). Check: parity-statusabilities-check.cjs |
| Support for the Throne give/move/return | src/components/OtherModal/OtherPanel.tsx; AgendaDetails | Native | NowStatus ThroneRow + GiveSheet; also Points sheet |
| Imperial strategy card point / Imperial primary scoring | StrategyCard flow | Native | NowCards.tsx opens ScoreSheet with anyPhase |
| Custodians token / Mecatol claim point | claim planet | Native | Same ClaimPlanetEvent (MapTab, claim sheet) |
| Manual VP adjustment | OtherPanel / FactionPanel | Native | NowPoints.tsx ManualVPUpdateEvent, +/-3 |
| Secrets scored outside status (action/agenda phase) | objective modal | Native | PointsButton "Points changed?" |
| Start-of-status abilities list (Arborec Mitosis, Wormhole Generator, Hydrothermal Mining, Crown of Emphidia, Genesis, Bioplasmosis, Oracle, Minister of Policy) | StatusPhase.tsx getStartOfStatusPhaseAbilities | Native | StatusAbilities.tsx: Mitosis, Wormhole Generator and Hydrothermal Mining as reminders (as upstream); Entropic Scar and Radical Advancement as sheets. The Oracle and the Crown are end-of-phase rows. Check: parity-statusabilities-check.cjs; The Oracle in parity-rare-check.cjs |
| End-of-status abilities hover list | StatusPhase.tsx getEndOfStatusPhaseAbilities | Native | StatusAbilities.tsx: Genesis, Bioplasmosis and Minister of Policy as reminders; The Crown of Emphidia (with the Tomb: purge for "Tomb + Crown of Emphidia") and The Oracle recorded, with take back |
| Thunder's Edge: Entropic Scar research (gain faction tech) | StatusPhase.tsx EntropicScarResearch | Native | Sheet: choose a player, gain one of their faction technologies (none for Nekro or anyone with both), take back |
| Thunder's Edge: Radical Advancement (replace tech) | StatusPhase.tsx RadicalAdvancement | Native | Sheet: return a technology, gain one of its colour with one more prerequisite; take back restores the returned one |
| Draw action cards per faction (Neural Motivator, Yssaril 3, etc.) | StatusPhase.tsx ActionCardDraws | Not needed | Counts shown upstream are reminders; /play prints the rule text under "Then on the board (not tracked)" |
| Remove command tokens / gain and redistribute (Sol, Hyper Metabolism) | StatusPhase.tsx CommandTokenGains | Not needed | Reminder text only in /play; nothing is recorded upstream beyond a log note |
| Ready cards, repair units, return strategy cards | StatusPhase.tsx steps | Not needed | Text reminder only |
| Step checklist with numbered steps | StatusPhase.tsx | Partial | /play has a three-card layout without upstream's numbered steps |
| Lock the phase until an objective is revealed | StatusPhase.tsx (LockedButtons, statusPhaseComplete) | Native | The next-phase buttons wait for the reveal; "Go on without one" opens the lock, as upstream's lock does on a tap |
| End phase: go to agenda or skip to next round when Mecatol is unclaimed | StatusPhase.tsx nextPhaseButtons | Native | AdvancePhaseEvent(skip) in NowStatus |
| Twilight's Fall: tyrant, edict phase | StatusPhase.tsx (TWILIGHTS FALL) | Native | Section 8: NowStatus finishes into the edict phase, NowEdict runs it. Check: tf-play-check.cjs |
| Hide objectives option (OBJECTIVES section hidden) | Conditional appSection | Native | NowStatus respects options.hide |

## 5. Agenda phase

| Feature | Upstream file | /play status | Notes |
|---|---|---|---|
| Reveal agenda 1 and 2 | main/phase/agenda/components/AgendaSelect.tsx | Native | NowAgenda RevealAgendaSheet |
| Un-reveal agenda (HideAgendaEvent) | AgendaSelect.tsx | Native | "Take it back" on the agenda card until voting starts. Check: parity-agendacards-check.cjs |
| Veto / Quash / Political Favor (reveal-hide with veto) | WhenAnAgendaIsRevealed.tsx VetoButton | Native | AgendaCards.tsx: "Before voting" row, confirm sheet, `HIDE_AGENDA` with veto; the speaker then reveals another |
| Political Secret (promissory note) | WhenAnAgendaIsRevealed.tsx | Native | AgendaCards.tsx: record or take back per player; they can't vote or play riders |
| Hack Election, Assassinate Representative | AfterAnAgendaIsRevealed.tsx | Native | AgendaCards.tsx. Hack Election reverses the voting order (logic.ts votingOrder) |
| Riders (Keleres Rider, Xxcha/other riders, Galactic Threat etc.) | src/components/VoteBlock/VoteBlock.tsx | Native | AgendaCards.tsx RidersSheet: who, which rider (logic.ts ridersFor copies upstream's rules), predicted outcome; take back. Undo of the resolve takes back a rider's effect (fork action `UNRESOLVE_AGENDA`; upstream's own Undo leaves it) |
| Start voting | components/StartVoting.tsx | Native | StartVotingEvent |
| Cast votes: outcome + amount, capped at available | CastVotesSection / VoteBlock | Native | VoteForm with Stepper; uses upstream computeRemainingVotes |
| Votes available per faction (planet influence, spent on agenda 1, Council Preserve, Xxcha, etc.) | VoteBlock.tsx | Native | available() reuses computeRemainingVotes; none after its owner uses Maw of Worlds, as upstream |
| Extra votes (separate "Extra" field, e.g. Predictive Intelligence, Distinguished Councilor, spent trade goods) | VoteBlock.tsx, VotingColumn.tsx | Native | VoteForm's "Extra votes" switch: Distinguished Councilor, Predictive Intelligence, Council Preserve and Blood Pact are played with the vote (offered as upstream offers them; logic.ts VOTE_BONUSES), other extra votes go in extraVotes, and changing a vote takes back cards no longer used. The Cast button and the Votes card show the total, Zeal included. Check: parity-votes-check.cjs |
| Manual vote entry (manualVotes mode) | VoteBlock.tsx | Native | In a game that doesn't track planets, the vote form asks how many votes the player has and saves it with upstream's MANUAL_VOTE_UPDATE (VoteBlock's ManualVoteCount); the vote is capped at that. Executive Order's own vote column is part of the Executive Order row. Check: parity-hidden-check.cjs |
| Abstain | VoteBlock.tsx | Native | Abstain button |
| Representative Government (one vote each; no Argent bonus) | VoteBlock / AgendaPhase | Native | repGov flag |
| Who can vote (Nekro without secret, Elder Qanoj etc.) | VoteBlock canFactionVote | Native | canVote() uses canFactionVote |
| Voting order from speaker, speaker last | VotingColumn.tsx | Native | votingOrder() |
| Vote tally and leading outcome | AgendaPhase.tsx computeVotes | Native | VotesCard / ResolveCard |
| Change someone's vote | VoteBlock.tsx | Native | Tap the player's row; replaces vote |
| Speaker tie-break | VotingColumn.tsx SpeakerTieBreak | Native | ResolveSheet sends SpeakerTieBreakEvent when tied |
| Covert Legislation (reveal eligible outcomes, sub-agenda) | components/CovertLegislation.tsx | Native | NowAgenda.tsx: the speaker reads out the hidden agenda's outcomes before voting (voting waits for it), votes and labels use them, and resolving names the hidden agenda, which passes with the vote. Undo also repeals the hidden agenda (fork actions `UNRESOLVE_AGENDA` and `UNREVEAL_SUB_AGENDA`; upstream's own Undo leaves it passed). Check: parity-covert-check.cjs |
| Resolve agenda with outcome | CastVotesSection.tsx completeAgenda | Native | ResolveSheet |
| Post-resolve effects: Incentive Program, Colonial Redistribution, Minister of Antiquities (relic), planet elections (give planet), Drive the Debate | components/AgendaDetails.tsx | Native | AgendaCards.tsx ResolveFollowUps, in the resolve sheet before Confirm (as upstream records them before the resolve): Drive the Debate for the elected player or planet owner, Incentive Program's objective, Colonial Redistribution's planet, Minister of Antiquities' relic, each with take back. Check: parity-agendafollow-check.cjs |
| Dictate Policy, Mutiny points etc. | AgendaPhase.tsx DictatePolicy | Native | DictatePolicyRows on the agenda screen once 3 laws are in play (upstream's rule; one scorer when it's a secret). Mutiny and other agenda points are applied by upstream's resolve |
| Ancient Burial Sites, Maw of Worlds (start of agenda phase) | AgendaPhase.tsx AgendaSteps | Native | AgendaCards.tsx before the first agenda. Ancient Burial Sites also lowers that player's available votes, which upstream's tally never does (it reads a state field nothing sets) |
| Agenda timers per agenda | src/components/AgendaTimer | Native | The agenda card shows game time on this agenda, and the end of the phase shows both (upstream's AgendaTimer rule, Clock.tsx useAgendaTimes) |
| Laws in effect list + repeal | src/components/Header/Header.tsx PassedLaws, RepealAgendaEvent | Native | Laws.tsx: "Laws in effect" on the Table tab, each with its text, who was elected, and a confirmed Repeal (undoable). Check: parity-laws-check.cjs |
| Laws' effects on gameplay (e.g. Representative Government, Checks and Balances, Minister of Policy) | various | Partial | Applied where built (RepGov, Checks and Balances at pick); others not surfaced |
| Ready planets, then start next round | AgendaPhase.tsx | Native | "Both agendas are resolved" card, AdvancePhaseEvent |

## 6. End of game and results

| Feature | Upstream file | /play status | Notes |
|---|---|---|---|
| End Game button when VP target reached | src/components/Header/Header.tsx | Native | GameEndBanner in NowEnd.tsx; alliance variant links out |
| Back to Game (Continue) | Header.tsx | Native | NowEnd "Back to the game" |
| Winner announcement and ties | results/ResultsPhase.tsx | Native | NowEnd game-over card |
| Final scores with points by source | summary-column "Final Score" | Native | NowEnd Results rows, tap for PlayerSheet |
| Game log (Beta) annotated by round | results/game-log.worker.tsx, ResultsPhase | Native | The Log tab has a heading where each round starts (logic.ts roundsOf). Check: parity-results-check.cjs (run on `next dev --webpack`: Turbopack's dev server can't start the replay worker) |
| Victory points graph by round | results/VictoryPointsGraph.tsx | Native | Results.tsx: "How the game went" (game-over screen, Table tab): points by round from upstream's replay worker, a legend that highlights a player, a table view. Check: parity-results-check.cjs (run on `next dev --webpack`: Turbopack's dev server can't start the replay worker) |
| Techs graph | results/TechGraph.tsx | Native | Same sheet, "Technology": technologies by round. Check: parity-results-check.cjs (run on `next dev --webpack`: Turbopack's dev server can't start the replay worker) |
| Map lapse (map by round) | results/MapLapse.tsx | Native | Same sheet, "Map": upstream's GameMap at the end of each round. Check: parity-results-check.cjs (run on `next dev --webpack`: Turbopack's dev server can't start the replay worker) |
| Timers summary (per round, per faction, agenda) | results/Timers.tsx | Native | Same sheet, "Time": each player's turn time (upstream timers, which /play runs since stage 3), turns and longest turn from the replay. Secondary timers stay off. Check: parity-results-check.cjs (run on `next dev --webpack`: Turbopack's dev server can't start the replay worker) |
| Combat summary | n/a (fork-only) | Native | NowEnd CombatSummary |
| Results view selector (Game Log, VP, Techs, Map Lapse, Timers) | ResultsPhase.tsx | Native | The sheet's Points / Technology / Map / Time picker |
| Link to archived game / permanent results page | archive/[gameId] | Not needed | Group does not use Archive |

## 7. Whole-game features

| Feature | Upstream file | /play status | Notes |
|---|---|---|---|
| Game log with per-entry list | src/components/GameLog/GameLog.tsx | Native | LogTab (filter by player, newest first, 300 entries) |
| Undo (latest action or grouped actions) | src/components/UndoButton | Native | Toast Undo and LogTab Undo (undoNewest) |
| Revert/edit arbitrary older log entries | GameLog.tsx | Not needed | Upstream can't either: its game log (GameLog.tsx) has no edit or undo controls, and its Undo takes back only the newest entry, as /play's does |
| Objectives page (all objectives, reveal/hide/score by anyone) | objectives/objective-page.tsx, ObjectiveModal | Native | Objectives.tsx: an "Objectives" row on the Table tab opens a sheet with Stage I, Stage II, Secrets (by player) and Other points. Each objective shows who scored it; anyone can reveal, hide (when unscored), score or take back for any player, with a confirming sentence. Hidden when OBJECTIVES is off. Check: views-check.cjs |
| Per-faction page: Phase section (what this faction does now) | (faction)/[factionId]/elements/PhaseSection.tsx | Native | Now tab is seat-based |
| Faction page: Techs tab (add/remove, tech tree) | elements/TechTab.tsx, src/components/TechTree | Native | TechTreeSheet.tsx: each colour by prerequisites, owned / can research / missing; add and remove via PlayerEdit. Check: parity-player-check.cjs |
| Faction page: Planets tab (claim, exhaust, attach) | elements/PlanetTab.tsx | Native | Claim and lose in PlayerEdit / claim sheet; attachments via MapTab. Planet exhaustion isn't tracked (Shawn, 2026-10-18) |
| Faction page: Objectives tab | elements/ObjectiveTab.tsx | Native | The Objectives sheet's Secrets tab lists each player's scored secrets (score or take back); public objectives list their scorers. Check: views-check.cjs |
| Faction page: leaders, abilities, units, promissories | FactionContent / FactionPanel | Partial | PlayerSheet shows leaders and abilities; hero play via NowComponent; no unit stats, no promissory tracking beyond component sheet |
| Faction links nav (switch faction) | FactionLinks.tsx | Native | Race / Table tab to PlayerSheet |
| Summary column (speaker order, scores, faction summaries) | main/summary-column/SummaryColumn.tsx | Native | Race card, Table tab |
| Speaker / initiative / voting order display | src/components/Footer/Footer.tsx | Native | TurnOrder.tsx: a "Turn order" card on the Table tab, opening on the phase's order (speaker, initiative or voting) with the others a tap away. Voting order uses logic.ts votingOrder, Hack Election included. Check: views-check.cjs |
| Change speaker | Footer.tsx | Native | NowCards (Politics) SetSpeaker; no free-form change otherwise |
| Tyrant (Twilight's Fall) | Footer.tsx | Native | A card on the Table tab (section 8). |
| Update techs / objectives / planets / other (global modals) | Footer.tsx modals | Partial | Planet claim, research, relic, expedition in sheets; no free-edit modal for objectives or planets |
| Thunder's Edge expedition | OtherPanel.tsx | Native | NowExpedition.tsx |
| Relics (gain/purge, Crown) | OtherPanel.tsx | Native | Gain, purge and lose by hand (PlayerEdit.tsx); the Crown in the status phase |
| Promissory notes and alliances (Fleet pool, Alliances) | OtherPanel.tsx | Native | PlayerEdit.tsx "Alliance": who holds a player's Alliance, confirmed; Mahact's fleet pool tokens. Check: parity-player-check.cjs |
| ControlButtons: password entry when view-only | game/[gameId]/ControlButtons.tsx, Header.tsx | Native | NowLocked.tsx: a banner on Now while the game is view-only, and any write or Undo opens the password sheet (upstream's useEnterPassword). Check: parity-lock-check.cjs |
| Pause / end game / continue | Header.tsx | Native | End/Continue (NowEnd) and pause (Table tab Game clock) |
| Game timer | src/components/GameTimer | Native | Clock.tsx runs it; the Table tab shows it |
| Turn timer / faction timers | src/components/TurnTimer, TimerDisplay | Native | Active player's faction timer runs; totals on the Table tab; the turn clock is in the hero |
| Map view | src/components/Map, main page | Native | MapTab (zoom, find a planet) |
| Map interactions: system details, claim planet, attachments | src/components/Map, PlanetModal | Native | SystemSheet |
| Map interactions: frontier tokens, Mallice/Nexus, Wormhole Nexus | Map components, FrontierExploration | Native | The Map tab draws upstream's GameMap, so the Wormhole Nexus and Mallice show as upstream shows them; upstream's map doesn't draw frontier tokens either. Frontier exploration is recorded from the tactical action (Frontier.tsx) and systems are added with MapTiles.tsx |
| Combat tracking | n/a (fork-only) | Native | Combat.tsx |
| Game password / lock | game/[gameId]/layout.tsx, Header | Native | /play's layout reads the password and session like upstream's; unlocking lasts for the session (two weeks), across reloads. Setting a password at setup is in Game setup |
| Share link and QR code | src/components/QRCode | Native | GameInfo.tsx "This game" on the Table tab: share (the phone's share sheet, or copy) and a QR code, both for the /play link (NEXT_PUBLIC_BASE_URL wins, as seam S3). Check: parity-global-check.cjs |
| Game code display | game/[gameId]/game-code.tsx | Native | Same card shows the code. Check: parity-global-check.cjs |
| Settings modal (victory points, factions, options) | src/components/SettingsModal | Native | "Game settings" from the same card: points to win, each player's name and colour (confirmed), with upstream's changeOption and updateFaction. Upstream's display settings are for its own layout. Check: parity-global-check.cjs |
| Theme toggle (dark/light) | app/[locale]/ThemeToggle.tsx | Native | DeviceSheet theme choice |
| Text size, shared-screen mode, dock | n/a (fork-only) | Native | DeviceSheet |
| Languages (i18n, LangSelectHoverMenu) | src/components/LangSelectHoverMenu | Not needed | /play stays English, with no language picker (Shawn, 2026-10-20). Its strings are fork code, so upstream's message files stay untouched |
| Download/export game data | Header / game page | Native | "Download the game" on the Table tab: upstream's /api/<id>/download (setup, timers, full log) as a JSON file. Upstream's screens never linked it. Check: parity-results-check.cjs (run on `next dev --webpack`: Turbopack's dev server can't start the replay worker) |
| Archive | app/[locale]/archive | Not needed | Dropped by Shawn |
| Stats | app/[locale]/stats | Not needed | Dropped by Shawn |
| Supporters, support links | app/[locale]/supporters, SupportSection.tsx | Not needed | Dropped by Shawn |
| Demo game | game/[gameId]/demo | Not needed | Group has its own games |
| FAQ | app/[locale]/FAQ | Native | The start page links upstream's FAQ page. Check: parity-global-check.cjs |
| Map builder | app/[locale]/map-builder | Not needed | Upstream's own page, kept and linked from the start page (it opens upstream's page). It makes map strings for setup and isn't part of a game, so /play doesn't need a copy |
| New game setup | app/[locale]/setup | Native | /start/new (NewGame.tsx); see Game setup |
| Home page: join by code, recent games | app/[locale]/page.tsx, JoinGame.tsx | Native | StartPage.tsx (game code, back to game, games on device) |
| PWA / service worker | app/[locale]/ServiceWorkerWrapper.tsx, `public/service-worker.js` | Not needed | Upstream doesn't run one: `ServiceWorkerWrapper` is never mounted and there's no web manifest, so upstream has no offline mode or install prompt either |
| Setup phase (starting techs, map string) | main/phase/setup | Native | See the game-phase setup row in Game setup |
| Fallback link to upstream faction page | (faction)/[factionId] | Native | Every phase is native now, the edict phase included, so NotNativeYet (a link to /game/<id>/<faction>) only shows for a phase upstream adds later |
| Hidden app sections (TECHS, PLANETS, OBJECTIVES) | src/components/Conditional | Native | Ctx.tracks() in PlayApp. With a section off, /play leaves out what upstream's Conditional hides: research (Technology card, secondaries, components, player edit), planet claims (tactical, map, Faunus, follow-ups), objective scoring (Imperial, tactical secrets, Prove Endurance, points sheet), relic rows, the player sheet's sections and the results' Technology view. Status, setup and agenda screens already checked it. Check: parity-hidden-check.cjs |

## 8. Twilight's Fall in /play

Built on branch `draft/twilights-fall` (2026-10-20) and checked on phones against a scripted 6-King game (`tf-play-check.cjs`, from the `tfall-snap-tf-*` snapshots). The code is in `src/fork/tfplay/`, hooked into `/play` with one or two lines in `PlayApp.tsx`, `ui.tsx`, `NowCards.tsx`, `NowAction.tsx`, `NowStatus.tsx`, `PlayerSheet.tsx` and `things.tsx`. Merged into `play/design-language` on 2026-10-24; the Twilight's Fall rows in sections 1 to 7 take their status from here.

| Feature | Upstream | /play status | Notes |
|---|---|---|---|
| Creating a Twilight's Fall game | SETUP page | Native | The Twilight's Fall draft (`/draft/tf`, `src/fork/tfdraft/`) creates it with the Kings seated, the map built, and each King's home system and starting units set. |
| Planet and unit factions (home system, starting units) | `StartingComponents.tsx` (TFFactionSelect) | Native | Set by the draft. Changing them afterwards is on the table screen. |
| Inaugural splice | `SetupPhase.tsx`, `SetupSteps.tsx` | Native | Setup card with each player's 3 abilities, 2 unit upgrades and 2 genomes (`TfTable.tsx`). NowSetup's own note now covers only home systems and starting units. |
| Strategy picks with the 8 cards | SP | Native | Lux to Aeterna in their colours (checked: Magus purple, Aeterna magenta). |
| Noctis, Calamitas, Magus: the splice | `StrategicActions/{Noctis,Calamitas,Magus}.tsx`, `src/components/Splice/SpliceModal.tsx` | Native | Splice sheet (`NowSplice.tsx`): who joins, Magus' extra card, Engineer and Reverse, the cards turned face up, picks in order, a King technology instead. Pick order copied from SpliceModal. |
| Joining a splice from the secondary | `AllSecondaries` in the same files | Native | Follow on Noctis, Calamitas or Magus also joins the splice. Players pick on their own phones from a splice card on the Now tab. |
| Thieve and Research Genome in a splice | `SpliceModal.tsx` | Partial | Counted when played on the table screen; no buttons in /play. |
| Tyrannus | `StrategicActions/Tyrannus.tsx` | Native | New speaker and new tyrant, each with a confirm sentence. |
| Aeterna | `StrategicActions/Aeterna.tsx` | Native | Score a public objective, or draw a paradigm. Upstream adds the point for holding Mecatol Rex when Aeterna is chosen. |
| Lux, Civitas, Amicus | None | Not needed | Their effects happen on the board. |
| Abilities, genomes, unit upgrades and paradigms owned | `TFTechSummary` (`FactionSummary.tsx`) | Native | On the player sheet, each name opens its text; "Change cards" records gains and discards. |
| Status phase into the edict phase | `StatusPhase.tsx` | Native | With a tyrant, "Start the edict phase"; without one, the next round starts. |
| Edict phase: the tyrant's edict | `phase/edict/EdictPhase.tsx` | Native | `NowEdict.tsx`. The next round stays locked until the tyrant has chosen. |
| Radiant Aur's extra edict | `EdictPhase.tsx` | Native | |
| Splice, Arbitrate, Convene, Artifice, Legacy of Ixth | `phase/edict/*.tsx` | Native | Splice opens the splice sheet for every player; the others record cards gained (and discarded, for Arbitrate); Artifice also records a relic. |
| Arise, Bless, Censure, Execute, Foretell | None | Not needed | Text only, as upstream. |
| The tyrant | `Footer.tsx` | Native | A card on the Table tab. |
| Thunder's Edge expeditions | Disabled in Twilight's Fall | Native | Hidden, as upstream. |
| Using a genome, and component actions from cards | `GenomeRow`, components | Partial | Component-action cards appear with other components; genome use isn't recorded in /play. Not run on a phone. |

## Biggest gaps

What's left, by the rows above that aren't Native or Not needed:

1. Component actions still recorded without their effect: Executive Order, Planetary Rigs, Sins of the Father, Dannel of the Tenth / Blessing of the Yin, Riftwalker Meian / Changing the Ways, Transpose, Create / Fabrication / Forge Legend, Unravel.
2. Read-only views: no unit stats or promissory notes in the player sheet, no browser of every objective with its scorers, no initiative or voting-order view, no free edit of objectives.
3. Twilight's Fall: Thieve and Research Genome in a splice, and recording a genome's use.
