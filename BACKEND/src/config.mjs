import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BACKEND_ROOT = path.resolve(__dirname, "..");

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
        planner: "gpt-4.1-mini",
        quoteRefiner: "gpt-5-mini",
        referenceCaption: "gpt-4.1-mini",
        referenceScoring: "gpt-4.1-mini",
        transcribe: "whisper-1",
    },

    scenes: { min: 2, max: 250 },

    visual: {
        sourceMode: process.env.VISUAL_SOURCE_MODE ?? "mixed_random",
        fallbackToImagesWhenNoStock: true,
        sceneDurationSec: {
            image: {
                min: 4,
                max: 6
            },
            video: {
                min: 5,
                max: 10
            }
        },
        decision: {
            stockProbability: 0.4
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
        fps: 60,
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
                fps: 60,
                blurStrength: "40:10",
                transitionDuration: 0.8
            },
            preview: {
                width: 1280,
                height: 720,
                fps: 30,
                blurStrength: "24:6",
                transitionDuration: 0.55
            }
        },
        imageAnimationStyle: process.env.IMAGE_ANIMATION_STYLE ?? "surprise_animation",
        imageAnimationProfiles: {
            fullscreen_zoom: {
                label: "Fullscreen Zoom",
                estimatedM1SecPer1SecClip: 2.95,
                zoomMode: "fullscreen_zoom",
                motionZoomStart: 1.0,
                motionZoomMax: 1.25
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
            surprise_animation: {
                label: "Surprise animation",
                estimatedM1SecPer1SecClip: 4.46,
                frameScale: 0.74,
                frameBorderPx: 12,
                frameBorderColor: "white",
                look: "surprise_animation",
                zoomMode: "surprise_animation",
                motionZoomStart: 0.88,
                motionZoomMax: 1.085,
                introDurationSec: 0.52,
                introYOffsetPx: 14,
                frameDriftXPx: 3,
                frameDriftYPx: 2,
                frameDriftPeriodSec: 18
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
        transitionDuration: 0.8,
        surpriseSfxPath: process.env.SURPRISE_SFX_PATH ?? path.join(BACKEND_ROOT, "assets", "sfx", "surprise_animation.m4a"),
        surpriseSfxTrimSec: Number(process.env.SURPRISE_SFX_TRIM_SEC ?? 0.95),
        surpriseSfxVolume: Number(process.env.SURPRISE_SFX_VOLUME ?? 0.9)
    },
    dirs: { input: "input", out: "out", testImages: "input/test-images", mocks: "input/mocks" },
};
