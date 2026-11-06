import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createDatabase, initializeDatabase } from "../src/db.js";

test("SQLite user data and subscription state persist across restarts", (context) => {
    const directory = mkdtempSync(join(tmpdir(), "balzzx-db-"));
    context.after(() => rmSync(directory, { recursive: true, force: true }));
    const databasePath = join(directory, "data", "bot.sqlite");
    const user = { id: 123, username: "tester", first_name: "Test", last_name: "User" };

    const firstStore = initializeDatabase(createDatabase(databasePath));
    assert.equal(firstStore.saveUser(user), false);
    assert.equal(firstStore.isRegistered(user.id), false);
    assert.equal(firstStore.registerUser(user.id), true);
    assert.equal(firstStore.isRegistered(user.id), true);
    assert.equal(firstStore.hasConfirmedAdultContent(user.id), false);
    assert.equal(firstStore.confirmAdultContent(user.id), true);
    assert.equal(firstStore.hasConfirmedAdultContent(user.id), true);
    assert.equal(firstStore.isSubscribed(user.id), false);
    assert.equal(firstStore.setSubscribed(user.id, true), true);
    assert.equal(firstStore.setBanned(user.id, true), true);
    assert.deepEqual(firstStore.getStats(), { total: 1, subscribers: 0, banned: 1 });
    firstStore.close();

    const reopenedStore = initializeDatabase(createDatabase(databasePath));
    assert.equal(reopenedStore.saveUser({ ...user, first_name: "Updated" }), true);
    assert.equal(reopenedStore.hasConfirmedAdultContent(user.id), true);
    assert.equal(reopenedStore.isSubscribed(user.id), true);
    assert.equal(reopenedStore.countSubscribers(), 0);
    assert.deepEqual(reopenedStore.listSubscribers(), []);
    assert.equal(reopenedStore.setBanned(user.id, false), true);
    assert.equal(reopenedStore.countSubscribers(), 1);
    assert.deepEqual(reopenedStore.listSubscribers(), [{ telegram_id: "123" }]);
    assert.deepEqual(reopenedStore.getStats(), { total: 1, subscribers: 1, banned: 0 });
    reopenedStore.close();
});

test("premium access expires, extends from the current expiry, and can be revoked", (context) => {
    const directory = mkdtempSync(join(tmpdir(), "balzzx-db-premium-"));
    context.after(() => rmSync(directory, { recursive: true, force: true }));
    const store = initializeDatabase(createDatabase(join(directory, "bot.sqlite")));
    const user = { id: 456, first_name: "Premium" };
    const now = 1_800_000_000_000;

    store.saveUser(user);
    assert.equal(store.grantPremium(user.id, 30, now), undefined);
    store.registerUser(user.id);
    assert.equal(store.isPremium(user.id, now), false);
    const firstExpiry = store.grantPremium(user.id, 30, now);
    assert.equal(firstExpiry, now + 30 * 24 * 60 * 60 * 1000);
    assert.equal(store.isPremium(user.id, now), true);
    assert.equal(store.isPremium(user.id, firstExpiry), false);
    assert.equal(store.grantPremium(user.id, 5, now + 10 * 24 * 60 * 60 * 1000), firstExpiry + 5 * 24 * 60 * 60 * 1000);
    assert.equal(store.removePremium(user.id), true);
    assert.equal(store.getPremiumUntil(user.id), undefined);
    assert.equal(store.isPremium(user.id, now), false);
    store.close();
});

test("existing SQLite schemas are migrated without registering old users", (context) => {
    const directory = mkdtempSync(join(tmpdir(), "balzzx-db-migration-"));
    context.after(() => rmSync(directory, { recursive: true, force: true }));
    const database = createDatabase(join(directory, "legacy.sqlite"));
    database.exec(`
        CREATE TABLE telegram_users (
            telegram_id TEXT PRIMARY KEY,
            username TEXT,
            first_name TEXT NOT NULL,
            last_name TEXT,
            subscribed INTEGER NOT NULL DEFAULT 0,
            banned INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        INSERT INTO telegram_users (telegram_id, first_name) VALUES ('789', 'Legacy');
    `);
    const store = initializeDatabase(database);
    assert.equal(store.isRegistered("789"), false);
    assert.equal(store.hasConfirmedAdultContent("789"), false);
    assert.equal(store.getPremiumUntil("789"), undefined);
    assert.equal(store.registerUser("789"), true);
    assert.equal(store.isRegistered("789"), true);
    store.close();
});

test("daily feature quotas reserve concurrently, count only success, and reset at Jakarta midnight", (context) => {
    const directory = mkdtempSync(join(tmpdir(), "balzzx-db-daily-"));
    context.after(() => rmSync(directory, { recursive: true, force: true }));
    const store = initializeDatabase(createDatabase(join(directory, "bot.sqlite")));
    const telegramId = "321";
    const justBeforeJakartaMidnight = Date.UTC(2026, 10, 6, 16, 59, 59);

    const failedAttempt = store.reserveDailyCommand(telegramId, 1, justBeforeJakartaMidnight);
    assert.equal(failedAttempt.allowed, true);
    assert.equal(
        store.reserveDailyCommand(telegramId, 1, justBeforeJakartaMidnight).allowed,
        false
    );
    assert.equal(store.completeDailyCommand(failedAttempt, false), true);
    assert.deepEqual(store.getDailyCommandUsage(telegramId, justBeforeJakartaMidnight), {
        used: 0,
        reserved: 0,
        usageDate: "2026-11-06",
        resetAt: Date.parse("2026-11-07T00:00:00+07:00")
    });

    const successfulAttempt = store.reserveDailyCommand(telegramId, 1, justBeforeJakartaMidnight);
    assert.equal(store.completeDailyCommand(successfulAttempt, true), true);
    assert.equal(store.reserveDailyCommand(telegramId, 1, justBeforeJakartaMidnight).allowed, false);

    const afterJakartaMidnight = Date.UTC(2026, 10, 6, 17, 0, 0);
    const nextDayAttempt = store.reserveDailyCommand(telegramId, 1, afterJakartaMidnight);
    assert.equal(nextDayAttempt.allowed, true);
    assert.equal(store.getDailyCommandUsage(telegramId, afterJakartaMidnight).usageDate, "2026-11-07");
    store.completeDailyCommand(nextDayAttempt, false);
    store.close();
});

test("daily feature reservations abandoned by a process restart are released", (context) => {
    const directory = mkdtempSync(join(tmpdir(), "balzzx-db-daily-restart-"));
    context.after(() => rmSync(directory, { recursive: true, force: true }));
    const databasePath = join(directory, "bot.sqlite");
    const firstStore = initializeDatabase(createDatabase(databasePath));
    const reservation = firstStore.reserveDailyCommand("654", 2);
    assert.equal(reservation.allowed, true);
    firstStore.close();

    const reopenedStore = initializeDatabase(createDatabase(databasePath));
    assert.deepEqual(reopenedStore.getDailyCommandUsage("654").reserved, 0);
    assert.equal(reopenedStore.reserveDailyCommand("654", 2).allowed, true);
    reopenedStore.close();
});

test("SQLite stats return zeroes for an empty database", (context) => {
    const directory = mkdtempSync(join(tmpdir(), "balzzx-db-empty-"));
    context.after(() => rmSync(directory, { recursive: true, force: true }));
    const store = initializeDatabase(createDatabase(join(directory, "bot.sqlite")));

    assert.deepEqual(store.getStats(), { total: 0, subscribers: 0, banned: 0 });
    assert.equal(store.countSubscribers(), 0);
    store.close();
});
