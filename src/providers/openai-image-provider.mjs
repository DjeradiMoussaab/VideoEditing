import fs from "fs";

export class OpenAIImageProvider {
    constructor(ctx) {
        this.ctx = ctx;
    }

    async generate({ scene, outPath, styleGuide, referenceImagePath }) {
        const prompt = [
            "Create a very realistic still image that matches this exact narration chunk.",
            `Narration context: ${scene.narration}`,
            `Scene visual intent: ${scene.visual}`,
            styleGuide,
            referenceImagePath
                ? "Use the reference image to keep the same person identity (face, hair, clothing)."
                : "Keep a consistent identity across scenes.",
            "Preserve character continuity, wardrobe continuity, and environment continuity unless narration explicitly changes them.",
            "Include specific camera framing, lighting, and textures that match the scene. make it look like the picture was taken by a low quality phone camera",
            "No text, no logos, no watermarks.",
            "keeping the same subject, composition, and scene, but make it look like a real photo taken with a very low-quality camera. The image should appear authentic and unedited, as if it was found online. Apply heavy compression artifacts, low resolution (around 480p quality), slight blur, digital noise, grain, washed colors, and reduced sharpness. Add uneven lighting, minor motion blur, and subtle pixelation. The photo should feel casual, imperfect, and realistic, like it was taken quickly with an old smartphone or cheap camera and uploaded to the internet.",
            scene.image_prompt
        ].join("\n");

        const r = referenceImagePath
            ? await this.ctx.openai.images.edit({
                model: this.ctx.config.models.image,
                image: fs.createReadStream(referenceImagePath),
                prompt,
                size: this.ctx.config.image.size,
                quality: this.ctx.config.image.quality
            })
            : await this.ctx.openai.images.generate({
                model: this.ctx.config.models.image,
                prompt,
                size: this.ctx.config.image.size,
                quality: this.ctx.config.image.quality
            });

        const b64 = r.data[0].b64_json;
        fs.writeFileSync(outPath, Buffer.from(b64, "base64"));
    }
}
