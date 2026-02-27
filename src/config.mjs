export const VIDEO_TRANSITIONS = {
    1: "fade",
    2: "smoothleft",
    3: "smoothright",
    4: "wipeleft",
    5: "wiperight",
    6: "circleopen"
};

export const config = {
    models: {
        planner: "gpt-4.1-nano",
        image: "gpt-image-1-mini",
        transcribe: "whisper-1",
    },

    scenes: { min: 2, max: 20 },

    image: { size: "1536x1024", quality: "low" },

    visual: {
        sourceMode: process.env.VISUAL_SOURCE_MODE ?? "mixed_random",
        fallbackToImagesWhenNoStock: true,
        sceneMinDurationSec: 6,
        sceneMaxDurationSec: 15,
        decision: {
            stockProbability: 0.75
        }
    },

    stock: {
        provider: "pexels",
        perPage: 15,
        minDurationSec: 3,
        maxDurationSec: 40,
        preferredWidth: 1920,
        preferredHeight: 1080
    },

    video: {
        width: 1920,
        height: 1080,
        fps: 30,
        frameScale: 0.78,
        frameBorderPx: 3,
        motionZoomStart: 1.0,
        motionZoomMax: 1.03,
        introDurationSec: 0.55,
        introYOffsetPx: 110,
        frameDriftXPx: 26,
        frameDriftYPx: 14,
        frameDriftPeriodSec: 6,
        encodePreset: "veryfast",
        transitionIds: [1,2,5],
        transitionDuration: 1.5
    },
    dirs: { input: "input", out: "out", testImages: "input/test-images", mocks: "input/mocks" },
};
