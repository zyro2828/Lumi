import fs from "node:fs/promises";
import { Router } from "express";
import { config } from "../config.js";
import { AppError } from "../utils/errors.js";
import { createUpload, removeFiles, tempPath } from "../utils/files.js";
import { extractAudio, isAllowedVideo } from "../services/ffmpegService.js";
import { transcribe } from "../services/sttService.js";

const router = Router();

const upload = createUpload({
    maxBytes: config.maxVideoBytes,
    isAllowed: isAllowedVideo,
    errorMessage: "Unsupported video format. Use MP4, MOV, MKV, WEBM, AVI or similar."
});

/**
 * POST /api/video-to-text
 * Request  (multipart/form-data): video = file, language? = "en" | "az" | ...
 *
 * Response: newline-delimited JSON (application/x-ndjson), one object per line:
 *   { "stage": "extracting" }
 *   { "stage": "transcribing" }
 *   { "stage": "preparing" }
 *   { "done": true, "text": "...", "audio": { "base64", "mimeType", "format" } }
 *   or, if something fails after processing has started:
 *   { "error": "readable message" }
 *
 * Problems detected before processing starts (wrong file type, file too
 * large, ...) are returned as a normal JSON error: { "error": "..." }
 */
router.post("/", upload.single("video"), async (req, res, next) => {
    const file = req.file;
    const audioPath = tempPath(".mp3");

    try {
        if (!file) {
            throw new AppError("Please choose a video file first.", 400);
        }
        if (file.size === 0) {
            throw new AppError("The video file is empty.", 400);
        }
    } catch (error) {
        removeFiles(file?.path);
        return next(error);
    }

    const language = /^[a-z]{2}$/.test(req.body?.language || "")
        ? req.body.language
        : undefined;

    res.status(200);
    res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    const send = payload => {
        if (!res.writableEnded) {
            res.write(JSON.stringify(payload) + "\n");
        }
    };

    try {
        send({ stage: "extracting" });
        await extractAudio({ inputPath: file.path, outputPath: audioPath, profile: "speech" });

        const { size } = await fs.stat(audioPath);
        if (size > config.maxAudioBytes) {
            throw new AppError(
                "This video is too long to transcribe in one go. Try a shorter video.", 413
            );
        }

        send({ stage: "transcribing" });
        const { text } = await transcribe({
            filePath: audioPath,
            originalName: "audio.mp3",
            mimeType: "audio/mpeg",
            language
        });

        send({ stage: "preparing" });
        const audio = await fs.readFile(audioPath);

        send({
            done: true,
            text,
            audio: { base64: audio.toString("base64"), mimeType: "audio/mpeg", format: "mp3" }
        });
    } catch (error) {
        if (!(error instanceof AppError)) {
            console.error("Video-to-text failed:", error);
        }
        send({
            error: error instanceof AppError
                ? error.message
                : "Something went wrong while processing this video."
        });
    } finally {
        removeFiles(file.path, audioPath);
        res.end();
    }
});

export default router;
