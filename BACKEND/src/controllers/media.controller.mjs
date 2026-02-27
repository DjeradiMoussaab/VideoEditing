import path from "path";
import { asyncHandler } from "../utils/async-handler.mjs";
import { resolveMedia } from "../services/job-store.service.mjs";

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
        return res.download(absPath, path.basename(absPath));
    }

    return res.sendFile(absPath);
});
