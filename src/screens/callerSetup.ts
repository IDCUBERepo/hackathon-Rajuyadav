import { startNewGame, voiceNotice } from '../caller/session';
import {
  DEFAULT_SETTINGS,
  MAX_AUTO_INTERVAL,
  migrateSettings,
  MIN_AUTO_INTERVAL,
  settingsNeedMigration,
  type GameSettings,
  type TieMode,
} from '../core/game';
import { PATTERN_IDS } from '../core/patterns';
import { strings, t } from '../i18n';
import { KEYS, loadJson, save } from '../storage';
import { onVoicesChanged, unlockSpeech } from '../speech';
import { h, icon, navigate, srOnly, uniqueId } from '../ui/dom';
import { checkboxRow, pageTitle, radioGroup, type Screen } from '../ui/screen';

/**
 * Start from the settings used last time, so regular groups set up in one tap.
 * Older saved settings are migrated once and saved back straight away, so a
 * choice the caller makes afterwards (e.g. Strict claim off) is respected.
 */
function initialSettings(): GameSettings {
  const saved = loadJson(KEYS.lastSettings, (v): v is object => typeof v === 'object' && v !== null);
  if (!saved) return migrateSettings(DEFAULT_SETTINGS);
  const settings = migrateSettings(saved);
  if (settingsNeedMigration(saved)) save(KEYS.lastSettings, settings);
  return settings;
}

export const callerSetupScreen: Screen = (main) => {
  const settings = initialSettings();

  // Prizes: one row per pattern with a checkbox, optional points and an optional label.
  const patternError = h('p', { class: 'field-error', id: uniqueId('pattern-error'), hidden: true });
  const patternRows = PATTERN_IDS.map((p) => {
    const pointsId = uniqueId('points');
    const points = h('input', {
      id: pointsId,
      class: 'input input-small input-points',
      type: 'number',
      inputmode: 'numeric',
      min: 0,
      step: 1,
      value: settings.points[p] === undefined ? '' : String(settings.points[p]),
      disabled: !settings.patterns.includes(p),
      oninput: () => {
        const value = Math.round(Number(points.value));
        if (points.value.trim() !== '' && Number.isFinite(value) && value >= 0) settings.points[p] = value;
        else delete settings.points[p];
      },
    });
    const prizeId = uniqueId('prize');
    const prize = h('input', {
      id: prizeId,
      class: 'input input-small',
      type: 'text',
      maxlength: 30,
      placeholder: t('setupPrizePlaceholder'),
      value: settings.prizes[p] ?? '',
      disabled: !settings.patterns.includes(p),
      oninput: () => {
        const text = prize.value.trim();
        if (text) settings.prizes[p] = text;
        else delete settings.prizes[p];
      },
    });
    const check = checkboxRow(
      strings.patterns[p],
      settings.patterns.includes(p),
      (on) => {
        settings.patterns = PATTERN_IDS.filter((id) => (id === p ? on : settings.patterns.includes(id)));
        prize.disabled = !on;
        points.disabled = !on;
        patternError.hidden = true;
      },
      strings.patternHelp[p],
    );
    // Visible labels are short; screen readers also hear which prize they belong to.
    const label = (id: string, text: string) =>
      h('label', { for: id, class: 'field-help' }, srOnly(`${strings.patterns[p]}: `), text);
    return h(
      'div',
      { class: 'pattern-setup' },
      check.wrap,
      h(
        'div',
        { class: 'prize-inputs' },
        h('div', { class: 'prize-input prize-input-points' }, label(pointsId, t('setupPointsLabel')), points),
        h('div', { class: 'prize-input' }, label(prizeId, t('setupPrizeTextLabel')), prize),
      ),
    );
  });

  // Ties: sharing on/off, and what a tie means.
  const sharedWarning = h('p', { class: 'notice', role: 'status' }, `⚠ ${t('setupSharedOffWarning')}`);
  const tieGroup = radioGroup<TieMode>(
    t('setupTieMode'),
    'tie-mode',
    [
      { value: 'split', label: t('tieSplit') },
      { value: 'full', label: t('tieFull') },
      { value: 'draw', label: t('tieDraw') },
    ],
    settings.tieMode,
    (v: TieMode) => {
      settings.tieMode = v;
      refreshTieHelp();
    },
    'tiles tiles-wide',
  );
  const tieHelp = h('p', { class: 'field-help' });
  const refreshTieHelp = () => {
    tieHelp.textContent = settings.tieMode === 'split' ? t('tieSplitHint') : settings.tieMode === 'draw' ? t('tieDrawHint') : '';
  };
  const refreshSharing = () => {
    sharedWarning.hidden = settings.sharedWinners;
    tieGroup.hidden = !settings.sharedWinners;
    tieHelp.hidden = !settings.sharedWinners;
  };
  refreshTieHelp();

  const notice = h('p', { class: 'notice', role: 'status' });
  const refreshNotice = () => {
    const text = voiceNotice(settings);
    notice.hidden = text === null;
    notice.textContent = text ? `ℹ ${text}` : '';
  };

  const hindiNote = h('p', { class: 'field-help' }, t('callStyleHindiNote'));

  const intervalId = uniqueId('interval');
  const intervalLabel = h('label', { for: intervalId, class: 'field-label' });
  const setIntervalLabel = () =>
    (intervalLabel.textContent = t('setupAutoInterval', { seconds: settings.autoIntervalSec }));
  setIntervalLabel();
  const interval = h('input', {
    id: intervalId,
    type: 'range',
    class: 'range',
    min: MIN_AUTO_INTERVAL,
    max: MAX_AUTO_INTERVAL,
    step: 1,
    value: String(settings.autoIntervalSec),
    oninput: () => {
      settings.autoIntervalSec = Number(interval.value);
      setIntervalLabel();
    },
  });

  const form = h(
    'form',
    { class: 'stack', novalidate: true },
    h(
      'fieldset',
      { class: 'card', 'aria-describedby': patternError.id },
      h('legend', {}, t('setupPatterns')),
      patternRows,
      patternError,
    ),
    h(
      'fieldset',
      { class: 'card' },
      h('legend', {}, t('setupVoice')),
      checkboxRow(t('setupVoiceOn'), settings.voice, (on) => {
        settings.voice = on;
        refreshNotice();
      }).wrap,
      radioGroup(
        t('setupVoiceLang'),
        'voice-lang',
        [
          { value: 'en', label: t('langEnglish') },
          { value: 'hi', label: t('langHindi') },
        ],
        settings.voiceLang,
        (v) => {
          settings.voiceLang = v;
          refreshNotice();
        },
      ),
      radioGroup(
        t('setupCallStyle'),
        'call-style',
        [
          { value: 'plain', label: t('callPlain') },
          { value: 'traditional', label: t('callTraditional') },
        ],
        settings.callStyle,
        (v) => (settings.callStyle = v),
        'tiles tiles-wide',
      ),
      hindiNote,
      notice,
    ),
    h('fieldset', { class: 'card' }, h('legend', {}, t('setupAutoDraw')), h('div', { class: 'field' }, intervalLabel, interval)),
    h(
      'fieldset',
      { class: 'card' },
      h('legend', {}, t('setupRules')),
      checkboxRow(t('setupStrict'), settings.strictClaim, (on) => (settings.strictClaim = on), t('setupStrictHint')).wrap,
      checkboxRow(
        t('setupShared'),
        settings.sharedWinners,
        (on) => {
          settings.sharedWinners = on;
          refreshSharing();
        },
        t('setupSharedHint'),
      ).wrap,
      sharedWarning,
      tieGroup,
      tieHelp,
      checkboxRow(t('setupSecondFullHouse'), settings.secondFullHouse, (on) => (settings.secondFullHouse = on)).wrap,
      'vibrate' in navigator
        ? checkboxRow(t('setupVibrate'), settings.vibrate, (on) => (settings.vibrate = on)).wrap
        : null,
    ),
    h('button', { type: 'submit', class: 'btn btn-primary btn-huge' }, icon('▶'), t('startGame')),
  );

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (settings.patterns.length === 0) {
      patternError.hidden = false;
      patternError.textContent = `⚠ ${t('setupNoPatterns')}`;
      (patternRows[0].querySelector('input') as HTMLInputElement).focus();
      return;
    }
    unlockSpeech();
    save(KEYS.lastSettings, settings);
    startNewGame(settings);
    navigate('#/caller');
  });

  refreshNotice();
  refreshSharing();
  const stopVoices = onVoicesChanged(refreshNotice);

  main.append(h('div', { class: 'page page-narrow' }, pageTitle(t('setupTitle'), '🎤'), form));
  return stopVoices;
};
