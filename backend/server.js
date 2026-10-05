import path from "node:path";
import express from "express";
import cors from "cors";
import multer from "multer";
import { config } from "./config.js";
import { AppError } from "./utils/errors.js";
import ttsRouter from "./routes/tts.js";
import sttRouter from "./routes/stt.js";
import extractRouter from "./routes/extract.js";
import videoToTextRouter from "./routes/videoToText.js";
import { checkFfmpeg } from "./services/ffmpegService.js";

const ffmpegAvailable = await checkFfmpeg();
if (!ffmpegAvailable) {
    console.warn("WARNING: FFmpeg was not found. Extract Voice and Video to Text will not work.");
    console.warn("Install FFmpeg or set FFMPEG_PATH in your .env file.");
}

const app = express();

app.use(cors());
app.use(express.json({ limit: "1mb" }));

// ---------- API ----------

app.get("/api/health", (req, res) => {
    res.json({
        status: "ok",
        service: "lumi-backend",
        providers: { stt: config.sttProvider, tts: config.ttsProvider },
        ffmpeg: ffmpegAvailable,
        // Only reports whether keys exist. The keys themselves are never exposed.
        keys: {
            groq: Boolean(config.groqApiKey),
            gemini: Boolean(config.geminiApiKey)
        }
    });
});

app.use("/api/tts", ttsRouter);
app.use("/api/stt", sttRouter);
app.use("/api/extract-audio", extractRouter);
app.use("/api/video-to-text", videoToTextRouter);

app.use("/api", (req, res) => {
    res.status(404).json({ error: "API route not found." });
});

// ---------- Frontend (static) ----------

app.use(express.static(config.frontendDir));

// ---------- Error handler ----------
// Every API error leaves the server in the same shape: { error: "message" }

app.use((err, req, res, next) => {
    if (err instanceof AppError) {
        return res.status(err.status).json({ error: err.message });
    }

    if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
            const mb = Math.round(config.maxAudioBytes / 1024 / 1024);
            return res.status(413).json({ error: `File is too large. The limit is ${mb} MB.` });
        }
        return res.status(400).json({ error: "The upload could not be processed." });
    }

    if (err.type === "entity.parse.failed") {
        return res.status(400).json({ error: "Invalid request." });
    }

    console.error("Unexpected error:", err);
    res.status(500).json({ error: "Something went wrong on the server." });
});

app.listen(config.port, () => {
    console.log(`Lumi running at http://localhost:${config.port}`);
    console.log(`Providers -> STT: ${config.sttProvider}, TTS: ${config.ttsProvider}`);
});
