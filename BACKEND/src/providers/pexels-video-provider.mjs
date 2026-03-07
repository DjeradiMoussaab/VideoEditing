import fs from "fs";

const PEXELS_API_BASE = "https://api.pexels.com/videos/search";
const RETRY_BASE_DELAY_MS = 800;

export class PexelsVideoProvider {
    constructor(ctx) {
        this.ctx = ctx;
        this.apiKey = process.env.PEXELS_API_KEY;
        if (!this.apiKey) {
            throw new Error("Missing PEXELS_API_KEY for stock video mode");
        }
    }

    async searchVideos({ query, perPage }) {
        return this.#withRetry(async () => {
            const url = new URL(PEXELS_API_BASE);
            url.searchParams.set("query", query);
            url.searchParams.set("per_page", String(perPage));
            url.searchParams.set("orientation", "landscape");

            const res = await fetch(url, {
                headers: { Authorization: this.apiKey }
            });
            if (!res.ok) {
                throw new Error(`Pexels search failed (${res.status})`);
            }

            const json = await res.json();
            return json.videos ?? [];
        }, { label: `Pexels search query="${query}"`, retries: 2 });
    }

    async downloadVideoFile(url, outPath) {
        await this.#withRetry(async () => {
            const res = await fetch(url);
            if (!res.ok) {
                throw new Error(`Pexels download failed (${res.status})`);
            }
            const ab = await res.arrayBuffer();
            fs.writeFileSync(outPath, Buffer.from(ab));
        }, { label: `Pexels download url="${url}"`, retries: 2 });
    }

    async #withRetry(fn, { label = "operation", retries = 2 } = {}) {
        let lastError = null;
        for (let attempt = 0; attempt <= retries; attempt++) {
            try {
                return await fn();
            } catch (err) {
                lastError = err;
                if (attempt >= retries) break;
                const delay = RETRY_BASE_DELAY_MS * (attempt + 1);
                await new Promise((resolve) => setTimeout(resolve, delay));
            }
        }
        const original = lastError instanceof Error ? lastError.message : String(lastError);
        throw new Error(`${label} failed after ${retries + 1} attempts. Original error: ${original}`);
    }
}
