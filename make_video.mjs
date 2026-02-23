import fs from "fs";
import path from "path";
import child_process from "child_process";
import OpenAI from "openai";
import { z } from "zod";

const openai = new OpenAI({ apiKey: "" });

const SceneSchema = z.object({
    scene_id: z.number().int(),
    narration: z.string(),
    visual: z.string(),
    image_prompt: z.string(),
});

const StyleGuideSchema = z
    .union([z.string(), z.record(z.any())])
    .transform((v) => {
        if (typeof v === "string") return v;
        return Object.entries(v)
            .map(([k, val]) => `${k}: ${typeof val === "string" ? val : JSON.stringify(val)}`)
            .join("\n");
    });

const PlanSchema = z.object({
    title: z.string(),
    style_guide: StyleGuideSchema,
    scenes: z.array(SceneSchema).min(8).max(12),
});

const exec = (cmd) => child_process.execSync(cmd, { stdio: "inherit" });

const readText = (p) => fs.readFileSync(p, "utf8");
const ensureDir = (p) => fs.mkdirSync(p, { recursive: true });

const INPUT_DIR = path.resolve("input");
const OUT_DIR = path.resolve("out");
ensureDir(OUT_DIR);

const storyPath = path.join(INPUT_DIR, "story.txt");
const voicePath = path.join(INPUT_DIR, "voiceover.mp3");

if (!fs.existsSync(storyPath)) throw new Error("Missing input/story.txt");
if (!fs.existsSync(voicePath)) throw new Error("Missing input/voiceover.mp3");

const story = readText(storyPath);

async function planScenes(storyText) {
    const system = `
You are a video producer for YouTube storytelling/news.
Create 8 to 12 scenes. Each scene should be a single clear visual idea.

Return JSON only with:
{
  "title": string,
  "style_guide": string,   <-- MUST be a single string, not an object/array
  "scenes": [
    { "scene_id": number, "narration": string, "visual": string, "image_prompt": string }
  ]
}

Rules:
- narration chunks short and in order.
- image_prompt cinematic, photoreal, 16:9, consistent style.
- avoid text in images.
`;
    const resp = await openai.chat.completions.create({
        model: "gpt-4.1-nano",
        messages: [
            { role: "system", content: system },
            { role: "user", content: storyText },
        ],
        response_format: { type: "json_object" },
    });

    const json = JSON.parse(resp.choices[0].message.content);
    return PlanSchema.parse(json);
}

async function genImage(prompt, outPath, model = "gpt-image-1-mini") {
    const r = await openai.images.generate({
        model,
        prompt,
        size: "1536x1024",
        quality: "low",
    });

    const b64 = r.data[0].b64_json;
    fs.writeFileSync(outPath, Buffer.from(b64, "base64"));
}

function getAudioDurationSeconds(audioFile) {
    const cmd = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${audioFile}"`;
    const out = child_process.execSync(cmd).toString().trim();
    return Number(out);
}

function writeConcatFile(videoFiles, concatPath) {
    const lines = videoFiles.map((vf) => `file '${vf.replace(/'/g, "'\\''")}'`).join("\n");
    fs.writeFileSync(concatPath, lines + "\n");
}

function buildStillVideo(imagePath, seconds, outVideoPath) {
    const d = Math.max(1, seconds);
    const fps = 30;
    const frames = Math.floor(d * fps);
    const cmd = [
        `ffmpeg -y -loop 1 -i "${imagePath}"`,
        `-vf "scale=1920:1080,zoompan=z='min(zoom+0.0009,1.12)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=1920x1080,format=yuv420p"`,
        `-t ${d}`,
        `-r ${fps}`,
        `"${outVideoPath}"`,
    ].join(" ");
    exec(cmd);
}

async function transcribeToSrt(audioFile, outSrtPath) {
    const file = fs.createReadStream(audioFile);
    const r = await openai.audio.transcriptions.create({
        file,
        model: "whisper-1",
        response_format: "srt",
    });
    fs.writeFileSync(outSrtPath, r);
}

function burnSubtitles(inVideo, srtPath, outVideo) {
    const cmd = `ffmpeg -y -i "${inVideo}" -vf "subtitles=${srtPath.replace(/\\/g, "/")}" "${outVideo}"`;
    exec(cmd);
}

async function main() {
    const planPath = path.join(OUT_DIR, "plan.json");
    const imagesDir = path.join(OUT_DIR, "images");
    const clipsDir = path.join(OUT_DIR, "clips");
    ensureDir(imagesDir);
    ensureDir(clipsDir);

    const plan = await planScenes(story);
    fs.writeFileSync(planPath, JSON.stringify(plan, null, 2));

    for (const s of plan.scenes) {
        const imgOut = path.join(imagesDir, `scene_${String(s.scene_id).padStart(2, "0")}.png`);
        if (!fs.existsSync(imgOut)) {
            await genImage(`${plan.style_guide}\n${s.image_prompt}`, imgOut, "gpt-image-1-mini");
        }
    }

    const totalAudio = getAudioDurationSeconds(voicePath);
    const perScene = totalAudio / plan.scenes.length;

    const clipFiles = [];
    for (const s of plan.scenes) {
        const img = path.join(imagesDir, `scene_${String(s.scene_id).padStart(2, "0")}.png`);
        const clip = path.join(clipsDir, `scene_${String(s.scene_id).padStart(2, "0")}.mp4`);
        buildStillVideo(img, perScene, clip);
        clipFiles.push(clip);
    }

    const concatList = path.join(OUT_DIR, "concat.txt");
    writeConcatFile(clipFiles, concatList);

    const visualsPath = path.join(OUT_DIR, "visuals.mp4");
    exec(`ffmpeg -y -f concat -safe 0 -i "${concatList}" -c copy "${visualsPath}"`);

    const finalPath = path.join(OUT_DIR, "final.mp4");
    exec(`ffmpeg -y -i "${visualsPath}" -i "${voicePath}" -c:v copy -c:a aac -shortest "${finalPath}"`);

    const srtPath = path.join(OUT_DIR, "subtitles.srt");
    await transcribeToSrt(voicePath, srtPath);

    const finalSubbed = path.join(OUT_DIR, "final_subbed.mp4");
    burnSubtitles(finalPath, srtPath, finalSubbed);

    console.log("Done:");
    console.log(finalSubbed);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});