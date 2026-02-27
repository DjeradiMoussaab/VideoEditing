import { Router } from "express";
import mediaRoutes from "./media.routes.mjs";
import projectRoutes from "./project.routes.mjs";

const router = Router();

router.get("/health", (_req, res) => {
    res.json({ ok: true });
});
router.use("/projects", projectRoutes);
router.use("/media", mediaRoutes);

export default router;
