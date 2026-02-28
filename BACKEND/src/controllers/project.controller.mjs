import { asyncHandler } from "../utils/async-handler.mjs";
import {
    createJob,
    generateDraft,
    generateFinalVideo,
    getJob,
    refreshStockSuggestions,
    saveProjectInputs,
    selectStockSuggestion,
    setSceneType,
    uploadSceneImage,
    uploadSceneVideo
} from "../services/pipeline-backend.service.mjs";

function notFound(message) {
    const err = new Error(message);
    err.statusCode = 404;
    return err;
}

export const createProjectController = asyncHandler(async (_req, res) => {
    const project = createJob();
    res.status(201).json({ project });
});

export const getProjectController = asyncHandler(async (req, res) => {
    const project = getJob(req.params.projectId);
    if (!project) throw notFound("Project not found");
    res.json({ project });
});

export const uploadProjectInputsController = asyncHandler(async (req, res) => {
    const project = saveProjectInputs(req.params.projectId, req.files);
    res.json({ project });
});

export const generateDraftController = asyncHandler(async (req, res) => {
    const project = await generateDraft(req.params.projectId, req.body || {});
    res.json({ project });
});

export const patchSceneController = asyncHandler(async (req, res) => {
    const { type } = req.body || {};
    if (!type) {
        const err = new Error("type is required");
        err.statusCode = 400;
        throw err;
    }

    const project = await setSceneType(req.params.projectId, req.params.sceneId, type);
    res.json({ project });
});

export const uploadSceneImageController = asyncHandler(async (req, res) => {
    if (!req.file) {
        const err = new Error("image file is required");
        err.statusCode = 400;
        throw err;
    }

    const project = await uploadSceneImage(req.params.projectId, req.params.sceneId, req.file);
    res.json({ project });
});

export const uploadSceneVideoController = asyncHandler(async (req, res) => {
    if (!req.file) {
        const err = new Error("video file is required");
        err.statusCode = 400;
        throw err;
    }

    const project = await uploadSceneVideo(req.params.projectId, req.params.sceneId, req.file);
    res.json({ project });
});

export const refreshStockSuggestionsController = asyncHandler(async (req, res) => {
    const project = await refreshStockSuggestions(req.params.projectId, req.params.sceneId);
    res.json({ project });
});

export const selectStockSuggestionController = asyncHandler(async (req, res) => {
    const { suggestionId } = req.body || {};
    if (!suggestionId) {
        const err = new Error("suggestionId is required");
        err.statusCode = 400;
        throw err;
    }

    const project = await selectStockSuggestion(
        req.params.projectId,
        req.params.sceneId,
        suggestionId
    );
    res.json({ project });
});

export const generateFinalController = asyncHandler(async (req, res) => {
    const project = await generateFinalVideo(req.params.projectId);
    res.json({ project });
});
