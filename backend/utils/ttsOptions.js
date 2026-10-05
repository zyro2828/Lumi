/**
 * Voices and speaking styles the TTS API accepts.
 * Voice names are Gemini's prebuilt voices (see the Gemini TTS docs).
 */

export const DEFAULT_VOICE = "Kore";

export const PREBUILT_VOICES = new Set([
    "Zephyr", "Puck", "Charon", "Kore", "Fenrir", "Leda", "Orus", "Aoede",
    "Callirrhoe", "Autonoe", "Enceladus", "Iapetus", "Umbriel", "Algieba",
    "Despina", "Erinome", "Algenib", "Rasalgethi", "Laomedeia", "Achernar",
    "Alnilam", "Schedar", "Gacrux", "Pulcherrima", "Achird", "Zubenelgenubi",
    "Vindemiatrix", "Sadachbia", "Sadaltager", "Sulafat"
]);

/** style id (sent by the frontend) -> text for speech_metadata.style */
export const STYLES = {
    neutral: "",
    cheerful: "cheerful and friendly",
    calm: "calm and relaxed",
    warm: "warm and gentle",
    energetic: "energetic and upbeat",
    serious: "serious and professional",
    whisper: "whispering"
};

/** Unknown/legacy values fall back to safe defaults instead of failing. */
export function normalizeVoice(voice) {
    return PREBUILT_VOICES.has(voice) ? voice : DEFAULT_VOICE;
}

export function normalizeStyle(style) {
    return Object.hasOwn(STYLES, style) ? style : "neutral";
}
