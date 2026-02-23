import path from "path";
import { config } from "./config.mjs";
import { createOpenAI } from "./services/openai.service.mjs";
import * as fsSvc from "./services/fs.service.mjs";
import * as ffmpegSvc from "./services/ffmpeg.service.mjs";

export function createContext(runOptions = {}) {
    const openai = createOpenAI();

    const INPUT_DIR = path.resolve(config.dirs.input);
    const OUT_DIR = path.resolve(config.dirs.out);
    const TEST_IMAGES_DIR = path.resolve(runOptions.testImagesDir ?? config.dirs.testImages);

    const paths = {
        inputDir: INPUT_DIR,
        outDir: OUT_DIR,
        testImagesDir: TEST_IMAGES_DIR,

        storyTxt: path.join(INPUT_DIR, "story.txt"),
        voiceMp3: path.join(INPUT_DIR, "voiceover.mp3"),

        // ✅ NEW
        referenceImage: path.join(INPUT_DIR, "reference.png"),

        planJson: path.join(OUT_DIR, "plan.json"),

        imagesDir: path.join(OUT_DIR, "images"),
        clipsDir: path.join(OUT_DIR, "clips"),

        concatTxt: path.join(OUT_DIR, "concat.txt"),
        visualsMp4: path.join(OUT_DIR, "visuals.mp4"),
        finalMp4: path.join(OUT_DIR, "final.mp4"),
        subtitlesSrt: path.join(OUT_DIR, "subtitles.srt"),
        finalSubbedMp4: path.join(OUT_DIR, "final_subbed.mp4"),

        sceneImage: (id) =>
            path.join(OUT_DIR, "images", `scene_${String(id).padStart(2, "0")}.png`),

        sceneClip: (id) =>
            path.join(OUT_DIR, "clips", `scene_${String(id).padStart(2, "0")}.mp4`)
    };

    fsSvc.ensureDir(OUT_DIR);
    fsSvc.ensureDir(paths.imagesDir);
    fsSvc.ensureDir(paths.clipsDir);

    if (!fsSvc.exists(paths.storyTxt)) throw new Error("Missing input/story.txt");
    if (!fsSvc.exists(paths.voiceMp3)) throw new Error("Missing input/voiceover.mp3");

    const storyText = fsSvc.readText(paths.storyTxt);

    // ✅ NEW
    const hasReference = fsSvc.exists(paths.referenceImage);

    return {
        config,
        openai,
        fs: fsSvc,
        ffmpeg: ffmpegSvc,
        paths,
        storyText,
        hasReference, // ✅ NEW
        runOptions: {
            useTestImages: Boolean(runOptions.useTestImages),
            testImagesDir: TEST_IMAGES_DIR
        },
        plan: null,
        clipFiles: []
    };
}
