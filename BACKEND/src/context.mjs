import path from "path";
import { config } from "./config.mjs";
import { createOpenAI } from "./services/openai.service.mjs";
import * as fsSvc from "./services/fs.service.mjs";
import * as ffmpegSvc from "./services/ffmpeg.service.mjs";

export function createContext(runOptions = {}) {
    const mockOpenAI = Boolean(runOptions.mockOpenAI);
    const openai = mockOpenAI ? null : createOpenAI();

    const INPUT_DIR = path.resolve(runOptions.inputDir ?? config.dirs.input);
    const OUT_DIR = path.resolve(runOptions.outDir ?? config.dirs.out);
    const TEST_IMAGES_DIR = path.resolve(runOptions.testImagesDir ?? config.dirs.testImages);
    const MOCKS_DIR = path.resolve(config.dirs.mocks);
    const STOCK_DIR = path.join(OUT_DIR, "stock");
    const visualSourceMode = runOptions.visualSource ?? config.visual.sourceMode;
    const validVisualModes = new Set(["image_frame", "stock_video", "hybrid", "mixed_random"]);
    if (!validVisualModes.has(visualSourceMode)) {
        throw new Error(`Invalid visual source mode "${visualSourceMode}". Use image_frame, stock_video, hybrid, or mixed_random.`);
    }

    const paths = {
        inputDir: INPUT_DIR,
        outDir: OUT_DIR,
        testImagesDir: TEST_IMAGES_DIR,
        mocksDir: MOCKS_DIR,
        stockDir: STOCK_DIR,

        storyTxt: path.join(INPUT_DIR, "story.txt"),
        voiceMp3: path.join(INPUT_DIR, "voiceover.mp3"),

        // ✅ NEW
        referenceImage: path.join(INPUT_DIR, "reference.png"),

        planJson: path.join(OUT_DIR, "plan.json"),
        sceneTimelineJson: path.join(OUT_DIR, "scene_timeline.json"),
        mockPlanJson: path.join(MOCKS_DIR, "plan.json"),

        imagesDir: path.join(OUT_DIR, "images"),
        clipsDir: path.join(OUT_DIR, "clips"),
        stockClipsDir: STOCK_DIR,

        concatTxt: path.join(OUT_DIR, "concat.txt"),
        visualsMp4: path.join(OUT_DIR, "visuals.mp4"),
        finalMp4: path.join(OUT_DIR, "final.mp4"),
        subtitlesSrt: path.join(OUT_DIR, "subtitles.srt"),
        mockSubtitlesSrt: path.join(MOCKS_DIR, "subtitles.srt"),
        finalSubbedMp4: path.join(OUT_DIR, "final_subbed.mp4"),

        sceneImage: (id) =>
            path.join(OUT_DIR, "images", `scene_${String(id).padStart(2, "0")}.png`),

        sceneClip: (id) =>
            path.join(OUT_DIR, "clips", `scene_${String(id).padStart(2, "0")}.mp4`),

        sceneStockVideo: (id) =>
            path.join(STOCK_DIR, `scene_${String(id).padStart(2, "0")}.mp4`)
    };

    fsSvc.ensureDir(OUT_DIR);
    fsSvc.ensureDir(paths.imagesDir);
    fsSvc.ensureDir(paths.clipsDir);
    fsSvc.ensureDir(paths.stockClipsDir);

    if (!fsSvc.exists(paths.voiceMp3)) throw new Error("Missing input/voiceover.mp3");

    const storyText = fsSvc.exists(paths.storyTxt) ? fsSvc.readText(paths.storyTxt) : "";

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
        visualSourceMode,
        runOptions: {
            useTestImages: Boolean(runOptions.useTestImages),
            testImagesDir: TEST_IMAGES_DIR,
            mockOpenAI,
            visualSource: visualSourceMode
        },
        plan: null,
        clipFiles: [],
        sceneVisualChoices: {},
        sceneVisuals: {}
    };
}
