import { saveProjectInputs } from '../services/pipeline-backend.service.mjs';
import { controlProcessing, processingControlPending } from '../services/processing-control.service.mjs';
import { loadManifest } from '../services/job-store.service.mjs';
import { renderScenePreview } from "../services/scene-preview.service.mjs";
import { asyncHandler } from "../utils/async-handler.mjs";
import { Router } from "express";
import {
    adjustSceneBoundaryController,
    splitSceneController,
    deleteSceneController,
    createProjectController,
    deleteProjectController,
    generateDraftController,
    continueDraftController,
    generateFinalController,
    getProjectController,
    listProjectHistoryController,
    patchSceneController,
    refreshStockSuggestionsController,
    selectReferenceMatchController,
    selectStockSuggestionController,
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
router.delete("/:projectId", (req, res, next) => {
    if (processingControlPending(req.params.projectId)) return res.status(409).json({ error: 'A processing action is already in progress.' });
    next();
}, deleteProjectController);
router.post("/:projectId/processing/:action", asyncHandler(async (req, res) => {
    res.json({ project: await controlProcessing(req.params.projectId, req.params.action) });
}));
router.use('/:projectId', (req, res, next) => {
    if (req.method === 'GET') return next();
    const project = loadManifest(req.params.projectId);
    if (processingControlPending(req.params.projectId) || /_(RUNNING|PAUSED|STOPPING)$/.test(project?.status || '')) {
        return res.status(409).json({ error: 'Pause or cancel processing before changing the project. Cancel paused processing to edit scenes.' });
    }
    next();
});
router.post("/:projectId/voiceover", uploadProjectInputs, asyncHandler(async (req, res) => {
    res.json({ project: await saveProjectInputs(req.params.projectId, req.files, { restoreVoiceover: true }) });
}));
router.post("/:projectId/inputs", uploadProjectInputs, uploadProjectInputsController);
router.post("/:projectId/draft", generateDraftController);
router.post("/:projectId/draft/continue", continueDraftController);
router.patch("/:projectId/scenes/:sceneId", patchSceneController);
router.delete("/:projectId/scenes/:sceneId", deleteSceneController);
router.patch("/:projectId/scenes/:sceneId/boundary", adjustSceneBoundaryController);
router.post("/:projectId/scenes/:sceneId/split", splitSceneController);
router.post("/:projectId/scenes/:sceneId/image", uploadSceneImage, uploadSceneImageController);
router.post("/:projectId/scenes/:sceneId/video", uploadSceneVideo, uploadSceneVideoController);
router.post("/:projectId/scenes/:sceneId/stock/refresh", refreshStockSuggestionsController);
router.post("/:projectId/scenes/:sceneId/stock/select", selectStockSuggestionController);
router.post("/:projectId/scenes/:sceneId/reference/select", selectReferenceMatchController);
router.post("/:projectId/scenes/:sceneId/preview", asyncHandler(async (req, res) => {
    res.json(await renderScenePreview(req.params.projectId, req.params.sceneId, req.body || {}));
}));
router.post("/:projectId/final", generateFinalController);

export default router;
