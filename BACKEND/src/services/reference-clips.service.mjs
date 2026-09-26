import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
const VERSION = 1;
export const MAX_REFERENCE_CLIPS = 30;
const videoExtensions = new Set(['.mp4', '.mov', '.webm', '.m4v', '.mkv', '.avi']);

export function validateReferenceClipFiles(files = []) {
    if (files.length > MAX_REFERENCE_CLIPS) throw Object.assign(new Error(`Add at most ${MAX_REFERENCE_CLIPS} reference clips.`), { statusCode: 400 });
    for (const file of files) {
        if (!videoExtensions.has(path.extname(file.originalname || '').toLowerCase())) {
            throw Object.assign(new Error(`Unsupported reference clip: ${file.originalname}. Use MP4, MOV, WebM, M4V, MKV or AVI.`), { statusCode: 400 });
        }
    }
}

export async function probeReferenceClip(file) {
    const { stdout } = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type,width,height,duration', '-of', 'json', file], { timeout: 30000 });
    const data = JSON.parse(stdout);
    const video = data.streams?.find(stream => stream.codec_type === 'video' && stream.width > 0 && stream.height > 0);
    const duration = Number(video?.duration || data.format?.duration);
    if (!video || !Number.isFinite(duration) || duration <= 0 || duration > 60) {
        throw new Error('Reference clips must contain video and be between 0 and 60 seconds long.');
    }
    return { duration, width: video.width, height: video.height };
}

async function fingerprint(file) {
    const hash = createHash('sha256');
    for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
    return hash.digest('hex');
}

export function sampleClipTimes(duration, cuts = [], dense = false) {
    const last = Math.max(0, duration - Math.min(.12, duration / 10));
    const anchors = Array.from({ length: dense ? 8 : 4 }, (_, i) => last * i / (dense ? 7 : 3));
    const selected = [...anchors];
    for (const cut of cuts) {
        const t = Math.min(last, Math.max(0, cut + .08));
        if (selected.length >= (dense ? 10 : 6)) break;
        if (selected.every(value => Math.abs(value - t) > .2)) selected.push(t);
    }
    return [...new Set(selected.map(t => Number(t.toFixed(3))))].sort((a, b) => a - b);
}

async function extractFrames(file, directory, duration, dense = false) {
    fs.mkdirSync(directory, { recursive: true });
    // Cut detection runs locally; no audio or video file is sent to the API.
    const { stderr } = await run('ffmpeg', ['-hide_banner', '-i', file, '-an', '-vf', "scale=160:-2,select='gt(scene,0.25)',showinfo", '-vsync', 'vfr', '-f', 'null', '-'], { timeout: 120000, maxBuffer: 4 * 1024 * 1024 });
    const cuts = [...stderr.matchAll(/pts_time:([\d.]+)/g)].map(match => Number(match[1]));
    const times = sampleClipTimes(duration, cuts, dense);
    const frames = [];
    let previousPixels;
    for (const time of times) {
        const target = path.join(directory, `${time.toFixed(3)}.jpg`);
        await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-ss', String(time), '-i', file, '-an', '-frames:v', '1', '-vf', 'scale=640:640:force_original_aspect_ratio=decrease:force_divisible_by=2', '-q:v', '5', target], { timeout: 30000 });
        if (!fs.existsSync(target) || !fs.statSync(target).size) continue;
        const { stdout: pixels } = await run('ffmpeg', ['-v', 'error', '-i', target, '-vf', 'scale=32:18,format=gray', '-frames:v', '1', '-f', 'rawvideo', '-'], { encoding: 'buffer', timeout: 30000 });
        const difference = previousPixels ? pixels.reduce((sum, value, i) => sum + Math.abs(value - previousPixels[i]), 0) / pixels.length : 255;
        // Keep first/last for temporal context, omit virtually identical intermediate frames.
        if (difference < 2 && time !== times.at(-1)) continue;
        frames.push({ time, path: target });
        previousPixels = pixels;
    }
    if (!frames.length) throw new Error('Could not decode reference clip frames.');
    return frames;
}

export function normalizeClipAnalysis(data, duration) {
    const caption = String(data?.caption || '').trim().slice(0, 800);
    if (!caption) throw new Error('Clip analysis returned no description.');
    const start = Number(data.usable_start_sec ?? 0);
    const end = Number(data.usable_end_sec ?? duration);
    // Invalid estimates must never produce an out-of-bounds trim.
    const valid = Number.isFinite(start) && Number.isFinite(end) && start >= 0 && end <= duration && end > start;
    return {
        caption,
        tags: Array.isArray(data.tags) ? data.tags.map(String).slice(0, 8) : [],
        usableStartSec: valid ? start : 0,
        usableEndSec: valid ? end : duration,
        needsMoreFrames: data.needs_more_frames === true
    };
}

async function describeClip(openai, model, frames, duration) {
    const content = [{ type: 'text', text: `Describe this silent video from ordered timestamped samples. Duration ${duration}s. Be factual; do not infer identity, speech or unseen events. Return JSON: {"caption":"concise subject, setting, visible action and changes over time", "tags":["up to 8 tags"], "usable_start_sec":0, "usable_end_sec":${duration}, "needs_more_frames":false}. Keep the entire clip usable unless sampled frames show a blank/broken opening or ending. Times are approximate. Set needs_more_frames true only if important action is unclear between samples. No more than 150 words.` }];
    for (const frame of frames) {
        content.push({ type: 'text', text: `${frame.time}s` }, { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${fs.readFileSync(frame.path).toString('base64')}` } });
    }
    const response = await openai.chat.completions.create({
        model, ...(model === 'gpt-6-luna' ? { reasoning_effort: 'low' } : {}),
        messages: [{ role: 'user', content }], response_format: { type: 'json_object' }, max_completion_tokens: 1600
    });
    return { ...normalizeClipAnalysis(JSON.parse(response.choices?.[0]?.message?.content || '{}'), duration), usage: response.usage || {} };
}

export function referenceClipCatalog(paths = [], index = {}) {
    return paths.map((file, i) => ({
        ...index[file], id: `clip_${i + 1}`, path: file, filename: path.basename(file), type: 'video'
    }));
}

export async function buildReferenceClipCatalog({ paths = [], cacheIndex = {}, directory, openai, model, onProgress = () => {}, probe = probeReferenceClip, extract = extractFrames }) {
    const index = { ...cacheIndex };
    const catalog = [];
    const stats = { cached: 0, analysed: 0, failed: 0, promptTokens: 0, completionTokens: 0 };
    for (const [i, file] of paths.entries()) {
        const signature = `${VERSION}|${model}|${await fingerprint(file)}`;
        const cached = Object.values(index).find(item => item.signature === signature && item.status === 'ready');
        if (cached && fs.existsSync(cached.thumbnailPath || '')) {
            index[file] = { ...cached };
            stats.cached++;
        } else {
            try {
                const info = await probe(file);
                const frameDir = path.join(directory, createHash('sha256').update(signature).digest('hex'));
                let frames = await extract(file, frameDir, info.duration);
                const firstFrames = frames;
                let analysis;
                if (openai) {
                    analysis = await describeClip(openai, model, frames, info.duration);
                    if (analysis.needsMoreFrames) {
                        frames = await extract(file, frameDir, info.duration, true);
                        const second = await describeClip(openai, model, frames, info.duration);
                        second.usage = {
                            prompt_tokens: Number(analysis.usage.prompt_tokens || 0) + Number(second.usage.prompt_tokens || 0),
                            completion_tokens: Number(analysis.usage.completion_tokens || 0) + Number(second.usage.completion_tokens || 0)
                        };
                        analysis = second;
                    }
                } else {
                    analysis = { caption: '', tags: [], usableStartSec: 0, usableEndSec: info.duration };
                }
                stats.analysed++;
                stats.promptTokens += Number(analysis.usage?.prompt_tokens || 0);
                stats.completionTokens += Number(analysis.usage?.completion_tokens || 0);
                index[file] = { signature, ...info, ...analysis, thumbnailPath: firstFrames[0].path, frameCount: frames.length, status: openai ? 'ready' : 'unanalysed' };
            } catch (error) {
                // Failure is visible and retryable; never cache a made-up successful caption.
                stats.failed++;
                index[file] = { signature, status: 'failed', error: String(error.message || error).slice(0, 300), caption: '', tags: [] };
            }
        }
        catalog.push({ ...index[file], id: `clip_${i + 1}`, path: file, filename: path.basename(file), type: 'video' });
        await onProgress({ completed: i + 1, total: paths.length, index, clip: catalog.at(-1) });
    }
    return { catalog, index, stats };
}

