const dateFormat = new Intl.DateTimeFormat('de-DE', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
});
const longDateFormat = new Intl.DateTimeFormat('de-DE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
});
const timeFormat = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' });
export function formatWhen(start, allDay, long = false) {
    const day = (long ? longDateFormat : dateFormat).format(start);
    return allDay ? `${day} (ganztägig)` : `${day}, ${timeFormat.format(start)} Uhr`;
}
export function formatTime(date) {
    return timeFormat.format(date);
}
//# sourceMappingURL=format.js.map