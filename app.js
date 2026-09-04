const API_URL = "https://shcool-platform.onrender.com/api";

// Извличане на assignment_id (?id=123), клас за свободно качване на упражнения
// (?exercise=8a) или клас за емоциометър (?mood=8a) от URL - режимите споделят страницата
const urlParams = new URLSearchParams(window.location.search);
const assignmentId = urlParams.get('id');
const exerciseClassId = urlParams.get('exercise');
const moodClassId = urlParams.get('mood');
// ?files=<request_id> - самостоятелна заявка за файл, при която името не е задължително
const fileRequestId = urlParams.get('files');
const pageMode = assignmentId ? 'assignment'
    : (exerciseClassId ? 'exercise'
    : (moodClassId ? 'mood'
    : (fileRequestId ? 'filerequest' : null)));

const FILE_REQUEST_ACCEPT = ".docx,.doc,.xlsx,.xls,.pptx,.ppt,.pdf,.txt,.csv,.png,.jpg,.jpeg";

let selectedFile = null;
let assignmentData = null;

document.addEventListener("DOMContentLoaded", () => {
    loadPageContext();
    setupDragAndDrop();
    setupSubmissionForm();
});

function showAlert(message) {
    const alertBox = document.getElementById("page-alert");
    alertBox.textContent = message;
    alertBox.style.display = "block";
}

function loadPageContext() {
    if (pageMode === 'assignment') return loadAssignment();
    if (pageMode === 'exercise') return loadExerciseClass();
    if (pageMode === 'mood') return loadMoodClass();
    if (pageMode === 'filerequest') return loadFileRequest();

    showAlert("Липсва линк към задача или клас. Помолете учителя за индивидуалния линк.");
    document.getElementById("submission-form").style.display = "none";
}

// Режим "заявка за файл" - показва заглавието на заявката и разхлабва формата:
// името става незадължително текстово поле, а разрешените формати са по-широки
async function loadFileRequest() {
    const nameSelect = document.getElementById("student-select");
    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.id = "uploader-name";
    nameInput.className = "custom-input";
    nameInput.placeholder = "Име (незадължително)";
    nameSelect.replaceWith(nameInput);
    document.querySelector('label[for="student-select"]').textContent = "Вашето име (незадължително)";

    const fileInput = document.getElementById("file-input");
    fileInput.setAttribute("accept", FILE_REQUEST_ACCEPT);
    document.querySelector(".file-field-wrapper label").textContent = "Изберете файл";

    const formatsText = document.getElementById("formats-text");
    if (formatsText) {
        formatsText.textContent = "Позволени са: Word, Excel, PowerPoint, PDF, TXT, CSV, PNG, JPEG";
    }
    // Значките W/X/P важат само за режима със задачите
    const formatBadges = document.getElementById("format-badges");
    if (formatBadges) formatBadges.style.display = "none";

    const submitBtn = document.getElementById("submit-btn");
    if (submitBtn) submitBtn.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> Качи файла';

    try {
        const res = await fetch(`${API_URL}/file-request/${encodeURIComponent(fileRequestId)}`);
        if (!res.ok) throw new Error("Линкът не е валиден или заявката е изтрита.");
        const data = await res.json();

        document.getElementById("submission-title").textContent = data.title || "Качване на файл";
        document.getElementById("assignment-subtitle").textContent =
            data.note || "Изберете файл и го качете - името не е задължително.";
    } catch (err) {
        showAlert(err.message || "Грешка при зареждане на заявката.");
        document.getElementById("submission-form").style.display = "none";
    }
}

// Зареждане на информацията за задачата (клас, критерии) и списъка с ученици
async function loadAssignment() {
    try {
        const res = await fetch(`${API_URL}/assignments/${encodeURIComponent(assignmentId)}`);
        if (!res.ok) throw new Error("Задачата не е намерена. Проверете дали линкът е коректен.");

        assignmentData = await res.json();

        const subtitle = document.getElementById("assignment-subtitle");
        subtitle.textContent = `Задача: ${assignmentData.title} · Клас: ${assignmentData.group_name || assignmentData.group_id}`;

        if (assignmentData.deadline) {
            const deadlineEl = document.getElementById("assignment-deadline");
            const isPast = new Date(assignmentData.deadline) < new Date();
            deadlineEl.textContent = `Краен срок: ${formatDeadline(assignmentData.deadline)}${isPast ? " (изтекъл)" : ""}`;
            deadlineEl.style.color = isPast ? "#dc2626" : "";
            deadlineEl.style.display = "block";
        }

        showReferenceMaterials(assignmentData);
        populateStudentSelect(assignmentData.students);
    } catch (err) {
        console.error("Грешка при зареждане на задачата:", err);
        showAlert(err.message || "Грешка при зареждане на задачата.");
        document.getElementById("submission-form").style.display = "none";
    }
}

function formatDeadline(dateStr) {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Показва линкове към помощните материали на задачата (файл и/или външен линк), ако има
function showReferenceMaterials(data) {
    const links = [];
    if (data.reference_file_url) {
        links.push(`<a href="${data.reference_file_url}" target="_blank" rel="noopener">Изтегли примерен файл</a>`);
    }
    if (data.reference_link) {
        links.push(`<a href="${data.reference_link}" target="_blank" rel="noopener">Отвори помощен линк</a>`);
    }
    if (links.length > 0) {
        document.getElementById("reference-materials-links").innerHTML = links.join(" &middot; ");
        document.getElementById("reference-materials-card").style.display = "flex";
    }
}

// Зареждане на класа за свободно качване на упражнения (без критерии/оценяване)
async function loadExerciseClass() {
    try {
        const res = await fetch(`${API_URL}/groups/${encodeURIComponent(exerciseClassId)}`);
        if (!res.ok) throw new Error("Класът не е намерен. Проверете дали линкът е коректен.");

        assignmentData = await res.json();

        document.getElementById("assignment-subtitle").textContent =
            `Качване на упражнение · Клас: ${assignmentData.group_name || assignmentData.group_id} · 5 качвания = оценка Отличен`;
        document.getElementById("submit-btn").innerHTML = `<i class="fa-solid fa-paper-plane"></i> Качи упражнението`;

        populateStudentSelect(assignmentData.students);
    } catch (err) {
        console.error("Грешка при зареждане на класа:", err);
        showAlert(err.message || "Грешка при зареждане на класа.");
        document.getElementById("submission-form").style.display = "none";
    }
}

// Емоциометър - публична страница за дневно гласуване по клас, без нужда от парола
const EMOTION_CONFIG = {
    "Щастлив": { emoji: "😊", cssClass: "happy" },
    "Тъжен": { emoji: "😢", cssClass: "sad" },
    "Кисел": { emoji: "😖", cssClass: "sour" },
    "Доволен": { emoji: "😌", cssClass: "content" },
    "Любопитен": { emoji: "🤔", cssClass: "curious" },
    "Притеснен": { emoji: "😰", cssClass: "worried" },
    "Влюбен": { emoji: "😍", cssClass: "love" }
};
let moodCounts = {};

function formatDateForInput(date) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

async function loadMoodClass() {
    document.getElementById("submission-card").style.display = "none";
    document.getElementById("mood-card").style.display = "block";

    try {
        const res = await fetch(`${API_URL}/groups/${encodeURIComponent(moodClassId)}`);
        if (!res.ok) throw new Error("Класът не е намерен. Проверете дали линкът е коректен.");
        const data = await res.json();
        document.getElementById("mood-class-title").textContent = `Емоциометър за клас ${data.group_name || data.group_id}`;
    } catch (err) {
        console.error("Грешка при зареждане на класа:", err);
        const alertBox = document.getElementById("mood-alert");
        alertBox.textContent = err.message || "Грешка при зареждане на класа.";
        alertBox.style.display = "block";
    }

    await loadMoodCounts();
}

async function loadMoodCounts() {
    const today = formatDateForInput(new Date());
    try {
        const res = await fetch(`${API_URL}/emotions?group_id=${encodeURIComponent(moodClassId)}&record_date=${today}`);
        if (!res.ok) throw new Error("Грешка при заявката към сървъра");
        moodCounts = await res.json();
    } catch (err) {
        console.error("Грешка при зареждане на емоциите:", err);
        moodCounts = {};
    }
    renderMoodGrid();
}

function renderMoodGrid() {
    const container = document.getElementById("mood-grid");
    container.innerHTML = Object.keys(EMOTION_CONFIG).map(emotion => {
        const cfg = EMOTION_CONFIG[emotion];
        const count = moodCounts[emotion] || 0;
        return `
            <button type="button" class="emotion-btn ${cfg.cssClass}" data-emotion="${emotion}" onclick="voteMoodEmotion('${emotion}')">
                <span class="emotion-emoji">${cfg.emoji}</span>
                <span class="emotion-label">${emotion}</span>
                <span class="emotion-count">${count} ${count === 1 ? 'глас' : 'гласа'}</span>
            </button>
        `;
    }).join("");
}

async function voteMoodEmotion(emotion) {
    const today = formatDateForInput(new Date());
    const formData = new FormData();
    formData.append("class_id", moodClassId);
    formData.append("record_date", today);
    formData.append("emotion", emotion);

    try {
        const res = await fetch(`${API_URL}/emotions/vote`, { method: "POST", body: formData });
        if (!res.ok) throw new Error("Грешка при гласуването");
        const result = await res.json();
        moodCounts[emotion] = result.count;
        renderMoodGrid();
        const btn = document.querySelector(`.emotion-btn[data-emotion="${CSS.escape(emotion)}"]`);
        if (btn) {
            btn.classList.add("pulse");
            setTimeout(() => btn.classList.remove("pulse"), 400);
        }
    } catch (err) {
        console.error("Грешка при гласуване:", err);
    }
}

function populateStudentSelect(students) {
    const select = document.getElementById("student-select");
    if (students && Array.isArray(students)) {
        students.forEach(studentName => {
            const opt = document.createElement("option");
            opt.value = studentName;
            opt.textContent = studentName;
            select.appendChild(opt);
        });
    }
}

// Управление на Drag & Drop и избор на файл
function setupDragAndDrop() {
    const dropZone = document.getElementById("drop-zone");
    const fileInput = document.getElementById("file-input");

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => dropZone.classList.add('dragover'), false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => dropZone.classList.remove('dragover'), false);
    });

    dropZone.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        const files = dt.files;
        handleFiles(files);
    });

    fileInput.addEventListener('change', (e) => {
        handleFiles(e.target.files);
    });
}

function handleFiles(files) {
    if (files.length > 0) {
        selectedFile = files[0];
        document.getElementById("file-name-display").innerText = `Избран файл: ${selectedFile.name}`;
    }
}

// Изпращане на файла за проверка и визуализация на резултата
function setupSubmissionForm() {
    document.getElementById("submission-form")?.addEventListener("submit", async (e) => {
        e.preventDefault();

        if (pageMode === 'filerequest') {
            if (!selectedFile) {
                alert("Моля, изберете файл за качване.");
                return;
            }
            return submitFileRequestUpload();
        }

        const studentName = document.getElementById("student-select").value;
        if (!studentName) {
            alert("Моля, изберете вашето име.");
            return;
        }
        if (!selectedFile) {
            alert("Моля, изберете файл за предаване.");
            return;
        }
        if (!assignmentData) {
            alert("Липсва информация за задачата. Презаредете страницата.");
            return;
        }

        const submitBtn = document.getElementById("submit-btn");
        const originalBtnHtml = submitBtn.innerHTML;
        submitBtn.disabled = true;
        submitBtn.innerHTML = pageMode === 'exercise'
            ? `<i class="fa-solid fa-spinner fa-spin"></i> Качване...`
            : `<i class="fa-solid fa-spinner fa-spin"></i> Проверка на файла...`;

        const formData = new FormData();
        formData.append("class_id", assignmentData.group_id);
        formData.append("student_name", studentName);
        formData.append("file", selectedFile);

        const endpoint = pageMode === 'exercise' ? '/exercise/upload' : '/evaluate';
        if (pageMode === 'assignment') {
            formData.append("criteria_json", JSON.stringify(assignmentData.criteria || {}));
            formData.append("assignment_id", assignmentId);
        }

        try {
            const res = await fetch(`${API_URL}${endpoint}`, {
                method: "POST",
                body: formData
            });

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.detail || `HTTP грешка: ${res.status}`);
            }

            const result = await res.json();
            if (pageMode === 'exercise') {
                showExerciseResult(result);
            } else {
                showResult(result);
            }
        } catch (err) {
            alert("Грешка при предаването: " + err.message);
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalBtnHtml;
        }
    });
}

// Качване по заявка за файл - без проверка и без задължително име
async function submitFileRequestUpload() {
    const submitBtn = document.getElementById("submit-btn");
    const originalBtnHtml = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Качване...';

    const formData = new FormData();
    formData.append("file", selectedFile);
    formData.append("uploader_name", document.getElementById("uploader-name")?.value.trim() || "");

    try {
        const res = await fetch(`${API_URL}/file-request/${encodeURIComponent(fileRequestId)}/upload`, {
            method: "POST",
            body: formData
        });
        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.detail || `HTTP грешка: ${res.status}`);
        }
        const result = await res.json();

        document.getElementById("submission-form").style.display = "none";
        document.getElementById("page-alert").style.display = "none";
        document.getElementById("result-title").textContent = "Файлът е качен успешно!";
        document.getElementById("result-filename").textContent = result.filename || "";
        ["result-score-row", "result-grade", "result-exercise-progress"].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = "none";
        });
        document.getElementById("result-panel").style.display = "block";
    } catch (err) {
        alert("Грешка при качването: " + err.message);
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalBtnHtml;
    }
}

function showResult(result) {
    document.getElementById("submission-form").style.display = "none";
    document.getElementById("page-alert").style.display = "none";

    document.getElementById("result-filename").textContent = result.filename || "";
    document.getElementById("result-score-value").textContent = result.score ?? 0;
    document.getElementById("result-max-score").textContent = result.max_score ?? 0;
    document.getElementById("result-percentage").textContent = `${result.percentage ?? 0}%`;

    const gradeEl = document.getElementById("result-grade");
    if (result.grade) {
        const tier = result.grade >= 5 ? "grade-high" : (result.grade === 4 ? "grade-mid" : "grade-low");
        gradeEl.className = `badge-status grade-badge ${tier}`;
        gradeEl.textContent = `Оценка: ${result.grade} (${result.grade_label || ""})`;
        gradeEl.style.display = "inline-flex";
    } else {
        gradeEl.style.display = "none";
    }

    document.getElementById("result-panel").style.display = "block";
}

// Резултатен панел за свободно качване на упражнение (без критерии/точки)
function showExerciseResult(result) {
    document.getElementById("submission-form").style.display = "none";
    document.getElementById("page-alert").style.display = "none";

    document.getElementById("result-title").textContent = result.excellent
        ? "Упражнението е качено! Достигнахте 5 качвания."
        : "Упражнението е качено успешно!";
    document.getElementById("result-filename").textContent = result.filename || "";
    document.getElementById("result-score-row").style.display = "none";

    const gradeEl = document.getElementById("result-grade");
    if (result.excellent) {
        gradeEl.className = "badge-status grade-badge grade-high";
        gradeEl.textContent = "Оценка: 6 (Отличен)";
        gradeEl.style.display = "inline-flex";
    } else {
        gradeEl.style.display = "none";
    }

    const progressEl = document.getElementById("result-exercise-progress");
    progressEl.textContent = result.excellent
        ? `Качени упражнения: ${result.count} / 5`
        : `Качени упражнения: ${result.count} / 5 · Още ${result.remaining} до оценка Отличен`;
    progressEl.style.display = "block";

    document.getElementById("result-panel").style.display = "block";
}
