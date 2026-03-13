import "dotenv/config";
import { generateFinalVideo } from "../services/pipeline-backend.service.mjs";
import { loadManifest, saveManifest } from "../services/job-store.service.mjs";

async function main() {
    const jobId = process.argv[2];
    if (!jobId) {
        throw new Error("Missing jobId argument");
    }
    console.log(`[final-job] started jobId=${jobId} pid=${process.pid}`);

    try {
        console.log(`[final-job] calling generateFinalVideo jobId=${jobId}`);
        await generateFinalVideo(jobId);
        console.log(`[final-job] completed jobId=${jobId}`);
    } catch (error) {
        console.error(`[final-job] failed jobId=${jobId}: ${error?.message || error}`);
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
