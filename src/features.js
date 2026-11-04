import { randomInt } from "node:crypto";
export function calculate(expression) {
    const match = expression.trim().match(/^(-?(?:\d+(?:\.\d+)?|\.\d+))\s*([+\-*/])\s*(-?(?:\d+(?:\.\d+)?|\.\d+))$/);
    if (!match)
        return undefined;
    const left = Number(match[1]);
    const right = Number(match[3]);
    let result;
    switch (match[2]) {
        case "+":
            result = left + right;
            break;
        case "-":
            result = left - right;
            break;
        case "*":
            result = left * right;
            break;
        case "/":
            if (right === 0)
                return undefined;
            result = left / right;
            break;
        default:
            return undefined;
    }
    return Number.isFinite(result) ? result : undefined;
}
export function randomInteger(minimum, maximum) {
    if (!Number.isSafeInteger(minimum) ||
        !Number.isSafeInteger(maximum) ||
        maximum < minimum ||
        maximum - minimum > 1_000_000) {
        return undefined;
    }
    return randomInt(minimum, maximum + 1);
}
export function formatJakartaTime(date = new Date()) {
    return new Intl.DateTimeFormat("id-ID", {
        dateStyle: "full",
        timeStyle: "long",
        timeZone: "Asia/Jakarta"
    }).format(date);
}
export function formatRuntime(durationMs) {
    const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
    const days = Math.floor(totalSeconds / 86_400);
    const hours = Math.floor((totalSeconds % 86_400) / 3_600);
    const minutes = Math.floor((totalSeconds % 3_600) / 60);
    const seconds = totalSeconds % 60;
    const parts = [];
    if (days)
        parts.push(`${days}d`);
    if (hours || days)
        parts.push(`${hours}h`);
    if (minutes || hours || days)
        parts.push(`${minutes}m`);
    parts.push(`${seconds}s`);
    return parts.join(" ");
}
