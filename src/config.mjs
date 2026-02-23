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

    scenes: { min: 2, max: 10 },

    image: { size: "1536x1024", quality: "high" },

    video: {
        width: 1920,
        height: 1080,
        fps: 30,
        zoomStart: 1.0,
        zoomMax: 1.12,
        zoomSupersample: 1.5,
        encodePreset: "veryfast",
        transitionIds: [1,2,5],
        transitionDuration: 0.6
    },
    dirs: { input: "input", out: "out", testImages: "input/test-images" },
};
