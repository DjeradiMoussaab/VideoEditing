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

    scenes: { min: 2, max: 100 },

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
        codec: process.platform === "darwin" ? "h264_videotoolbox" : "libx264",
        pixFmt: "yuv420p",
        hwBitrate: "10M",
        hwMaxrate: "12M",
        hwBufsize: "20M",
        clipCacheEnabled: true,
        clipRenderConcurrency: Number(process.env.CLIP_RENDER_CONCURRENCY ?? 4),
        renderProfile: process.env.RENDER_PROFILE ?? "final",
        renderProfiles: {
            final: {
                width: 1920,
                height: 1080,
                fps: 30,
                blurStrength: "40:10",
                transitionDuration: 0.8
            },
            preview: {
                width: 1280,
                height: 720,
                fps: 24,
                blurStrength: "24:6",
                transitionDuration: 0.55
            }
        },
        imageAnimationStyle: process.env.IMAGE_ANIMATION_STYLE ?? "capcut_zoom1",
        imageAnimationProfiles: {
            cinematic_drift: {
                label: "Cinematic Drift",
                estimatedM1SecPer1SecClip: 4.426,
                frameScale: 0.78,
                frameBorderPx: 12,
                motionZoomStart: 1.0,
                motionZoomMax: 1.1,
                introDurationSec: 0.55,
                introYOffsetPx: 110,
                frameDriftXPx: 26,
                frameDriftYPx: 14,
                frameDriftPeriodSec: 6
            },
            gentle_pan: {
                label: "Gentle Pan",
                estimatedM1SecPer1SecClip: 4.413,
                frameScale: 0.79,
                frameBorderPx: 12,
                motionZoomStart: 1.0,
                motionZoomMax: 1.1,
                introDurationSec: 0.5,
                introYOffsetPx: 90,
                frameDriftXPx: 18,
                frameDriftYPx: 8,
                frameDriftPeriodSec: 9
            },
            static_frame: {
                label: "Static Frame",
                estimatedM1SecPer1SecClip: 3.57,
                frameScale: 0.82,
                frameBorderPx: 12,
                motionZoomStart: 1.0,
                motionZoomMax: 1.1,
                introDurationSec: 0.35,
                introYOffsetPx: 45,
                frameDriftXPx: 0,
                frameDriftYPx: 0,
                frameDriftPeriodSec: 10
            },
            capcut_zoom1: {
                label: "CapCut Zoom 1",
                estimatedM1SecPer1SecClip: 4.05,
                frameScale: 0.72,
                frameBorderPx: 12,
                zoomMode: "capcut_zoom1",
                motionZoomStart: 1.0,
                motionZoomMax: 1.1,
                zoomInDurationSec: 1,
                zoomOutDurationSec: 1,
                introDurationSec: 0.28,
                introYOffsetPx: 24,
                frameDriftXPx: 0,
                frameDriftYPx: 0,
                frameDriftPeriodSec: 10
            }
        },
        encodePreset: "veryfast",
        transitionIds: [1,2,3],
        transitionDuration: 0.8
    },
    dirs: { input: "input", out: "out", testImages: "input/test-images", mocks: "input/mocks" },
};
