import type { ParsedResult } from 'chrono-node';
import { createGermanChrono } from './customParsers.js';
import { DAYTIME_DEFAULTS, MORNING_HINT } from './patterns.js';
import { prefilter, type PrefilterResult } from './prefilter.js';
import { extractTitle, type Span } from './title.js';

export { prefilter, type PrefilterResult } from './prefilter.js';

export interface DetectedSlot {
  /** Der Textausschnitt, aus dem Datum/Uhrzeit stammen. */
  text: string;
  /** YYYY-MM-DD */
  date: string;
  /** HH:MM oder null für ganztägig */
  time: string | null;
  endTime: string | null;
  /** false, wenn nur eine Uhrzeit erkannt und das Datum (heute/morgen) abgeleitet wurde. */
  dateFromMessage: boolean;
}

export interface ParsedMessage {
  text: string;
  prefilter: PrefilterResult;
  title: string;
  primary: DetectedSlot | null;
  alternatives: DetectedSlot[];
  inPast: boolean;
}

interface Clock {
  hour: number;
  minute: number;
}

interface Candidate {
  index: number;
  spans: Span[];
  text: string;
  hasDate: boolean;
  date: Date;
  time: Clock | null;
  endTime: Clock | null;
  /** Uhrzeit vor der Nachmittags-Heuristik, falls diese unsicher war. */
  ambiguousTime: { time: Clock; endTime: Clock | null } | null;
  vagueTime: Clock | null;
}

const germanChrono = createGermanChrono();
const BARE_WEEKDAY_ABBREVIATION = /^(?:am\s+)?(?:mo|di|mi|do|fr|sa|so)$/i;
const LOOKAHEAD_CHARS = 16;

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function formatDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatClock(clock: Clock | null): string | null {
  return clock ? `${pad(clock.hour)}:${pad(clock.minute)}` : null;
}

function parseClock(value: string): Clock {
  const [hour, minute] = value.split(':').map(Number);
  return { hour: hour ?? 0, minute: minute ?? 0 };
}

function isFalsePositive(result: ParsedResult, text: string): boolean {
  const matched = result.text.trim();
  // "Guten Morgen" ist eine Begrüßung, nicht "morgen".
  if (/^morgen$/i.test(matched) && /guten\s*$/i.test(text.slice(0, result.index))) return true;
  // "So geht das", "Do it" ... – zweibuchstabige Kürzel nur mit Punkt akzeptieren.
  if (BARE_WEEKDAY_ABBREVIATION.test(matched) && text.charAt(result.index + result.text.length) !== '.') {
    return true;
  }
  return false;
}

/** Nachmittags-Heuristik: "um 3" meint fast immer 15 Uhr, außer es steht "früh/morgens" dabei. */
function adjustMeridiem(clock: Clock, meridiemCertain: boolean, context: string): Clock {
  if (meridiemCertain || clock.hour < 1 || clock.hour > 6 || MORNING_HINT.test(context)) return clock;
  return { hour: clock.hour + 12, minute: clock.minute };
}

function toCandidate(result: ParsedResult, text: string): Candidate {
  const { start, end } = result;
  const context = text.slice(result.index, result.index + result.text.length + LOOKAHEAD_CHARS);
  const meridiemCertain = start.isCertain('meridiem');

  let time: Clock | null = null;
  let endTime: Clock | null = null;
  let ambiguousTime: Candidate['ambiguousTime'] = null;
  if (start.isCertain('hour')) {
    const raw = { hour: start.get('hour') ?? 0, minute: start.get('minute') ?? 0 };
    const rawEnd = end?.isCertain('hour') ? { hour: end.get('hour') ?? 0, minute: end.get('minute') ?? 0 } : null;
    time = adjustMeridiem(raw, meridiemCertain, context);
    endTime = rawEnd;
    if (!meridiemCertain && raw.hour < 12) ambiguousTime = { time: raw, endTime: rawEnd };
    if (time.hour !== raw.hour && rawEnd && rawEnd.hour < 12) {
      endTime = { hour: rawEnd.hour + 12, minute: rawEnd.minute };
    }
  }

  const daytime = DAYTIME_DEFAULTS.find((rule) => rule.pattern.test(context));
  const vagueTime = daytime ? parseClock(daytime.time) : null;

  return {
    index: result.index,
    spans: [[result.index, result.index + result.text.length]],
    text: result.text.trim(),
    hasDate: start.isCertain('day') || start.isCertain('weekday'),
    date: start.date(),
    time,
    endTime,
    ambiguousTime,
    vagueTime,
  };
}

function addHours(clock: Clock | null, hours: number): Clock | null {
  return clock ? { hour: clock.hour + hours, minute: clock.minute } : null;
}

/** Tageszeit am Datum ("Freitag abends", "Donnerstag früh") entscheidet über vormittags/nachmittags. */
function resolveWithDaytime(timeCandidate: Candidate, daytime: Clock | null): Pick<Candidate, 'time' | 'endTime'> {
  const ambiguous = timeCandidate.ambiguousTime;
  if (!daytime || !ambiguous) return { time: timeCandidate.time, endTime: timeCandidate.endTime };
  if (daytime.hour >= 12) {
    const endTime = ambiguous.endTime && ambiguous.endTime.hour < 12 ? addHours(ambiguous.endTime, 12) : ambiguous.endTime;
    return { time: addHours(ambiguous.time, 12), endTime };
  }
  return { time: ambiguous.time, endTime: ambiguous.endTime };
}

/** Datum ohne Uhrzeit + separat erkannte Uhrzeit ("Mo. 10 Uhr", "12. Oktober ab 18 Uhr") zusammenführen. */
function mergeDateAndTime(candidates: Candidate[]): Candidate[] {
  const dateOnly = candidates.filter((c) => c.hasDate && !c.time);
  const timeOnly = candidates.filter((c) => !c.hasDate && c.time);
  const used = new Set<Candidate>();
  const merged: Candidate[] = [];

  for (const dateCandidate of dateOnly) {
    const free = timeOnly.filter((c) => !used.has(c));
    const timeCandidate =
      free.find((c) => c.index > dateCandidate.index) ?? free.filter((c) => c.index < dateCandidate.index).pop();
    if (!timeCandidate || !timeCandidate.time) {
      merged.push(dateCandidate);
      continue;
    }
    used.add(timeCandidate);

    const { time, endTime } = resolveWithDaytime(timeCandidate, dateCandidate.vagueTime);
    const [first, second] =
      dateCandidate.index < timeCandidate.index ? [dateCandidate, timeCandidate] : [timeCandidate, dateCandidate];
    merged.push({
      ...dateCandidate,
      index: first.index,
      spans: [...dateCandidate.spans, ...timeCandidate.spans],
      text: `${first.text} … ${second.text}`,
      time,
      endTime,
    });
  }

  const rest = candidates.filter((c) => !dateOnly.includes(c) && !used.has(c));
  return [...merged, ...rest].sort((a, b) => a.index - b.index);
}

function score(candidate: Candidate): number {
  if (candidate.hasDate && candidate.time) return 3;
  if (candidate.hasDate && candidate.vagueTime) return 2.5;
  if (candidate.hasDate) return 2;
  return 1;
}

function toSlot(candidate: Candidate): DetectedSlot {
  return {
    text: candidate.text,
    date: formatDate(candidate.date),
    time: formatClock(candidate.time ?? candidate.vagueTime),
    endTime: formatClock(candidate.endTime),
    dateFromMessage: candidate.hasDate,
  };
}

function isInPast(slot: DetectedSlot, now: Date): boolean {
  const [year, month, day] = slot.date.split('-').map(Number);
  if (!slot.time) {
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return new Date(year!, month! - 1, day!) < today;
  }
  const { hour, minute } = parseClock(slot.time);
  return new Date(year!, month! - 1, day!, hour, minute) < now;
}

/**
 * Erkennt deterministisch Datum, Uhrzeit und Wochentag in einer deutschen Nachricht
 * und schlägt einen Termin (Titel, Datum, Uhrzeit) vor.
 */
export function parseMessage(text: string, now: Date = new Date()): ParsedMessage {
  const normalized = text.replace(/\s+/g, ' ').trim();
  const results = germanChrono
    .parse(normalized, now, { forwardDate: true })
    .filter((result) => !isFalsePositive(result, normalized));

  const candidates = mergeDateAndTime(results.map((result) => toCandidate(result, normalized)));
  const ranked = [...candidates].sort((a, b) => score(b) - score(a) || a.index - b.index);

  const slots: DetectedSlot[] = [];
  for (const candidate of ranked) {
    const slot = toSlot(candidate);
    const duplicate = slots.some(
      (s) => s.date === slot.date && s.time === slot.time && s.endTime === slot.endTime,
    );
    if (!duplicate) slots.push(slot);
  }

  const primary = slots[0] ?? null;
  return {
    text: normalized,
    prefilter: prefilter(normalized),
    title: extractTitle(normalized, candidates.flatMap((c) => c.spans)),
    primary,
    alternatives: slots.slice(1),
    inPast: primary ? isInPast(primary, now) : false,
  };
}
