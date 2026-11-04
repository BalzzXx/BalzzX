import "dotenv/config";
import { z } from "zod";

const schema = z.object({
    BOT_TOKEN: z.string().min(1, "Set BOT_TOKEN in .env using a fresh token from BotFather"),
    BOT_ADMIN_IDS: z.string().min(1).default("6388490164"),
    DATABASE_PATH: z.string().min(1).default("./data/balzzx.sqlite"),
    MENU_MEDIA_URL: z.string().url().default("https://kappa.lol/5VJjsi"),
    NEOXR_API_URL: z.string().url().default("https://api.neoxr.eu/api/gpt-pro"),
    NEOXR_PINTEREST_URL: z.string().url().default("https://api.neoxr.eu/api/pinterest-v2"),
    NEOXR_IQC_URL: z.string().url().default("https://api.neoxr.eu/api/iqc"),
    NEOXR_UPSCALE_URL: z.string().url().default("https://api.neoxr.eu/api/upscale"),
    NEOXR_API_KEY: z.string().optional()
});

export function loadConfig() {
    const parsed = schema.safeParse(process.env);
    if (!parsed.success)
        throw new Error(`Invalid configuration: ${parsed.error.message}`);
    const adminIds = parsed.data.BOT_ADMIN_IDS.split(",").map((id) => id.trim());
    if (adminIds.some((id) => !/^\d+$/.test(id)))
        throw new Error("BOT_ADMIN_IDS must be a comma-separated list of Telegram numeric IDs");
    return {
        token: parsed.data.BOT_TOKEN,
        adminIds: new Set(adminIds),
        databasePath: parsed.data.DATABASE_PATH,
        menuMediaUrl: parsed.data.MENU_MEDIA_URL,
        aiApiUrl: parsed.data.NEOXR_API_URL,
        pinterestApiUrl: parsed.data.NEOXR_PINTEREST_URL,
        iqcApiUrl: parsed.data.NEOXR_IQC_URL,
        upscaleApiUrl: parsed.data.NEOXR_UPSCALE_URL,
        aiApiKey: parsed.data.NEOXR_API_KEY
    };
}
