import crypto from "node:crypto";
import { GoogleGenAI } from "@google/genai";
import { config } from "../config.js";
import { AppError } from "../utils/errors.js";
import { createToneWav, pcmToWav } from "../utils/wav.js";
import { STYLES } from "../utils/ttsOptions.js";

/**
 * Text-to-speech service.
 *
 * generateSpeech({ text, voice, style })
 *   -> { audioBase64, mimeType, format }
 *
 * `voice` is a Gemini prebuilt voice name, `style` a key of STYLES.
 * Providers: "mock" and "gemini".
 */

// Tiny in-memory cache: the same request does not spend quota twice.
const cache = new Map();
const CACHE_LIMIT = 50;

// ---------- mock ----------

async function mockProvider() {
    await new Promise(resolve => setTimeout(resolve, 800)); // feel like a real call
    return {
        audioBase64: createToneWav().toString("base64"),
        mimeType: "audio/wav",
        format: "wav"
    };
}

// ---------- gemini ----------

let geminiClient = null;

function getGeminiClient() {
    if (!config.geminiApiKey) {
        throw new AppError("Speech generation is not configured (missing API key).", 500);
    }
    if (!geminiClient) {
        geminiClient = new GoogleGenAI({
            apiKey: config.geminiApiKey,
            httpOptions: { timeout: 90_000 }
        });
    }
    return geminiClient;
}

/** Translates SDK/network errors into messages that are safe for users. */
function mapGeminiError(error) {
    // Technical details stay in the server log only (never the API key).
    console.error("Gemini TTS error:", error?.status ?? "", error?.message ?? error);

    const status = Number(error?.status);
    const message = String(error?.message || "");

    if (status === 429 || /RESOURCE_EXHAUSTED|quota|rate limit/i.test(message)) {
        return new AppError(
            "Speech generation limit reached. Please wait a minute and try again.", 429
        );
    }
    if (status === 401 || status === 403 || /API key/i.test(message)) {
        return new AppError("Speech generation is not configured correctly.", 500);
    }
    if (status === 404) {
        return new AppError(
            "The speech model is not available. Check GEMINI_TTS_MODEL in your .env file.", 502
        );
    }
    if (status === 400) {
        return new AppError(
            "The speech service could not process this text. Try a different text.", 400
        );
    }
    if (error?.name === "AbortError" || /timeout|timed out/i.test(message)) {
        return new AppError("Speech generation took too long. Please try again.", 504);
    }
    if (error instanceof TypeError || /fetch failed|ENOTFOUND|ECONN/i.test(message)) {
        return new AppError("Could not reach the speech service. Check your connection.", 502);
    }
    return new AppError("Speech generation failed. Please try again.", 502);
}

async function geminiProvider({ text, voice, style }) {
    const client = getGeminiClient();

    const textBlock = { type: "text", text };
    if (STYLES[style]) {
        textBlock.annotations = [{ type: "speech_metadata", style: STYLES[style] }];
    }

    let interaction;
    try {
        interaction = await client.interactions.create({
            model: config.geminiTtsModel,
            input: [{ type: "user_input", content: [textBlock] }],
            response_format: { type: "audio" },
            generation_config: { speech_config: [{ voice }] }
        });
    } catch (error) {
        throw mapGeminiError(error);
    }

    const data = interaction?.output_audio?.data;
    if (!data) {
        console.error("Gemini TTS returned no audio.");
        throw new AppError(
            "No audio was generated for this text. Try rephrasing it.", 502
        );
    }

    let audio = Buffer.from(data, "base64");

    // Gemini 3.8 models return a ready WAV file. Older models return raw
    // 24 kHz 16-bit mono PCM, so add a WAV header when it is missing.
    if (audio.subarray(0, 4).toString("ascii") !== "RIFF") {
        audio = pcmToWav(audio, 24000);
    }

    return { audioBase64: audio.toString("base64"), mimeType: "audio/wav", format: "wav" };
}

// ---------- public ----------

const providers = {
    mock: mockProvider,
    gemini: geminiProvider
};

export async function generateSpeech({ text, voice, style }) {
    const provider = providers[config.ttsProvider];

    if (!provider) {
        throw new AppError("Text-to-speech provider is not configured correctly.", 500);
    }

    const key = crypto
        .createHash("sha256")
        .update(JSON.stringify([config.ttsProvider, config.geminiTtsModel, text, voice, style]))
        .digest("hex");

    if (cache.has(key)) {
        return cache.get(key);
    }

    const result = await provider({ text, voice, style });

    if (cache.size >= CACHE_LIMIT) {
        cache.delete(cache.keys().next().value);
    }
    cache.set(key, result);

    return result;
}
