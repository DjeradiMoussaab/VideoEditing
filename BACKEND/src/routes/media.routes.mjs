import { Router } from "express";
import { getMediaController } from "../controllers/media.controller.mjs";

const router = Router();

router.get("/:projectId/*", getMediaController);

export default router;
