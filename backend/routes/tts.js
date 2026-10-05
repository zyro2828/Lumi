import { Router } from "express";
import { config } from "../config.js";
import { AppError } from "../utils/errors.js";
import { generateSpeech } from "../services/ttsService.js";
import { normalizeStyle, normalizeVoice } from "../utils/ttsOptions.js";

const router = Router();

/**
 * POST /api/tts
 * Request  (JSON): { text: string, voice?: string, style?: string }
 *   voice: a Gemini prebuilt voice name, e.g. "Kore" (unknown values -> default)
 *   style: neutral | cheerful | calm | warm | energetic | serious | whisper
 *   The language of the text is detected automatically.
 * Response (JSON): { audioBase64: string, mimeType: string, format: string }
 */
router.post("/", async (req, res, next) => {
    try {
        const { text, voice, style } = req.body || {};

        if (typeof text !== "string" || !text.trim()) {
            throw new AppError("Please enter some text first.", 400);
        }
        if (text.length > config.maxTtsChars) {
            throw new AppError(
                `Text is too long. The limit is ${config.maxTtsChars} characters.`,
                413
            );
        }

        const result = await generateSpeech({
            text: text.trim(),
            voice: normalizeVoice(voice),
            style: normalizeStyle(style)
        });

        res.json(result);
    } catch (error) {
        next(error);
    }
});

export default router;
