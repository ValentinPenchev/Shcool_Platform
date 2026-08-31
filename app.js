const API_URL = "https://shcool-platform.onrender.com/api";

// Извличане на assignment_id от URL (напр. ?id=123)
const urlParams = new URLSearchParams(window.location.search);
const assignmentId = urlParams.get('id');

let selectedFile = null;
let assignmentData = null;

document.addEventListener("DOMContentLoaded", () => {
    loadAssignment();
    setupDragAndDrop();
    setupSubmissionForm();
});

function showAlert(message) {
    const alertBox = document.getElementById("page-alert");
    alertBox.textContent = message;
    alertBox.style.display = "block";
}

// Зареждане на информацията за задачата (клас, критерии) и списъка с ученици
async function loadAssignment() {
    if (!assignmentId) {
        showAlert("Липсва линк към задача. Помолете учителя за индивидуалния линк на задачата.");
        document.getElementById("submission-form").style.display = "none";
        return;
    }

    try {
        const res = await fetch(`${API_URL}/assignments/${encodeURIComponent(assignmentId)}`);
        if (!res.ok) throw new Error("Задачата не е намерена. Проверете дали линкът е коректен.");

        assignmentData = await res.json();

        const subtitle = document.getElementById("assignment-subtitle");
        subtitle.textContent = `Задача: ${assignmentData.title} · Клас: ${assignmentData.group_name || assignmentData.group_id}`;

        const select = document.getElementById("student-select");
        if (assignmentData.students && Array.isArray(assignmentData.students)) {
            assignmentData.students.forEach(studentName => {
                const opt = document.createElement("option");
                opt.value = studentName;
                opt.textContent = studentName;
                select.appendChild(opt);
            });
        }
    } catch (err) {
        console.error("Грешка при зареждане на задачата:", err);
        showAlert(err.message || "Грешка при зареждане на задачата.");
        document.getElementById("submission-form").style.display = "none";
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
        submitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Проверка на файла...`;

        const formData = new FormData();
        formData.append("class_id", assignmentData.group_id);
        formData.append("student_name", studentName);
        formData.append("criteria_json", JSON.stringify(assignmentData.criteria || {}));
        formData.append("assignment_id", assignmentId);
        formData.append("file", selectedFile);

        try {
            const res = await fetch(`${API_URL}/evaluate`, {
                method: "POST",
                body: formData
            });

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.detail || `HTTP грешка: ${res.status}`);
            }

            const result = await res.json();
            showResult(result);
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

    document.getElementById("result-panel").style.display = "block";
}
