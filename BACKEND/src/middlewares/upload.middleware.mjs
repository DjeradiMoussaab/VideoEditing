import multer from "multer";
import fs from 'node:fs';
import { apiConfig } from '../config/api.config.mjs';
import { validateReferenceClipFiles } from '../services/reference-clips.service.mjs';

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 200 * 1024 * 1024 }
});

// Project batches may include 20 videos: spool uploads to disk, not RAM.
const projectUpload = multer({
    storage: multer.diskStorage({ destination(_req, _file, cb) {
        try { fs.mkdirSync(apiConfig.uploadsDir, { recursive: true }); cb(null, apiConfig.uploadsDir); }
        catch (error) { cb(error); }
    } }),
    limits: { fileSize: 200 * 1024 * 1024, files: 131 },
    fileFilter(_req, file, cb) {
        try { if (file.fieldname === 'referenceClip') validateReferenceClipFiles([file]); cb(null, true); }
        catch (error) { cb(error); }
    }
});
export const uploadProjectInputs = projectUpload.fields([
    { name: "voiceover", maxCount: 1 },
    { name: "reference", maxCount: 100 },
    { name: "referenceClip", maxCount: 30 }
]);

export const uploadSceneImage = upload.single("image");
export const uploadSceneVideo = upload.single("video");
