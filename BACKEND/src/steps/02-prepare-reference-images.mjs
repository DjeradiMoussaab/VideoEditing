import fs from "fs";
import path from "path";

function collectImageFiles(dir) {
    if (!dir || !fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return [];
    return fs
        .readdirSync(dir)
        .filter((name) => /\.(png|jpe?g|webp)$/i.test(name))
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
        .map((name) => path.join(dir, name));
}

function fallbackReferencePool(ctx) {
    if (ctx.runOptions.useTestImages) {
        return collectImageFiles(ctx.runOptions.testImagesDir);
    }
    return Array.isArray(ctx.referenceImages) ? ctx.referenceImages.filter((p) => fs.existsSync(p)) : [];
}

export async function prepareReferenceImagesStep(ctx) {
    if (ctx.visualSourceMode === "stock_video") return ctx;

    const fallbackReferences = fallbackReferencePool(ctx);
    const maxReferenceReuse = Math.max(1, Number(ctx.runOptions.maxReferenceReuse ?? 2));
    const fallbackUsage = new Map();

    for (const scene of ctx.plan.scenes) {
        const choice = ctx.sceneVisualChoices[scene.scene_id];
        if (choice !== "image") continue;

        let mapped = ctx.sceneVisuals[scene.scene_id];
        if (!mapped?.path || !fs.existsSync(mapped.path)) {
            const fallbackPath = fallbackReferences.find((refPath) => {
                const used = fallbackUsage.get(refPath) || 0;
                return used < maxReferenceReuse;
            });
            if (fallbackPath) {
                fallbackUsage.set(fallbackPath, (fallbackUsage.get(fallbackPath) || 0) + 1);
                mapped = {
                    type: "image",
                    path: fallbackPath,
                    source: ctx.runOptions.useTestImages ? "test_images" : "reference"
                };
            }
        }

        if (!mapped?.path || !fs.existsSync(mapped.path)) {
            throw new Error(
                `No reference image available for scene ${scene.scene_id}. Upload more references or reduce Max images.`
            );
        }

        ctx.sceneVisuals[scene.scene_id] = {
            ...mapped,
            type: "image",
            source: mapped.source || "reference"
        };

        if (typeof ctx.onSceneImageReady === "function") {
            ctx.onSceneImageReady({
                sceneId: scene.scene_id,
                source: ctx.sceneVisuals[scene.scene_id].source,
                cached: true
            });
        }
    }

    return ctx;
}
