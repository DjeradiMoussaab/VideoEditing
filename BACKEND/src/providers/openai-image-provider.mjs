import fs from "fs";

export class OpenAIImageProvider {
    constructor(ctx) {
        this.ctx = ctx;
    }

    getModelName() {
        return String(this.ctx.config.models.image || "");
    }

    canUseEditEndpoint() {
        return this.getModelName().toLowerCase() === "dall-e-2";
    }

    buildImageParams({ prompt, referenceImagePath, includeQuality }) {
        const params = {
            model: this.getModelName(),
            prompt,
            size: this.ctx.config.image.size
        };

        if (includeQuality && this.ctx.config.image.quality) {
            params.quality = this.ctx.config.image.quality;
        }

        if (referenceImagePath && this.canUseEditEndpoint()) {
            params.image = fs.createReadStream(referenceImagePath);
        }

        return params;
    }

    shouldSendQuality() {
        const model = String(this.ctx.config.models.image || "").toLowerCase();
        if (!this.ctx.config.image?.quality) return false;
        // Some image model variants reject the quality parameter.
        if (model.includes("mini")) return false;
        return true;
    }

    async callImageApi(params, referenceImagePath) {
        if (referenceImagePath && this.canUseEditEndpoint()) {
            return this.ctx.openai.images.edit(params);
        }
        return this.ctx.openai.images.generate(params);
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

        const tryWithQuality = this.shouldSendQuality();
        let r;

        try {
            r = await this.callImageApi(
                this.buildImageParams({
                    prompt,
                    referenceImagePath,
                    includeQuality: tryWithQuality
                }),
                referenceImagePath
            );
        } catch (error) {
            const msg = String(error?.message || "").toLowerCase();
            const qualityRejected =
                msg.includes("unknown parameter: 'quality'") ||
                (msg.includes("unsupported") && msg.includes("quality"));
            if (!tryWithQuality || !qualityRejected) throw error;

            // Fallback for model variants where quality is not accepted.
            r = await this.callImageApi(
                this.buildImageParams({
                    prompt,
                    referenceImagePath,
                    includeQuality: false
                }),
                referenceImagePath
            );
        }

        const b64 = r.data[0].b64_json;
        fs.writeFileSync(outPath, Buffer.from(b64, "base64"));
    }
}
