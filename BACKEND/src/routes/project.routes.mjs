import { Router } from "express";
import {
    adjustSceneBoundaryController,
    createProjectController,
    generateDraftController,
    generateFinalController,
    getProjectController,
    listProjectHistoryController,
    patchSceneController,
    refreshStockSuggestionsController,
    selectReferenceMatchController,
    selectStockSuggestionController,
    insertSceneVideoAfterController,
    uploadProjectInputsController,
    uploadSceneImageController,
    uploadSceneVideoController
} from "../controllers/project.controller.mjs";
import {
    uploadProjectInputs,
    uploadSceneImage,
    uploadSceneVideo
} from "../middlewares/upload.middleware.mjs";

const router = Router();

router.post("/", createProjectController);
router.get("/history", listProjectHistoryController);
router.get("/:projectId", getProjectController);
router.post("/:projectId/inputs", uploadProjectInputs, uploadProjectInputsController);
router.post("/:projectId/draft", generateDraftController);
router.patch("/:projectId/scenes/:sceneId", patchSceneController);
router.patch("/:projectId/scenes/:sceneId/boundary", adjustSceneBoundaryController);
router.post("/:projectId/scenes/:sceneId/image", uploadSceneImage, uploadSceneImageController);
router.post("/:projectId/scenes/:sceneId/video", uploadSceneVideo, uploadSceneVideoController);
router.post("/:projectId/scenes/:sceneId/insert-video", uploadSceneVideo, insertSceneVideoAfterController);
router.post("/:projectId/scenes/:sceneId/stock/refresh", refreshStockSuggestionsController);
router.post("/:projectId/scenes/:sceneId/stock/select", selectStockSuggestionController);
router.post("/:projectId/scenes/:sceneId/reference/select", selectReferenceMatchController);
router.post("/:projectId/final", generateFinalController);

export default router;
