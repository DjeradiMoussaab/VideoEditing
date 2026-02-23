import fs from "fs";

export class OpenAIImageProvider {
    constructor(ctx) {
        this.ctx = ctx;
    }

    async generate({ scene, outPath, styleGuide, referenceImagePath }) {
        const prompt = [
            styleGuide,
            referenceImagePath
                ? "Use the reference image to keep the same person identity (face, hair, clothing)."
                : "Keep a consistent identity across scenes.",
            "No text, no logos, no watermarks.",
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