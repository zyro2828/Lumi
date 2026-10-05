import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import multer from "multer";
import { config } from "../config.js";
import { AppError } from "./errors.js";

await fs.mkdir(config.tmpDir, { recursive: true });

/** Deletes temporary files. Never throws. */
export async function removeFiles(...paths) {
    await Promise.all(
        paths.filter(Boolean).map(file => fs.unlink(file).catch(() => {}))
    );
}

export function tempPath(extension) {
    return path.join(config.tmpDir, crypto.randomUUID() + extension);
}

/** Creates a multer instance that stores one validated file on disk. */
export function createUpload({ maxBytes, isAllowed, errorMessage }) {
    return multer({
        storage: multer.diskStorage({
            destination: config.tmpDir,
            filename: (req, file, cb) =>
                cb(null, crypto.randomUUID() + path.extname(file.originalname || ""))
        }),
        limits: { fileSize: maxBytes, files: 1 },
        fileFilter: (req, file, cb) => {
            if (!isAllowed(file.originalname)) {
                return cb(new AppError(errorMessage, 415));
            }
            cb(null, true);
        }
    });
}
