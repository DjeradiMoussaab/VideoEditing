import path from "path";
import { asyncHandler } from "../utils/async-handler.mjs";
import { resolveMedia, loadManifest, mediaUrl } from "../services/job-store.service.mjs";
import { projectVideoFilename } from '../services/project-title.service.mjs';

export const getMediaController = asyncHandler(async (req, res) => {
    const { projectId } = req.params;
    const relPath = req.params[0] || "";
    const absPath = resolveMedia(projectId, relPath);

    if (!absPath) {
        const err = new Error("Media not found");
        err.statusCode = 404;
        throw err;
    }

    if (req.query.download === "1") {
        const project=loadManifest(projectId);
        const url=mediaUrl(projectId,absPath);
        const version=project?.generatedVideos?.find(item=>item.finalUrl===url);
        if(project&&(project.artifacts?.finalUrl===url||version))return res.download(absPath,projectVideoFilename(project,project.artifacts?.finalUrl===url?null:version.number));
        return res.download(absPath, path.basename(absPath));
    }

    return res.sendFile(absPath);
});
