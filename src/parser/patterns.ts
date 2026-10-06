/** Wortgrenzen, die auch Umlaute korrekt behandeln (JS-`\b` kennt nur ASCII). */
export const WB = '(?<![\\p{L}\\p{N}])';
export const WE = '(?![\\p{L}\\p{N}])';

export const HOUR_WORDS: Record<string, number> = {
  ein: 1,
  eins: 1,
  zwei: 2,
  drei: 3,
  vier: 4,
  fünf: 5,
  sechs: 6,
  sieben: 7,
  acht: 8,
  neun: 9,
  zehn: 10,
  elf: 11,
  zwölf: 12,
};

export const HOUR_WORD_ALTERNATION = Object.keys(HOUR_WORDS)
  .sort((a, b) => b.length - a.length)
  .join('|');

export const WEEKDAY_NAMES =
  'montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonnabend|sonntag';

export const MONTH_NAMES =
  'januar|jänner|februar|märz|maerz|april|mai|juni|juli|august|september|oktober|november|dezember|' +
  'jan|feb|mär|apr|jun|jul|aug|sep|sept|okt|nov|dez';

/** Tageszeit-Wörter und die Uhrzeit, die bei so einer vagen Angabe eingetragen wird. */
export const DAYTIME_DEFAULTS: Array<{ pattern: RegExp; time: string }> = [
  { pattern: new RegExp(`${WB}(nachmittags?)${WE}`, 'iu'), time: '15:00' },
  { pattern: new RegExp(`${WB}(vormittags?)${WE}`, 'iu'), time: '10:00' },
  { pattern: new RegExp(`${WB}(mittags?)${WE}`, 'iu'), time: '12:00' },
  { pattern: new RegExp(`${WB}(abends?)${WE}`, 'iu'), time: '19:00' },
  { pattern: new RegExp(`${WB}(nachts?)${WE}`, 'iu'), time: '22:00' },
  { pattern: new RegExp(`${WB}(früh|morgens)${WE}`, 'iu'), time: '08:00' },
];

export const MORNING_HINT = new RegExp(`${WB}(früh|morgens|vormittags?|am morgen)${WE}`, 'iu');
