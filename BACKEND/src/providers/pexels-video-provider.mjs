import fs from "fs";

const PEXELS_API_BASE = "https://api.pexels.com/videos/search";

export class PexelsVideoProvider {
    constructor(ctx) {
        this.ctx = ctx;
        this.apiKey = process.env.PEXELS_API_KEY;
        if (!this.apiKey) {
            throw new Error("Missing PEXELS_API_KEY for stock video mode");
        }
    }

    async searchVideos({ query, perPage }) {
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
    }

    async downloadVideoFile(url, outPath) {
        const res = await fetch(url);
        if (!res.ok) {
            throw new Error(`Pexels download failed (${res.status})`);
        }
        const ab = await res.arrayBuffer();
        fs.writeFileSync(outPath, Buffer.from(ab));
    }
}
