import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
/** Merkt sich verschickte Erinnerungen, damit nach Neustarts nichts doppelt rausgeht. */
export class ReminderStore {
    db;
    constructor(dataDir) {
        if (dataDir === ':memory:') {
            this.db = new DatabaseSync(':memory:');
        }
        else {
            mkdirSync(dataDir, { recursive: true });
            this.db = new DatabaseSync(join(dataDir, 'reminders.db'));
        }
        this.db.exec(`
      CREATE TABLE IF NOT EXISTS sent_reminders (
        key TEXT PRIMARY KEY,
        sent_at TEXT NOT NULL
      )
    `);
    }
    isSent(key) {
        return this.db.prepare('SELECT 1 FROM sent_reminders WHERE key = ?').get(key) !== undefined;
    }
    markSent(keys, at = new Date()) {
        const insert = this.db.prepare('INSERT OR IGNORE INTO sent_reminders (key, sent_at) VALUES (?, ?)');
        for (const key of keys)
            insert.run(key, at.toISOString());
    }
    /** Alte Einträge entfernen, damit die Datenbank nicht endlos wächst. */
    prune(olderThan) {
        this.db.prepare('DELETE FROM sent_reminders WHERE sent_at < ?').run(olderThan.toISOString());
    }
    close() {
        this.db.close();
    }
}
//# sourceMappingURL=store.js.map