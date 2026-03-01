import { z } from "zod";

export const SceneSchema = z.object({
    scene_id: z.number().int(),
    start_sec: z.number().nonnegative(),
    end_sec: z.number().positive(),
    duration_sec: z.number().positive(),
    narration: z.string(),
    visual: z.string(),
    image_prompt: z.string()
});

export const StyleGuideSchema = z
    .union([z.string(), z.record(z.any())])
    .transform((v) => {
        if (typeof v === "string") return v;
        return Object.entries(v)
            .map(([k, val]) => `${k}: ${typeof val === "string" ? val : JSON.stringify(val)}`)
            .join("\n");
    });

export const PlanSchema = z.object({
    title: z.string(),
    style_guide: StyleGuideSchema,
    scenes: z.array(SceneSchema).min(1)
});
