# SPEC: "Tambola Together" — an accessible web app for in-person Tambola (Housie)

This file is the full specification. README.md describes what is currently built.
When validating, compare the code against this file. When they differ, report it; do not change code without approval.

## Working style
You are building a production-quality web app. Reliability and accessibility matter more than feature count.
- Plan first (files, modules, data model), then build milestone by milestone.
- After each milestone: run the tests, fix failures, run the app, and briefly summarise what works.
- Do not start a later milestone until the current one works end to end.
- Keep the code simple, typed, commented where logic is non-obvious, and free of unused code.
- If a requirement conflicts with reliability, choose reliability and note the trade-off in the README.
- Never weaken or delete a test to make it pass.

## Product summary
A web app that helps groups play Tambola in person at home, at parties or in clubs. It must suit
children, older adults, first-timers and experienced players, on phones, tablets, laptops and TVs.

The social game stays human: players LISTEN for numbers, MARK their own tickets, RECOGNISE patterns
and SHOUT their claims. The app automates the tedious parts: joining, drawing numbers, announcing them,
tracking called numbers, generating valid tickets, verifying claims, announcing winners and tracking prizes.

## Tech stack and constraints
- Vite + TypeScript, no UI framework (vanilla TS modules). Minimal dependencies.
- Allowed runtime dependency: a small, well-maintained QR code generator (e.g. the "qrcode" npm package), bundled into the app.
- Vitest for unit tests. Playwright for end-to-end and accessibility tests (with @axe-core/playwright).
- Fully client-side with NO backend and NO accounts. Works offline after first load (service worker + web manifest, installable as a PWA).
- Output is a static build (`npm run build`) deployable to any static host, using relative paths so it works from a sub-folder. Routing uses the URL hash, so no server rewrite rules are needed.
- QR join requires the app to be hosted at a real web address over HTTPS (or reachable on the same Wi-Fi network).
- Persist all game state in localStorage so a page refresh or accidental close never loses a game. Wrap all storage access in try/catch.
- Store settings with a settings version number so defaults can be migrated safely. A game already in progress keeps the rules it started with.
- Must work in current Chrome, Safari (iOS), Firefox and Edge.

## Core design: one caller, unlimited players, no server
Two roles, chosen on the home screen with two big buttons: "I'm the Caller" and "I'm a Player".
Each game has exactly ONE caller. There is NO limit on the number of players: no maximum player count, fixed-size player list, or cap on shared winners or printed sheets.

1. GAME CODE: the caller's device creates a random 4-character code (crypto.getRandomValues) from the alphabet `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (no look-alikes 0/O, 1/I/L). The last character carries the Strict claim rule (odd alphabet position = on, even = off), so players' devices can show the right claim reminder without a server. Settings cannot change once a game starts. The code is shown in huge text, together with a QR code for instant joining (Milestone 5).
2. Players join by scanning the QR code, or by opening the app and typing the game code. They enter their name and choose 1–6 tickets. The caller's device does not need to know about players in advance.
3. TICKET CODE: 5 characters, generated randomly on the player's device and shown on the ticket: 4 characters for the strip ID plus a final position digit 2–7 (1st–6th ticket of the strip). Every ticket is resolved by rebuilding its strip from (gameCode + stripId) and taking the ticket at that position. Every distinct ticket code is a distinct ticket, and a mistyped position character is rejected rather than pointing at someone else's ticket. Codes are case-insensitive when typed.
4. STRIP: 6 tickets that together contain every number 1–90 exactly once, generated deterministically by a seeded PRNG (32-bit string hash of gameCode + stripId feeding mulberry32, integer maths only, so results are identical in every browser). A player asking for 6 tickets gets a full strip.
5. Printed tickets are full strips with their 6 codes printed on them, resolved exactly the same way, so claims verify identically.

Players' devices are NOT synced to the draw. Players listen and mark by hand, as in the physical game.
Winners are known only on the caller's device and are announced to the room by voice and on the caller/TV screen.
Be honest about this in the UI and README. Live sync is a "Coming Soon" feature.

## Ticket rules (standard Tambola). Must be unit tested.
- 3 rows × 9 columns, 15 numbers total, exactly 5 numbers per row.
- Column 1: 1–9, column 2: 10–19, ... column 8: 70–79, column 9: 80–90.
- Every column has 1 to 3 numbers, sorted ascending top to bottom. No duplicates.
- Tests: 10,000 tickets checked against every rule; determinism; 2,000 strips each contain 1–90 exactly once; a "golden" snapshot so a future change can never silently change already-issued tickets.

## Winning patterns (the caller can enable/disable each when setting up)
- Early Five: any 5 numbers on the ticket
- Top Line, Middle Line, Bottom Line: all 5 numbers in that row
- Four Corners: first and last NUMBER of the top row and of the bottom row (not blank cells)
- Full House: all 15 numbers
Pattern checking is a pure function `checkPattern(ticket, calledNumbers, pattern)`, fully unit tested including edge cases.
The same ticket can never win the same pattern twice. Each pattern can have optional points and a prize label.

### Strict claim (ON by default; the caller can turn it off in setup for relaxed family games)
A claim is only valid if the pattern was completed by the most recently called number.
- A late claim is rejected with a kind message, e.g.:
  "So close! Your Top Line was complete on number 42, but the claim came late. Remember to shout as soon as you see it! Number 42 was called 2 calls ago."
- Early Five under strict: valid only when the ticket's 5th called number is the latest number drawn.
- With Strict claim OFF, a late claim is accepted.
- Settings saved before Strict claim became the default are migrated to ON once; a later OFF is kept.

### Claim window and shared winners (Shared winners ON by default)
- After a number is called, any number of players can claim the same pattern until the caller calls the next number. All claims in that window are judged against the numbers called at that moment.
- With Shared winners ON, every valid claim in the window is recorded as a winner.
- Tie settings in setup (default: "Split the prize"):
  - Split the prize: points divided equally and rounded to whole points (100 ÷ 3 = 33 each; halves round up). Text prize labels show "Shared between N".
  - Everyone gets the full prize.
  - Tie-breaker draw: when the caller presses "Finish checking claims", the app picks one winner at random (short animation, instant with reduced motion, plus a voice announcement). The next number can't be called until the draw is done.
- With Shared winners OFF, only the first ticket checked wins; later claims get a clear "already taken" message. Setup warns: "Only the first ticket you check will win, even if players shout at the same time."
- Once a pattern is closed (the caller continued or called the next number), it cannot be claimed again.
- A tied Full House with sharing ON ends the game only when the caller confirms there are no more claims.
- Settings saved before Shared winners became the default are migrated to ON once; a later OFF is kept.

## Milestone 1: Caller screen
- Setup: patterns, points and prize labels, Strict claim (ON), Shared winners (ON), tie setting (Split the prize), voice on/off, voice language, call style (plain or traditional), auto-draw speed. Each setting has a one-line plain-language explanation.
- Big "Call Next Number" button (Space or Enter, only when focus isn't on another control). Draws uniformly at random from the remaining numbers using crypto.getRandomValues.
- The current number is extremely large with a short animation (off with reduced motion).
- A 1–90 board; called numbers are filled, bold and ticked (not colour alone).
- The last 5 numbers, plus a count such as "32 of 90 called".
- After all 90 numbers, the call button is disabled with "All numbers called".
- Auto-draw with a 5–30 s interval; Pause and Resume stay easy to reach. Auto-draw is not saved across a refresh; after a refresh it starts paused.
- "Undo last number" with confirmation. If the number completed a recorded win, warn that the win will be removed and ask for confirmation.
- Voice via the Web Speech API: plain ("Number 22 … 2, 2") or traditional ("Two little ducks … 22", full 1–90 list in a data file). Hindi ("नंबर बाईस … दो, दो") when a Hindi voice exists, otherwise a visible notice and English. Hindi always uses plain calls. On iOS, the first tap on "Start game" or "Call Next Number" unlocks speech.
- "Repeat" button to re-announce the current number.
- TV / projector mode: full screen with the current number, last 5 numbers, the board, the join QR code and the winners board, readable from across a room. A TV window in another tab of the same browser follows the caller automatically (storage events); only one tab should draw.
- End game, New game, and a summary of winners.

## Milestone 2: Player screen
- Join flow: game code → name → 1–6 tickets. Big inputs and a clear error for badly formatted codes.
- Tickets render as a clear grid; on phones, stacked vertically. Tickets use the ARIA grid pattern (one Tab stop per ticket, arrow keys to move, Enter/Space to mark).
- Tap to mark, tap again to unmark. Blank cells (hatched) cannot be marked. Marked cells are filled with a dab ring (not colour alone).
- Marks persist per game in localStorage. Players can rejoin a game they already have tickets for.
- Optional "Marking helper" (off by default): type or pick the number just heard; it's marked if on the ticket, or "Not on your ticket" (visually and via aria-live).
- Optional "Pattern hints" (off by default): uses only the player's own marks, shows "You may have a Top Line — shout 'Claim!' now!", and never claims automatically.
- A large "How to claim" reminder: shout, then show your ticket code to the caller. With Strict claim on: "Shout 'Claim!' before the next number is called, or your claim won't count."
- A friendly note: "Winners are announced by the caller — listen out!"

## Milestone 3: Claim verification (caller side)
- "Check a Claim" is always visible and pauses auto-draw instantly. The claim is judged against the numbers called at the moment the button was pressed, even if an auto-draw timer was about to fire.
- The caller selects the pattern and enters the ticket code (large input) and optionally the player's name.
- The app rebuilds the ticket and shows it with called numbers filled in and the pattern outlined.
- Results: Valid (record and announce, Milestone 4); Not complete (kind message listing missing numbers); Late (the "So close!" message); Pattern closed or ticket already won it (friendly message); Invalid or mistyped code (friendly error, never crash).
- After a valid claim: "Any more claims for Top Line on number 42?" with "Check another claim" and "No more claims — continue". If the dialog is closed, a banner on the caller screen keeps both buttons available.
- Prize tracker: Open / Won by <name> with points / Shared with every name and points (and who won a tie-breaker). Long lists scroll inside the panel.
- Full House ends the game (with an option to continue for a second Full House).

## Milestone 4: Winner announcements and sharing
- Voice: "Congratulations Priya, winner of Top Line, 100 points!" or "Top Line is shared by Priya and Rahul, 50 points each!" Respects voice on/off and language.
- Winner banner: large, high-contrast (bright on dark in every theme) with name, prize and points. At the top of the claim dialog on the caller screen, and full screen in TV mode. Closes after 6 seconds or on "Continue". Announced to screen readers; confetti skipped with reduced motion.
- Winners board in TV mode: every prize with Open or its winners and points, always visible; long lists scroll inside the panel.
- Share results on the final summary: plain text (date, every prize with winners and points, numbers called) via the Web Share API, or "Copy to clipboard" with a "Copied!" confirmation.

## Milestone 5: 📱 QR Instant Join — "Scan → Join → Play."
- On the caller screen and in TV mode, show a large QR code next to the game code. The QR code holds the app's own join link with the game code, built from window.location (origin + path) so it works wherever and in whatever sub-folder the app is hosted, and matching the app's hash-based routing.
- Generate the QR code locally with the bundled library so it works offline. No external QR services.
- Heading "Scan → Join → Play.", with the game code in large text underneath for people who prefer typing.
- Opening the join link goes straight to the player join screen with the game code already filled in and validated; the player only enters their name and number of tickets.
- An invalid code in the link falls back to the normal join screen with a friendly message.
- After joining, remove the code from the address bar (history.replaceState) so a refresh doesn't restart the join.
- The QR code has an accessible text alternative, e.g. "QR code to join game KMPT".
- On localhost or a local IP, show the caller a note: "Phones can only scan this when the app is hosted online or on the same Wi-Fi network."
- "Full-screen QR" shows only the QR code and game code, very large. It closes with mouse, touch, Escape or a large "Close" button.
- Remove "Join by QR code" from the Coming Soon menu.

## Milestone 6: 👓 Inclusive/Senior Mode — "Designed for everyone from children to grandparents."
- A large, clearly labelled switch on the home screen and in Settings: "Inclusive Mode 👓 — bigger, clearer, simpler".
- Turning it ON applies these together:
  - Largest text size (A++). All buttons are at least 64×64px. Ticket cells are as large as the screen allows while keeping the whole ticket visible: at least 48×48px on tablets and larger, and as large as possible on phones, with a friendly tip "Turn your phone sideways for bigger numbers" shown in portrait. On phones, show one ticket at a time with large "Next ticket" / "Previous ticket" buttons.
  - High Contrast theme.
  - Marking helper ON and Pattern hints ON on the player screen.
  - Slower, clearer voice (speech rate around 0.8) with each number said twice, e.g. "Number 22 … two, two … 22".
  - Reduced motion and no confetti.
  - A simplified player screen showing only the ticket, the marking helper and the "How to claim" reminder. Advanced options move behind a "More" button.
  - One ticket by default when joining (players can still choose more).
- Turning it OFF restores the previous individual settings exactly. Save them before applying the mode.
- The mode is saved per device and survives refresh. Individual settings can still be adjusted while it is on.
- Works on both the caller and player screens.

## Milestone 7: Printable tickets
- Print any number of sheets (one full strip of 6 tickets per sheet) with the game code and each ticket code.
- Print stylesheet: black on white, thick borders, large numbers, a small "Tambola Together" header.

## Accessibility requirements (target WCAG 2.2 AA)
- Base text 18px, with a saved A / A+ / A++ control; layouts don't break at the largest size.
- Light, Dark and High Contrast themes; system preference by default. Colours are CSS custom properties per theme: text ≥ 4.5:1, UI parts ≥ 3:1, colour-blind safe (blue/orange, not red/green). forced-colors (Windows High Contrast) supported.
- State is never shown by colour alone.
- All controls at least 48×48px (64×64px in Inclusive Mode). Documented trade-off: ticket cells on narrow phones are smaller (about 36px) so the whole ticket stays visible; they meet WCAG 2.2's 24px minimum, reach 48px+ on tablets and laptops, and the Marking helper offers a typing alternative.
- Full keyboard operation with visible 4px focus rings and a logical tab order.
- Screen readers: semantic HTML, labelled controls, focus moves to each new page's heading, ticket cells announced like "Row 1, column 3, number 24, marked", and a live region announcing each called number, claim result, pattern hint and winner.
- prefers-reduced-motion turns off number animation and confetti.
- Plain, friendly language with icons next to text labels.
- Optional vibration on the caller device when a number is drawn, where supported.
- "How to Play" reachable from every screen, explaining QR joining, Inclusive Mode, the Strict claim rule, shared wins, and that winners are announced by the caller.
- All UI text in one file (src/i18n/en.ts) so more languages can be added.

## Visual design
- Warm, festive but uncluttered. Rounded shapes, clear hierarchy, one primary action per screen.
- Home screen: "I'm the Caller", "I'm a Player", the Inclusive Mode switch, "How to Play" and "Settings".
- Mobile-first responsive layout, with TV mode for large screens.

## "Coming Soon" menu (disabled items with a "Coming Soon" badge and a one-line description)
- 🤖 AI Host: a future AI-powered multilingual Tambola host that calls numbers with fun rhymes, cheers winners and explains the rules in your language
- Live sync: players' screens follow the draw and show winners in real time
- More languages: Tamil, Bengali, Marathi, Telugu, Gujarati
- Custom patterns designer (e.g. Pyramid, Star)
- Festive themes (Diwali, Christmas, birthday, kitty party)
- Scan a paper ticket with the camera to mark it digitally
- Braille and large-print ticket export
- Sign-language number clips
- Club leaderboard across multiple games
- Host multiple rooms at once for large events

## Quality checklist
Automated tests must cover everything below. Results are reported as a table: Test ID | What was checked | Pass/Fail | Notes. Mock speechSynthesis and the Web Share API.

A. Tickets: all rules on 10,000 tickets; determinism; distinct codes give distinct tickets; 2,000 strips contain 1–90 once; golden snapshot; no ambiguous characters; case-insensitive codes; mistyped position digit rejected.
B. Drawing: 90 draws give 1–90 once each; button disabled after 90; undo works; undo of a winning number warns and removes the win; auto-draw interval and pause; keyboard shortcuts don't fire while focus is on another control.
C. Patterns: every pattern valid when complete, rejected with missing numbers when not; Four Corners uses numbers not blanks; disabled patterns can't be claimed.
D. Strict claim: default ON with migration; game code carries the rule to players; on-time claim valid; late claim rejected with the correct message; Early Five strict rule; OFF accepts late claims; "Check a Claim" freezes numbers even if an auto-draw timer was about to fire.
E. Shared winners: default ON with Split the prize and migration; two and three valid claims on the same number recorded; a claim after the next number is late; each tie setting; 100 ÷ 3 splitting; sharing OFF behaviour and warning; closed patterns; same ticket can't win twice; invalid codes; "Any more claims?" prompt and the fallback banner; tied Full House.
F. Player: join validation; mark/unmark; blanks unmarkable; marking helper; pattern hints never auto-claim; strict reminder and "winners are announced by the caller" note; rejoin keeps tickets.
G. Saving: caller refresh restores everything with auto-draw paused; player refresh restores tickets and marks; storage unavailable shows a warning without crashing; offline after first load; new game clears game state but keeps settings; TV tab follows the caller.
H. Voice: one announcement per draw in the chosen style; Repeat; missing or no Hindi voice shows a notice; traditional calls exist for 1–90; voice OFF means no announcements.
I. Accessibility and display: axe shows zero serious/critical issues on every screen (home, setup, caller, claim dialog, winner banner, TV, full-screen QR, print, summary, join, player, How to Play, settings) in all three themes, with Inclusive Mode off and on; keyboard play and tab order; aria-live announcements; ticket cell labels; non-colour indicators; text sizes; reduced motion; screenshots at 360, 768, 1280 and 1920px with no sideways scrolling or overlaps; all controls ≥ 48×48px (ticket cells on phones excepted as documented).
J. No player limit: exactly one caller per game; no player, shared-winner or printed-sheet caps in the code.
K. Winners: voice lines for single and shared wins; banner closes after 6 s or on Continue; TV winners board updates and persists after refresh; share text for single, shared and no-winner patterns; clipboard fallback.
N. QR Instant Join:
  N1. The QR code encodes the correct join link with the current game code (decode it in the test), including when hosted in a sub-folder.
  N2. Opening the join link shows the join screen with the code pre-filled.
  N3. An invalid code in the link shows the normal join screen with a friendly message.
  N4. After joining, the code is removed from the address bar, and a refresh keeps the player in the game.
  N5. The QR code works offline and has an accessible text alternative.
  N6. The localhost note appears only when running locally.
  N7. Full-screen QR opens and closes with mouse, touch, Escape and Close.
O. Inclusive Mode:
  O1. Turning it ON applies every setting in Milestone 6.
  O2. Turning it OFF restores previous individual settings exactly.
  O3. It survives a refresh.
  O4. Individual settings can still be changed while it is on.
  O5. The voice uses the slower rate and repeats each number.
  O6. The simplified player screen shows only the ticket, marking helper and claim reminder; "More" reveals the rest.
  O7. All buttons are at least 64×64px; ticket cells are at least 48×48px at 768px and wider; on phones the whole ticket stays visible, one ticket shows at a time, and the "turn sideways" tip appears in portrait. Screenshots at 360px (portrait and landscape) and 768px show no overlaps or sideways scrolling.
P. Coming Soon: every item, including 🤖 AI Host, is visible with its badge and cannot be activated; "Join by QR code" is no longer listed.

L. Full game with many players (Playwright), PLAYER_COUNT variable (default 5):
  1. The caller creates a game (Strict claim ON, Shared winners ON, default patterns). Only one caller exists.
  2. PLAYER_COUNT players join by opening the QR code's join link (decoded from the caller screen), named Player 1, Player 2, and so on, with 1 ticket each. At least one player joins by typing the game code instead.
  3. Read each player's ticket code and numbers, and confirm all tickets are valid and different.
  4. The caller calls numbers.
  5. After each call, every player whose ticket has that number marks it by tapping; the marks show on each player's screen.
  6. As soon as any player's top row is complete, the caller checks that Top Line claim immediately.
  7. The winner's name appears in the winner banner, prize tracker and TV winners board, and the voice announcement was triggered.
  8. Negative check: a player without a complete Top Line claims it and is rejected with the missing numbers listed.
  9. The caller presses "No more claims — continue" and keeps calling.
  10. Continue until a DIFFERENT player completes Full House (choose codes so this is guaranteed, or retry with a new game). Claim it immediately; it is valid.
  11. The game ends and the summary lists all winners, patterns and points.
  12. Reload the caller and every player. The caller still shows the same summary, winners, points and called numbers; "Call Next Number" is still disabled; each player still sees the same ticket and marks.
  Run the whole scenario once with one player in Inclusive Mode.

M. Large group (PLAYER_COUNT = 100):
  - Open 5 real player browser contexts, and create the other 95 tickets directly from ticket codes using the same deterministic generator.
  - Play to Full House, checking every valid claim. Several players completing the same pattern on the same number are all recorded as shared winners.
  - The prize tracker, winners board and summary stay readable and correct with many winners; point splitting is correct.
  - Calling a number and checking a claim each take under 1 second on the caller screen.

For L and M, report the ticket codes used and the order of numbers called, so any failure can be reproduced.

## README
The README covers: how to run, build and deploy (including hosting so QR join works on phones); how the no-server ticket system works; one caller and unlimited players; QR join; Inclusive Mode; Strict claim and shared winners; how winners are announced and shared; accessibility and trade-offs; known limitations; and the Coming Soon roadmap.