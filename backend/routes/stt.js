import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { Router } from "express";
import multer from "multer";
import { config } from "../config.js";
import { AppError } from "../utils/errors.js";
import { transcribe, isAllowedAudio } from "../services/sttService.js";

const router = Router();

await fs.mkdir(config.tmpDir, { recursive: true });

const upload = multer({
    storage: multer.diskStorage({
        destination: config.tmpDir,
        filename: (req, file, cb) =>
            cb(null, crypto.randomUUID() + path.extname(file.originalname || ""))
    }),
    limits: { fileSize: config.maxAudioBytes, files: 1 },
    fileFilter: (req, file, cb) => {
        if (!isAllowedAudio(file.originalname)) {
            return cb(new AppError(
                "Unsupported audio format. Use MP3, WAV, M4A, WEBM, OGG or FLAC.", 415
            ));
        }
        cb(null, true);
    }
});

/**
 * POST /api/stt
 * Request  (multipart/form-data): audio = file, language? = "en" | "az" | ...
 * Response (JSON): { text: string }
 */
router.post("/", upload.single("audio"), async (req, res, next) => {
    const file = req.file;

    try {
        if (!file) {
            throw new AppError("Please choose an audio file first.", 400);
        }
        if (file.size === 0) {
            throw new AppError("The audio file is empty.", 400);
        }

        const language = /^[a-z]{2}$/.test(req.body?.language || "")
            ? req.body.language
            : undefined;

        const result = await transcribe({
            filePath: file.path,
            originalName: file.originalname,
            mimeType: file.mimetype,
            language
        });

        res.json({ text: result.text });
    } catch (error) {
        next(error);
    } finally {
        // Uploaded media is temporary: always delete it.
        if (file) {
            fs.unlink(file.path).catch(() => {});
        }
    }
});

export default router;
