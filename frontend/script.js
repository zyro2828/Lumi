/* =========================================================
   LUMI — AI VOICE STUDIO
   Frontend logic
   ========================================================= */

const landingPage = document.getElementById("landing-page");
const workspace = document.getElementById("workspace");
const workspaceTitle = document.getElementById("workspace-title");

const toolNames = {
    tts: "Text to Speech",
    stt: "Speech to Text",
    extract: "Extract Voice",
    "video-text": "Video to Text"
};

const API = {
    tts: "/api/tts",
    stt: "/api/stt",
    extract: "/api/extract-audio",
    videoToText: "/api/video-to-text"
};

// Keep in sync with MAX_VIDEO_MB in .env (the backend enforces it as well).
const MAX_VIDEO_BYTES = 200 * 1024 * 1024;
const VIDEO_EXTENSIONS = [
    ".mp4", ".mov", ".mkv", ".webm", ".avi", ".m4v", ".mpeg", ".mpg", ".3gp", ".flv", ".wmv"
];

const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
const MAX_RECORDING_SECONDS = 300;
const AUDIO_EXTENSIONS = [
    ".mp3", ".wav", ".m4a", ".webm", ".ogg", ".flac", ".mp4", ".mpeg", ".mpga"
];

let currentTool = "tts";


/* =========================================================
   NAVIGATION
   ========================================================= */

function openWorkspace() {
    openTool("tts");
}

function showLanding() {
    workspace.classList.add("hidden");
    landingPage.classList.remove("hidden");

    window.scrollTo({ top: 0, behavior: "instant" });
}

function openTool(tool) {
    if (!toolNames[tool]) {
        return;
    }

    currentTool = tool;

    // Landing page feature cards call openTool() directly,
    // so make sure the workspace is visible.
    landingPage.classList.add("hidden");
    workspace.classList.remove("hidden");

    document.querySelectorAll(".tool-page").forEach(page => {
        page.classList.remove("active-tool");
    });

    document.querySelectorAll(".workspace-nav-item").forEach(item => {
        item.classList.remove("active");
    });

    const selectedPage = document.getElementById(`tool-${tool}`);
    const selectedNavigation = document.querySelector(
        `.workspace-nav-item[data-tool="${tool}"]`
    );

    if (selectedPage) {
        selectedPage.classList.add("active-tool");
    }

    if (selectedNavigation) {
        selectedNavigation.classList.add("active");
    }

    if (workspaceTitle) {
        workspaceTitle.textContent = toolNames[tool];
    }

    window.scrollTo({ top: 0, behavior: "instant" });
}


/* =========================================================
   SHARED HELPERS
   ========================================================= */

function showToast(message) {
    const toast = document.getElementById("toast");
    const toastMessage = document.getElementById("toast-message");

    if (!toast || !toastMessage) {
        return;
    }

    toastMessage.textContent = message;
    toast.classList.add("show");

    clearTimeout(window.lumiToastTimeout);

    window.lumiToastTimeout = setTimeout(() => {
        toast.classList.remove("show");
    }, 3500);
}

/** Small DOM builder. Uses textContent, so API text can never inject HTML. */
function createElement(tag, className, text) {
    const element = document.createElement(tag);

    if (className) {
        element.className = className;
    }
    if (text !== undefined) {
        element.textContent = text;
    }

    return element;
}

function formatBytes(bytes) {
    if (bytes < 1024) {
        return `${bytes} B`;
    }
    if (bytes < 1024 * 1024) {
        return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatTime(totalSeconds) {
    const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
    const seconds = String(totalSeconds % 60).padStart(2, "0");
    return `${minutes}:${seconds}`;
}

/**
 * Calls the backend. Resolves with parsed JSON or throws an Error
 * whose message is safe and readable for the user.
 */
async function callApi(url, options = {}, { timeoutMs = 120000, expect = "json" } = {}) {
    let response;

    try {
        response = await fetch(url, {
            ...options,
            signal: AbortSignal.timeout(timeoutMs)
        });
    } catch (error) {
        if (error.name === "TimeoutError") {
            throw new Error("The request took too long. Please try again.");
        }
        throw new Error(
            "Cannot reach the Lumi server. Make sure the backend is running " +
            "and open the site from http://localhost:3000."
        );
    }

    if (response.ok && expect === "blob") {
        return response.blob();
    }

    let data = null;
    try {
        data = await response.json();
    } catch (error) {
        data = null;
    }

    if (!response.ok) {
        throw new Error((data && data.error) || `Request failed (${response.status}).`);
    }

    return data;
}

function setButtonBusy(buttonId, labelId, busy, busyText, idleText) {
    const button = document.getElementById(buttonId);
    const label = document.getElementById(labelId);

    if (button) {
        button.disabled = busy;
        button.classList.toggle("is-busy", busy);
    }
    if (label) {
        label.textContent = busy ? busyText : idleText;
    }
}

function createSpinner() {
    return createElement("span", "spinner");
}

/* =========================================================
   TEXT TO SPEECH
   ========================================================= */

let ttsBusy = false;
let ttsAudioUrl = null;

function handleTextFile(input) {
    const file = input.files[0];

    if (!file) {
        return;
    }

    if (!file.name.toLowerCase().endsWith(".txt")) {
        showToast("Please select a TXT file.");
        input.value = "";
        return;
    }

    const reader = new FileReader();

    reader.onload = function (event) {
        const textarea = document.getElementById("tts-text");

        textarea.value = event.target.result;
        updateCharacterCount();
        showToast("Text file imported successfully.");
        input.value = "";
    };

    reader.onerror = function () {
        showToast("Could not read this file.");
        input.value = "";
    };

    reader.readAsText(file);
}

function clearTTS() {
    const textarea = document.getElementById("tts-text");

    textarea.value = "";
    updateCharacterCount();
}

function updateCharacterCount() {
    const textarea = document.getElementById("tts-text");
    const counter = document.getElementById("character-count");

    if (!textarea || !counter) {
        return;
    }

    counter.textContent = `${textarea.value.length.toLocaleString()} characters`;
}

function base64ToBlob(base64, mimeType) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);

    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }

    return new Blob([bytes], { type: mimeType });
}

function renderTtsLoading() {
    const container = document.getElementById("tts-result");
    const box = createElement("div", "result-placeholder");

    box.appendChild(createSpinner());
    box.appendChild(createElement("h3", "", "Generating speech…"));
    box.appendChild(createElement("p", "", "This usually takes a few seconds."));

    container.replaceChildren(box);
}

function renderTtsError(message) {
    const container = document.getElementById("tts-result");
    const box = createElement("div", "result-placeholder result-error");

    box.appendChild(createElement("div", "result-icon error-icon", "!"));
    box.appendChild(createElement("h3", "", "Speech could not be generated"));
    box.appendChild(createElement("p", "", message));

    container.replaceChildren(box);
}

function renderTtsResult(blob, format) {
    const container = document.getElementById("tts-result");

    if (ttsAudioUrl) {
        URL.revokeObjectURL(ttsAudioUrl);
    }
    ttsAudioUrl = URL.createObjectURL(blob);

    const extension = (format || "wav").toLowerCase();

    const head = createElement("div", "audio-result-head");
    const titles = createElement("div");
    titles.appendChild(createElement("span", "card-label", "GENERATED SPEECH"));
    titles.appendChild(createElement("h3", "", "Your audio is ready"));
    head.appendChild(titles);

    const player = document.createElement("audio");
    player.controls = true;
    player.src = ttsAudioUrl;
    player.className = "audio-player";

    const actions = createElement("div", "audio-result-actions");
    const download = createElement("a", "download-link", `Download ${extension.toUpperCase()}`);
    download.href = ttsAudioUrl;
    download.download = `lumi-speech.${extension}`;
    actions.appendChild(download);

    container.replaceChildren(head, player, actions);
}

async function generateSpeech() {
    if (ttsBusy) {
        return;
    }

    const text = document.getElementById("tts-text").value.trim();

    if (!text) {
        showToast("Add some text before generating speech.");
        return;
    }

    ttsBusy = true;
    setButtonBusy("tts-generate", "tts-generate-label", true,
        "Generating…", "Generate Speech");
    renderTtsLoading();

    try {
        const data = await callApi(API.tts, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                text,
                voice: document.getElementById("tts-voice").value,
                style: document.getElementById("tts-style").value
            })
        });

        const blob = base64ToBlob(data.audioBase64, data.mimeType || "audio/wav");
        renderTtsResult(blob, data.format);
    } catch (error) {
        renderTtsError(error.message);
    } finally {
        ttsBusy = false;
        setButtonBusy("tts-generate", "tts-generate-label", false,
            "Generating…", "Generate Speech");
    }
}


/* =========================================================
   SPEECH TO TEXT
   ========================================================= */

let sttFile = null;
let sttPreviewUrl = null;
let sttBusy = false;
let sttResultDefaultHtml = "";

let recorder = null;
let recordingStream = null;
let recordingChunks = [];
let recordingTimer = null;
let recordingSeconds = 0;

function isRecording() {
    return recorder !== null && recorder.state === "recording";
}

function updateSttControls() {
    const transcribe = document.getElementById("stt-transcribe");

    if (transcribe) {
        transcribe.disabled = sttBusy || isRecording() || !sttFile;
    }
}

function setSttFile(file) {
    if (sttPreviewUrl) {
        URL.revokeObjectURL(sttPreviewUrl);
        sttPreviewUrl = null;
    }

    sttFile = file;

    const selected = document.getElementById("stt-selected");
    const preview = document.getElementById("stt-preview");

    if (!file) {
        selected.classList.add("hidden");
        preview.removeAttribute("src");
        updateSttControls();
        return;
    }

    sttPreviewUrl = URL.createObjectURL(file);
    preview.src = sttPreviewUrl;

    document.getElementById("stt-file-name").textContent = file.name;
    document.getElementById("stt-file-size").textContent = formatBytes(file.size);
    selected.classList.remove("hidden");

    updateSttControls();
}

function removeSttFile() {
    if (sttBusy) {
        return;
    }
    setSttFile(null);
}

function handleSttFile(input) {
    const file = input.files[0];
    input.value = ""; // allows picking the same file again later

    acceptSttFile(file);
}

function acceptSttFile(file) {
    if (!file) {
        return;
    }

    const lowerName = file.name.toLowerCase();
    const supported = AUDIO_EXTENSIONS.some(extension => lowerName.endsWith(extension));

    if (!supported) {
        showToast("Unsupported format. Use MP3, WAV, M4A, WEBM, OGG or FLAC.");
        return;
    }

    if (file.size === 0) {
        showToast("This audio file is empty.");
        return;
    }

    if (file.size > MAX_AUDIO_BYTES) {
        showToast(`File is too large. The limit is ${formatBytes(MAX_AUDIO_BYTES)}.`);
        return;
    }

    if (isRecording()) {
        stopRecording();
    }

    setSttFile(file);
}

function pickRecorderMimeType() {
    const candidates = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/mp4",
        "audio/ogg;codecs=opus"
    ];

    return candidates.find(type => MediaRecorder.isTypeSupported(type)) || "";
}

function setRecordingUi(active) {
    const button = document.getElementById("stt-record");
    const label = document.getElementById("stt-record-label");

    button.classList.toggle("recording", active);
    label.textContent = active
        ? `Stop recording  ${formatTime(recordingSeconds)}`
        : "Record from microphone";
}

async function toggleRecording() {
    if (isRecording()) {
        stopRecording();
        return;
    }

    if (sttBusy) {
        return;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia ||
        typeof MediaRecorder === "undefined") {
        showToast("Recording is not supported in this browser.");
        return;
    }

    try {
        recordingStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (error) {
        showToast("Microphone access was blocked. Allow it in your browser and try again.");
        return;
    }

    const mimeType = pickRecorderMimeType();

    try {
        recorder = mimeType
            ? new MediaRecorder(recordingStream, { mimeType })
            : new MediaRecorder(recordingStream);
    } catch (error) {
        recordingStream.getTracks().forEach(track => track.stop());
        showToast("Could not start recording in this browser.");
        return;
    }

    recordingChunks = [];
    recordingSeconds = 0;

    recorder.ondataavailable = event => {
        if (event.data && event.data.size > 0) {
            recordingChunks.push(event.data);
        }
    };

    recorder.onstop = finishRecording;

    recorder.start();
    setRecordingUi(true);
    updateSttControls();

    recordingTimer = setInterval(() => {
        recordingSeconds += 1;
        setRecordingUi(true);

        if (recordingSeconds >= MAX_RECORDING_SECONDS) {
            stopRecording();
            showToast("Maximum recording length reached (5 minutes).");
        }
    }, 1000);
}

function stopRecording() {
    if (isRecording()) {
        recorder.stop();
    }
}

function finishRecording() {
    clearInterval(recordingTimer);
    recordingTimer = null;

    if (recordingStream) {
        recordingStream.getTracks().forEach(track => track.stop());
        recordingStream = null;
    }

    const type = ((recorder && recorder.mimeType) || "audio/webm").split(";")[0];
    const blob = new Blob(recordingChunks, { type });

    recorder = null;
    recordingChunks = [];
    setRecordingUi(false);

    if (blob.size === 0) {
        showToast("Nothing was recorded. Please try again.");
        updateSttControls();
        return;
    }

    let extension = ".webm";
    if (type.includes("mp4")) {
        extension = ".m4a";
    } else if (type.includes("ogg")) {
        extension = ".ogg";
    }

    setSttFile(new File([blob], `recording${extension}`, { type }));
}

function renderSttState(state, content) {
    const result = document.getElementById("stt-result");

    if (state === "text") {
        result.className = "transcript-text";
        result.replaceChildren(document.createTextNode(content));
        return;
    }

    result.className = "empty-transcript";

    if (state === "loading") {
        result.replaceChildren(
            createSpinner(),
            createElement("p", "", "Transcribing your audio…")
        );
    } else if (state === "error") {
        result.classList.add("transcript-error");
        result.replaceChildren(
            createElement("span", "", "!"),
            createElement("p", "", content)
        );
    } else {
        result.innerHTML = sttResultDefaultHtml;
    }
}

async function transcribeAudio() {
    if (sttBusy) {
        return;
    }

    if (!sttFile) {
        showToast("Choose or record an audio file first.");
        return;
    }

    sttBusy = true;
    updateSttControls();
    setButtonBusy("stt-transcribe", "stt-transcribe-label", true,
        "Transcribing…", "Transcribe");
    renderSttState("loading");

    try {
        const formData = new FormData();
        formData.append("audio", sttFile, sttFile.name);

        const language = document.getElementById("stt-language").value;
        if (language) {
            formData.append("language", language);
        }

        const data = await callApi(API.stt, { method: "POST", body: formData });

        renderSttState("text", data.text);
    } catch (error) {
        renderSttState("error", error.message);
    } finally {
        sttBusy = false;
        setButtonBusy("stt-transcribe", "stt-transcribe-label", false,
            "Transcribing…", "Transcribe");
        updateSttControls();
    }
}

function clearStt() {
    if (sttBusy) {
        return;
    }

    if (isRecording()) {
        stopRecording();
    }

    setSttFile(null);
    renderSttState("empty");
}


/* =========================================================
   VIDEO TOOLS (shared by Extract Voice and Video to Text)
   Element ids follow the pattern "<tool>-selected", "<tool>-preview",
   "<tool>-file-name", "<tool>-file-size", "<tool>-run", "<tool>-run-label".
   ========================================================= */

const videoTools = {
    "extract": { file: null, previewUrl: null, busy: false },
    "video-text": { file: null, previewUrl: null, busy: false }
};

function updateVideoControls(tool) {
    const state = videoTools[tool];
    const run = document.getElementById(`${tool}-run`);

    if (run) {
        run.disabled = state.busy || !state.file;
    }
}

function setVideoFile(tool, file) {
    const state = videoTools[tool];
    const selected = document.getElementById(`${tool}-selected`);
    const preview = document.getElementById(`${tool}-preview`);

    if (state.previewUrl) {
        URL.revokeObjectURL(state.previewUrl);
        state.previewUrl = null;
    }

    state.file = file;

    if (!file) {
        selected.classList.add("hidden");
        preview.removeAttribute("src");
        updateVideoControls(tool);
        return;
    }

    state.previewUrl = URL.createObjectURL(file);
    preview.src = state.previewUrl;

    document.getElementById(`${tool}-file-name`).textContent = file.name;
    document.getElementById(`${tool}-file-size`).textContent = formatBytes(file.size);
    selected.classList.remove("hidden");

    updateVideoControls(tool);
}

function removeVideoFile(tool) {
    if (videoTools[tool].busy) {
        return;
    }
    setVideoFile(tool, null);
}

function handleVideoFile(input, tool) {
    const file = input.files[0];
    input.value = ""; // allows picking the same file again later

    acceptVideoFile(tool, file);
}

function acceptVideoFile(tool, file) {
    if (!file || videoTools[tool].busy) {
        return;
    }

    const lowerName = file.name.toLowerCase();
    const supported = VIDEO_EXTENSIONS.some(extension => lowerName.endsWith(extension));

    if (!supported) {
        showToast("Unsupported format. Use MP4, MOV, MKV, WEBM or AVI.");
        return;
    }

    if (file.size === 0) {
        showToast("This video file is empty.");
        return;
    }

    if (file.size > MAX_VIDEO_BYTES) {
        showToast(`Video is too large. The limit is ${formatBytes(MAX_VIDEO_BYTES)}.`);
        return;
    }

    setVideoFile(tool, file);
}

/** Builds an audio player + download link, used for extracted audio. */
function buildAudioResult({ label, title, url, fileName, linkText }) {
    const head = createElement("div", "audio-result-head");
    const titles = createElement("div");
    titles.appendChild(createElement("span", "card-label", label));
    titles.appendChild(createElement("h3", "", title));
    head.appendChild(titles);

    const player = document.createElement("audio");
    player.controls = true;
    player.src = url;
    player.className = "audio-player";

    const actions = createElement("div", "audio-result-actions");
    const download = createElement("a", "download-link", linkText);
    download.href = url;
    download.download = fileName;
    actions.appendChild(download);

    return [head, player, actions];
}

function fileBaseName(fileName) {
    return fileName.replace(/\.[^.]+$/, "") || "audio";
}


/* =========================================================
   EXTRACT VOICE
   ========================================================= */

let extractAudioUrl = null;
let extractResultDefaultHtml = "";

function renderExtractState(state, content) {
    const container = document.getElementById("extract-result");

    if (state === "loading") {
        const box = createElement("div", "result-placeholder");
        box.appendChild(createSpinner());
        box.appendChild(createElement("h3", "", "Extracting audio…"));
        box.appendChild(createElement("p", "", "Large videos can take a little while."));
        container.replaceChildren(box);
    } else if (state === "error") {
        const box = createElement("div", "result-placeholder result-error");
        box.appendChild(createElement("div", "result-icon error-icon", "!"));
        box.appendChild(createElement("h3", "", "Audio could not be extracted"));
        box.appendChild(createElement("p", "", content));
        container.replaceChildren(box);
    } else {
        container.innerHTML = extractResultDefaultHtml;
    }
}

async function extractAudio() {
    const state = videoTools.extract;

    if (state.busy) {
        return;
    }
    if (!state.file) {
        showToast("Choose a video first.");
        return;
    }

    state.busy = true;
    updateVideoControls("extract");
    setButtonBusy("extract-run", "extract-run-label", true, "Extracting…", "Extract Voice");
    renderExtractState("loading");

    try {
        const formData = new FormData();
        formData.append("video", state.file, state.file.name);

        const blob = await callApi(
            API.extract,
            { method: "POST", body: formData },
            { timeoutMs: 600000, expect: "blob" }
        );

        if (extractAudioUrl) {
            URL.revokeObjectURL(extractAudioUrl);
        }
        extractAudioUrl = URL.createObjectURL(blob);

        document.getElementById("extract-result").replaceChildren(
            ...buildAudioResult({
                label: "EXTRACTED AUDIO",
                title: `Audio from ${state.file.name}`,
                url: extractAudioUrl,
                fileName: `${fileBaseName(state.file.name)}.mp3`,
                linkText: `Download MP3 (${formatBytes(blob.size)})`
            })
        );
    } catch (error) {
        renderExtractState("error", error.message);
    } finally {
        state.busy = false;
        setButtonBusy("extract-run", "extract-run-label", false, "Extracting…", "Extract Voice");
        updateVideoControls("extract");
    }
}

function clearExtract() {
    if (videoTools.extract.busy) {
        return;
    }

    if (extractAudioUrl) {
        URL.revokeObjectURL(extractAudioUrl);
        extractAudioUrl = null;
    }

    setVideoFile("extract", null);
    renderExtractState("empty");
}


/* =========================================================
   VIDEO TO TEXT
   ========================================================= */

const FLOW_ORDER = ["upload", "extract", "transcribe", "result"];

// Server stage name -> index of the step that is now active.
const SERVER_STAGE_TO_FLOW = { extracting: 1, transcribing: 2, preparing: 3 };

const STAGE_MESSAGES = {
    upload: "Uploading video…",
    extracting: "Extracting audio…",
    transcribing: "Transcribing…",
    preparing: "Preparing result…"
};

let videoTextResultDefaultHtml = "";
let videoTextAudioUrl = null;

/** activeIndex = step in progress. done = true marks every step finished. */
function setFlow(activeIndex, done = false) {
    document.querySelectorAll(".flow-item").forEach(item => {
        const index = FLOW_ORDER.indexOf(item.dataset.stage);

        item.classList.toggle("done", done || (activeIndex !== null && index < activeIndex));
        item.classList.toggle("active", !done && index === activeIndex);
    });
}

function renderVideoTextState(state, content) {
    const result = document.getElementById("video-text-result");

    if (state === "text") {
        result.className = "transcript-text";
        result.replaceChildren(document.createTextNode(content));
        return;
    }

    result.className = "empty-transcript";

    if (state === "loading") {
        result.replaceChildren(createSpinner(), createElement("p", "", content));
    } else if (state === "error") {
        result.classList.add("transcript-error");
        result.replaceChildren(createElement("span", "", "!"), createElement("p", "", content));
    } else {
        result.innerHTML = videoTextResultDefaultHtml;
    }
}

function hideVideoTextAudio() {
    const box = document.getElementById("video-text-audio");

    if (videoTextAudioUrl) {
        URL.revokeObjectURL(videoTextAudioUrl);
        videoTextAudioUrl = null;
    }

    box.classList.add("hidden");
    box.replaceChildren();
}

function showVideoTextAudio(audio, videoName) {
    const box = document.getElementById("video-text-audio");

    if (videoTextAudioUrl) {
        URL.revokeObjectURL(videoTextAudioUrl);
    }

    videoTextAudioUrl = URL.createObjectURL(base64ToBlob(audio.base64, audio.mimeType));

    box.replaceChildren(
        ...buildAudioResult({
            label: "EXTRACTED AUDIO",
            title: "Audio used for transcription",
            url: videoTextAudioUrl,
            fileName: `${fileBaseName(videoName)}.${audio.format}`,
            linkText: `Download audio (${audio.format.toUpperCase()})`
        })
    );
    box.classList.remove("hidden");
}

/**
 * Reads a newline-delimited JSON stream and calls onMessage for each line.
 */
async function readNdjson(response, onMessage) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
        const { value, done } = await reader.read();

        buffer += decoder.decode(value || new Uint8Array(), { stream: !done });

        let newline;
        while ((newline = buffer.indexOf("\n")) !== -1) {
            const line = buffer.slice(0, newline).trim();
            buffer = buffer.slice(newline + 1);

            if (line) {
                onMessage(JSON.parse(line));
            }
        }

        if (done) {
            break;
        }
    }

    if (buffer.trim()) {
        onMessage(JSON.parse(buffer.trim()));
    }
}

async function transcribeVideo() {
    const state = videoTools["video-text"];

    if (state.busy) {
        return;
    }
    if (!state.file) {
        showToast("Choose a video first.");
        return;
    }

    state.busy = true;
    updateVideoControls("video-text");
    setButtonBusy("video-text-run", "video-text-run-label", true,
        "Working…", "Start Transcription");
    hideVideoTextAudio();
    setFlow(0);
    renderVideoTextState("loading", STAGE_MESSAGES.upload);

    try {
        const formData = new FormData();
        formData.append("video", state.file, state.file.name);

        const language = document.getElementById("video-text-language").value;
        if (language) {
            formData.append("language", language);
        }

        let response;
        try {
            response = await fetch(API.videoToText, {
                method: "POST",
                body: formData,
                signal: AbortSignal.timeout(900000)
            });
        } catch (error) {
            throw new Error(
                error.name === "TimeoutError"
                    ? "The request took too long. Try a shorter video."
                    : "Cannot reach the Lumi server. Make sure the backend is running " +
                      "and open the site from http://localhost:3000."
            );
        }

        if (!response.ok) {
            let message = `Request failed (${response.status}).`;
            try {
                message = (await response.json()).error || message;
            } catch (error) {
                // keep the generic message
            }
            throw new Error(message);
        }

        let finalMessage = null;

        await readNdjson(response, message => {
            if (message.error) {
                throw new Error(message.error);
            }

            if (message.stage) {
                setFlow(SERVER_STAGE_TO_FLOW[message.stage]);
                renderVideoTextState("loading", STAGE_MESSAGES[message.stage]);
            }

            if (message.done) {
                finalMessage = message;
            }
        });

        if (!finalMessage) {
            throw new Error("Processing was interrupted. Please try again.");
        }

        setFlow(null, true);
        renderVideoTextState("text", finalMessage.text);

        if (finalMessage.audio) {
            showVideoTextAudio(finalMessage.audio, state.file.name);
        }
    } catch (error) {
        setFlow(null, false);
        renderVideoTextState("error", error.message);
    } finally {
        state.busy = false;
        setButtonBusy("video-text-run", "video-text-run-label", false,
            "Working…", "Start Transcription");
        updateVideoControls("video-text");
    }
}

function clearVideoText() {
    if (videoTools["video-text"].busy) {
        return;
    }

    hideVideoTextAudio();
    setVideoFile("video-text", null);
    setFlow(null, false);
    renderVideoTextState("empty");
}


/* =========================================================
   DRAG & DROP
   ========================================================= */

function setupDropzone(card, onFile) {
    if (!card) {
        return;
    }

    card.addEventListener("dragover", event => {
        event.preventDefault();
        card.classList.add("drag-over");
    });

    card.addEventListener("dragleave", event => {
        if (!card.contains(event.relatedTarget)) {
            card.classList.remove("drag-over");
        }
    });

    card.addEventListener("drop", event => {
        event.preventDefault();
        card.classList.remove("drag-over");

        const file = event.dataTransfer && event.dataTransfer.files[0];
        if (file) {
            onFile(file);
        }
    });
}


/* =========================================================
   TRANSCRIPT ACTIONS (Speech to Text + Video to Text)
   ========================================================= */

function getTranscriptText() {
    const resultId = currentTool === "video-text"
        ? "video-text-result"
        : "stt-result";

    const result = document.getElementById(resultId);

    if (!result || !result.classList.contains("transcript-text")) {
        return "";
    }

    return result.textContent.trim();
}

function copyResult() {
    const text = getTranscriptText();

    if (!text) {
        showToast("There is no transcript to copy yet.");
        return;
    }

    if (navigator.clipboard) {
        navigator.clipboard.writeText(text)
            .then(() => showToast("Transcript copied."))
            .catch(() => showToast("Could not copy the transcript."));
    } else {
        showToast("Copy is not supported in this browser.");
    }
}

function downloadTranscript() {
    const text = getTranscriptText();

    if (!text) {
        showToast("There is no transcript to download yet.");
        return;
    }

    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = "transcript.txt";
    document.body.appendChild(link);
    link.click();
    link.remove();

    URL.revokeObjectURL(url);
}


/* =========================================================
   INIT
   ========================================================= */

document.addEventListener("DOMContentLoaded", () => {
    const textarea = document.getElementById("tts-text");

    if (textarea) {
        textarea.addEventListener("input", updateCharacterCount);
        updateCharacterCount();
    }

    const sttResult = document.getElementById("stt-result");
    if (sttResult) {
        sttResultDefaultHtml = sttResult.innerHTML;
    }

    extractResultDefaultHtml = document.getElementById("extract-result").innerHTML;
    videoTextResultDefaultHtml = document.getElementById("video-text-result").innerHTML;

    setupDropzone(document.getElementById("stt-file").closest(".upload-card"), acceptSttFile);
    setupDropzone(document.getElementById("extract-file").closest(".upload-card"),
        file => acceptVideoFile("extract", file));
    setupDropzone(document.getElementById("video-text-file").closest(".upload-card"),
        file => acceptVideoFile("video-text", file));

    // A file dropped outside a drop zone must not make the browser navigate away.
    ["dragover", "drop"].forEach(type => {
        window.addEventListener(type, event => event.preventDefault());
    });

    // Smooth scrolling for landing-page anchors.
    document
        .querySelectorAll('.nav-links a[href^="#"], .secondary-button[href^="#"], .footer-links a[href^="#"]')
        .forEach(link => {
            link.addEventListener("click", event => {
                const targetId = link.getAttribute("href");

                if (!targetId || targetId === "#") {
                    return;
                }

                const target = document.querySelector(targetId);

                if (!target) {
                    return;
                }

                event.preventDefault();
                target.scrollIntoView({ behavior: "smooth" });
            });
        });
});
