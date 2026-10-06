import { formatTime, formatWhen } from '../format.js';
import { escapeHtml, layout } from './html.js';
const REASON_LABELS = {
    wochentag: 'Wochentag',
    datum: 'Datum',
    uhrzeit: 'Uhrzeit',
    relativ: 'heute/morgen',
};
function eventList(events) {
    if (events.length === 0)
        return '<p class="muted">Keine Termine in den nächsten 14 Tagen.</p>';
    const items = events
        .map((event) => {
        const when = event.allDay
            ? formatWhen(event.start, true)
            : `${formatWhen(event.start, false)} – ${formatTime(event.end)}`;
        return `<li${event.important ? ' class="important"' : ''}>
        <span class="when">${escapeHtml(when)}</span>
        <span class="what">${event.important ? '⭐ ' : ''}${escapeHtml(event.title)}</span>
      </li>`;
    })
        .join('\n');
    return `<ul class="events">${items}</ul>`;
}
export function homePage(options) {
    const flash = options.saved
        ? `<p class="flash ok">✅ Gespeichert: <strong>${escapeHtml(options.saved)}</strong></p>`
        : '';
    const upcoming = options.events
        ? eventList(options.events)
        : `<p class="flash warn">Kalender nicht erreichbar: ${escapeHtml(options.calendarError ?? 'unbekannter Fehler')}</p>`;
    return layout('Kalender', `${flash}
    <section class="card">
      <h1>Nachricht → Termin</h1>
      <p class="muted">In WhatsApp eine Nachricht teilen und „Kalender“ wählen – oder hier einfügen:</p>
      <form method="get" action="/share">
        <textarea name="text" rows="4" placeholder="z. B. Treffen wir uns am Freitag um 19 Uhr im Kino?" required></textarea>
        <div class="row">
          <button type="button" class="secondary" data-paste>📋 Aus Zwischenablage</button>
          <button type="submit">Termin erkennen</button>
        </div>
      </form>
    </section>
    <section class="card">
      <h2>Nächste 14 Tage</h2>
      ${upcoming}
    </section>`);
}
function slotLabel(slot) {
    const [year, month, day] = slot.date.split('-').map(Number);
    const start = new Date(year, month - 1, day);
    const datePart = formatWhen(start, true).replace(' (ganztägig)', '');
    if (!slot.time)
        return `${datePart} (ganztägig)`;
    return `${datePart}, ${slot.time}${slot.endTime ? `–${slot.endTime}` : ''} Uhr`;
}
export function confirmPage(parsed, uid) {
    const slot = parsed.primary;
    const warnings = [];
    if (!slot)
        warnings.push('Kein Datum erkannt – bitte Datum und Uhrzeit selbst eintragen.');
    else if (!slot.dateFromMessage)
        warnings.push('Nur eine Uhrzeit erkannt – das Datum wurde abgeleitet, bitte prüfen.');
    if (parsed.inPast)
        warnings.push('Der erkannte Zeitpunkt liegt in der Vergangenheit.');
    const reasons = parsed.prefilter.reasons.map((reason) => REASON_LABELS[reason]).join(', ');
    const alternatives = parsed.alternatives
        .map((alt) => `<button type="button" class="chip" data-date="${escapeHtml(alt.date)}" data-time="${escapeHtml(alt.time ?? '')}" data-end="${escapeHtml(alt.endTime ?? '')}" title="${escapeHtml(alt.text)}">${escapeHtml(slotLabel(alt))}</button>`)
        .join(' ');
    const allDay = slot ? !slot.time : false;
    return layout('Termin bestätigen', `<section class="card">
      <h1>Termin bestätigen</h1>
      <blockquote>${escapeHtml(parsed.text)}</blockquote>
      ${reasons ? `<p class="muted">Erkannt: ${escapeHtml(reasons)}${slot ? ` – „${escapeHtml(slot.text)}“` : ''}</p>` : ''}
      ${warnings.map((w) => `<p class="flash warn">${escapeHtml(w)}</p>`).join('\n')}
      <form method="post" action="/events" id="event-form">
        <input type="hidden" name="uid" value="${escapeHtml(uid)}">
        <input type="hidden" name="description" value="${escapeHtml(parsed.text)}">
        <label>Titel
          <input type="text" name="title" value="${escapeHtml(parsed.title)}" maxlength="200" required>
        </label>
        <label>Datum
          <input type="date" name="date" value="${escapeHtml(slot?.date ?? '')}" required>
        </label>
        <label class="check"><input type="checkbox" name="allDay" ${allDay ? 'checked' : ''} data-allday> Ganztägig</label>
        <div class="row times">
          <label>Beginn
            <input type="time" name="time" value="${escapeHtml(slot?.time ?? '')}">
          </label>
          <label>Ende
            <input type="time" name="endTime" value="${escapeHtml(slot?.endTime ?? '')}" placeholder="optional">
          </label>
        </div>
        ${alternatives ? `<p class="muted">Weitere erkannte Angaben:</p><p>${alternatives}</p>` : ''}
        <label class="check important"><input type="checkbox" name="important"> ⭐ Wichtig – E-Mail-Erinnerung schicken</label>
        <div class="row">
          <a class="button secondary" href="/">Abbrechen</a>
          <button type="submit">Speichern</button>
        </div>
      </form>
    </section>`);
}
export function errorPage(message) {
    return layout('Fehler', `<section class="card">
      <h1>Das hat nicht geklappt</h1>
      <p class="flash warn">${escapeHtml(message)}</p>
      <p><a class="button secondary" href="/">Zur Startseite</a></p>
    </section>`);
}
export function loginPage(invalid) {
    return layout('Anmelden', `<section class="card">
      <h1>Anmelden</h1>
      ${invalid ? '<p class="flash warn">Token ungültig.</p>' : ''}
      <form method="get" action="/login">
        <label>Zugangstoken
          <input type="password" name="token" autocomplete="current-password" required>
        </label>
        <button type="submit">Anmelden</button>
      </form>
    </section>`);
}
//# sourceMappingURL=views.js.map