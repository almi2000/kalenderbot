import ICAL from 'ical.js';
export const IMPORTANT_CATEGORY = 'WICHTIG';
const PRODID = '-//whatsapp-kalender//Terminassistent//DE';
const MAX_OCCURRENCES = 5000;
function pad(value) {
    return String(value).padStart(2, '0');
}
function utcStamp(date) {
    return (`${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
        `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`);
}
function dateValue(date) {
    return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
}
function escapeText(value) {
    return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}
/** RFC 5545: Zeilen nach 75 Oktetten falten, ohne UTF-8-Zeichen zu zerschneiden. */
function fold(line) {
    const parts = [];
    let current = '';
    let bytes = 0;
    for (const char of line) {
        const size = Buffer.byteLength(char);
        const limit = parts.length === 0 ? 75 : 74;
        if (bytes + size > limit) {
            parts.push(current);
            current = '';
            bytes = 0;
        }
        current += char;
        bytes += size;
    }
    parts.push(current);
    return parts.join('\r\n ');
}
function alarm(trigger, description) {
    return ['BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${escapeText(description)}`, `TRIGGER:${trigger}`, 'END:VALARM'];
}
/** Lokale Formularwerte (Zeitzone des Prozesses) in konkrete Zeitpunkte umrechnen. */
export function resolveTimes(event) {
    const [year, month, day] = event.date.split('-').map(Number);
    if (!event.time) {
        const start = new Date(year, month - 1, day);
        return { start, end: new Date(year, month - 1, day + 1), allDay: true };
    }
    const [hour, minute] = event.time.split(':').map(Number);
    const start = new Date(year, month - 1, day, hour, minute);
    let end = new Date(start.getTime() + 60 * 60 * 1000);
    if (event.endTime) {
        const [endHour, endMinute] = event.endTime.split(':').map(Number);
        end = new Date(year, month - 1, day, endHour, endMinute);
        // "22:00–01:00" endet am Folgetag
        if (end <= start)
            end = new Date(year, month - 1, day + 1, endHour, endMinute);
    }
    return { start, end, allDay: false };
}
export function buildICalendar(event, phoneAlarmMinutes, now = new Date()) {
    const { start, end, allDay } = resolveTimes(event);
    const lines = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        `PRODID:${PRODID}`,
        'CALSCALE:GREGORIAN',
        'BEGIN:VEVENT',
        `UID:${event.uid}`,
        `DTSTAMP:${utcStamp(now)}`,
        `CREATED:${utcStamp(now)}`,
        `LAST-MODIFIED:${utcStamp(now)}`,
        allDay ? `DTSTART;VALUE=DATE:${dateValue(start)}` : `DTSTART:${utcStamp(start)}`,
        allDay ? `DTEND;VALUE=DATE:${dateValue(end)}` : `DTEND:${utcStamp(end)}`,
        `SUMMARY:${escapeText(event.title)}`,
    ];
    if (event.description)
        lines.push(`DESCRIPTION:${escapeText(`WhatsApp: ${event.description}`)}`);
    if (event.important)
        lines.push(`CATEGORIES:${IMPORTANT_CATEGORY}`, 'PRIORITY:1');
    // Ganztägig: Erinnerung am Vortag um 18 Uhr statt um Mitternacht.
    if (allDay)
        lines.push(...alarm('-PT6H', event.title));
    else if (phoneAlarmMinutes > 0)
        lines.push(...alarm(`-PT${phoneAlarmMinutes}M`, event.title));
    if (event.important)
        lines.push(...alarm('-P1D', event.title));
    lines.push('END:VEVENT', 'END:VCALENDAR');
    return `${lines.map(fold).join('\r\n')}\r\n`;
}
function isImportant(vevent, title) {
    if (title.trim().startsWith('!'))
        return true;
    return vevent
        .getAllProperties('categories')
        .flatMap((property) => property.getValues())
        .some((value) => String(value).trim().toUpperCase() === IMPORTANT_CATEGORY);
}
/**
 * Liest VEVENTs aus einem iCalendar-Dokument und expandiert Wiederholungen,
 * sodass alle Vorkommen geliefert werden, die im Zeitraum [from, to) beginnen.
 */
export function parseICalendar(ics, from, to) {
    const root = new ICAL.Component(ICAL.parse(ics));
    for (const vtimezone of root.getAllSubcomponents('vtimezone')) {
        const tzid = String(vtimezone.getFirstPropertyValue('tzid') ?? '');
        if (tzid && !ICAL.TimezoneService.has(tzid))
            ICAL.TimezoneService.register(vtimezone);
    }
    const vevents = root.getAllSubcomponents('vevent');
    const exceptions = vevents.filter((vevent) => vevent.hasProperty('recurrence-id'));
    const results = [];
    for (const vevent of vevents) {
        if (vevent.hasProperty('recurrence-id'))
            continue;
        if (String(vevent.getFirstPropertyValue('status') ?? '').toUpperCase() === 'CANCELLED')
            continue;
        const event = new ICAL.Event(vevent);
        for (const exception of exceptions) {
            if (exception.getFirstPropertyValue('uid') === event.uid)
                event.relateException(exception);
        }
        const title = event.summary ?? '';
        const important = isImportant(vevent, title);
        const base = {
            uid: event.uid,
            title: title.replace(/^\s*!\s*/, ''),
            description: event.description ?? '',
            allDay: event.startDate.isDate,
            important,
        };
        if (!event.isRecurring()) {
            const start = event.startDate.toJSDate();
            if (start >= from && start < to)
                results.push({ ...base, start, end: event.endDate.toJSDate() });
            continue;
        }
        const iterator = event.iterator();
        for (let i = 0, next = iterator.next(); next && i < MAX_OCCURRENCES; i++, next = iterator.next()) {
            const details = event.getOccurrenceDetails(next);
            const start = details.startDate.toJSDate();
            if (start >= to)
                break;
            if (start < from)
                continue;
            results.push({
                ...base,
                title: (details.item.summary ?? title).replace(/^\s*!\s*/, ''),
                start,
                end: details.endDate.toJSDate(),
            });
        }
    }
    return results.sort((a, b) => a.start.getTime() - b.start.getTime());
}
//# sourceMappingURL=ical.js.map