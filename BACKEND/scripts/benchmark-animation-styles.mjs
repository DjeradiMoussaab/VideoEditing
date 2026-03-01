import fs from "fs";
import path from "path";
import child_process from "child_process";
import { config } from "../src/config.mjs";

function parseArg(name, fallback) {
    const idx = process.argv.indexOf(name);
    if (idx === -1) return fallback;
    const next = process.argv[idx + 1];
    if (!next) return fallback;
    const num = Number(next);
    return Number.isFinite(num) ? num : fallback;
}

function ensureDir(p) {
    fs.mkdirSync(p, { recursive: true });
}

function runCmd(cmd, quiet = true) {
    child_process.execSync(cmd, { stdio: quiet ? "ignore" : "inherit" });
}

function makeImageClipCommand({ img, clip, durationSec, profile, videoConfig }) {
    const fps = Number(videoConfig.fps);
    const frames = Math.max(2, Math.floor(durationSec * fps));
    const width = Number(videoConfig.width);
    const height = Number(videoConfig.height);
    const frameScale = Math.min(0.95, Math.max(0.5, Number(profile.frameScale ?? 0.78)));
    const borderPx = Math.max(0, Math.floor(Number(profile.frameBorderPx ?? 3)));
    const makeEven = (n) => Math.max(2, Math.floor(n / 2) * 2);
    const innerW = makeEven(width * frameScale);
    const innerH = makeEven(height * frameScale);
    const zoomStart = Number(profile.motionZoomStart ?? 1.0);
    const zoomMax = Number(profile.motionZoomMax ?? 1.03);
    const introDuration = Math.max(0.2, Number(profile.introDurationSec ?? 0.55));
    const introYOffset = Math.max(0, Number(profile.introYOffsetPx ?? 110));
    const driftX = Math.max(0, Number(profile.frameDriftXPx ?? 26));
    const driftY = Math.max(0, Number(profile.frameDriftYPx ?? 14));
    const driftPeriod = Math.max(2, Number(profile.frameDriftPeriodSec ?? 6));
    const preset = videoConfig.encodePreset ?? "veryfast";
    const zoomExpr = `${zoomStart}+(${zoomMax}-${zoomStart})*(0.5-0.5*cos(PI*on/${frames - 1}))`;
    const framedW = innerW + borderPx * 2;
    const framedH = innerH + borderPx * 2;
    const overlayXExpr = `(W-w)/2+if(lt(t,${introDuration}),0,${driftX}*sin(2*PI*(t-${introDuration})/${driftPeriod}))`;
    const overlayYExpr = `(H-h)/2+if(lt(t,${introDuration}),${introYOffset}*(1-(0.5-0.5*cos(PI*t/${introDuration}))),${driftY}*cos(2*PI*(t-${introDuration})/${driftPeriod}))`;
    const filter = [
        `[0:v]split=2[bgsrc][fgsrc]`,
        `[bgsrc]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},boxblur=40:10[bg]`,
        `[fgsrc]scale=${innerW}:${innerH}:force_original_aspect_ratio=decrease,pad=${innerW}:${innerH}:(ow-iw)/2:(oh-ih)/2:color=black,pad=${framedW}:${framedH}:${borderPx}:${borderPx}:color=black,format=rgba,fade=t=in:st=0:d=${introDuration}:alpha=1[framed]`,
        `[bg][framed]overlay=x='${overlayXExpr}':y='${overlayYExpr}':format=auto[composed]`,
        `[composed]zoompan=z='${zoomExpr}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:fps=${fps}:s=${width}x${height},format=yuv420p[vout]`
    ].join(";");

    return [
        `ffmpeg -y -loop 1 -framerate ${fps} -t ${durationSec} -i "${img}"`,
        `-filter_complex "${filter}"`,
        `-map "[vout]"`,
        `-frames:v ${frames}`,
        `-c:v libx264 -preset ${preset} -pix_fmt yuv420p`,
        `"${clip}"`
    ].join(" ");
}

function ensureSourceImage(sourcePath) {
    if (fs.existsSync(sourcePath)) return;
    const cmd = [
        `ffmpeg -y -f lavfi -i "testsrc2=size=1536x1024:rate=1"`,
        `-frames:v 1 "${sourcePath}"`
    ].join(" ");
    runCmd(cmd, true);
}

function formatSec(v) {
    return `${v.toFixed(3)}s`;
}

function main() {
    const durationSec = Math.max(0.5, parseArg("--duration", 1));
    const iterations = Math.max(1, Math.floor(parseArg("--iterations", 3)));
    const quiet = !process.argv.includes("--verbose");

    const benchDir = path.resolve("BACKEND/out/bench-animation");
    const sourcePath = path.join(benchDir, "source.png");
    ensureDir(benchDir);
    ensureSourceImage(sourcePath);

    const styles = Object.entries(config.video.imageAnimationProfiles || {});
    if (!styles.length) {
        console.error("No animation styles found in config.video.imageAnimationProfiles");
        process.exit(1);
    }

    console.log(`Benchmarking image animation styles`);
    console.log(`Resolution: ${config.video.width}x${config.video.height} @ ${config.video.fps}fps`);
    console.log(`Clip duration per test: ${durationSec}s | Iterations: ${iterations}`);
    console.log("");

    const results = [];
    for (const [styleId, profile] of styles) {
        const samples = [];
        for (let i = 0; i < iterations; i++) {
            const clip = path.join(benchDir, `${styleId}_${i + 1}.mp4`);
            const cmd = makeImageClipCommand({
                img: sourcePath,
                clip,
                durationSec,
                profile,
                videoConfig: config.video
            });

            const start = process.hrtime.bigint();
            runCmd(cmd, quiet);
            const end = process.hrtime.bigint();
            const elapsedSec = Number(end - start) / 1e9;
            samples.push(elapsedSec);
        }

        const avg = samples.reduce((s, v) => s + v, 0) / samples.length;
        const sorted = [...samples].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        const median = sorted.length % 2 === 0
            ? (sorted[mid - 1] + sorted[mid]) / 2
            : sorted[mid];

        results.push({
            styleId,
            label: profile.label || styleId,
            avg,
            median
        });

        console.log(`${styleId} (${profile.label || styleId}) -> avg ${formatSec(avg)} | median ${formatSec(median)}`);
    }

    console.log("");
    console.log("Sorted by avg render time:");
    const ranked = [...results].sort((a, b) => a.avg - b.avg);
    for (const r of ranked) {
        console.log(`- ${r.styleId}: ${formatSec(r.avg)} per ${durationSec}s clip`);
    }
}

main();
