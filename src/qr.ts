import QRCode from 'qrcode';
import { codeProblem, GAME_CODE_LENGTH, normalizeCode, type CodeProblem } from './core/codes';

/** URL parameter carrying the game code in QR join links: ?game=KMPT */
export const JOIN_PARAM = 'game';

/**
 * The app's own address with the game code attached, built from where the app
 * is actually running, so it works on any host or sub-folder.
 */
export function joinUrl(gameCode: string, loc: Pick<Location, 'origin' | 'pathname'> = location): string {
  return `${loc.origin}${loc.pathname}?${JOIN_PARAM}=${encodeURIComponent(gameCode)}`;
}

/**
 * Localhost or a private-network address: phones can't reach localhost at
 * all, and a local IP only works on the same Wi-Fi.
 */
export function isLocalHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  return (
    h === 'localhost' ||
    h.endsWith('.localhost') ||
    h === '::1' ||
    /^127\./.test(h) ||
    /^10\./.test(h) ||
    /^192\.168\./.test(h) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(h) ||
    /^169\.254\./.test(h) ||
    h.endsWith('.local')
  );
}

export type DeepLink = { kind: 'none' } | { kind: 'valid'; code: string } | { kind: 'invalid'; problem: CodeProblem };

/** Read ?game=XXXX from a query string. */
export function readDeepLink(search: string): DeepLink {
  const raw = new URLSearchParams(search).get(JOIN_PARAM);
  if (raw === null) return { kind: 'none' };
  const code = normalizeCode(raw);
  const problem = codeProblem(code, GAME_CODE_LENGTH);
  return problem ? { kind: 'invalid', problem } : { kind: 'valid', code };
}

/** Remove ?game=… from the address bar without reloading, so a refresh won't restart the join. */
export function clearDeepLink(): void {
  if (!new URLSearchParams(location.search).has(JOIN_PARAM)) return;
  history.replaceState(history.state, '', `${location.pathname}${location.hash}`);
}

/** QR code as an SVG string, generated locally (no network), with a quiet zone. */
export function qrSvg(text: string): Promise<string> {
  return QRCode.toString(text, { type: 'svg', errorCorrectionLevel: 'M', margin: 2, color: { dark: '#000000', light: '#ffffff' } });
}
