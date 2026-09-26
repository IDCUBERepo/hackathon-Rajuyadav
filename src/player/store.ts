import { parsePlayerGame, type PlayerGame } from '../core/player';
import { KEYS, loadJson, loadString, remove, save } from '../storage';

/** Persistence for the player's current game (one game per device at a time). */

const isPlayerGame = (v: unknown): v is PlayerGame => parsePlayerGame(v) !== null;

export function loadPlayerGame(gameCode: string): PlayerGame | null {
  const raw = loadJson(KEYS.player(gameCode), isPlayerGame);
  return raw ? parsePlayerGame(raw) : null;
}

export function loadCurrentPlayerGame(): PlayerGame | null {
  const code = loadString(KEYS.playerCurrent);
  return code ? loadPlayerGame(code) : null;
}

export function savePlayerGame(game: PlayerGame): void {
  save(KEYS.player(game.gameCode), game);
  save(KEYS.playerCurrent, game.gameCode);
}

export function forgetPlayerGame(gameCode: string): void {
  remove(KEYS.player(gameCode));
  remove(KEYS.playerCurrent);
}
