import multer from "multer";

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 200 * 1024 * 1024 }
});

export const uploadProjectInputs = upload.fields([
    { name: "voiceover", maxCount: 1 },
    { name: "reference", maxCount: 100 }
]);

export const uploadSceneImage = upload.single("image");
export const uploadSceneVideo = upload.single("video");
