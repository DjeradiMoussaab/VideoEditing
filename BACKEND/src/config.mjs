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
    6: "circleopen",
    7: "fadeblack",
    8: "fadewhite"
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
            stockProbability: 0.4,
            // Target share of scenes rendered as a quote card. `target` is the aim; the
            // deterministic selection in quote-timeline-refiner.service.mjs clamps the
            // actual count to [min, max] of the total scene count.
            quoteRatio: { min: 0.10, max: 0.20, target: 0.15 }
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
        codec: process.env.VIDEO_CODEC || (process.platform === "darwin" ? "h264_videotoolbox" : "libx264"),
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
                sceneFit: "Neutral general b-roll with no strong period or emotional cue - the safe default treatment for present-moment narration.",
                estimatedM1SecPer1SecClip: 2.7,
                zoomMode: "fullscreen_zoom_in",
                motionZoomStart: 1.0,
                motionZoomMax: 1.3
            },
            fullscreen_zoom_out: {
                label: "Fullscreen Zoom Out",
                description: "A calm 30% pullback to reveal the wider moment.",
                sceneFit: "Neutral general b-roll; also good for narration about revealing context or 'stepping back to see the full picture', or for visual variety right after a zoom-in scene.",
                estimatedM1SecPer1SecClip: 2.7,
                zoomMode: "fullscreen_zoom_out",
                motionZoomStart: 1.3,
                motionZoomMax: 1.0
            },
            documentary_frame: {
                label: "Documentary • Midnight",
                description: "Crisp gallery mount, soft cast shadow and an image-toned midnight backdrop.",
                sceneFit: "Serious, somber, investigative, or nighttime/tense narration beats - presented like a portrait or piece of evidence, without going full vintage.",
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
                sceneFit: "Warm, nostalgic, gentle-memory narration beats - softer and less heavy than the vintage/historical treatments below, good for family-memory or sentimental moments.",
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
                label: "Vintage • Paper",
                description: "Original vintage paper, stamps, handwriting and film overlays. Silent motion fitted to the full scene duration, without a caption banner.",
                sceneFit: "Strongly historical/period narration - old documents, decades past, explicit 'back then' framing. Visually heavy - use for a few standout old-time beats, not neutral narration.",
                treatment: "vintage",
                estimatedM1SecPer1SecClip: 3.2
            },
            archive_stack: {
                label: "Historical • Memories",
                description: "Ink-revealed archival print with original paper, frame, film damage, particles and moving light leaks. Silent motion fitted to the full scene duration without text.",
                sceneFit: "A dramatic 'uncovering an old record or memory' pivotal beat - similar territory to Vintage • Paper but with a more active reveal motion; save for a standout historical/memory moment.",
                treatment: "historical",
                estimatedM1SecPer1SecClip: 3.2
            },
            history_slideshow: {
                label: "History • Slideshow",
                description: "Black-and-white photograph revealed through drifting clouds, paper texture and film grain. Silent motion fitted to the full scene duration without text.",
                sceneFit: "Reflective, dreamlike, past-tense remembrance or memorial-feeling beats - softer and more ethereal than the archive/vintage treatments, good for 'looking back' moments.",
                treatment: "history_slideshow",
                estimatedM1SecPer1SecClip: 3.2
            },
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
