import { Router } from "express";
import {
    createProjectController,
    generateDraftController,
    generateFinalController,
    getProjectController,
    patchSceneController,
    refreshStockSuggestionsController,
    selectStockSuggestionController,
    uploadProjectInputsController,
    uploadSceneImageController
} from "../controllers/project.controller.mjs";
import {
    uploadProjectInputs,
    uploadSceneImage
} from "../middlewares/upload.middleware.mjs";

const router = Router();

router.post("/", createProjectController);
router.get("/:projectId", getProjectController);
router.post("/:projectId/inputs", uploadProjectInputs, uploadProjectInputsController);
router.post("/:projectId/draft", generateDraftController);
router.patch("/:projectId/scenes/:sceneId", patchSceneController);
router.post("/:projectId/scenes/:sceneId/image", uploadSceneImage, uploadSceneImageController);
router.post("/:projectId/scenes/:sceneId/stock/refresh", refreshStockSuggestionsController);
router.post("/:projectId/scenes/:sceneId/stock/select", selectStockSuggestionController);
router.post("/:projectId/final", generateFinalController);

export default router;
