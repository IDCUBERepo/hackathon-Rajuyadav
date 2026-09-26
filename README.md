# Tambola Together

An accessible, offline-first web app for playing **Tambola (Housie)** in person — at home, at parties or in clubs.

The social game stays human: players **listen** for numbers, **mark** their own tickets, **recognise** patterns and **shout** their claims. The app does the tedious parts: drawing and announcing numbers, tracking what has been called, generating valid tickets, verifying claims and tracking prizes.

- No server, no accounts, no tracking. Everything runs in the browser.
- Works offline after the first visit and can be installed as an app (PWA).
- Designed for children, older adults and first-timers: large text, big buttons, three themes, full keyboard and screen-reader support.

---

## Quick start

Requires Node.js 20+.

```bash
npm install
npm run dev        # development server at http://localhost:5173
npm test           # unit tests (Vitest)
npm run build      # type-check and build static files into dist/
npm run preview    # serve the production build at http://localhost:4173
npm run e2e        # end-to-end + accessibility tests (Playwright)
```

The first time you run the end-to-end tests, install the browser: `npx playwright install chromium`.

## Deploy

`npm run build` produces a fully static site in `dist/`. Upload that folder to any static host — GitHub Pages, Netlify, Vercel, Azure Static Web Apps, S3, or any web server such as nginx.

- The build uses relative paths, so it works from a sub-folder (e.g. `https://example.com/tambola/`).
- Routing uses the URL hash (`#/caller`), so no server rewrite rules are needed.
- Serve it over **HTTPS**; service workers (offline mode) and installation require it (localhost is exempt).
- After deploying a new version, users get it on their next visit. The service worker caches by build hash and removes old caches automatically.

---

## How to play

1. **Pick a caller.** One person taps **I'm the Caller**, chooses the prizes and starts a game. A big 4-character **game code** appears.
2. **Get tickets.** Everyone else taps **I'm a Player**, types the game code and their name, and chooses 1–6 tickets. No phone? The caller can **print** paper tickets.
3. **Listen and mark.** The caller draws numbers (button, Space/Enter, or auto-draw). The app announces them out loud. Players tap numbers on their tickets.
4. **Shout "Claim!"** when a pattern is complete.
5. **The caller checks.** Tap **Check a Claim**, choose the prize, type the 5-character ticket code. The app shows the ticket with called numbers filled in and the pattern outlined, and says whether it's a winner.

Prizes: Early Five, Top Line, Middle Line, Bottom Line, Four Corners, Full House. The caller can turn each on or off, give each optional **points** and a prize label, and play on for a second Full House.

### Ties: several players on the same number (Shared winners ON by default)

- **Claim window.** After a number is called, any number of players can claim the same pattern until the caller calls the next number. All claims are judged against the numbers called at that moment.
- **Caller flow.** After a valid claim the caller sees *"Any more claims for Top Line on number 42?"* with **Check another claim** and **No more claims — continue**. The pattern closes when the caller continues or calls the next number. If the dialog is closed, a banner on the caller screen keeps both buttons available.
- **Tie settings** (setup, default *Split the prize*):
  - **Split the prize** — points are divided equally and rounded to whole points (100 ÷ 3 = 33 each; 100 ÷ 6 = 17 each; halves round up).
  - **Everyone gets the full prize.**
  - **Tie-breaker draw** — when the caller presses **Finish checking claims**, the app picks one winner at random (short animation, instant with reduced motion, plus a voice announcement). The next number can't be called until the draw is done.
- **Full House** with sharing ON ends the game when the caller confirms there are no more claims, so a tied Full House can still be checked.
- **Sharing OFF:** only the first ticket checked wins. Setup warns: *"Only the first ticket you check will win, even if players shout at the same time."*
- The prize tracker and final summary list every winner with their points (and who won a tie-breaker).

### Telling the room who won

Players' devices aren't synced, so the caller's device announces every win:

- **Voice** (if voice is on, in the chosen language): *"Congratulations Priya, winner of Top Line, 100 points!"* or *"Top Line is shared by Priya and Rahul, 50 points each!"* Hindi is spoken when Hindi is chosen and available.
- **Winner banner**: large, high-contrast (bright on dark in every theme) with name, prize and points. It sits at the top of the claim dialog on the caller's screen and fills the screen in TV mode. It closes after 6 seconds or on **Continue**, is announced to screen readers, and its confetti is skipped with reduced motion.
- **Winners board in TV mode**: every prize with *Open* or its winners and points, always visible; long lists scroll inside the panel. A TV window in another tab of the same browser follows the caller automatically.
- **Share results** on the final summary: plain text (date, every prize with winners and points, numbers called) via the phone's share sheet, or copied to the clipboard with a *Copied!* confirmation where sharing isn't available.
- Players see: *"Winners are announced by the caller — listen out!"*
- Saved setup settings from before this change are switched to Shared winners ON once (settings version 3); a later OFF is kept. Games already in progress keep their rules.

### Strict claim (ON by default)

A claim only counts if the player shouts **before the next number is called**. If the pattern was completed on an earlier number, the claim is late and the caller sees a kind message such as: *"So close! Your Top Line was complete on number 42, but the claim came late. Remember to shout as soon as you see it! Number 42 was called 2 calls ago."*

- Turn it off in setup for relaxed family games; late claims then still win.
- Fairness: pressing **Check a Claim** pauses auto-draw immediately, and the claim is judged against the numbers called at the moment the button was pressed — never against a number drawn afterwards.
- Players see the matching reminder ("Shout 'Claim!' before the next number is called, or your claim won't count") because the rule is carried in the game code (see below). How to Play explains the rule too.
- Saved setup settings have a version number. Settings saved before Strict claim became the default are switched to ON once; if the caller turns it off afterwards, that choice is kept. A game that is already in progress keeps the rules it started with.

---

## How the no-server ticket system works

There is no server, so the caller's device must be able to rebuild any player's ticket from a short code. It does this with **deterministic generation**:

```
ticket = f(gameCode, ticketCode)       — the same inputs always give the same ticket, on every device
```

- **Game code**: 4 characters, chosen randomly by the caller's device (`crypto.getRandomValues`). The last character also carries the Strict claim rule (odd alphabet position = on, even = off), so players' devices can show the right claim reminder without a server. Settings can't change once a game starts, so the code always matches.
- **Ticket code**: 5 characters, chosen randomly by the player's device. The first 4 characters are a **strip ID**; the last character is the **position** in that strip, always a digit `2`–`7` (1st–6th ticket). Exactly one code exists per ticket, so two different codes never give the same ticket, and a mistyped last character is rejected instead of pointing at someone else's ticket. (Ticket format v2 — tickets issued by earlier versions no longer verify.)
- **Strip**: a set of 6 tickets that together contain every number 1–90 exactly once (the standard Housie "strip"). It is generated by a seeded PRNG — a 32-bit string hash of `gameCode + stripId` feeding **mulberry32**. Only 32-bit integer maths is used, so results are identical in every browser.
- **Every ticket is resolved the same way**, whether it's on a phone or printed: rebuild the strip, take the ticket at the position. So a player who asks for 6 tickets gets a full strip (every number exactly once), and printed sheets are simply full strips with their 6 codes printed on them.
- Code alphabet: `ABCDEFGHJKMNPQRSTUVWXYZ23456789` — no look-alikes (`0/O`, `1/I/L`).

Each ticket follows the standard rules: 3 rows × 9 columns, 15 numbers, exactly 5 per row, 1–3 per column, column ranges 1–9 / 10–19 / … / 80–90, sorted top to bottom, no duplicates. Unit tests generate **10,000 tickets** and check every rule, check determinism, and check that **2,000 strips** each contain 1–90 exactly once. A "golden" snapshot ensures a future code change can never silently change tickets that were already issued.

Claim checking is a pure function, `checkPattern(ticket, calledNumbers, pattern)`, in `src/core/patterns.ts`.

### Honest limitations of this design

- **Players' screens do not follow the draw.** Players listen and mark by hand, as with paper. The app says so on the home screen and on the player screen. Live sync is on the Coming Soon list.
- **A game code cannot be checked for existence** (no server). Players get a clear error for a badly formatted code, but a well-formed wrong code will produce tickets for a game that isn't being played — claims on them simply won't verify. The caller's screen shows the code in huge text to avoid this.
- **Two players with the same ticket** is possible but very unlikely: it needs the same random 4-character strip ID (1 in 923,521 per pair of players) *and* the same position. Every distinct ticket code is a distinct ticket.
- **Pattern hints** on the player's device use only the player's own marks. They can't know what was really called and never claim anything automatically.

---

## Accessibility

Target: **WCAG 2.2 AA**.

- Base text is 18px, with a saved **A / A+ / A++** text-size control (up to 23px base).
- **Light, Dark and High Contrast** themes; the system preference is followed by default. Colours are CSS custom properties per theme, chosen for contrast (text ≥ 4.5:1, UI parts ≥ 3:1) and colour-blind safety (blue/orange rather than red/green).
- **State is never shown by colour alone**: called board numbers are filled, bold and ticked; marked ticket cells are filled and get a dab ring; selected options show a ✓; blank ticket cells are hatched.
- **Keyboard**: everything works without a mouse; visible 4px focus rings; Space/Enter draws a number (only when focus isn't on another control); tickets use the ARIA grid pattern (one Tab stop per ticket, arrow keys to move, Enter/Space to mark).
- **Screen readers**: semantic HTML, labelled controls, focus moves to each new page's heading, and ticket cells are announced like "Row 1, column 3, number 24, marked". A live region announces each called number, claim result and pattern hint.
- `prefers-reduced-motion` turns off the number animation and confetti. `forced-colors` (Windows High Contrast) is supported.
- Plain, friendly language with icons next to text labels; a **How to Play** link on every screen.
- All UI text is in `src/i18n/en.ts` so more languages can be added.

**Verification**: Lighthouse accessibility score is **100** on every screen reachable without a game. An automated axe-core test (`e2e/a11y.spec.ts`) checks **every** screen — including caller, TV, print, player, the claim dialog and the summary — in all three themes against WCAG 2.0/2.1/2.2 A and AA, and a keyboard test checks tab order and shortcuts.

### Trade-offs

- **Ticket cells on narrow phones are about 36×37px**, below the 48px target. A ticket has 9 columns; at 48px each plus spacing it needs ~460px of width, and most phones are 360–414px wide. We chose to keep the whole ticket visible (so players can see rows and patterns at a glance) over horizontal scrolling. Cells meet WCAG 2.2's 24px minimum target size, reach 48px+ on tablets and laptops, and the optional **Marking helper** lets anyone mark by typing the number instead of tapping. All other controls are at least 48×48px.
- **Auto-draw is not saved across a refresh.** After a refresh the game is restored exactly, but auto-draw starts paused, so numbers are never drawn without the caller noticing.

---

## Voice

Numbers are announced with the browser's built-in Web Speech API:

- Plain: "Number 22 … 2, 2"
- Traditional: "Two little ducks … 22" (the full 1–90 list is in `src/data/calls.ts`)
- Hindi: "नंबर बाईस … दो, दो" when the device has a Hindi voice; otherwise the setup screen shows a notice and English is used. Traditional calls are English rhymes, so Hindi always uses plain calls.

On iOS, speech must start from a tap; the first tap on "Start game" or "Call Next Number" unlocks it for auto-draw.

---

## Other known limitations

- One game per device at a time for callers (players can rejoin a game they already have tickets for).
- Opening the caller screen in two tabs on the same device keeps them in sync through storage events (handy for a TV window), but only one tab should be used to draw.
- If the browser blocks storage (some private modes), the app warns that a refresh may lose the game.
- Vibration is only available where the browser supports it (not on iOS).

---

## Coming Soon

Shown in the app as disabled menu items:

- **Live sync** — players' screens follow the draw in real time
- **Join by QR code**
- **More languages** — Tamil, Bengali, Marathi, Telugu, Gujarati
- **Custom patterns designer** — e.g. Pyramid, Star
- **Festive themes** — Diwali, Christmas, birthday, kitty party
- **Scan a paper ticket** with the camera to mark it digitally
- **Braille and large-print ticket export**
- **Sign-language number clips**
- **Club leaderboard** across multiple games
- **Host multiple rooms** at once for large events

---

## Project structure

```
src/
  core/            Pure, framework-free logic (fully unit-tested)
    prng.ts          string hash + mulberry32 + shuffle
    random.ts        unbiased crypto random integers
    codes.ts         code alphabet, game/ticket codes, strip positions
    ticket.ts        ticket and strip generation
    patterns.ts      checkPattern, missing numbers, strict-claim check, completing number
    game.ts          caller state: default settings (single source), settings migration,
                     draw, undo, claims, winners, load validation
    player.ts        player state: marks, marking helper, pattern hints
  caller/session.ts  live caller game, auto-draw timer, persistence, voice
  player/store.ts    player persistence
  screens/           one module per screen (home, setup, caller, TV, print, join, player, …)
  ui/                DOM helpers, dialogs, ticket views, confetti, shared caller widgets
  data/calls.ts      traditional calls and Hindi number words
  i18n/              all UI strings
  announce.ts        wording of spoken announcements
  speech.ts          Web Speech API wrapper
  storage.ts         try/catch-wrapped localStorage
  styles/main.css    themes, layout, TV mode, print stylesheet
tests/             Vitest unit tests
e2e/               Playwright: full two-device game, offline mode, accessibility
vite.config.ts     includes a small plugin that generates the service worker
```

`npm run icons` regenerates the PNG app icons from `public/icon.svg`.
