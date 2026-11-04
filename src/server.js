import { createBot } from "./bot.js";
import { loadConfig } from "./config.js";
import { createDatabase, initializeDatabase } from "./db.js";
const config = loadConfig();
const pool = createDatabase(config.databaseUrl);
const bot = createBot(config, pool);
try {
    await initializeDatabase(pool);
    for (const signal of ["SIGINT", "SIGTERM"]) {
        process.once(signal, () => {
            bot.stop();
        });
    }
    await bot.start({
        onStart: (botInfo) => {
            console.log(`BalzzX-MD @${botInfo.username} is running (long polling).`);
        }
    });
}
catch (error) {
    console.error("Bot startup failed:", error);
    process.exitCode = 1;
}
finally {
    await pool.end();
}
