import { HOUR_WORD_ALTERNATION, MONTH_NAMES, WB, WE, WEEKDAY_NAMES } from './patterns.js';

export type PrefilterReason = 'wochentag' | 'datum' | 'uhrzeit' | 'relativ';

export interface PrefilterResult {
  matched: boolean;
  reasons: PrefilterReason[];
}

const RULES: Array<{ reason: PrefilterReason; pattern: RegExp }> = [
  {
    reason: 'wochentag',
    // Kurzformen nur mit Punkt ("Mo."), sonst kollidieren "so", "do", "mi" mit normalen Wörtern.
    pattern: new RegExp(
      `${WB}(?:(?:${WEEKDAY_NAMES})s?|(?:mo|di|mi|do|fr|sa|so)\\.(?=\\s|$|,)|wochenende)${WE}`,
      'iu',
    ),
  },
  {
    reason: 'datum',
    pattern: new RegExp(
      [
        `${WB}\\d{1,2}\\.\\s?\\d{1,2}\\.(?:\\d{2,4})?`,
        `${WB}\\d{4}-\\d{2}-\\d{2}${WE}`,
        `${WB}\\d{1,2}\\.?\\s*(?:${MONTH_NAMES})\\.?${WE}`,
      ].join('|'),
      'iu',
    ),
  },
  {
    reason: 'uhrzeit',
    pattern: new RegExp(
      [
        `${WB}\\d{1,2}:\\d{2}${WE}`,
        `${WB}\\d{1,2}(?:[.:]\\d{2})?\\s*uhr${WE}`,
        `${WB}(?:um|gegen|ab)\\s+\\d{1,2}${WE}`,
        `${WB}(?:um|gegen|ab)\\s+(?:${HOUR_WORD_ALTERNATION})${WE}`,
        `${WB}(?:halb|viertel\\s+nach|viertel\\s+vor|dreiviertel)\\s+(?:\\d{1,2}|${HOUR_WORD_ALTERNATION})${WE}`,
      ].join('|'),
      'iu',
    ),
  },
  {
    reason: 'relativ',
    pattern: new RegExp(
      `${WB}(?:heute|(?<!guten\\s)morgen|übermorgen|nächste[nrs]?\\s+woche|in\\s+\\d+\\s+tagen)${WE}`,
      'iu',
    ),
  },
];

/** Schnelle, rein deterministische Prüfung: Enthält die Nachricht überhaupt Termin-Hinweise? */
export function prefilter(text: string): PrefilterResult {
  const reasons = RULES.filter((rule) => rule.pattern.test(text)).map((rule) => rule.reason);
  return { matched: reasons.length > 0, reasons };
}
