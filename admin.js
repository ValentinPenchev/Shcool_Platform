const API_URL = "https://shcool-platform.onrender.com/api";

document.addEventListener("DOMContentLoaded", () => {
    loadClasses();
    loadAssignments();
});

// Превключване между секциите в интерфейса
function showSection(sectionId) {
    document.querySelectorAll('.dashboard-section').forEach(sec => sec.style.display = 'none');
    document.getElementById(`sec-${sectionId}`).style.display = 'block';

    document.querySelectorAll('.sidebar-menu li').forEach(li => li.classList.remove('active'));
    const activeMenu = document.getElementById(`menu-${sectionId}`);
    if (activeMenu) activeMenu.classList.add('active');
}

// Локално кеширани данни за класовете (пълния списък ученици за нуждите на редакция)
const classesData = {};

// Зареждане на класовете от базата данни
async function loadClasses() {
    try {
        const res = await fetch(`${API_URL}/admin/groups`);
        const classes = await res.json();

        const sidebarSelect = document.getElementById("sidebar-class-select");
        const filterGroup = document.getElementById("filter-group");
        const assignGroupSelect = document.getElementById("assign-group-select");
        const classesTable = document.getElementById("classes-table-body");
        const filterAssignmentsClass = document.getElementById("filter-assignments-class");

        sidebarSelect.innerHTML = "";
        filterGroup.innerHTML = '<option value="">Всички класове</option>';
        assignGroupSelect.innerHTML = "";
        if(filterAssignmentsClass) filterAssignmentsClass.innerHTML = '<option value="">Всички класове</option>';
        classesTable.innerHTML = "";

        classes.forEach(c => {
            const classId = c.group_id || c.id;
            const className = c.group_name || c.name;
            const classStudents = c.students_json || c.students || [];
            classesData[classId] = { className, students: classStudents };

            sidebarSelect.innerHTML += `<option value="${classId}">${className}</option>`;
            filterGroup.innerHTML += `<option value="${classId}">${className}</option>`;
            assignGroupSelect.innerHTML += `<option value="${classId}">${className}</option>`;
            if(filterAssignmentsClass) filterAssignmentsClass.innerHTML += `<option value="${classId}">${className}</option>`;

            classesTable.innerHTML += renderClassRow(classId, className, classStudents.length);
        });
    } catch (err) {
        console.error("Грешка при зареждане на класовете:", err);
    }
}

// Маркъп на един ред в таблицата с класове
function renderClassRow(classId, className, studentsCount) {
    return `
        <tr id="class-row-${classId}">
            <td><strong>${className}</strong></td>
            <td>${classId}</td>
            <td>${studentsCount} ученици</td>
            <td>
                <button type="button" class="btn-icon" onclick="editClass('${classId}')" title="Редактирай класа"><i class="fa-regular fa-pen-to-square"></i></button>
                <button type="button" class="btn-danger-icon" onclick="deleteClass('${classId}')" title="Изтрий класа"><i class="fa-regular fa-trash-can"></i></button>
            </td>
        </tr>
    `;
}

// Добавя новосъздаден/обновен клас директно в интерфейса, без да разбърква реда на таблицата
function upsertClassInUI(classId, className, students) {
    classesData[classId] = { className, students };

    const addOptionIfMissing = (selectEl) => {
        if (!selectEl) return;
        const exists = Array.from(selectEl.options).some(o => o.value === classId);
        if (!exists) {
            selectEl.innerHTML += `<option value="${classId}">${className}</option>`;
        } else {
            const opt = Array.from(selectEl.options).find(o => o.value === classId);
            opt.textContent = className;
        }
    };

    addOptionIfMissing(document.getElementById("sidebar-class-select"));
    addOptionIfMissing(document.getElementById("filter-group"));
    addOptionIfMissing(document.getElementById("assign-group-select"));
    addOptionIfMissing(document.getElementById("filter-assignments-class"));

    const classesTable = document.getElementById("classes-table-body");
    const existingRow = document.getElementById(`class-row-${classId}`);
    if (existingRow) {
        existingRow.outerHTML = renderClassRow(classId, className, students.length);
    } else {
        classesTable.insertAdjacentHTML("beforeend", renderClassRow(classId, className, students.length));
    }
}

// Зарежда данните за клас обратно във формата, за да могат да бъдат редактирани
let editingClassId = null;

function editClass(classId) {
    const data = classesData[classId];
    if (!data) return;

    editingClassId = classId;

    const idInput = document.getElementById("class-id");
    idInput.value = classId;
    idInput.readOnly = true;
    document.getElementById("class-name").value = data.className;
    document.getElementById("class-names-text").value = (data.students || []).join("\n");

    document.getElementById("class-form-title").textContent = `Редактиране на клас: ${data.className}`;
    document.getElementById("class-form-submit-btn").textContent = "Запази промените";
    document.getElementById("class-form-cancel-btn").style.display = "inline-block";

    showSection('classes');
    document.getElementById("class-id").scrollIntoView({ behavior: "smooth", block: "center" });
}

function cancelClassEdit() {
    editingClassId = null;
    document.getElementById("create-class-form").reset();
    document.getElementById("class-id").readOnly = false;
    document.getElementById("class-form-title").textContent = "Нов клас";
    document.getElementById("class-form-submit-btn").textContent = "Запази Класа";
    document.getElementById("class-form-cancel-btn").style.display = "none";
}

// Изтриване на клас
async function deleteClass(classId) {
    if (!confirm(`Сигурни ли сте, че искате да изтриете класа "${classId}"? Това действие не може да бъде отменено.`)) return;

    try {
        const response = await fetch(`${API_URL}/admin/groups/${encodeURIComponent(classId)}`, { method: "DELETE" });
        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.detail || `HTTP грешка: ${response.status}`);
        }

        delete classesData[classId];
        document.getElementById(`class-row-${classId}`)?.remove();
        document.querySelectorAll(`#sidebar-class-select option[value="${classId}"], #filter-group option[value="${classId}"], #assign-group-select option[value="${classId}"], #filter-assignments-class option[value="${classId}"]`)
            .forEach(opt => opt.remove());

        if (editingClassId === classId) cancelClassEdit();

        loadAssignments();
    } catch (err) {
        alert("Грешка при изтриване на класа: " + err.message);
    }
}

// Зареждане на задачите (винаги отразява актуално активните задачи за избрания филтър)
async function loadAssignments(selectedClassFilter = "") {
    try {
        let url = `${API_URL}/admin/assignments`;
        if (selectedClassFilter) {
            url += `?group_id=${encodeURIComponent(selectedClassFilter)}`;
        }

        const res = await fetch(url);
        let assignments = await res.json();

        const filterAssignment = document.getElementById("filter-assignment");
        const assignmentsTable = document.getElementById("assignments-table-body");

        // Табелата "Задача" в статистиката винаги отразява актуално активните задачи за текущия филтър
        const previouslySelected = filterAssignment.value;
        filterAssignment.innerHTML = '<option value="">Всички задачи</option>';
        assignments.forEach(a => {
            filterAssignment.innerHTML += `<option value="${a.id}">${a.title}</option>`;
        });
        if (assignments.some(a => a.id === previouslySelected)) {
            filterAssignment.value = previouslySelected;
        }

        assignmentsTable.innerHTML = "";
        assignments.forEach(a => {
            assignmentsTable.insertAdjacentHTML("beforeend", renderAssignmentRow(a));
        });

        if (assignments.length === 0) {
            assignmentsTable.innerHTML = `<tr><td colspan="4" style="text-align:center; color: var(--text-muted);">Няма намерени задачи.</td></tr>`;
        }
    } catch (err) {
        console.error("Грешка при зареждане на задачите:", err);
    }
}

// Пътят на текущата страница (без файла), за да работи линкът и при хостване в подпапка (напр. GitHub Pages project site)
function getSiteBasePath() {
    return window.location.pathname.replace(/[^/]*$/, '');
}

function buildStudentLink(assignmentId) {
    return `${window.location.origin}${getSiteBasePath()}index.html?id=${assignmentId}`;
}

// Маркъп на един ред в таблицата със задачи, включително уникалния линк за ученици
function renderAssignmentRow(a) {
    const studentUrl = buildStudentLink(a.id);
    return `
        <tr id="assignment-row-${a.id}">
            <td><strong>${a.title}</strong></td>
            <td>${a.group_id || a.class_id || ''}</td>
            <td><a href="${studentUrl}" target="_blank" class="task-link">${studentUrl}</a></td>
            <td>
                <button type="button" class="btn-icon" onclick="copyAssignmentLink('${a.id}')" title="Копирай линка"><i class="fa-regular fa-copy"></i></button>
                <button type="button" class="btn-danger-icon" onclick="deleteAssignment('${a.id}')" title="Изтрий задачата"><i class="fa-regular fa-trash-can"></i></button>
            </td>
        </tr>
    `;
}

function copyAssignmentLink(assignmentId) {
    const url = buildStudentLink(assignmentId);
    navigator.clipboard?.writeText(url).then(() => {
        alert("Линкът е копиран: " + url);
    }).catch(() => {
        prompt("Копирайте линка ръчно:", url);
    });
}

async function deleteAssignment(assignmentId) {
    if (!confirm("Сигурни ли сте, че искате да изтриете тази задача? Това действие не може да бъде отменено.")) return;

    try {
        const response = await fetch(`${API_URL}/admin/assignments/${encodeURIComponent(assignmentId)}`, { method: "DELETE" });
        if (!response.ok) throw new Error("Грешка при изтриване от сървъра");

        document.getElementById(`assignment-row-${assignmentId}`)?.remove();
        document.querySelector(`#filter-assignment option[value="${assignmentId}"]`)?.remove();
    } catch (err) {
        alert("Грешка при изтриване на задачата: " + err.message);
    }
}

// Функция за филтриране на таблицата със задачи (винаги позволява връщане към всички активни задачи)
function filterAssignmentsTable() {
    const selectedClass = document.getElementById("filter-assignments-class").value;
    loadAssignments(selectedClass);
}

// Добавяне/редактиране на клас и мигновено визуализиране
document.getElementById("create-class-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = document.getElementById("class-id").value.trim();
    const name = document.getElementById("class-name").value.trim();
    const studentsText = document.getElementById("class-names-text").value;
    const studentsArray = studentsText.split("\n").map(s => s.trim()).filter(s => s.length > 0);

    if (!editingClassId && classesData[id]) {
        if (!confirm(`Клас с ID "${id}" вече съществува. Искате ли да презапишете данните му?`)) return;
    }

    const formData = new FormData();
    formData.append("group_id", id);
    formData.append("group_name", name);
    formData.append("students_json", JSON.stringify(studentsArray));

    try {
        const response = await fetch(`${API_URL}/admin/groups`, {
            method: "POST",
            body: formData
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.detail || `HTTP грешка: ${response.status}`);
        }

        alert(editingClassId ? "Класът е обновен успешно!" : "Класът е запазен успешно в базата данни!");
        upsertClassInUI(id, name, studentsArray);

        if (editingClassId) {
            cancelClassEdit();
        } else {
            document.getElementById("create-class-form").reset();
        }
    } catch (err) {
        alert("Грешка при запазване на класа: " + err.message);
    }
});

// Добавяне на нова задача
document.getElementById("create-assignment-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const group_id = document.getElementById("assign-group-select").value;
    const title = document.getElementById("assign-title").value.trim();
    const fileInput = document.getElementById("criteria-file-input");

    const formData = new FormData();
    formData.append("group_id", group_id);
    formData.append("title", title);
    
    // ДОБАВЕНО: Винаги изпращаме празен JSON за критерии, за да предотвратим 422 грешки от FastAPI
    formData.append("criteria_json", "{}");
    
    if (fileInput.files.length > 0) {
        formData.append("criteria_file", fileInput.files[0]);
    }

    try {
        const response = await fetch(`${API_URL}/admin/assignments`, {
            method: "POST",
            body: formData
        });

        // ДОБАВЕНО: Интелигентно прихващане на грешките от сървъра
        if (!response.ok) {
            let errorDetail = "Неизвестна грешка от сървъра.";
            try {
                const errData = await response.json();
                if (errData.detail) {
                    // Ако грешката е валидационна (масив от липсващи полета), я форматираме
                    errorDetail = Array.isArray(errData.detail) 
                        ? errData.detail.map(err => err.msg).join(", ") 
                        : errData.detail;
                }
            } catch (_) {
                errorDetail = `HTTP Грешка: ${response.status}`;
            }
            throw new Error(errorDetail);
        }

        alert("Задачата е създадена успешно!");
        document.getElementById("create-assignment-form").reset();

        const currentFilter = document.getElementById("filter-assignments-class").value;
        await loadAssignments(currentFilter);
    } catch (err) {
        alert("Грешка при създаване на задачата: " + err.message);
    }
});

// Синхронизиране на филтрите между лентата и таблото
function syncClassFilter(val) {
    document.getElementById("filter-group").value = val;
    loadAssignments(val);
    loadDashboardData();
}

function onFilterChange() {
    const selectedClass = document.getElementById("filter-group").value;
    loadAssignments(selectedClass);
    loadDashboardData();
}

// Зареждане на данните за таблото (Dashboard)
async function loadDashboardData() {
    const classId = document.getElementById("filter-group").value;
    const assignmentId = document.getElementById("filter-assignment").value;

    try {
        let url = `${API_URL}/admin/submissions`;
        const params = [];
        if (assignmentId) params.push(`assignment_id=${encodeURIComponent(assignmentId)}`);
        if (classId) params.push(`group_id=${encodeURIComponent(classId)}`);
        if (params.length > 0) url += `?${params.join('&')}`;

        const res = await fetch(url);
        if (!res.ok) throw new Error("Грешка при заявката към сървъра");
        const submissions = await res.json();

        let totalStudentsCount = 0;
        if (classId && classesData[classId]) {
            totalStudentsCount = (classesData[classId].students || []).length;
        }

        const submittedCount = submissions.length;
        document.getElementById("stat-count").innerText = submittedCount;
        document.getElementById("stat-total-students").innerText = `от ${totalStudentsCount} ученици`;

        let totalScore = 0;
        let plagiarismCount = 0;

        submissions.forEach(sub => {
            totalScore += (sub.score || 0);
            if (sub.plagiarism_flag) { 
                plagiarismCount++;
            }
        });

        const avgScore = submittedCount > 0 ? Math.round(totalScore / submittedCount) : 0;
        document.getElementById("stat-avg").innerText = `${avgScore}%`;
        document.getElementById("stat-plagiarism").innerText = plagiarismCount;

        const tbody = document.querySelector("#submissions-table tbody");
        tbody.innerHTML = "";

        if (submissions.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted);">Няма намерени предадени решения за избраните филтри.</td></tr>`;
            return;
        }

        submissions.forEach((sub, index) => {
            const statusBadge = 'Проверено'; 
            const plagiarismText = sub.plagiarism_flag ? '<span style="color: #dc2626; font-weight: 600;">Да</span>' : 'Не';

            tbody.innerHTML += `
                <tr>
                    <td>${index + 1}</td>
                    <td><strong>${sub.student_name || 'Неизвестен'}</strong></td>
                    <td>${sub.filename || sub.file_name || 'Файл'}</td>
                    <td><strong>${sub.score || 0}</strong> / ${sub.max_score || 100} точки</td>
                    <td>${plagiarismText}</td>
                    <td><span class="badge-status">${statusBadge}</span></td>
                </tr>
            `;
        });

    } catch (err) {
        console.error("Грешка при зареждане на таблото:", err);
    }
}