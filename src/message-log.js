const messageTypes = [
    ["photo", "photo"],
    ["video", "video"],
    ["animation", "animation"],
    ["audio", "audio"],
    ["voice", "voice"],
    ["video_note", "video note"],
    ["document", "document"],
    ["sticker", "sticker"],
    ["location", "location"],
    ["venue", "venue"],
    ["contact", "contact"],
    ["poll", "poll"],
    ["dice", "dice"]
];

export function formatIncomingMessage(message, from, chat) {
    const text = message.text ?? message.caption;
    const mediaType = messageTypes.find(([key]) => message[key] !== undefined)?.[1];
    return JSON.stringify({
        event: "telegram_message",
        time: new Date().toISOString(),
        chatId: chat.id,
        chatType: chat.type,
        userId: from.id,
        username: from.username,
        messageId: message.message_id,
        ...(text !== undefined ? { text } : {}),
        ...(mediaType ? { mediaType } : {})
    });
}
