import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";
import { AppError } from "../utils/errors.js";

/**
 * Speech-to-text service.
 *
 * transcribe({ filePath, originalName, mimeType, language })
 *   -> { text }
 *
 * Providers: "mock", "groq" (Whisper), "gemini" (added later).
 */

async function mockProvider() {
    await new Promise(resolve => setTimeout(resolve, 1000));
    return {
        text:
            "This is a mock transcription. Switch STT_PROVIDER to groq in your " +
            ".env file to transcribe real audio."
    };
}

async function groqProvider({ filePath, originalName, mimeType, language }) {
    if (!config.groqApiKey) {
        throw new AppError("Transcription service is not configured (missing API key).", 500);
    }

    const buffer = await fs.readFile(filePath);

    const form = new FormData();
    form.append(
        "file",
        new Blob([buffer], { type: mimeType || "application/octet-stream" }),
        originalName || "audio"
    );
    form.append("model", config.groqSttModel);
    form.append("response_format", "json");
    if (language) {
        form.append("language", language);
    }

    let response;
    try {
        response = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
            method: "POST",
            headers: { Authorization: `Bearer ${config.groqApiKey}` },
            body: form,
            signal: AbortSignal.timeout(90_000)
        });
    } catch (error) {
        console.error("Groq request failed:", error.name, error.message);
        if (error.name === "TimeoutError") {
            throw new AppError("Transcription took too long. Please try a shorter file.", 504);
        }
        throw new AppError("Could not reach the transcription service. Check your connection.", 502);
    }

    if (!response.ok) {
        const details = await response.text().catch(() => "");
        // Technical details go to the server log only, never to the user.
        console.error(`Groq error ${response.status}:`, details.slice(0, 500));

        if (response.status === 429) {
            throw new AppError("Transcription limit reached. Please wait a minute and try again.", 429);
        }
        if (response.status === 413) {
            throw new AppError("The audio file is too large for the transcription service.", 413);
        }
        if (response.status === 401 || response.status === 403) {
            throw new AppError("Transcription service is not configured correctly.", 500);
        }
        throw new AppError("The transcription service returned an error. Please try again.", 502);
    }

    const data = await response.json();
    return { text: (data.text || "").trim() };
}

async function geminiProvider() {
    throw new AppError(
        "Gemini transcription is not connected yet. Use STT_PROVIDER=groq or mock.",
        501
    );
}

const providers = {
    mock: mockProvider,
    groq: groqProvider,
    gemini: geminiProvider
};

export async function transcribe(input) {
    const provider = providers[config.sttProvider];

    if (!provider) {
        throw new AppError("Transcription provider is not configured correctly.", 500);
    }

    const result = await provider(input);

    if (!result.text) {
        throw new AppError("No speech was detected in this audio.", 422);
    }

    return result;
}

export const ALLOWED_AUDIO_EXTENSIONS = [
    ".mp3", ".wav", ".m4a", ".webm", ".ogg", ".flac", ".mp4", ".mpeg", ".mpga"
];

export function isAllowedAudio(fileName) {
    return ALLOWED_AUDIO_EXTENSIONS.includes(path.extname(fileName || "").toLowerCase());
}
