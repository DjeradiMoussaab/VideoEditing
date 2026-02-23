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
        image: "gpt-image-1",
        transcribe: "whisper-1",
    },

    scenes: { min: 2, max: 4 },

    image: { size: "1536x1024", quality: "high" },

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
