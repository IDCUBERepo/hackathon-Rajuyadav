import type { PlayerGame } from './core/player';
import { loadCurrentPlayerGame, loadPlayerGame, savePlayerGame } from './player/store';
import { loadPrefs, savePrefs, type Prefs } from './prefs';

/*
 * Inclusive Mode 👓 — bigger, clearer, simpler.
 *
 * Device-wide: A++ text, High Contrast, 64px targets (CSS), reduced motion,
 * slower voice that says each number twice. Per player game: marking helper
 * and pattern hints on. Everything it changes is remembered first, and put
 * back exactly when the mode is turned off. The pure functions below hold
 * the rules; setInclusiveMode()/adoptPlayerGame() do the saving.
 */

/** Turn the mode on: remember current settings, then apply the mode. */
export function enableInclusive(prefs: Prefs, players: PlayerGame[]): { prefs: Prefs; players: PlayerGame[] } {
  if (prefs.inclusive) return { prefs, players };
  let next: Prefs = {
    ...prefs,
    inclusive: true,
    theme: 'contrast',
    textSize: 2,
    beforeInclusive: { theme: prefs.theme, textSize: prefs.textSize, players: {} },
  };
  const adopted = players.map((p) => {
    const r = adoptPlayer(next, p);
    next = r.prefs;
    return r.player;
  });
  return { prefs: next, players: adopted };
}

/**
 * A player game seen for the first time while the mode is on: remember its
 * own helper settings, then switch both helpers on. Games already adopted are
 * left alone, so a player can still turn a helper off while the mode is on.
 */
export function adoptPlayer(prefs: Prefs, player: PlayerGame): { prefs: Prefs; player: PlayerGame } {
  const before = prefs.beforeInclusive;
  if (!prefs.inclusive || !before || player.gameCode in before.players) return { prefs, player };
  return {
    prefs: {
      ...prefs,
      beforeInclusive: { ...before, players: { ...before.players, [player.gameCode]: { helper: player.helper, hints: player.hints } } },
    },
    player: { ...player, helper: true, hints: true },
  };
}

/** Turn the mode off: restore everything exactly as it was. */
export function disableInclusive(prefs: Prefs, players: PlayerGame[]): { prefs: Prefs; players: PlayerGame[] } {
  const before = prefs.beforeInclusive;
  if (!prefs.inclusive) return { prefs, players };
  const restored = players.map((p) => {
    const saved = before?.players[p.gameCode];
    return saved ? { ...p, helper: saved.helper, hints: saved.hints } : p;
  });
  return {
    prefs: { theme: before?.theme ?? prefs.theme, textSize: before?.textSize ?? prefs.textSize, inclusive: false },
    players: restored,
  };
}

/* ---------- Side effects: load, apply, save ---------- */

export function setInclusiveMode(on: boolean): void {
  const prefs = loadPrefs();
  if (on) {
    const current = loadCurrentPlayerGame();
    const r = enableInclusive(prefs, current ? [current] : []);
    r.players.forEach(savePlayerGame);
    savePrefs(r.prefs);
  } else {
    const codes = Object.keys(prefs.beforeInclusive?.players ?? {});
    const games = codes.map(loadPlayerGame).filter((g): g is PlayerGame => g !== null);
    const current = loadCurrentPlayerGame();
    const r = disableInclusive(prefs, games);
    r.players.forEach(savePlayerGame);
    // Saving a game also makes it "current"; keep the current game current.
    if (current) savePlayerGame(r.players.find((p) => p.gameCode === current.gameCode) ?? current);
    savePrefs(r.prefs);
  }
}

/** Call when a player game is shown; applies the mode to it the first time. */
export function adoptPlayerGame(player: PlayerGame): PlayerGame {
  const r = adoptPlayer(loadPrefs(), player);
  if (r.player !== player) {
    savePlayerGame(r.player);
    savePrefs(r.prefs);
  }
  return r.player;
}
