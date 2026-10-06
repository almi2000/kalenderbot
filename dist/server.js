import { buildApp } from './app.js';
import { CalDavCalendar } from './caldav/client.js';
import { loadConfig } from './config.js';
import { ReminderJob } from './reminder/job.js';
import { MultiNotifier } from './reminder/notify.js';
import { ReminderStore } from './reminder/store.js';
const config = loadConfig();
const calendar = new CalDavCalendar(config.caldav, config.phoneAlarmMinutes);
const app = await buildApp({
    calendar,
    defaultDurationMinutes: config.defaultDurationMinutes,
    appToken: config.appToken,
    secureCookie: config.publicUrl.startsWith('https://'),
});
const store = new ReminderStore(config.dataDir);
const reminders = new ReminderJob({
    calendar,
    store,
    notifier: new MultiNotifier(config.smtp, config.ntfy),
    offsetsMinutes: config.reminderOffsetsMinutes,
    allDayTime: config.allDayReminderTime,
    cronExpression: config.reminderCron,
    timezone: config.timezone,
    logger: app.log,
});
async function shutdown(signal) {
    app.log.info({ signal }, 'Fahre herunter');
    await reminders.stop();
    await app.close();
    store.close();
    process.exit(0);
}
process.once('SIGTERM', () => void shutdown('SIGTERM'));
process.once('SIGINT', () => void shutdown('SIGINT'));
await app.listen({ port: config.port, host: config.host });
app.log.info({ publicUrl: config.publicUrl, timezone: config.timezone }, 'Kalender-App läuft');
reminders.start();
//# sourceMappingURL=server.js.map