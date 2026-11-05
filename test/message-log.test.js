import assert from "node:assert/strict";
import test from "node:test";
import { formatIncomingMessage } from "../src/message-log.js";

test("incoming message log includes sender, chat, and text", () => {
    const log = JSON.parse(formatIncomingMessage(
        { message_id: 7, text: "hello" },
        { id: 12, username: "user" },
        { id: 34, type: "private" }
    ));
    assert.equal(log.event, "telegram_message");
    assert.equal(log.chatId, 34);
    assert.equal(log.chatType, "private");
    assert.equal(log.userId, 12);
    assert.equal(log.username, "user");
    assert.equal(log.messageId, 7);
    assert.equal(log.text, "hello");
    assert.ok(Number.isFinite(Date.parse(log.time)));
});

test("incoming media log records its caption and media type", () => {
    const log = JSON.parse(formatIncomingMessage(
        { message_id: 8, caption: "look", photo: [{}] },
        { id: 12 },
        { id: 34, type: "group" }
    ));
    assert.equal(log.text, "look");
    assert.equal(log.mediaType, "photo");
});
