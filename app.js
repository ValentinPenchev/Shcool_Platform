// Автоматично определяне на API URL за локално тестване и за Render
const API_URL = window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost"
    ? "http://127.0.0.1:8000/api"
    : "https://evaluator-backend.onrender.com/api";

let currentAssignment = null;

// При зареждане на страницата извличаме задачата от URL (?task=ID)
document.addEventListener("DOMContentLoaded", async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const taskId = urlParams.get("task");

    if (!taskId) {
        document.getElementById("task-title").innerText = "Грешка: Липсва идентификатор на задача!";
        document.getElementById("submission-form").style.display = "none";
        return;
    }

    await loadAssignmentData(taskId);
});

// Зареждане на данните за задачата и списъка с ученици
async function loadAssignmentData(taskId) {
    try {
        const response = await fetch(`${API_URL}/assignments/${taskId}`);
        if (!response.ok) {
            throw new Error("Задачата не беше намерена.");
        }

        currentAssignment = await response.json();

        // Попълване на заглавието и класа
        document.getElementById("task-title").innerText = currentAssignment.title;
        document.getElementById("group-name-display").innerText = `Клас/Група: ${currentAssignment.group_name || currentAssignment.group_id}`;

        // Попълване на падащото меню с ученици
        const select = document.getElementById("student-select");
        select.innerHTML = '<option value="">-- Изберете име от списъка --</option>';
        
        const studentsList = currentAssignment.students || currentAssignment.students_json || [];
        
        studentsList.forEach(student => {
            const opt = document.createElement("option");
            opt.value = student;
            opt.textContent = student;
            select.appendChild(opt);
        });

    } catch (err) {
        document.getElementById("task-title").innerText = "Грешка при зареждане на задачата.";
        console.error(err);
    }
}

// Изпращане на файла за оценяване
document.getElementById("submission-form").addEventListener("submit", async (e) => {
    e.preventDefault();

    const studentName = document.getElementById("student-select").value;
    const fileInput = document.getElementById("file-input");

    if (!studentName || fileInput.files.length === 0) {
        alert("Моля, изберете име и прикачете файл.");
        return;
    }

    const formData = new FormData();
    formData.append("class_id", currentAssignment.group_id);
    formData.append("student_name", studentName);
    formData.append("criteria_json", JSON.stringify(currentAssignment.criteria || {}));
    formData.append("file", fileInput.files[0]);

    // Показване на индикатор за зареждане
    const submitBtn = document.getElementById("submit-btn");
    document.getElementById("loader").classList.remove("hidden");
    document.getElementById("result-box").classList.add("hidden");
    submitBtn.disabled = true;

    try {
        const response = await fetch(`${API_URL}/evaluate`, {
            method: "POST",
            body: formData
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ detail: "Грешка при оценяването." }));
            throw new Error(errorData.detail || "Грешка при оценяването.");
        }

        const data = await response.json();
        displayResults(data);

    } catch (err) {
        alert("Възникна грешка: " + err.message);
    } finally {
        document.getElementById("loader").classList.add("hidden");
        submitBtn.disabled = false;
    }
});

// Визуализация на резултатите
function displayResults(data) {
    document.getElementById("result-box").classList.remove("hidden");

    document.getElementById("score-percentage").innerText = `${data.percentage}%`;
    document.getElementById("score-points").innerText = `(${data.score} / ${data.max_score} точки)`;

    // Плагиатство
    const plagBox = document.getElementById("plagiarism-warning");
    if (data.plagiarism_flag) {
        plagBox.classList.remove("hidden");
        document.getElementById("plagiarism-note").innerText = data.plagiarism_note;
    } else {
        plagBox.classList.add("hidden");
    }

    // Детайли по критериите
    const detailsList = document.getElementById("details-list");
    detailsList.innerHTML = "";

    if (data.details && Array.isArray(data.details)) {
        data.details.forEach(item => {
            const li = document.createElement("li");
            li.style.color = item.passed ? "var(--success-color)" : "var(--warning-color)";
            li.style.marginBottom = "6px";
            li.innerHTML = `<strong>${item.passed ? "✓" : "✗"} ${item.criterion}:</strong> ${item.note} (${item.score}/${item.max} т.)`;
            detailsList.appendChild(li);
        });
    }
}