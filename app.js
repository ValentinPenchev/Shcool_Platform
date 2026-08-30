const API_URL = "https://shcool-platform.onrender.com/api";
let currentAssignment = null;

document.addEventListener("DOMContentLoaded", async () => {
    const taskId = new URLSearchParams(window.location.search).get("task");
    if (taskId) {
        await loadAssignment(taskId);
    }
});

// Зарежда информация за конкретната задача и списъка с ученици
async function loadAssignment(taskId) {
    try {
        const res = await fetch(`${API_URL}/assignments/${taskId}`);
        if (!res.ok) throw new Error("Задачата не беше намерена.");

        currentAssignment = await res.json();

        // Попълване на заглавието
        const titleEl = document.getElementById("task-title");
        if (titleEl) titleEl.innerText = currentAssignment.title;

        // Попълване на учениците в падащото меню
        const studentSelect = document.getElementById("student-select");
        if (studentSelect && currentAssignment.students) {
            studentSelect.innerHTML = '<option value="">-- Изберете вашето име --</option>';
            currentAssignment.students.forEach(name => {
                studentSelect.innerHTML += `<option value="${name}">${name}</option>`;
            });
        }
    } catch (e) {
        alert("Грешка при зареждане на задачата: " + e.message);
    }
}

// Форма за предаване на решение от ученик
document.getElementById("submission-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();

    const studentSelect = document.getElementById("student-select");
    const fileInput = document.getElementById("file-input");

    if (!studentSelect || !studentSelect.value) {
        alert("Моля, изберете вашето име!");
        return;
    }

    if (!fileInput || !fileInput.files[0]) {
        alert("Моля, прикачете файл за проверка!");
        return;
    }

    const formData = new FormData();
    formData.append("class_id", currentAssignment ? currentAssignment.group_id : "8a");
    formData.append("student_name", studentSelect.value);
    formData.append("criteria_json", JSON.stringify(currentAssignment ? currentAssignment.criteria : {}));
    formData.append("file", fileInput.files[0]);

    const submitBtn = document.getElementById("submit-btn");
    if (submitBtn) submitBtn.disabled = true;

    try {
        const res = await fetch(`${API_URL}/evaluate`, {
            method: "POST",
            body: formData
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || "Грешка при оценяването.");

        // Показване на резултата
        const resultBox = document.getElementById("result-box");
        if (resultBox) resultBox.classList.remove("hidden");

        const scorePercent = document.getElementById("score-percentage");
        if (scorePercent) scorePercent.innerText = `${data.percentage}%`;

        const scorePoints = document.getElementById("score-points");
        if (scorePoints) scorePoints.innerText = `(${data.score} / ${data.max_score} точки)`;

        if (data.plagiarism_flag) {
            alert(`⚠️ Внимание: Забелязано е съвпадение! ${data.plagiarism_note}`);
        } else {
            alert("Файлът беше оценен и предаден успешно!");
        }
    } catch (err) {
        alert("Грешка при изпращане: " + err.message);
    } finally {
        if (submitBtn) submitBtn.disabled = false;
    }
});