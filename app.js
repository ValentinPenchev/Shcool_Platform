const API_URL = "https://shcool-platform.onrender.com/api";

// Извличане на assignment_id (?id=123) или клас за свободно качване на упражнения
// (?exercise=8a) от URL - двата режима споделят една и съща страница/форма
const urlParams = new URLSearchParams(window.location.search);
const assignmentId = urlParams.get('id');
const exerciseClassId = urlParams.get('exercise');
const pageMode = assignmentId ? 'assignment' : (exerciseClassId ? 'exercise' : null);

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

    showAlert("Липсва линк към задача или клас. Помолете учителя за индивидуалния линк.");
    document.getElementById("submission-form").style.display = "none";
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
