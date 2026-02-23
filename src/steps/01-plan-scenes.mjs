import { PlanSchema } from "../schemas/plan.schema.mjs";

export async function planScenesStep(ctx) {
    if (ctx.fs.exists(ctx.paths.planJson)) {
        const json = ctx.fs.readJson(ctx.paths.planJson);
        ctx.plan = PlanSchema.parse(json);
        return ctx;
    }

    const system = `
You are a video producer for YouTube storytelling/news.
Create ${ctx.config.scenes.min} to ${ctx.config.scenes.max} scenes. Each scene should be a single clear visual idea.

Return JSON only with:
{
  "title": string,
  "style_guide": string,
  "scenes": [
    { "scene_id": number, "narration": string, "visual": string, "image_prompt": string }
  ]
}

Rules:
- IMPORTANT: very realistic images, not cinematic, just low quality just like in the reference photo
- the faces, objetcs, trees ..everything must look real and like it's in 360p quality.
- narration chunks short and in order
- handheld phone photo, flat lighting, natural colors, jpeg compression artifacts, 360p look, 16:9
- avoid text in images
`.trim();

    const resp = await ctx.openai.chat.completions.create({
        model: ctx.config.models.planner,
        messages: [
            { role: "system", content: system },
            { role: "user", content: ctx.storyText }
        ],
        response_format: { type: "json_object" }
    });

    const json = JSON.parse(resp.choices[0].message.content);
    ctx.plan = PlanSchema.parse(json);
    ctx.fs.writeJson(ctx.paths.planJson, ctx.plan);

    return ctx;
}