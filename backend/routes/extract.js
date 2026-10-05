import { Router } from "express";
import { config } from "../config.js";
import { AppError } from "../utils/errors.js";
import { createUpload, removeFiles, tempPath } from "../utils/files.js";
import { extractAudio, isAllowedVideo } from "../services/ffmpegService.js";

const router = Router();

const upload = createUpload({
    maxBytes: config.maxVideoBytes,
    isAllowed: isAllowedVideo,
    errorMessage: "Unsupported video format. Use MP4, MOV, MKV, WEBM, AVI or similar."
});

/**
 * POST /api/extract-audio
 * Request  (multipart/form-data): video = file
 * Response (binary): audio/mpeg  (the extracted MP3)
 * Errors   (JSON):   { error: string }
 */
router.post("/", upload.single("video"), async (req, res, next) => {
    const file = req.file;
    const outputPath = tempPath(".mp3");

    try {
        if (!file) {
            throw new AppError("Please choose a video file first.", 400);
        }
        if (file.size === 0) {
            throw new AppError("The video file is empty.", 400);
        }

        await extractAudio({ inputPath: file.path, outputPath, profile: "full" });

        res.type("audio/mpeg");
        res.sendFile(outputPath, error => {
            // Temporary files are removed once the response has been sent.
            removeFiles(file.path, outputPath);
            if (error && !res.headersSent) {
                next(error);
            }
        });
    } catch (error) {
        removeFiles(file?.path, outputPath);
        next(error);
    }
});

export default router;
