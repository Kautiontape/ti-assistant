# /play parity with upstream

This lists what a player can do or see in upstream TI Assistant, and whether the fork's `/play` screen does it. It was built on 2026-10-20 by reading upstream's screens (upstream `5c34942`) and the fork's `src/fork` (branch `play/design-language`, `34ebc6b`). Re-check a row in the code before building on it, and update the row in the same commit that changes its status.

| Status | Rows | Meaning |
|---|---|---|
| Native | 140 | Works in `/play`. |
| Partial | 31 | Works in `/play`, with the gap named in Notes. |
| Table screen | 9 | `/play` links to upstream's table screen (`/game/<id>/main`) for it. |
| Via More controls | 8 | `/play`'s "More controls" row opens upstream's faction page, which has it, but only on that player's turn. |
| Missing | 20 | No way to do it from `/play`. |
| Not needed | 14 | Left out on purpose; the reason is in Notes. |

`/play` hides upstream's header (`HideOnPlay.tsx`), so everything upstream's header, footer and sidebars offer needs its own path in `/play`. Twilight's Fall belongs to the Twilight's Fall work (branch `draft/twilights-fall`): its rows in sections 1 to 7 are left for that branch, and the last section covers what a Twilight's Fall game does in `/play`. The totals above leave that section out. Paths: SETUP is `app/[locale]/setup/setup-page.tsx`, AP is `app/[locale]/game/[gameId]/main/phase/action`, SP is `.../main/phase/strategy/StrategyPhase.tsx`; other upstream paths are under `app/[locale]/game/[gameId]/` unless they start with `src/`.

## 1. Game setup

| Feature | Upstream file | /play status | Notes |
|---|---|---|---|
| Entry to new game | SETUP page.tsx | Table screen | Start page (src/fork/home/StartPage.tsx) has "New game" `external` to /setup. |
| Player count (3-8 chips) | SETUP (PlayerCount, ~l.182) | Partial | Only the Milty draft (src/fork/draft/NewDraft.tsx), fixed at 6 players. |
| Expansions: PoK, Thunder's Edge, Codex I-IV, Twilight's Fall | SETUP l.235-325 | Partial | Draft has an expansions list (NewDraft.tsx); Codex/TF handling there not checked. Other setups: upstream. |
| Homebrew: Discordant Stars | SETUP l.359 | Table screen | Not in draft. |
| Events (shown when TF is off) | SETUP l.387 | Table screen | Not in draft. |
| Game variant: normal / alliance-separate / alliance-combined (4, 6, 8 players only) | SETUP l.213, 539 | Table screen | Draft always makes "normal" (server.ts `BASE_OPTIONS`). |
| Victory points (+ secondary VP for separate alliance) | SETUP l.205 | Partial | Draft sets `victory-points`; no secondary VP. |
| Map type chips (standard/warp/skinny/large by player count) | SETUP l.447 | Missing | Draft hardcodes "standard". |
| Map string input, validates, filters non-claimable planets | SETUP l.479, 1952 | Partial | Draft builds the map string from the chosen slices (src/fork/draft/server.ts gamePayload). No manual entry. |
| Faction pick per seat (radial menu, filtered by expansions, removedIn) | SETUP l.1177, 1700 | Partial | Draft picks factions per player (draftableFactions copies the filter). |
| Colour picker per seat (Magenta/Orange only with PoK) | setup/components/ColorPicker.tsx | Partial | Draft auto-assigns (pickColor); can't change. |
| Player name per seat | setup/components/PlayerNameInput.tsx | Native | Draft collects names. |
| Speaker choice | SETUP l.2285 | Partial | Draft: position 0 is speaker; picked in the draft. |
| Alliance partner pairing | SETUP l.961, 1239 | Table screen | Not in draft. |
| Randomize factions + Reset | SETUP l.2045-2078, 2441 | Missing | Draft has its own random faction pool. |
| "Select all factions and colors" gate | SETUP l.2381 | Not needed | Draft guarantees it. |
| Track toggles: Cards, Techs, Planets, Objectives, Relics | SETUP l.2148-2211 | Missing | Draft uses `BASE_OPTIONS`; no choice. |
| Advanced tracking: Command Tokens (+ disclaimer) | SETUP l.2221-2272 | Not needed | Command token pools aren't tracked (Shawn, 2026-10-18); upstream tracks them only behind its advanced option and doesn't track trade goods or commodities at all |
| Password (optional) | SETUP l.2307 | Missing | Draft creates games without one. |
| Start Game button | SETUP l.2343 | Native (draft) | Draft's "Create the game" calls create-game (server.ts l.154). |
| Language selector, theme | setup header | Not needed | Device settings sheet in /play covers theme/text size. |
| Game-phase SETUP (starting techs, speaker actions, reveal 2 stage I) | main/phase/setup | Native | NowSetup.tsx: starting technology choices (Winnu, Argent, Keleres, Deepwrought and the rest), Keleres' home system, the speaker's two stage I objectives (with take back), the map string, then Start the game once upstream's setupPhaseComplete allows. Twilight's Fall choices link to the table screen. Check: parity-setup-check.cjs |

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
| Ral Nel hero: unpass | AP UnpassSection l.1938 | Native | "Ral Nel unpasses" on the everyone-has-passed card while Director Nel is readied (UNPASS). Not exercised: no Ral Nel snapshot |
| Faunus (Pass-turn faction ability) | AP/Actions/Faunus.tsx | Native | Pass sheet: take a non-home, non-legendary planet with no attachments, sent with the pass (Faunus.tsx rule). Not exercised: no Faunus owner in the snapshots |
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
| Mecatol Rex / Custodians token +1 VP | TacticalAction l.119 | Partial | Claiming Mecatol records the point (data layer); /play shows no "+1 VP for Custodians" text (counted in PlayerSheet points). |
| Space / ground combat (fork-only feature) | src/fork/actions/combat.ts | Native | Combat.tsx (start, banner clock, end). Not in upstream. |
| Score action-phase objectives (up to 4) | TacticalAction l.125-190 | Native | Every action-phase objective is a secret: "Scored a secret?" in the tactical action's rows opens the action-phase secrets (and "Points changed?" in any turn). Check: parity-player-check.cjs |
| Become a Martyr (score on losing home) | TacticalAction l.395 | Native | An action-phase secret: "Points changed?" → scored a secret (upstream also keeps it out of the tactical list) |
| Gain relic from frontier exploration | TacticalAction l.193; GainRelic | Native | RelicSheet, from a component action or the frontier sheet after a tactical action (Frontier.tsx) |
| Frontier exploration (explore token) | src/components/FrontierExploration | Native | Frontier.tsx: "Explored a frontier?" after a tactical action: gain a relic or find Mirage. Check: parity-player-check.cjs |
| Mirage claim (Mirage planet from frontier) | FrontierExploration l.52 | Native | Frontier sheet: take control of Mirage, with take back |
| Nekro Technological Singularity (copy 4 techs) | TacticalAction l.195 | Via More controls | Not in fork. |
| Embers of Muaat: Adjudicator Ba'al (replace system) | TacticalAction l.245 | Via More controls | Not in fork. |
| Thunder's Edge expedition (6 slots, tie-break owner) | src/components/Expedition | Native | NowExpedition.tsx (commit, take back, tie-break). |
| Breakthrough readied on first expedition | commitToExpedition handler | Native | Done in data layer; sheet text says so. |

### 3c. Component actions

| Feature | Upstream file | /play status | Notes |
|---|---|---|---|
| Pick component (search; groups for cards, techs, leaders, relics, promissory notes, abilities) | AP ComponentAction.tsx ComponentSelect l.87 | Native | NowComponent.tsx ComponentSheet (copies the filter). |
| Take back the played component | ComponentAction | Native | "Take it back" (`UNPLAY_COMPONENT`). |
| Component description | ComponentDetails l.545 | Native | Shown under component name. |
| Research a tech (Plagiarize, Focused Research, Enigmatic Device, Flayesh) | ComponentAction l.28-41, 185 | Native | "Record the technology" -> ResearchSheet. |
| Gain relic (Gain Relic, Black Market Forgery, Hesh and Prit, Create/Fabrication/Forge Legend) | ComponentAction l.79 | Partial | Gain Relic/Black Market/Hesh and Prit native (RelicSheet); Create, Fabrication, Forge Legend not in RELIC set. |
| Exploration Probe / Circlet of the Void (frontier) | ComponentAction l.58 | Native | The component's card offers the frontier sheet |
| Share Knowledge, Divert Funding, Dynamis Core, Visionaria Select | ComponentActions/*.tsx | Via More controls | Component recorded only. |
| Stellar Converter, Conventions of War Abandoned (purge planet) | ComponentActions/PurgePlanet.tsx | Via More controls | Recorded only. |
| Nano-Forge, Terraform (attach to planet) | ComponentActions/AttachToPlanet.tsx | Partial | Attach via map system sheet by hand; no guided flow. |
| Dannel of the Tenth / Blessing of the Yin, Riftwalker Meian / Changing the Ways, Z'eu, Transpose | ComponentActions/*.tsx | Via More controls | Recorded only. |
| Planetary Rigs, Overrule, Sins of the Father, Mathis Mathinus, Strategize, Vaults of the Heir, Ta Zern, Silver Flame, Executive Order | ComponentActions/*.tsx | Via More controls | Recorded only. |
| Industrial / Mining Initiative, Total War, Book of Latvinia, Age of Exploration | ComponentActions/*.tsx | Via More controls | Recorded only. |
| Star Chart / Azdel's Key (add system to map) | ComponentActions/AddSystemToMap.tsx | Via More controls | Not in MapTab. |
| Action cards that are ACTIONS | ComponentAction | Native | Listed under "Action cards" in the component sheet. |
| Action cards played at other times (record who) | `PLAY_ACTION_CARD` (upstream logs only) | Native | NowActionCards.tsx (fork addition). Assassinate Representative and Ancient Burial Sites are on the agenda screen (AgendaCards.tsx); Engineer, Reverse and Thieve stay on the table screen. |
| Promissory note actions & Support for the Throne / alliances | src/components/PromissoryMenu | Partial | Notes with component actions appear in the sheet; SftT and alliances show on PlayerSheet read-only; scoring Support for the Throne is in NowPoints only if status/any phase. |
| Exhaust/ready techs, leaders (agent/commander/hero) and relics when used | FactionPanel l.675 UpdateLeaderStateEvent; component handlers | Partial | Leaders (ready, exhaust, unlock, purge) and relics (purge) by hand in PlayerEdit.tsx. Upstream has no event to exhaust a technology, so neither does /play |
| Breakthrough state (locked/readied/exhausted/purged) | FactionPanel FactionBreakthrough l.1132 | Native | PlayerEdit.tsx: lock and unlock, as upstream's faction panel |
| Twilight's Fall splice/genome/paradigm cards (Coerce, Elevate, Evolve, Genophage, Helix, Irradiate, Mutate, Devour World, Witching Hour...) | ComponentAction l.240-360; src/components/Splice | Missing | TF not supported in /play (expedition hidden when TF on). |
| Unravel (purge relic) / Repeal Law | ComponentAction l.354 | Partial | Relic purge in PlayerEdit.tsx and repeal in Laws.tsx; Unravel itself is only recorded as the component |

### 3d. Strategic actions

| Feature | Upstream file | /play status | Notes |
|---|---|---|---|
| Play strategy card primary (select, mark primary "Done") | AP l.383-1385 (MarkPrimaryEvent toggle) | Partial | Select native; "Done" toggle not in /play (SecondariesCard does not wait for primary). |
| Secondary check for other players (Follow/Skip/Change) | AP SecondaryCheck l.141 | Native | SecondariesCard + per-player prompt (MarkSecondaryEvent). |
| Technology primary (1st free, 2nd for 6 resources) | StrategicActions/Technology.tsx | Native | TechnologyPrimary + ResearchSheet. |
| Technology secondary (follow + research; Jol-Nar 2 techs; Nekro excluded) | AP l.383 | Native | ResearchSheet follow mode, "2nd tech". Nekro: text says gains command tokens, no token UI. |
| Politics primary (new speaker, swap/undo) | StrategicActions/Politics.tsx | Native | PoliticsPrimary. Draw action cards: board. |
| Politics: End Turn blocked until speaker chosen | NextPlayerButtons l.1566 | Native | End turn waits for the new speaker, with a hint. Check: parity-turn-check.cjs |
| Imperial primary (score public obj or secret / Mecatol +1) | StrategicActions/Imperial.tsx | Native | ImperialPrimary + `score` sheet. |
| Imperial secondary (draw secret obj), Imperial points for Mecatol | AP l.1313 | Partial | Text only. |
| Diplomacy primary (Xxcha Peace Accords planet claim) | StrategicActions/Diplomacy.tsx | Missing | Not in fork. Via More controls. |
| Diplomacy primary/secondary (ready planets, refresh) | AP l.647 | Partial | Text only. |
| Leadership (gain N command tokens, shown only with command-token tracking) | StrategicActions/Leadership.tsx | Not needed | Command token pools aren't tracked (Shawn, 2026-10-18); upstream tracks them only behind its advanced option and doesn't track trade goods or commodities at all. The Leadership card itself is native (select, text, secondaries) |
| Construction / Trade / Warfare (Warfare: score action-phase obj; Trade: commodities, Hacan etc.) | AP l.1080, 1155 | Partial | Select + text + secondaries; no trade-goods or commodity counters anywhere in fork. |
| Warfare primary objective scoring | StrategicActions/Warfare.tsx | Native | With Thunder's Edge, Warfare's primary gets the tactical rows: take a planet, frontier, scored a secret |
| Twilight's Fall cards (Noctis, Tyrannus, Calamitas, Magus, Aeterna, Lux, Civitas, Amicus): splice join/leave, new tyrant | StrategicActions/*.tsx | Missing | TF has no /play support. |
| Cards on table (who picked, played/ready) | AP StrategyCardColumn | Native | CardBoard. |

### 3e. Faction panels and sidebars

| Feature | Upstream file | /play status | Notes |
|---|---|---|---|
| Faction panel: leaders (agent/commander/hero) with ready/exhaust/purge | src/components/FactionPanel.tsx l.566-740 | Native | PlayerEdit.tsx "Leaders": exhaust and ready agents, unlock commanders and heroes, purge and unpurge heroes. Check: parity-player-check.cjs |
| Faction techs, unit upgrades, unit stats | FactionPanel l.756, 1023, 1097 | Partial | PlayerSheet lists techs by colour (cite popouts). Tech add/remove: ResearchSheet / Undo only. No unit stat blocks. |
| Faction abilities, promissory notes, genomes, paradigms | FactionPanel l.794-977 | Partial | Abilities listed in PlayerSheet (popout text); notes and TF cards not shown. |
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
| Start-of-status abilities list (Arborec Mitosis, Wormhole Generator, Hydrothermal Mining, Crown of Emphidia, Genesis, Bioplasmosis, Oracle, Minister of Policy) | StatusPhase.tsx getStartOfStatusPhaseAbilities | Native | StatusAbilities.tsx: Mitosis, Wormhole Generator and Hydrothermal Mining as reminders (as upstream); Entropic Scar and Radical Advancement as sheets. The Oracle and the Crown are end-of-phase rows. Check: parity-statusabilities-check.cjs (The Oracle not exercised: no Naalu snapshot) |
| End-of-status abilities hover list | StatusPhase.tsx getEndOfStatusPhaseAbilities | Native | StatusAbilities.tsx: Genesis, Bioplasmosis and Minister of Policy as reminders; The Crown of Emphidia (with the Tomb: purge for "Tomb + Crown of Emphidia") and The Oracle recorded, with take back |
| Thunder's Edge: Entropic Scar research (gain faction tech) | StatusPhase.tsx EntropicScarResearch | Native | Sheet: choose a player, gain one of their faction technologies (none for Nekro or anyone with both), take back |
| Thunder's Edge: Radical Advancement (replace tech) | StatusPhase.tsx RadicalAdvancement | Native | Sheet: return a technology, gain one of its colour with one more prerequisite; take back restores the returned one |
| Draw action cards per faction (Neural Motivator, Yssaril 3, etc.) | StatusPhase.tsx ActionCardDraws | Not needed | Counts shown upstream are reminders; /play prints the rule text under "Then on the board (not tracked)" |
| Remove command tokens / gain and redistribute (Sol, Hyper Metabolism) | StatusPhase.tsx CommandTokenGains | Not needed | Reminder text only in /play; nothing is recorded upstream beyond a log note |
| Ready cards, repair units, return strategy cards | StatusPhase.tsx steps | Not needed | Text reminder only |
| Step checklist with numbered steps | StatusPhase.tsx | Partial | /play has a three-card layout without upstream's numbered steps |
| Lock the phase until an objective is revealed | StatusPhase.tsx (LockedButtons, statusPhaseComplete) | Native | The next-phase buttons wait for the reveal; "Go on without one" opens the lock, as upstream's lock does on a tap |
| End phase: go to agenda or skip to next round when Mecatol is unclaimed | StatusPhase.tsx nextPhaseButtons | Native | AdvancePhaseEvent(skip) in NowStatus |
| Twilight's Fall: tyrant, edict phase | StatusPhase.tsx (TWILIGHTS FALL) | Table screen | Finish-phase link-out; Edict phase itself (Arbitrate, Convene, Splice, Legacy of Ixth) is NotNativeYet |
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
| Manual vote entry (manualVotes mode) | VoteBlock.tsx | Missing | Cap at "available" in /play can block odd cases |
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
| Game log (Beta) annotated by round | results/game-log.worker.tsx, ResultsPhase | Partial | Log tab has the live log with filter and undo, no round grouping or annotations |
| Victory points graph by round | results/VictoryPointsGraph.tsx | Missing | No chart |
| Techs graph | results/TechGraph.tsx | Missing | No chart |
| Map lapse (map by round) | results/MapLapse.tsx | Missing | MapTab shows the current map only |
| Timers summary (per round, per faction, agenda) | results/Timers.tsx | Partial | NowEnd shows time per player on turns and in combat (fork-derived), not upstream's timer data |
| Combat summary | n/a (fork-only) | Native | NowEnd CombatSummary |
| Results view selector (Game Log, VP, Techs, Map Lapse, Timers) | ResultsPhase.tsx | Missing | |
| Link to archived game / permanent results page | archive/[gameId] | Not needed | Group does not use Archive |

## 7. Whole-game features

| Feature | Upstream file | /play status | Notes |
|---|---|---|---|
| Game log with per-entry list | src/components/GameLog/GameLog.tsx | Native | LogTab (filter by player, newest first, 300 entries) |
| Undo (latest action or grouped actions) | src/components/UndoButton | Native | Toast Undo and LogTab Undo (undoNewest) |
| Revert/edit arbitrary older log entries | GameLog.tsx | Missing | Only the newest group can be undone |
| Objectives page (all objectives, reveal/hide/score by anyone) | objectives/objective-page.tsx, ObjectiveModal | Partial | Score/reveal for the current step only; no full objectives browser, no scorers list per objective |
| Per-faction page: Phase section (what this faction does now) | (faction)/[factionId]/elements/PhaseSection.tsx | Native | Now tab is seat-based |
| Faction page: Techs tab (add/remove, tech tree) | elements/TechTab.tsx, src/components/TechTree | Native | TechTreeSheet.tsx: each colour by prerequisites, owned / can research / missing; add and remove via PlayerEdit. Check: parity-player-check.cjs |
| Faction page: Planets tab (claim, exhaust, attach) | elements/PlanetTab.tsx | Native | Claim and lose in PlayerEdit / claim sheet; attachments via MapTab. Planet exhaustion isn't tracked (Shawn, 2026-10-18) |
| Faction page: Objectives tab | elements/ObjectiveTab.tsx | Partial | PlayerSheet "Points"; no per-objective scoring list |
| Faction page: leaders, abilities, units, promissories | FactionContent / FactionPanel | Partial | PlayerSheet shows leaders and abilities; hero play via NowComponent; no unit stats, no promissory tracking beyond component sheet |
| Faction links nav (switch faction) | FactionLinks.tsx | Native | Race / Table tab to PlayerSheet |
| Summary column (speaker order, scores, faction summaries) | main/summary-column/SummaryColumn.tsx | Native | Race card, Table tab |
| Speaker / initiative / voting order display | src/components/Footer/Footer.tsx | Partial | Speaker tag in Table tab; no separate initiative/voting order views |
| Change speaker | Footer.tsx | Native | NowCards (Politics) SetSpeaker; no free-form change otherwise |
| Tyrant (Twilight's Fall) | Footer.tsx | Missing | |
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
| Map interactions: frontier tokens, Mallice/Nexus, Wormhole Nexus | Map components, FrontierExploration | Partial | Wormhole nexus shown; frontier exploration not handled |
| Combat tracking | n/a (fork-only) | Native | Combat.tsx |
| Game password / lock | game/[gameId]/layout.tsx, Header | Native | /play's layout reads the password and session like upstream's; unlocking lasts for the session (two weeks), across reloads. Setting a password at setup is section 1 |
| Share link and QR code | src/components/QRCode | Missing | Start page has a join by code only; no share/QR |
| Game code display | game/[gameId]/game-code.tsx | Missing | Code only in the URL |
| Settings modal (victory points, factions, options) | src/components/SettingsModal | Missing | No in-game settings; VP target is read-only |
| Theme toggle (dark/light) | app/[locale]/ThemeToggle.tsx | Native | DeviceSheet theme choice |
| Text size, shared-screen mode, dock | n/a (fork-only) | Native | DeviceSheet |
| Languages (i18n, LangSelectHoverMenu) | src/components/LangSelectHoverMenu | Not needed | /play stays English, with no language picker (Shawn, 2026-10-20). Its strings are fork code, so upstream's message files stay untouched |
| Download/export game data | Header / game page | Missing | |
| Archive | app/[locale]/archive | Not needed | Dropped by Shawn |
| Stats | app/[locale]/stats | Not needed | Dropped by Shawn |
| Supporters, support links | app/[locale]/supporters, SupportSection.tsx | Not needed | Dropped by Shawn |
| Demo game | game/[gameId]/demo | Not needed | Group has its own games |
| FAQ | app/[locale]/FAQ | Missing | Not linked from the start page; low value |
| Map builder | app/[locale]/map-builder | Table screen | Start page external link |
| New game setup | app/[locale]/setup | Table screen | Start page external link; Milty draft is native (src/fork/draft) |
| Home page: join by code, recent games | app/[locale]/page.tsx, JoinGame.tsx | Native | StartPage.tsx (game code, back to game, games on device) |
| PWA / service worker | app/[locale]/ServiceWorkerWrapper.tsx, `public/service-worker.js` | Missing | Applies if HideOnPlay doesn't skip it; no offline or install prompt in /play (not verified at runtime) |
| Setup phase (starting techs, map string) | main/phase/setup | Native | See section 1's game-phase SETUP row |
| Fallback link to upstream faction page | (faction)/[factionId] | Table screen | NotNativeYet links to /game/<id>/<faction> |
| Hidden app sections (TECHS, PLANETS, OBJECTIVES) | src/components/Conditional | Partial | Honoured in Status; other tabs do not consistently check |

## 8. Twilight's Fall in /play

From reading the code; no live Twilight's Fall game was run. Upstream supports the mode broadly (it needs Thunder's Edge): 8 Kings, 8 replacement strategy cards, splicing of abilities, genomes and unit upgrades, paradigms, and an edict phase in place of the agenda phase.

Phase switch: `src/fork/play/PlayApp.tsx:123`. END / ACTION / STRATEGY / STATUS / AGENDA are native; **every other phase (SETUP, EDICT) falls into `NotNativeYet`** (line 165-182), which tells the user "This phase isn't on the new screen yet" and gives links to upstream's `/game/<id>/<faction>` and `/game/<id>/main`. Only `NowStatus.tsx:139` and `NowExpedition.tsx:25` mention TF explicitly. Nothing in `src/fork/play` contains "EDICT" or tyrant handling.

| Feature | Upstream | /play status | Notes |
|

## Biggest gaps

From setup to the action phase:

1. Setup: only the Milty draft creates games natively (6 players, fixed options). Player count, variants/alliances, events, Discordant Stars, map type/string, tracking toggles, command tokens, password and colour changes all live on upstream's /setup.
2. Faction-specific and card-specific component actions (about 35 cases: PurgePlanet, Overrule, Strategize, Z'eu, Transpose, Plagiarize beyond tech, AddSystemToMap, etc.): /play only records the component, then needs "More controls".
3. Tactical extras: frontier exploration (+ Mirage), action-phase objective scoring, Become a Martyr, Nekro Technological Singularity, Adjudicator Ba'al, Prove Endurance, Faunus: none native; only reachable through the faction page.
4. Turn-flow controls: mark-primary "Done" is not sent (by design; it only collapses upstream's panel).
5. Twilight's Fall (splices, TF strategy cards, Lux/Civitas/Amicus) and trade-goods/commodity/command-token tracking have no /play counterpart; the Strategy-phase end abilities (Naalu, Hacan, Imperial Arbiter) and start-of-phase reminders are only a hint plus link.

From the status phase to the whole game:

1. Agenda special cases: post-resolve effects (Incentive Program, Colonial Redistribution, planet/relic/Drive the Debate, Dictate Policy) are missing or link out.
2. Status phase abilities and Thunder's Edge steps (Oracle, Crown, Wormhole Generator, Mitosis, Entropic Scar, Radical Advancement) all send players to the table screen.
3. The results timer view is missing (the timers themselves run in /play now).
4. Results extras: VP graph, tech graph, map lapse, annotated log, and export/download.
5. Sharing and settings: no share link or QR, no game code display, no in-game settings.