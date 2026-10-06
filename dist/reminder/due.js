export function reminderKey(event, offsetMinutes) {
    return `${event.uid}|${event.start.toISOString()}|${offsetMinutes}`;
}
/** Bei Ganztagsterminen zählt eine feste Uhrzeit am Termintag statt Mitternacht. */
export function reminderBase(event, allDayTime) {
    if (!event.allDay)
        return event.start;
    const [hour, minute] = allDayTime.split(':').map(Number);
    const base = new Date(event.start);
    base.setHours(hour ?? 8, minute ?? 0, 0, 0);
    return base;
}
/**
 * Ermittelt fällige Erinnerungen. Sind mehrere Vorlaufzeiten gleichzeitig fällig
 * (z. B. Termin erst kurz vorher angelegt), wird nur eine Nachricht verschickt.
 */
export function findDueReminders(events, now, offsetsMinutes, allDayTime, isSent) {
    const due = [];
    for (const event of events) {
        if (!event.important)
            continue;
        const base = reminderBase(event, allDayTime);
        if (base <= now)
            continue;
        const dueOffsets = offsetsMinutes.filter((offset) => {
            const remindAt = base.getTime() - offset * 60_000;
            return remindAt <= now.getTime() && !isSent(reminderKey(event, offset));
        });
        if (dueOffsets.length === 0)
            continue;
        due.push({
            event,
            offsetMinutes: Math.min(...dueOffsets),
            keys: dueOffsets.map((offset) => reminderKey(event, offset)),
        });
    }
    return due;
}
//# sourceMappingURL=due.js.map