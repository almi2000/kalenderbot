import * as chrono from 'chrono-node';
import type { Parser, ParsingContext } from 'chrono-node';
import { HOUR_WORDS, HOUR_WORD_ALTERNATION, WB, WE } from './patterns.js';

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function hourFromToken(token: string): number | null {
  const lower = token.toLowerCase();
  if (lower in HOUR_WORDS) return HOUR_WORDS[lower] ?? null;
  const value = Number.parseInt(lower, 10);
  return value >= 1 && value <= 12 ? value : null;
}

/** "12.10." bzw. "3.11." ohne Jahr – chrono erkennt das im Deutschen nicht. */
const dateWithoutYear: Parser = {
  pattern: () => new RegExp(`(?<![\\p{L}\\p{N}.])(\\d{1,2})\\.\\s?(\\d{1,2})\\.(?!\\s?\\d)`, 'u'),
  extract: (context: ParsingContext, match: RegExpMatchArray) => {
    const day = Number(match[1]);
    const month = Number(match[2]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;

    const ref = context.refDate;
    let year = ref.getFullYear();
    const candidate = new Date(year, month - 1, day);
    if (candidate.getMonth() !== month - 1) return null;
    if (candidate < startOfDay(ref)) year += 1;

    return context.createParsingComponents({ day, month }).imply('year', year);
  },
};

/** "halb drei", "viertel nach 4", "viertel vor zwölf", "dreiviertel acht". */
const quarterTimes: Parser = {
  pattern: () =>
    new RegExp(
      `${WB}(?:(?:um|gegen|ab)\\s+)?(halb|viertel\\s+nach|viertel\\s+vor|dreiviertel|drei\\s+viertel)\\s+(\\d{1,2}|${HOUR_WORD_ALTERNATION})(?:\\s*uhr)?${WE}`,
      'iu',
    ),
  extract: (context: ParsingContext, match: RegExpMatchArray) => {
    const kind = (match[1] ?? '').toLowerCase().replace(/\s+/g, ' ');
    const named = hourFromToken(match[2] ?? '');
    if (named === null) return null;

    let hour = named;
    let minute = 0;
    if (kind === 'halb') {
      hour = named - 1;
      minute = 30;
    } else if (kind === 'viertel nach') {
      minute = 15;
    } else {
      hour = named - 1;
      minute = 45;
    }
    if (hour === 0) hour = 12;
    return context.createParsingComponents({ hour, minute });
  },
};

/** "um drei", "gegen acht Uhr" – Stundenangabe als Zahlwort. */
const hourWords: Parser = {
  pattern: () =>
    new RegExp(`${WB}(?:um|gegen|ab)\\s+(${HOUR_WORD_ALTERNATION})(?:\\s+uhr)?${WE}`, 'iu'),
  extract: (context: ParsingContext, match: RegExpMatchArray) => {
    const hour = hourFromToken(match[1] ?? '');
    if (hour === null) return null;
    return context.createParsingComponents({ hour, minute: 0 });
  },
};

/** "gegen 8", "ab 19:30" – chrono erkennt Ziffern nur mit "um" oder "Uhr". */
const approximateHours: Parser = {
  pattern: () =>
    new RegExp(`${WB}(?:so\\s+)?(?:gegen|ab)\\s+(\\d{1,2})(?:[:.](\\d{2}))?(?:\\s*uhr)?${WE}`, 'iu'),
  extract: (context: ParsingContext, match: RegExpMatchArray) => {
    const hour = Number(match[1]);
    const minute = match[2] ? Number(match[2]) : 0;
    if (hour > 23 || minute > 59) return null;
    return context.createParsingComponents({ hour, minute });
  },
};

/** "am Wochenende", "nächstes Wochenende" → Samstag (ganztägig). */
const weekend: Parser = {
  pattern: () =>
    new RegExp(
      `${WB}(?:(am|übers|über\\s+das|dieses|diesem|nächstes|nächsten|kommendes|kommenden)\\s+)?wochenende${WE}`,
      'iu',
    ),
  extract: (context: ParsingContext, match: RegExpMatchArray) => {
    const ref = startOfDay(context.refDate);
    const weekday = ref.getDay();
    const modifier = (match[1] ?? '').toLowerCase();
    let offset: number;
    if (weekday === 6) offset = 0;
    else if (weekday === 0) offset = -1;
    else offset = 6 - weekday;
    if (weekday === 6 || weekday === 0) {
      if (modifier.startsWith('nächst') || modifier.startsWith('kommend')) offset += 7;
      else if (weekday === 0) offset = 0;
    }
    const target = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() + offset);
    return context.createParsingComponents({
      year: target.getFullYear(),
      month: target.getMonth() + 1,
      day: target.getDate(),
    });
  },
};

export function createGermanChrono(): chrono.Chrono {
  const instance = chrono.de.casual.clone();
  instance.parsers.push(dateWithoutYear, quarterTimes, hourWords, approximateHours, weekend);
  return instance;
}
