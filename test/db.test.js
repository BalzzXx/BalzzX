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
    assert.equal(firstStore.isSubscribed(user.id), false);
    assert.equal(firstStore.setSubscribed(user.id, true), true);
    assert.equal(firstStore.setBanned(user.id, true), true);
    assert.deepEqual(firstStore.getStats(), { total: 1, subscribers: 0, banned: 1 });
    firstStore.close();

    const reopenedStore = initializeDatabase(createDatabase(databasePath));
    assert.equal(reopenedStore.saveUser({ ...user, first_name: "Updated" }), true);
    assert.equal(reopenedStore.isSubscribed(user.id), true);
    assert.equal(reopenedStore.countSubscribers(), 0);
    assert.deepEqual(reopenedStore.listSubscribers(), []);
    assert.equal(reopenedStore.setBanned(user.id, false), true);
    assert.equal(reopenedStore.countSubscribers(), 1);
    assert.deepEqual(reopenedStore.listSubscribers(), [{ telegram_id: "123" }]);
    assert.deepEqual(reopenedStore.getStats(), { total: 1, subscribers: 1, banned: 0 });
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
