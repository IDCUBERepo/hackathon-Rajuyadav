import { describe, expect, it } from 'vitest';
import { numberAnnouncement } from '../src/announce';
import { createPlayerGame, type PlayerGame } from '../src/core/player';
import { adoptPlayer, disableInclusive, enableInclusive } from '../src/inclusive';
import { DEFAULT_PREFS, parsePrefs, type Prefs } from '../src/prefs';
import { isLocalHost, joinUrl, readDeepLink } from '../src/qr';

describe('QR join helpers', () => {
  it('builds the join URL from wherever the app runs, including sub-folders', () => {
    expect(joinUrl('KMPT', { origin: 'https://tambola.example', pathname: '/' })).toBe('https://tambola.example/?game=KMPT');
    expect(joinUrl('KMPT', { origin: 'https://x.github.io', pathname: '/tambola/' })).toBe('https://x.github.io/tambola/?game=KMPT');
  });

  it('reads ?game= links: valid, invalid, or none', () => {
    expect(readDeepLink('?game=KMPT')).toEqual({ kind: 'valid', code: 'KMPT' });
    expect(readDeepLink('?game=kmpt')).toEqual({ kind: 'valid', code: 'KMPT' });
    expect(readDeepLink('?game=KM0T')).toEqual({ kind: 'invalid', problem: 'characters' });
    expect(readDeepLink('?game=KM')).toEqual({ kind: 'invalid', problem: 'length' });
    expect(readDeepLink('?game=')).toEqual({ kind: 'invalid', problem: 'empty' });
    expect(readDeepLink('')).toEqual({ kind: 'none' });
    expect(readDeepLink('?other=1')).toEqual({ kind: 'none' });
  });

  it('recognises localhost and local-network addresses', () => {
    for (const h of ['localhost', '127.0.0.1', '[::1]', '192.168.1.20', '10.0.0.5', '172.16.4.1', '172.31.0.9', 'my-pc.local', 'app.localhost']) {
      expect(isLocalHost(h), h).toBe(true);
    }
    for (const h of ['tambola.example', 'x.github.io', '172.32.0.1', '8.8.8.8', 'localhost.example.com']) {
      expect(isLocalHost(h), h).toBe(false);
    }
  });
});

describe('Inclusive Mode rules', () => {
  const before: Prefs = { theme: 'dark', textSize: 1, inclusive: false };
  const player: PlayerGame = { ...createPlayerGame('KMPT', 'Nani', ['KMPT2']), helper: false, hints: true };

  it('ON applies A++ text, High Contrast and both helpers, remembering what was there', () => {
    const { prefs, players } = enableInclusive(before, [player]);
    expect(prefs).toMatchObject({ inclusive: true, theme: 'contrast', textSize: 2 });
    expect(prefs.beforeInclusive).toEqual({ theme: 'dark', textSize: 1, players: { KMPT: { helper: false, hints: true } } });
    expect(players[0]).toMatchObject({ helper: true, hints: true });
  });

  it('OFF restores the previous settings exactly', () => {
    const on = enableInclusive(before, [player]);
    const off = disableInclusive(on.prefs, on.players);
    expect(off.prefs).toEqual(before);
    expect(off.players[0]).toEqual(player);
  });

  it('changes made while ON are allowed, and OFF still restores the originals', () => {
    const on = enableInclusive(before, [player]);
    const tweaked: Prefs = { ...on.prefs, textSize: 1, theme: 'light' };
    const tweakedPlayer = { ...on.players[0], hints: false };
    const off = disableInclusive(tweaked, [tweakedPlayer]);
    expect(off.prefs).toEqual(before);
    expect(off.players[0]).toMatchObject({ helper: false, hints: true });
  });

  it('a game joined while ON gets the helpers, and goes back to its own settings when OFF', () => {
    const on = enableInclusive(before, []);
    const fresh = createPlayerGame('ABCD', 'Nani', ['ABCD2']);
    const adopted = adoptPlayer(on.prefs, fresh);
    expect(adopted.player).toMatchObject({ helper: true, hints: true });
    // Adopting again does nothing (the player may have switched a helper off on purpose).
    const again = adoptPlayer(adopted.prefs, { ...adopted.player, hints: false });
    expect(again.player.hints).toBe(false);
    const off = disableInclusive(adopted.prefs, [adopted.player]);
    expect(off.players[0]).toMatchObject({ helper: false, hints: false });
  });

  it('adopting does nothing while the mode is off', () => {
    expect(adoptPlayer(before, player).player).toBe(player);
  });

  it('saved preferences round-trip, and older saves without the mode stay valid', () => {
    const on = enableInclusive(before, [player]).prefs;
    expect(parsePrefs(JSON.parse(JSON.stringify(on)))).toEqual(on);
    expect(parsePrefs({ theme: 'light', textSize: 0 })).toEqual({ theme: 'light', textSize: 0, inclusive: false });
    expect(parsePrefs({ theme: 'nope', textSize: 0 })).toBeNull();
    expect(DEFAULT_PREFS.inclusive).toBe(false);
  });
});

describe('Inclusive Mode voice', () => {
  it('says each number twice', () => {
    expect(numberAnnouncement(22, 'plain', 'en', true)).toBe('Number 22 … 2, 2 … 22');
    expect(numberAnnouncement(5, 'plain', 'en', true)).toBe('Number 5 … only 5 … 5');
    expect(numberAnnouncement(22, 'traditional', 'en', true)).toBe('Two little ducks … 22 … 22');
    expect(numberAnnouncement(22, 'plain', 'hi', true)).toBe('नंबर बाईस … दो, दो … बाईस');
    // Unchanged when the mode is off.
    expect(numberAnnouncement(22, 'plain', 'en')).toBe('Number 22 … 2, 2');
  });
});
