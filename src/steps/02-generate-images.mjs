import { OpenAIImageProvider } from "../providers/openai-image-provider.mjs";
import fs from "fs";
import path from "path";

function getImageFiles(dir) {
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
        throw new Error(`Test images directory not found: ${dir}`);
    }

    const files = fs
        .readdirSync(dir)
        .filter((name) => /\.(png|jpe?g|webp)$/i.test(name))
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

    if (files.length === 0) {
        throw new Error(`No images found in test directory: ${dir}`);
    }

    return files;
}

function findBySceneId(files, sceneId) {
    const padded = String(sceneId).padStart(2, "0");
    const match = files.find((name) => new RegExp(`^scene_${padded}\\.(png|jpe?g|webp)$`, "i").test(name));
    return match ?? null;
}

export async function generateImagesStep(ctx) {
    if (ctx.visualSourceMode === "stock_video") return ctx;
    const allowFallback = Boolean(ctx.config.visual.fallbackToImagesWhenNoStock);

    if (ctx.runOptions.useTestImages) {
        const files = getImageFiles(ctx.runOptions.testImagesDir);

        if (files.length < ctx.plan.scenes.length) {
            throw new Error(
                `Not enough test images in ${ctx.runOptions.testImagesDir}. Need ${ctx.plan.scenes.length}, found ${files.length}.`
            );
        }

        for (let i = 0; i < ctx.plan.scenes.length; i++) {
            const scene = ctx.plan.scenes[i];
            const wantedVideo = ctx.sceneVisualChoices[scene.scene_id] === "video";
            const hasStock = ctx.fs.exists(ctx.paths.sceneStockVideo(scene.scene_id));
            if (wantedVideo && hasStock) continue;
            if (wantedVideo && !allowFallback) continue;
            const out = ctx.paths.sceneImage(scene.scene_id);
            if (ctx.fs.exists(out)) {
                if (wantedVideo && !hasStock) ctx.sceneVisualChoices[scene.scene_id] = "image";
                ctx.sceneVisuals[scene.scene_id] = { type: "image", path: out };
                continue;
            }

            const byId = findBySceneId(files, scene.scene_id);
            const sourceName = byId ?? files[i];
            const sourcePath = path.join(ctx.runOptions.testImagesDir, sourceName);
            ctx.ffmpeg.exec(`ffmpeg -y -i "${sourcePath}" -frames:v 1 "${out}"`);
            if (wantedVideo && !hasStock) ctx.sceneVisualChoices[scene.scene_id] = "image";
            ctx.sceneVisuals[scene.scene_id] = { type: "image", path: out };
        }

        return ctx;
    }

    const provider = new OpenAIImageProvider(ctx);

    for (const s of ctx.plan.scenes) {
        const wantedVideo = ctx.sceneVisualChoices[s.scene_id] === "video";
        const hasStock = ctx.fs.exists(ctx.paths.sceneStockVideo(s.scene_id));
        if (wantedVideo && hasStock) continue;
        if (wantedVideo && !allowFallback) continue;
        const out = ctx.paths.sceneImage(s.scene_id);
        if (ctx.fs.exists(out)) {
            if (wantedVideo && !hasStock) ctx.sceneVisualChoices[s.scene_id] = "image";
            ctx.sceneVisuals[s.scene_id] = { type: "image", path: out };
            continue;
        }

        await provider.generate({
            scene: s,
            outPath: out,
            styleGuide: ctx.plan.style_guide,
            referenceImagePath: ctx.hasReference ? ctx.paths.referenceImage : null
        });
        if (wantedVideo && !hasStock) ctx.sceneVisualChoices[s.scene_id] = "image";
        ctx.sceneVisuals[s.scene_id] = { type: "image", path: out };
    }

    return ctx;
}
