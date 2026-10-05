/**
 * Build a WAV file (16-bit PCM, mono) from raw PCM samples.
 * Gemini TTS returns raw PCM, browsers need a WAV header to play it.
 */
export function pcmToWav(pcmBuffer, sampleRate = 24000, channels = 1, bitDepth = 16) {
    const byteRate = (sampleRate * channels * bitDepth) / 8;
    const blockAlign = (channels * bitDepth) / 8;
    const header = Buffer.alloc(44);

    header.write("RIFF", 0);
    header.writeUInt32LE(36 + pcmBuffer.length, 4);
    header.write("WAVE", 8);
    header.write("fmt ", 12);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20); // PCM
    header.writeUInt16LE(channels, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(byteRate, 28);
    header.writeUInt16LE(blockAlign, 32);
    header.writeUInt16LE(bitDepth, 34);
    header.write("data", 36);
    header.writeUInt32LE(pcmBuffer.length, 40);

    return Buffer.concat([header, pcmBuffer]);
}

/** A short sine-wave "beep" used by mock mode. */
export function createToneWav(seconds = 1.5, frequency = 440, sampleRate = 24000) {
    const total = Math.floor(seconds * sampleRate);
    const pcm = Buffer.alloc(total * 2);

    for (let i = 0; i < total; i++) {
        // Fade in/out so playback does not click.
        const fade = Math.min(1, i / 2000, (total - i) / 2000);
        const sample = Math.sin((2 * Math.PI * frequency * i) / sampleRate) * 0.3 * fade;
        pcm.writeInt16LE(Math.round(sample * 32767), i * 2);
    }

    return pcmToWav(pcm, sampleRate);
}
