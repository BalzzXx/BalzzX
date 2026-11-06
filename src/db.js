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
    const columns = new Set(database.prepare("PRAGMA table_info(telegram_users)").all().map(({ name }) => name));
    if (!columns.has("is_registered"))
        database.exec("ALTER TABLE telegram_users ADD COLUMN is_registered INTEGER NOT NULL DEFAULT 0 CHECK (is_registered IN (0, 1))");
    if (!columns.has("adult_confirmed"))
        database.exec("ALTER TABLE telegram_users ADD COLUMN adult_confirmed INTEGER NOT NULL DEFAULT 0 CHECK (adult_confirmed IN (0, 1))");
    if (!columns.has("premium_until"))
        database.exec("ALTER TABLE telegram_users ADD COLUMN premium_until INTEGER");

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
    const registerUserStatement = database.prepare(`
        UPDATE telegram_users
        SET is_registered = 1, last_seen_at = CURRENT_TIMESTAMP
        WHERE telegram_id = ?
    `);
    const getRegistrationStatement = database.prepare(
        "SELECT is_registered FROM telegram_users WHERE telegram_id = ?"
    );
    const getAdultConfirmationStatement = database.prepare(
        "SELECT adult_confirmed FROM telegram_users WHERE telegram_id = ?"
    );
    const confirmAdultStatement = database.prepare(
        "UPDATE telegram_users SET adult_confirmed = 1 WHERE telegram_id = ? AND is_registered = 1"
    );
    const getPremiumStatement = database.prepare(
        "SELECT premium_until FROM telegram_users WHERE telegram_id = ?"
    );
    const grantPremiumStatement = database.prepare(
        "UPDATE telegram_users SET premium_until = ? WHERE telegram_id = ? AND is_registered = 1"
    );
    const removePremiumStatement = database.prepare(
        "UPDATE telegram_users SET premium_until = NULL WHERE telegram_id = ?"
    );
    function getPremiumUntil(telegramId) {
        const premiumUntil = getPremiumStatement.get(String(telegramId))?.premium_until;
        return typeof premiumUntil === "number" ? premiumUntil : undefined;
    }

    return {
        saveUser(from) {
            const telegramId = String(from.id);
            saveUserStatement.run(telegramId, from.username ?? null, from.first_name, from.last_name ?? null);
            return getUserStatement.get(telegramId).banned === 1;
        },
        registerUser(telegramId) {
            return registerUserStatement.run(String(telegramId)).changes > 0;
        },
        isRegistered(telegramId) {
            return getRegistrationStatement.get(String(telegramId))?.is_registered === 1;
        },
        hasConfirmedAdultContent(telegramId) {
            return getAdultConfirmationStatement.get(String(telegramId))?.adult_confirmed === 1;
        },
        confirmAdultContent(telegramId) {
            return confirmAdultStatement.run(String(telegramId)).changes > 0;
        },
        getPremiumUntil,
        isPremium(telegramId, now = Date.now()) {
            const premiumUntil = getPremiumUntil(telegramId);
            return premiumUntil !== undefined && premiumUntil > now;
        },
        grantPremium(telegramId, durationDays, now = Date.now()) {
            if (!Number.isSafeInteger(durationDays) || durationDays < 1 || durationDays > 3650)
                throw new RangeError("Premium duration must be between 1 and 3650 days");
            const currentExpiry = getPremiumUntil(telegramId) ?? 0;
            const expiresAt = Math.max(currentExpiry, now) + durationDays * 24 * 60 * 60 * 1000;
            const updated = grantPremiumStatement.run(expiresAt, String(telegramId)).changes > 0;
            return updated ? expiresAt : undefined;
        },
        removePremium(telegramId) {
            return removePremiumStatement.run(String(telegramId)).changes > 0;
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
