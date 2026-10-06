import nodemailer from 'nodemailer';
import { formatTime, formatWhen } from '../format.js';
function startOfDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}
function relativeDay(start, now) {
    const days = Math.round((startOfDay(start) - startOfDay(now)) / 86_400_000);
    if (days === 0)
        return 'heute';
    if (days === 1)
        return 'morgen';
    if (days === 2)
        return 'übermorgen';
    return null;
}
function countdown(start, now) {
    const minutes = Math.max(0, Math.round((start.getTime() - now.getTime()) / 60_000));
    if (minutes < 60)
        return `in ${minutes} Minute${minutes === 1 ? '' : 'n'}`;
    const hours = Math.round(minutes / 60);
    if (hours < 36)
        return `in ${hours} Stunde${hours === 1 ? '' : 'n'}`;
    return `in ${Math.round(hours / 24)} Tagen`;
}
/** Text bezieht sich auf die tatsächliche Restzeit, nicht auf die konfigurierte Vorlaufzeit. */
export function buildReminderMessage(event, now) {
    const day = relativeDay(event.start, now);
    const shortWhen = event.allDay
        ? (day ?? formatWhen(event.start, true).replace(' (ganztägig)', ''))
        : `${day ?? formatWhen(event.start, true).replace(' (ganztägig)', '')}, ${formatTime(event.start)} Uhr`;
    const when = event.allDay
        ? formatWhen(event.start, true, true)
        : `${formatWhen(event.start, false, true)} (${countdown(event.start, now)})`;
    const lines = ['Erinnerung an deinen Termin:', '', event.title, when];
    if (event.description)
        lines.push('', event.description);
    return { subject: `⏰ ${event.title} – ${shortWhen}`, text: lines.join('\n') };
}
class MailChannel {
    config;
    transport;
    constructor(config) {
        this.config = config;
        this.transport = nodemailer.createTransport({
            host: config.host,
            port: config.port,
            secure: config.secure,
            auth: config.user ? { user: config.user, pass: config.password } : undefined,
        });
    }
    async send(message) {
        await this.transport.sendMail({
            from: this.config.from,
            to: this.config.to,
            subject: message.subject,
            text: message.text,
        });
    }
}
class NtfyChannel {
    config;
    constructor(config) {
        this.config = config;
    }
    async send(message) {
        // JSON-Variante, weil HTTP-Header (Title) keine Umlaute erlauben.
        const response = await fetch(this.config.url, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                ...(this.config.token ? { authorization: `Bearer ${this.config.token}` } : {}),
            },
            body: JSON.stringify({
                topic: this.config.topic,
                title: message.subject,
                message: message.text,
                priority: 4,
                tags: ['calendar'],
            }),
            signal: AbortSignal.timeout(10_000),
        });
        if (!response.ok)
            throw new Error(`ntfy antwortet mit ${response.status} ${await response.text()}`);
    }
}
/** Verschickt über alle konfigurierten Kanäle; scheitert nur, wenn kein Kanal funktioniert. */
export class MultiNotifier {
    targets = [];
    constructor(smtp, ntfy) {
        if (smtp) {
            const mail = new MailChannel(smtp);
            this.targets.push({ name: 'E-Mail', send: (m) => mail.send(m) });
        }
        if (ntfy) {
            const push = new NtfyChannel(ntfy);
            this.targets.push({ name: 'ntfy', send: (m) => push.send(m) });
        }
    }
    get channels() {
        return this.targets.map((target) => target.name);
    }
    async send(message) {
        const results = await Promise.allSettled(this.targets.map((target) => target.send(message)));
        const failures = results.flatMap((result, index) => result.status === 'rejected' ? [`${this.targets[index].name}: ${result.reason.message}`] : []);
        if (failures.length > 0 && failures.length === this.targets.length) {
            throw new Error(`Erinnerung konnte nicht verschickt werden – ${failures.join('; ')}`);
        }
    }
}
//# sourceMappingURL=notify.js.map