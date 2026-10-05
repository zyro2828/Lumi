import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// The .env file lives in the project root (one level above /backend).
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const env = process.env;

export const config = {
    port: Number(env.PORT) || 3000,

    sttProvider: (env.STT_PROVIDER || "mock").toLowerCase(),
    ttsProvider: (env.TTS_PROVIDER || "mock").toLowerCase(),

    groqApiKey: env.GROQ_API_KEY || "",
    geminiApiKey: env.GEMINI_API_KEY || "",

    groqSttModel: env.GROQ_STT_MODEL || "whisper-large-v3-turbo",
    geminiTtsModel: env.GEMINI_TTS_MODEL || "gemini-3.8-flash-lite-tts",

    maxTtsChars: Number(env.MAX_TTS_CHARS) || 3000,
    maxAudioBytes: (Number(env.MAX_AUDIO_MB) || 25) * 1024 * 1024,
    maxVideoBytes: (Number(env.MAX_VIDEO_MB) || 200) * 1024 * 1024,

    ffmpegPath: env.FFMPEG_PATH || "ffmpeg",

    tmpDir: path.join(__dirname, "tmp"),
    frontendDir: path.join(__dirname, "..", "frontend")
};
