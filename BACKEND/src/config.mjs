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
        planner: "gpt-6-luna",
        quoteRefiner: "gpt-6-luna",
        referenceCaption: "gpt-6-luna",
        referenceScoring: "gpt-6-luna",
        transcribe: "whisper-1",
    },

    scenes: { min: 2, max: 500 },

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
        imageAnimationStyle: process.env.IMAGE_ANIMATION_STYLE ?? "fullscreen_zoom_in",
        imageAnimationProfiles: {
            fullscreen_zoom_in: {
                label: "Fullscreen Zoom In",
                description: "A gentle 30% push toward the story.",
                estimatedM1SecPer1SecClip: 2.7,
                zoomMode: "fullscreen_zoom_in",
                motionZoomStart: 1.0,
                motionZoomMax: 1.3
            },
            fullscreen_zoom_out: {
                label: "Fullscreen Zoom Out",
                description: "A calm 30% pullback to reveal the wider moment.",
                estimatedM1SecPer1SecClip: 2.7,
                zoomMode: "fullscreen_zoom_out",
                motionZoomStart: 1.3,
                motionZoomMax: 1.0
            },
            cinematic_breathe: {
                label: "Cinematic Breathe",
                description: "A subtle inhale and release for emotional pauses.",
                estimatedM1SecPer1SecClip: 2.7,
                zoomMode: "fullscreen_breathe",
                motionZoomStart: 1.0,
                motionZoomMax: 1.12
            },
            documentary_frame: {
                label: "Documentary • Midnight",
                description: "Crisp gallery mount, soft cast shadow and an image-toned midnight backdrop.",
                treatment: "midnight",
                estimatedM1SecPer1SecClip: 3.0,
                frameScale: 0.84,
                frameBorderPx: 12,
                frameBorderColor: "white",
                motionZoomStart: 1.0,
                motionZoomMax: 1.035,
                introDurationSec: 0.45,
                introYOffsetPx: 22,
                frameDriftXPx: 9,
                frameDriftYPx: 5,
                frameDriftPeriodSec: 15
            },
            archival_frame: {
                label: "Archive • Paper",
                description: "Warm paper, a generous archival mount and a slow camera retreat.",
                treatment: "paper",
                estimatedM1SecPer1SecClip: 3.0,
                frameScale: 0.78,
                frameBorderPx: 14,
                frameBorderColor: "#ece6da",
                motionZoomStart: 1.06,
                motionZoomMax: 1.0,
                introDurationSec: 0.55,
                introYOffsetPx: 30,
                frameDriftXPx: 5,
                frameDriftYPx: 8,
                frameDriftPeriodSec: 18
            },
            documentary_echo: {
                label: "Documentary • Echo",
                description: "A sharp photograph between blurred memory echoes with a slow diagonal reveal.",
                treatment: "echo",
                estimatedM1SecPer1SecClip: 3.2
            },
            archive_stack: {
                label: "Archive • Layers",
                description: "Offset archival prints emerge from a warm, defocused documentary backdrop.",
                treatment: "stack",
                estimatedM1SecPer1SecClip: 3.2
            },
            documentary_glass: {
                label: "Documentary • Glass",
                description: "A luminous blurred halo frames the original photograph during a gentle breathing move.",
                treatment: "glass",
                estimatedM1SecPer1SecClip: 3.2
            },
            slow_float: {
                label: "Gallery • Float",
                description: "A floating photograph, soft depth and a diagonal camera glide.",
                treatment: "float",
                estimatedM1SecPer1SecClip: 3.0,
                frameScale: 0.8,
                frameBorderPx: 8,
                frameBorderColor: "white",
                motionZoomStart: 1.0,
                motionZoomMax: 1.025,
                introDurationSec: 0.65,
                introYOffsetPx: 36,
                frameDriftXPx: 16,
                frameDriftYPx: 9,
                frameDriftPeriodSec: 14
            },
            gentle_settle: {
                label: "Portrait • Dusk",
                description: "A fast, eased arrival over a muted plum backdrop, followed by a slow push.",
                treatment: "warm",
                estimatedM1SecPer1SecClip: 3.0,
                frameScale: 0.76,
                frameBorderPx: 12,
                frameBorderColor: "white",
                zoomMode: "capcut_zoom1",
                motionZoomStart: 0.97,
                motionZoomMax: 1.045,
                zoomInDurationSec: 1.1,
                zoomOutDurationSec: 1.2,
                introDurationSec: 0.42,
                introYOffsetPx: 20,
                frameDriftXPx: 2,
                frameDriftYPx: 2,
                frameDriftPeriodSec: 16
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
