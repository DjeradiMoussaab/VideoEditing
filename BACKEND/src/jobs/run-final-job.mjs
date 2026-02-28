import "dotenv/config";
import { generateFinalVideo } from "../services/pipeline-backend.service.mjs";
import { loadManifest, saveManifest } from "../services/job-store.service.mjs";

async function main() {
    const jobId = process.argv[2];
    if (!jobId) {
        throw new Error("Missing jobId argument");
    }

    try {
        await generateFinalVideo(jobId);
    } catch (error) {
        const manifest = loadManifest(jobId);
        if (manifest) {
            manifest.status = "FINAL_FAILED";
            manifest.progress = {
                ...(manifest.progress || {}),
                phase: "final_failed",
                percent: Number(manifest.progress?.percent || 0),
                summary: `Final render failed: ${error.message || "Unknown error"}`
            };
            saveManifest(jobId, manifest);
        }
        process.exitCode = 1;
    }
}

main();
