import { deleteProject } from "../services/project-history.service.mjs";
import { asyncHandler } from "../utils/async-handler.mjs";
import {
    createJob,
    startDraftJob,
    getJob,
    listGeneratedVideosHistory,
    refreshStockSuggestions,
    selectReferenceMatch,
    saveProjectInputs,
    selectStockSuggestion,
    startFinalVideoJob,
    adjustSceneBoundary,
    splitScene,
    deleteScene,
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

export const listProjectHistoryController = asyncHandler(async (_req, res) => {
    const history = listGeneratedVideosHistory();
    res.json({ history });
});

export const uploadProjectInputsController = asyncHandler(async (req, res) => {
    const project = await saveProjectInputs(req.params.projectId, req.files);
    res.json({ project });
});

export const generateDraftController = asyncHandler(async (req, res) => {
    const project = await startDraftJob(req.params.projectId, req.body || {}, { background: true });
    res.json({ project });
});

export const continueDraftController = asyncHandler(async (req, res) => {
    const project = await startDraftJob(req.params.projectId, {}, { resume: true, background: true });
    res.json({ project });
});

export const patchSceneController = asyncHandler(async (req, res) => {
    const { type, imageAnimationStyle, quoteText, quoteAuthor, quoteStyleId, quoteFields } = req.body || {};
    if (!type && imageAnimationStyle === undefined && quoteText === undefined && quoteAuthor === undefined && quoteStyleId === undefined && quoteFields === undefined) {
        const err = new Error("type, imageAnimationStyle or quoteText is required");
        err.statusCode = 400;
        throw err;
    }

    const project = await setSceneType(req.params.projectId, req.params.sceneId, {
        type,
        imageAnimationStyle,
        quoteText,
        quoteAuthor,
        quoteStyleId,
        quoteFields
    });
    res.json({ project });
});

export const adjustSceneBoundaryController = asyncHandler(async (req, res) => {
    const { deltaSec } = req.body || {};
    if (deltaSec === undefined || deltaSec === null || deltaSec === "") {
        const err = new Error("deltaSec is required");
        err.statusCode = 400;
        throw err;
    }

    const project = await adjustSceneBoundary(req.params.projectId, req.params.sceneId, deltaSec);
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
    const customQuery = typeof req.body?.customQuery === "string" ? req.body.customQuery : null;
    const project = await refreshStockSuggestions(req.params.projectId, req.params.sceneId, customQuery);
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

export const selectReferenceMatchController = asyncHandler(async (req, res) => {
    const { matchId } = req.body || {};
    if (!matchId) {
        const err = new Error("matchId is required");
        err.statusCode = 400;
        throw err;
    }
    const project = await selectReferenceMatch(req.params.projectId, req.params.sceneId, matchId);
    res.json({ project });
});

export const generateFinalController = asyncHandler(async (req, res) => {
    const force = String(req.query?.force ?? req.body?.force ?? "false").toLowerCase() === "true";
    console.log(`[api] POST /projects/${req.params.projectId}/final force=${force}`);
    const project = startFinalVideoJob(req.params.projectId, { force });
    console.log(`[api] queued final render projectId=${req.params.projectId} force=${force}`);
    res.status(202).json({ project });
});

export const deleteProjectController = asyncHandler(async (req, res) => {
    await deleteProject(req.params.projectId);
    res.json({ deleted: true });
});

export const splitSceneController = asyncHandler(async (req, res) => {
    const { timeSec, expectedUpdatedAt } = req.body || {};
    res.json(splitScene(req.params.projectId, req.params.sceneId, timeSec, expectedUpdatedAt));
});

export const deleteSceneController = asyncHandler(async (req, res) => {
    res.json(deleteScene(req.params.projectId, req.params.sceneId, req.body?.expectedUpdatedAt));
});
