import { spawn } from "node:child_process";
import path from "node:path";
import { config } from "../config.js";
import { AppError } from "../utils/errors.js";

/**
 * FFmpeg wrapper. Everything that touches the ffmpeg binary lives here.
 */

export const ALLOWED_VIDEO_EXTENSIONS = [
    ".mp4", ".mov", ".mkv", ".webm", ".avi", ".m4v", ".mpeg", ".mpg", ".3gp", ".flv", ".wmv"
];

export function isAllowedVideo(fileName) {
    return ALLOWED_VIDEO_EXTENSIONS.includes(path.extname(fileName || "").toLowerCase());
}

const FFMPEG_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Output profiles:
 *  - "full":   good-quality stereo MP3 for the user to keep/download
 *  - "speech": small mono 16 kHz MP3, ideal for transcription
 *              (Whisper resamples to 16 kHz mono anyway)
 */
const PROFILES = {
    full: ["-c:a", "libmp3lame", "-q:a", "2"],
    speech: ["-ac", "1", "-ar", "16000", "-c:a", "libmp3lame", "-b:a", "48k"]
};

/** Resolves true if the ffmpeg binary can be started. */
export function checkFfmpeg() {
    return new Promise(resolve => {
        const child = spawn(config.ffmpegPath, ["-version"], { stdio: "ignore" });
        child.on("error", () => resolve(false));
        child.on("close", code => resolve(code === 0));
    });
}

export function extractAudio({ inputPath, outputPath, profile = "full" }) {
    return new Promise((resolve, reject) => {
        const args = [
            "-hide_banner",
            "-loglevel", "error",
            "-y",
            "-i", inputPath,
            "-map", "0:a:0",   // first audio stream; fails clearly if there is none
            "-vn",
            ...PROFILES[profile],
            outputPath
        ];

        const child = spawn(config.ffmpegPath, args, { stdio: ["ignore", "ignore", "pipe"] });

        let stderr = "";
        let timedOut = false;

        const timer = setTimeout(() => {
            timedOut = true;
            child.kill("SIGKILL");
        }, FFMPEG_TIMEOUT_MS);

        child.stderr.on("data", chunk => {
            if (stderr.length < 4000) {
                stderr += chunk.toString();
            }
        });

        child.on("error", error => {
            clearTimeout(timer);
            if (error.code === "ENOENT") {
                console.error("FFmpeg not found. Install it or set FFMPEG_PATH in .env.");
                return reject(new AppError(
                    "Audio extraction is unavailable because FFmpeg is not installed on the server.",
                    503
                ));
            }
            console.error("FFmpeg failed to start:", error);
            reject(new AppError("Audio extraction failed. Please try again.", 500));
        });

        child.on("close", code => {
            clearTimeout(timer);

            if (timedOut) {
                return reject(new AppError(
                    "Processing this video took too long. Try a shorter video.", 504
                ));
            }
            if (code === 0) {
                return resolve();
            }

            // Technical details stay in the server log only.
            console.error(`FFmpeg exited with code ${code}:`, stderr.trim());

            if (/matches no streams|does not contain any stream|no audio/i.test(stderr)) {
                return reject(new AppError("This video does not contain an audio track.", 422));
            }
            if (/Invalid data found|moov atom not found|could not find codec|Error opening input/i.test(stderr)) {
                return reject(new AppError(
                    "This video could not be read. The file may be corrupted or unsupported.", 422
                ));
            }
            reject(new AppError("Audio extraction failed. Please try again.", 500));
        });
    });
}
