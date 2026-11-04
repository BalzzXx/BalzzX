import { mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

export function createDatabase(databasePath) {
    const filePath = resolve(process.cwd(), databasePath);
    mkdirSync(dirname(filePath), { recursive: true, mode: 0o700 });
    const database = new DatabaseSync(filePath, { timeout: 5000 });
    database.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;");
    return database;
}

export function initializeDatabase(database) {
    database.exec(readFileSync(resolve(process.cwd(), "sql/schema.sql"), "utf8"));

    const saveUserStatement = database.prepare(`
        INSERT INTO telegram_users (telegram_id, username, first_name, last_name)
        VALUES (?, ?, ?, ?)
        ON CONFLICT (telegram_id) DO UPDATE SET
            username = excluded.username,
            first_name = excluded.first_name,
            last_name = excluded.last_name,
            last_seen_at = CURRENT_TIMESTAMP
    `);
    const getUserStatement = database.prepare(
        "SELECT subscribed, banned FROM telegram_users WHERE telegram_id = ?"
    );
    const setSubscriptionStatement = database.prepare(
        "UPDATE telegram_users SET subscribed = ? WHERE telegram_id = ?"
    );
    const setBannedStatement = database.prepare(
        "UPDATE telegram_users SET banned = ? WHERE telegram_id = ?"
    );

    return {
        saveUser(from) {
            const telegramId = String(from.id);
            saveUserStatement.run(telegramId, from.username ?? null, from.first_name, from.last_name ?? null);
            return getUserStatement.get(telegramId).banned === 1;
        },
        isSubscribed(telegramId) {
            return getUserStatement.get(String(telegramId))?.subscribed === 1;
        },
        setSubscribed(telegramId, subscribed) {
            return setSubscriptionStatement.run(subscribed ? 1 : 0, String(telegramId)).changes > 0;
        },
        countSubscribers() {
            return database.prepare(
                "SELECT COUNT(*) AS count FROM telegram_users WHERE subscribed = 1 AND banned = 0"
            ).get().count;
        },
        getStats() {
            return { ...database.prepare(`
                SELECT COUNT(*) AS total,
                    COALESCE(SUM(CASE WHEN subscribed = 1 AND banned = 0 THEN 1 ELSE 0 END), 0) AS subscribers,
                    COALESCE(SUM(CASE WHEN banned = 1 THEN 1 ELSE 0 END), 0) AS banned
                FROM telegram_users
            `).get() };
        },
        listSubscribers() {
            return database.prepare(
                "SELECT telegram_id FROM telegram_users WHERE subscribed = 1 AND banned = 0"
            ).all().map(({ telegram_id }) => ({ telegram_id }));
        },
        setBanned(telegramId, banned) {
            return setBannedStatement.run(banned ? 1 : 0, String(telegramId)).changes > 0;
        },
        close() {
            database.close();
        }
    };
}
