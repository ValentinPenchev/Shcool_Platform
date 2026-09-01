const API_URL = "https://shcool-platform.onrender.com/api";

document.addEventListener("DOMContentLoaded", async () => {
    // Изчакваме класовете и задачите, за да са налични имената им (напр. в колоната "Задача"),
    // преди първото зареждане на статистиката
    await Promise.all([loadClasses(), loadAssignments()]);
    loadDashboardData();
    startDashboardPolling();
    setupCriteriaDropZone();
});

// Превключване между секциите в интерфейса
function showSection(sectionId) {
    document.querySelectorAll('.dashboard-section').forEach(sec => sec.style.display = 'none');
    document.getElementById(`sec-${sectionId}`).style.display = 'block';

    document.querySelectorAll('.sidebar-menu li').forEach(li => li.classList.remove('active'));
    const activeMenu = document.getElementById(`menu-${sectionId}`);
    if (activeMenu) activeMenu.classList.add('active');

    // Статистиката се презарежда автоматично при отваряне и се опреснява периодично,
    // за да не се налага ръчно презареждане при ново предадено решение
    if (sectionId === 'dashboard') {
        loadDashboardData();
        startDashboardPolling();
    } else {
        stopDashboardPolling();
    }

    if (sectionId === 'exercises') {
        const select = document.getElementById("exercise-class-filter");
        if (select && !select.value && Object.keys(classesData).length > 0) {
            select.value = Object.keys(classesData)[0];
            renderClassChips();
        }
        loadExercisesData();
    }
}

// Локално кеширани данни за класовете (пълния списък ученици за нуждите на редакция)
const classesData = {};
// Локално кеширани заглавия на задачите, за да се показват в таблото със статистика
const assignmentTitleById = {};

// Зареждане на класовете от базата данни
async function loadClasses() {
    try {
        const res = await fetch(`${API_URL}/admin/groups`);
        const classes = await res.json();

        const filterGroup = document.getElementById("filter-group");
        const assignGroupSelect = document.getElementById("assign-group-select");
        const filterAssignmentsClass = document.getElementById("filter-assignments-class");

        filterGroup.innerHTML = '<option value="">Всички класове</option>';
        assignGroupSelect.innerHTML = "";
        if(filterAssignmentsClass) filterAssignmentsClass.innerHTML = '<option value="">Всички класове</option>';

        classes.forEach(c => {
            const classId = c.group_id || c.id;
            const className = c.group_name || c.name;
            const classStudents = c.students_json || c.students || [];
            classesData[classId] = { className, students: classStudents };

            filterGroup.innerHTML += `<option value="${classId}">${className}</option>`;
            assignGroupSelect.innerHTML += `<option value="${classId}">${className}</option>`;
            if(filterAssignmentsClass) filterAssignmentsClass.innerHTML += `<option value="${classId}">${className}</option>`;
        });

        renderClassesTable(Object.entries(classesData));
        renderClassChips();
    } catch (err) {
        console.error("Грешка при зареждане на класовете:", err);
    }
}

// Бърз достъп до класовете чрез цветни бутони вместо падащо меню. Всеки чип-ред
// управлява едно скрито <select>, за да се преизползва вече съществуващата логика
// за филтриране (onFilterChange, filterAssignmentsTable, loadExercisesData).
const CLASS_CHIP_CONFIGS = [
    { chipsId: "dashboard-class-chips", selectId: "filter-group", onSelect: (id) => { document.getElementById("filter-group").value = id; onFilterChange(); } },
    { chipsId: "assignments-class-chips", selectId: "filter-assignments-class", onSelect: (id) => { document.getElementById("filter-assignments-class").value = id; filterAssignmentsTable(); } },
    { chipsId: "exercises-class-chips", selectId: "exercise-class-filter", onSelect: (id) => { document.getElementById("exercise-class-filter").value = id; loadExercisesData(); } },
];

function renderClassChips() {
    const entries = Object.entries(classesData);

    CLASS_CHIP_CONFIGS.forEach(({ chipsId, selectId, onSelect }) => {
        const container = document.getElementById(chipsId);
        const select = document.getElementById(selectId);
        if (!container || !select) return;

        const currentValue = select.value || "";
        const includeAll = chipsId !== "exercises-class-chips";

        const chips = [];
        if (includeAll) {
            chips.push(`<button type="button" class="class-chip ${currentValue === '' ? 'active' : ''}" data-class-id="">Всички</button>`);
        }
        entries.forEach(([classId, data], index) => {
            const isActive = currentValue === classId;
            chips.push(`<button type="button" class="class-chip ${classBadgeColorIndex(index)} ${isActive ? 'active' : ''}" data-class-id="${classId}">${data.className}</button>`);
        });

        container.innerHTML = chips.join("");
        container.querySelectorAll(".class-chip").forEach(btn => {
            btn.addEventListener("click", () => onSelect(btn.dataset.classId));
        });
    });
}

// Рендва цялото тяло на таблицата с класове от подаден списък от [classId, data] двойки
function renderClassesTable(entries) {
    const classesTable = document.getElementById("classes-table-body");
    if (entries.length === 0) {
        classesTable.innerHTML = `
            <tr><td colspan="4">
                <div class="empty-state">
                    <div class="empty-icon"><i class="fa-solid fa-inbox"></i></div>
                    <h4>Няма намерени класове</h4>
                    <p>Създайте първия клас, за да го видите тук.</p>
                </div>
            </td></tr>
        `;
        return;
    }
    classesTable.innerHTML = entries
        .map(([classId, data], index) => renderClassRow(classId, data.className, (data.students || []).length, index))
        .join("");
}

// Цветова значка за клас (циклично по индекс в списъка)
function classBadgeColorIndex(index) {
    return `c${index % 5}`;
}

// Маркъп на един ред в таблицата с класове (кликването върху реда отваря резултатите на класа в Статистика)
function renderClassRow(classId, className, studentsCount, colorIndex = 0) {
    return `
        <tr id="class-row-${classId}" class="clickable-row" onclick="viewClassResults('${classId}')" title="Отвори резултатите за този клас">
            <td>
                <div class="class-name-cell">
                    <span class="class-badge ${classBadgeColorIndex(colorIndex)}">${(className || classId).slice(0, 2)}</span>
                    <strong>${className}</strong>
                </div>
            </td>
            <td>${classId}</td>
            <td><i class="fa-solid fa-user-group" style="color: var(--text-muted); margin-right: 6px;"></i>${studentsCount} ученици</td>
            <td>
                <button type="button" class="btn-icon" onclick="event.stopPropagation(); editClass('${classId}')" title="Редактирай класа"><i class="fa-regular fa-pen-to-square"></i></button>
                <button type="button" class="btn-danger-icon" onclick="event.stopPropagation(); deleteClass('${classId}')" title="Изтрий класа"><i class="fa-regular fa-trash-can"></i></button>
            </td>
        </tr>
    `;
}

// Отваря Статистика, филтрирана само за резултатите/материалите на избрания клас
function viewClassResults(classId) {
    syncClassFilter(classId);
    showSection('dashboard');
}

// Претърсва локално кешираните класове по име или ID
function filterClassesBySearch() {
    const term = document.getElementById("classes-search").value.trim().toLowerCase();
    const entries = Object.entries(classesData).filter(([classId, data]) =>
        !term || classId.toLowerCase().includes(term) || (data.className || "").toLowerCase().includes(term)
    );
    renderClassesTable(entries);
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

    addOptionIfMissing(document.getElementById("filter-group"));
    addOptionIfMissing(document.getElementById("assign-group-select"));
    addOptionIfMissing(document.getElementById("filter-assignments-class"));
    addOptionIfMissing(document.getElementById("exercise-class-filter"));

    renderClassesTable(Object.entries(classesData));
    renderClassChips();
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
    document.getElementById("class-form-title").textContent = "Добави нов клас";
    document.getElementById("class-form-submit-btn").innerHTML = '<i class="fa-solid fa-plus"></i> Запази Класа';
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
        renderClassesTable(Object.entries(classesData));
        document.querySelectorAll(`#filter-group option[value="${classId}"], #assign-group-select option[value="${classId}"], #filter-assignments-class option[value="${classId}"], #exercise-class-filter option[value="${classId}"]`)
            .forEach(opt => opt.remove());
        renderClassChips();

        if (editingClassId === classId) cancelClassEdit();

        loadAssignments();
    } catch (err) {
        alert("Грешка при изтриване на класа: " + err.message);
    }
}

// Последно заредения (евентуално филтриран по клас) списък със задачи - използва се за локалното търсене
let assignmentsCache = [];

// Зареждане на задачите (винаги отразява актуално активните задачи за избрания филтър)
async function loadAssignments(selectedClassFilter = "") {
    try {
        let url = `${API_URL}/admin/assignments`;
        if (selectedClassFilter) {
            url += `?group_id=${encodeURIComponent(selectedClassFilter)}`;
        }

        const res = await fetch(url);
        let assignments = await res.json();
        assignmentsCache = assignments;
        assignments.forEach(a => { assignmentTitleById[a.id] = a.title; });

        const filterAssignment = document.getElementById("filter-assignment");

        // Табелата "Задача" в статистиката винаги отразява актуално активните задачи за текущия филтър
        const previouslySelected = filterAssignment.value;
        filterAssignment.innerHTML = '<option value="">Всички задачи</option>';
        assignments.forEach(a => {
            filterAssignment.innerHTML += `<option value="${a.id}">${a.title}</option>`;
        });
        if (assignments.some(a => a.id === previouslySelected)) {
            filterAssignment.value = previouslySelected;
        }

        const searchInput = document.getElementById("assignments-search");
        if (searchInput) searchInput.value = "";
        renderAssignmentsTable(assignments);
    } catch (err) {
        console.error("Грешка при зареждане на задачите:", err);
    }
}

// Рендва цялото тяло на таблицата със задачи от подаден списък
function renderAssignmentsTable(list) {
    const assignmentsTable = document.getElementById("assignments-table-body");
    if (list.length === 0) {
        assignmentsTable.innerHTML = `
            <tr><td colspan="4">
                <div class="empty-state">
                    <div class="empty-icon"><i class="fa-solid fa-inbox"></i></div>
                    <h4>Няма създадени задачи</h4>
                    <p>Създайте първата задача, за да я видите тук.</p>
                </div>
            </td></tr>
        `;
        return;
    }
    assignmentsTable.innerHTML = list.map(renderAssignmentRow).join("");
}

// Претърсва локално кешираните задачи по заглавие или клас
function filterAssignmentsBySearch() {
    const term = document.getElementById("assignments-search").value.trim().toLowerCase();
    const filtered = assignmentsCache.filter(a =>
        !term || (a.title || "").toLowerCase().includes(term) || (a.group_id || a.class_id || "").toLowerCase().includes(term)
    );
    renderAssignmentsTable(filtered);
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

// Плъзгане и пускане на файл с критерии в секция "Задачи"
function setupCriteriaDropZone() {
    const dropZone = document.getElementById("criteria-drop-zone");
    const fileInput = document.getElementById("criteria-file-input");
    if (!dropZone || !fileInput) return;

    const showFileName = () => {
        const display = document.getElementById("criteria-file-name-display");
        display.textContent = fileInput.files.length > 0 ? `Избран файл: ${fileInput.files[0].name}` : "";
    };

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, (e) => { e.preventDefault(); e.stopPropagation(); });
    });
    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => dropZone.classList.add('dragover'));
    });
    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => dropZone.classList.remove('dragover'));
    });
    dropZone.addEventListener('drop', (e) => {
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            fileInput.files = files;
            showFileName();
        }
    });
    fileInput.addEventListener('change', showFileName);
}

// Периодично опресняване на статистиката, докато секцията е отворена (за да се вижда веднага ново предаден материал)
let dashboardPollInterval = null;

function startDashboardPolling() {
    stopDashboardPolling();
    dashboardPollInterval = setInterval(loadDashboardData, 15000);
}

function stopDashboardPolling() {
    if (dashboardPollInterval) {
        clearInterval(dashboardPollInterval);
        dashboardPollInterval = null;
    }
}

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

// Последно заредените предавания (по текущите филтри клас/задача), страница и брой на страница за пагинацията
let submissionsCache = [];
let submissionsCurrentPage = 1;
let submissionsPageSize = 10;

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
        // Най-новите предавания най-отгоре
        submissions.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
        submissionsCache = submissions;

        let totalStudentsCount = 0;
        if (classId && classesData[classId]) {
            totalStudentsCount = (classesData[classId].students || []).length;
        }

        const submittedCount = submissions.length;
        document.getElementById("stat-count").innerText = submittedCount;
        document.getElementById("stat-total-students").innerText = `от ${totalStudentsCount} ученици`;

        let totalScore = 0;
        let totalMaxScore = 0;
        submissions.forEach(sub => {
            totalScore += (sub.score || 0);
            totalMaxScore += (sub.max_score || 0);
        });

        const avgScore = submittedCount > 0 ? Math.round(totalScore / submittedCount) : 0;
        const avgMaxPoints = submittedCount > 0 && totalMaxScore > 0 ? Math.round(totalMaxScore / submittedCount) : 100;
        document.getElementById("stat-avg").innerText = `${avgScore}%`;
        document.getElementById("stat-avg-sub").innerText = `${avgScore}/${avgMaxPoints} точки`;
        updateAverageRing(avgScore);

        const searchInput = document.getElementById("submissions-search");
        if (searchInput) searchInput.value = "";
        submissionsCurrentPage = 1;
        renderSubmissionsTable();
    } catch (err) {
        console.error("Грешка при зареждане на таблото:", err);
    }
}

// Обновява кръглия прогрес пръстен за средния успех
function updateAverageRing(avgScore) {
    const circle = document.getElementById("avg-ring-fill");
    const label = document.getElementById("avg-ring-label");
    if (!circle || !label) return;
    const circumference = 2 * Math.PI * 27;
    const offset = circumference - (Math.max(0, Math.min(100, avgScore)) / 100) * circumference;
    circle.style.strokeDasharray = `${circumference}`;
    circle.style.strokeDashoffset = `${offset}`;
    label.textContent = `${avgScore}%`;
}

// Претърсва кешираните предавания по име на ученик
function filterSubmissionsBySearch() {
    submissionsCurrentPage = 1;
    renderSubmissionsTable();
}

function getFilteredSubmissions() {
    const searchInput = document.getElementById("submissions-search");
    const term = searchInput ? searchInput.value.trim().toLowerCase() : "";
    if (!term) return submissionsCache;
    return submissionsCache.filter(sub => (sub.student_name || "").toLowerCase().includes(term));
}

// Рендва видимата страница от таблицата с резултати, включително пагинацията
function renderSubmissionsTable() {
    const tbody = document.querySelector("#submissions-table tbody");
    const filtered = getFilteredSubmissions();

    if (filtered.length === 0) {
        tbody.innerHTML = `
            <tr><td colspan="10">
                <div class="empty-state">
                    <div class="empty-icon"><i class="fa-solid fa-inbox"></i></div>
                    <h4>Няма предадени решения</h4>
                    <p>Няма намерени предадени решения за избраните филтри.</p>
                </div>
            </td></tr>
        `;
        renderSubmissionsPagination(0);
        return;
    }

    const totalPages = Math.max(1, Math.ceil(filtered.length / submissionsPageSize));
    if (submissionsCurrentPage > totalPages) submissionsCurrentPage = totalPages;
    const start = (submissionsCurrentPage - 1) * submissionsPageSize;
    const pageItems = filtered.slice(start, start + submissionsPageSize);

    tbody.innerHTML = pageItems.map((sub, i) => {
        const index = start + i;
        const statusBadge = '<i class="fa-solid fa-check"></i> Проверено';
        const taskTitle = assignmentTitleById[sub.assignment_id] || (sub.assignment_id ? sub.assignment_id : '—');
        const studentName = sub.student_name || 'Неизвестен';
        const submittedAt = formatSubmittedAt(sub.created_at);
        const fileActions = (sub.file_url && sub.file_url !== '#')
            ? `
                <a href="${sub.file_url}" target="_blank" rel="noopener" class="btn-icon" title="Отвори в нов прозорец"><i class="fa-regular fa-eye"></i></a>
                <a href="${sub.file_url}" download="${sub.filename || ''}" class="btn-icon" title="Свали материала"><i class="fa-solid fa-download"></i></a>
              `
            : '<span class="stat-sub">Няма файл</span>';
        const gradeTier = sub.grade >= 5 ? 'grade-high' : (sub.grade === 4 ? 'grade-mid' : 'grade-low');
        const gradeCell = sub.grade
            ? `<span class="badge-status grade-badge ${gradeTier}">${sub.grade} <span class="grade-label">(${sub.grade_label || ''})</span></span>`
            : '—';
        const detailRowId = `sub-detail-${sub.id}`;

        return `
            <tr class="clickable-row" onclick="toggleSubmissionDetails(${sub.id})">
                <td><button type="button" class="btn-icon expand-toggle" id="toggle-${sub.id}" title="Детайли по критерии"><i class="fa-solid fa-chevron-right"></i></button></td>
                <td>${index + 1}</td>
                <td><span class="row-avatar a${index % 5}">${studentName.slice(0, 1).toUpperCase()}</span><strong>${studentName}</strong></td>
                <td>${taskTitle}</td>
                <td><div class="file-name-cell"><i class="fa-regular fa-file-lines"></i>${sub.filename || sub.file_name || 'Файл'}</div></td>
                <td>${submittedAt}</td>
                <td><strong>${sub.score || 0}</strong> / ${sub.max_score || 100} точки</td>
                <td>${gradeCell}</td>
                <td><span class="badge-status">${statusBadge}</span></td>
                <td onclick="event.stopPropagation();">${fileActions}<button type="button" class="btn-danger-icon" onclick="deleteSubmission(${sub.id})" title="Изтрий предаването"><i class="fa-regular fa-trash-can"></i></button></td>
            </tr>
            <tr class="submission-detail-row" id="${detailRowId}" hidden>
                <td colspan="10">${buildSubmissionDetailsHtml(sub)}</td>
            </tr>
        `;
    }).join("");

    renderSubmissionsPagination(filtered.length);
}

// Изгражда съдържанието на разширения ред: какво е пропуснато от критериите
function buildSubmissionDetailsHtml(sub) {
    const details = sub.details_json && Array.isArray(sub.details_json.details) ? sub.details_json.details : null;

    if (!details) {
        return '<div class="submission-detail-empty">Няма налична информация по критериите за това предаване.</div>';
    }

    const missed = details.filter(d => !d.passed);

    if (missed.length === 0) {
        return `<div class="submission-detail-ok"><i class="fa-solid fa-circle-check"></i> Всичко е изпълнено</div>`;
    }

    const items = missed.map(d => `<li><strong>${d.criterion || 'Критерий'}:</strong> ${d.note || 'Не е изпълнено.'}</li>`).join('');
    return `
        <div class="submission-detail-missed">
            <div class="submission-detail-title">Пропуснато от критериите:</div>
            <ul class="missed-criteria-list">${items}</ul>
        </div>
    `;
}

// Разгъва/свива реда с детайли по критерии за дадено предаване
function toggleSubmissionDetails(submissionId) {
    const row = document.getElementById(`sub-detail-${submissionId}`);
    const toggleBtn = document.getElementById(`toggle-${submissionId}`);
    if (!row) return;
    row.hidden = !row.hidden;
    if (toggleBtn) toggleBtn.classList.toggle('expanded', !row.hidden);
}

// Форматира датата на предаване като дд/мм/гггг чч:мм
function formatSubmittedAt(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '—';
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Ръчно изтриване на предадено решение (материал + запис в базата)
async function deleteSubmission(submissionId) {
    if (!confirm("Сигурни ли сте, че искате да изтриете това предадено решение? Файлът също ще бъде премахнат.")) return;

    try {
        const response = await fetch(`${API_URL}/admin/submissions/${submissionId}`, { method: "DELETE" });
        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.detail || `HTTP грешка: ${response.status}`);
        }

        submissionsCache = submissionsCache.filter(sub => sub.id !== submissionId);
        renderSubmissionsTable();
    } catch (err) {
        alert("Грешка при изтриване на предаването: " + err.message);
    }
}

function renderSubmissionsPagination(totalCount) {
    const container = document.getElementById("submissions-pagination");
    if (!container) return;

    if (totalCount === 0) {
        container.innerHTML = "";
        return;
    }

    const totalPages = Math.max(1, Math.ceil(totalCount / submissionsPageSize));
    const start = (submissionsCurrentPage - 1) * submissionsPageSize + 1;
    const end = Math.min(totalCount, submissionsCurrentPage * submissionsPageSize);

    let pageButtons = "";
    for (let p = 1; p <= totalPages; p++) {
        pageButtons += `<button type="button" class="${p === submissionsCurrentPage ? 'active' : ''}" onclick="setSubmissionsPage(${p})">${p}</button>`;
    }

    container.innerHTML = `
        <div>
            Показване на
            <select class="page-size-select" onchange="changeSubmissionsPageSize(this.value)">
                ${[10, 20, 50].map(n => `<option value="${n}" ${n === submissionsPageSize ? 'selected' : ''}>${n}</option>`).join("")}
            </select>
            от ${totalCount} резултата (${start}-${end})
        </div>
        <div class="pagination-controls">
            <button type="button" onclick="setSubmissionsPage(${submissionsCurrentPage - 1})" ${submissionsCurrentPage <= 1 ? 'disabled' : ''}><i class="fa-solid fa-chevron-left"></i></button>
            ${pageButtons}
            <button type="button" onclick="setSubmissionsPage(${submissionsCurrentPage + 1})" ${submissionsCurrentPage >= totalPages ? 'disabled' : ''}><i class="fa-solid fa-chevron-right"></i></button>
        </div>
    `;
}

function setSubmissionsPage(page) {
    submissionsCurrentPage = page;
    renderSubmissionsTable();
}

function changeSubmissionsPageSize(size) {
    submissionsPageSize = parseInt(size, 10);
    submissionsCurrentPage = 1;
    renderSubmissionsTable();
}

// Експортира текущо филтрираните резултати като CSV файл
function exportSubmissionsCSV() {
    const rows = getFilteredSubmissions();
    if (rows.length === 0) {
        alert("Няма данни за експортиране.");
        return;
    }

    const headers = ["Ученик", "Задача", "Клас", "Файл", "Предадено на", "Точки", "Максимум точки", "Успех (%)"];
    const csvRows = [headers.join(",")];
    rows.forEach(sub => {
        const taskTitle = assignmentTitleById[sub.assignment_id] || sub.assignment_id || "";
        const values = [
            sub.student_name || "",
            taskTitle,
            sub.class_id || "",
            sub.filename || "",
            formatSubmittedAt(sub.created_at),
            sub.score || 0,
            sub.max_score || 0,
            sub.percentage || 0
        ].map(v => `"${String(v).replace(/"/g, '""')}"`);
        csvRows.push(values.join(","));
    });

    const blob = new Blob(["﻿" + csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `rezultati_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

// -----------------------------------------------------------------------------
// УПРАЖНЕНИЯ (свободни качвания за практика, без автоматична проверка)
// -----------------------------------------------------------------------------

const EXCELLENT_UPLOAD_THRESHOLD = 5;
const EXCELLENT_GRADE_VALUE = 6;
let exercisesCache = [];
let exerciseGradesCache = [];

function buildExerciseLink(classId) {
    return `${window.location.origin}${getSiteBasePath()}index.html?exercise=${encodeURIComponent(classId)}`;
}

function copyExerciseLink() {
    const classId = document.getElementById("exercise-class-filter").value;
    if (!classId) return;
    const url = buildExerciseLink(classId);
    navigator.clipboard?.writeText(url).then(() => {
        alert("Линкът е копиран: " + url);
    }).catch(() => {
        prompt("Копирайте линка ръчно:", url);
    });
}

// Разбива списък на последователни групи по `size` елемента (за групиране по 5 качвания)
function chunkIntoBatches(list, size) {
    const batches = [];
    for (let i = 0; i < list.length; i += size) {
        batches.push(list.slice(i, i + size));
    }
    return batches;
}

// Обезопасява текст за вграждане в единични кавички вътре в onclick="" атрибут
function escapeJsString(str) {
    return String(str).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

// Зарежда качванията + вече въведените оценки за избрания клас и обновява таблицата
async function loadExercisesData() {
    const classId = document.getElementById("exercise-class-filter").value;
    const linkCard = document.getElementById("exercises-link-card");
    const tbody = document.querySelector("#exercises-table tbody");

    if (!classId) {
        linkCard.style.display = "none";
        tbody.innerHTML = `
            <tr><td colspan="4">
                <div class="empty-state">
                    <div class="empty-icon"><i class="fa-solid fa-user-group"></i></div>
                    <h4>Изберете клас</h4>
                    <p>Изберете клас отгоре, за да видите напредъка по упражнения.</p>
                </div>
            </td></tr>
        `;
        return;
    }

    const url = buildExerciseLink(classId);
    document.getElementById("exercises-link-url").href = url;
    document.getElementById("exercises-link-url").textContent = url;
    linkCard.style.display = "flex";

    try {
        const [uploadsRes, gradesRes] = await Promise.all([
            fetch(`${API_URL}/admin/exercises?group_id=${encodeURIComponent(classId)}`),
            fetch(`${API_URL}/admin/exercise-grades?group_id=${encodeURIComponent(classId)}`)
        ]);
        if (!uploadsRes.ok || !gradesRes.ok) throw new Error("Грешка при заявката към сървъра");
        exercisesCache = await uploadsRes.json();
        exerciseGradesCache = await gradesRes.json();
        renderExercisesTable(classId);
    } catch (err) {
        console.error("Грешка при зареждане на упражненията:", err);
        tbody.innerHTML = `
            <tr><td colspan="4">
                <div class="empty-state">
                    <div class="empty-icon"><i class="fa-solid fa-triangle-exclamation"></i></div>
                    <h4>Грешка при зареждане</h4>
                    <p>Уверете се, че таблиците "exercise_uploads" и "exercise_grade_log" съществуват в Supabase.</p>
                </div>
            </td></tr>
        `;
    }
}

// Групира качванията по ученик (и по групи от 5) и рендва таблицата с напредък
function renderExercisesTable(classId) {
    const tbody = document.querySelector("#exercises-table tbody");
    const students = (classesData[classId] && classesData[classId].students) || [];

    const uploadsByStudent = {};
    students.forEach(name => { uploadsByStudent[name] = []; });
    exercisesCache.forEach(upload => {
        const name = upload.student_name || "Неизвестен";
        if (!uploadsByStudent[name]) uploadsByStudent[name] = [];
        uploadsByStudent[name].push(upload);
    });

    const gradesByStudent = {};
    exerciseGradesCache.forEach(g => {
        const name = g.student_name || "Неизвестен";
        if (!gradesByStudent[name]) gradesByStudent[name] = [];
        gradesByStudent[name].push(g);
    });

    const names = Array.from(new Set([...students, ...Object.keys(uploadsByStudent), ...Object.keys(gradesByStudent)]));
    if (names.length === 0) {
        tbody.innerHTML = `
            <tr><td colspan="4">
                <div class="empty-state">
                    <div class="empty-icon"><i class="fa-solid fa-inbox"></i></div>
                    <h4>Няма ученици в този клас</h4>
                </div>
            </td></tr>
        `;
        return;
    }

    tbody.innerHTML = names.map((name, index) => {
        const uploads = (uploadsByStudent[name] || []).slice().sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));
        const grades = (gradesByStudent[name] || []).slice().sort((a, b) => new Date(a.entered_at || 0) - new Date(b.entered_at || 0));
        const batches = chunkIntoBatches(uploads, EXCELLENT_UPLOAD_THRESHOLD);
        const readyBatches = batches.filter(b => b.length === EXCELLENT_UPLOAD_THRESHOLD);
        const inProgressBatch = batches.find(b => b.length < EXCELLENT_UPLOAD_THRESHOLD);
        const inProgressCount = inProgressBatch ? inProgressBatch.length : 0;
        const hasReady = readyBatches.length > 0;
        const rowId = `exercise-student-${index}`;
        const safeName = escapeJsString(name);

        const gradedBadge = grades.length > 0
            ? `<span class="badge-status grade-badge grade-high"><i class="fa-solid fa-circle-check"></i> ${grades.length} ${grades.length === 1 ? 'въведена' : 'въведени'}</span>`
            : '<span class="stat-sub">Няма</span>';

        // Единна индикация за оценка: докато не е готова (< 5 качвания) е прогрес лента;
        // щом стигне 5, самата индикация става кликаема (кехлибарена) - при клик трайно
        // се записва и остава зелена ("въведена"), вместо отделен бутон до нея.
        const gradeIndicatorCell = hasReady
            ? gradeIndicator(classId, safeName, 'pending')
            : `<div class="progress-bar-track"><div class="progress-bar-fill" style="width:${Math.round((inProgressCount / EXCELLENT_UPLOAD_THRESHOLD) * 100)}%"></div></div><span class="stat-sub">${inProgressCount} / ${EXCELLENT_UPLOAD_THRESHOLD}</span>`;

        const historyHtml = grades.map(g => `
            <div class="exercise-batch-card entered">
                <div class="batch-card-header">
                    ${gradeIndicator(classId, safeName, 'entered')}
                    <span class="stat-sub">въведена на ${formatSubmittedAt(g.entered_at)}</span>
                </div>
                <ul class="missed-criteria-list">
                    ${(g.filenames || []).map(f => `<li><i class="fa-regular fa-file-lines"></i> ${f}</li>`).join('')}
                </ul>
            </div>
        `).join('');

        const currentBatchesHtml = batches.map(batch => {
            const isReady = batch.length === EXCELLENT_UPLOAD_THRESHOLD;
            return `
                <div class="exercise-batch-card ${isReady ? 'pending' : 'progress'}">
                    <div class="batch-card-header">
                        ${isReady
                            ? gradeIndicator(classId, safeName, 'pending')
                            : `<span class="stat-sub">В процес: ${batch.length} / ${EXCELLENT_UPLOAD_THRESHOLD}</span>`}
                    </div>
                    <ul class="missed-criteria-list">
                        ${batch.map(u => `
                            <li>
                                <i class="fa-regular fa-file-lines"></i> ${u.filename || 'Файл'} · ${formatSubmittedAt(u.created_at)}
                                ${u.file_url && u.file_url !== '#' ? `<a href="${u.file_url}" target="_blank" rel="noopener" class="btn-icon" title="Отвори"><i class="fa-regular fa-eye"></i></a>` : ''}
                                <button type="button" class="btn-danger-icon" onclick="event.stopPropagation(); deleteExerciseUpload(${u.id}, '${classId}')" title="Изтрий качването"><i class="fa-regular fa-trash-can"></i></button>
                            </li>
                        `).join('')}
                    </ul>
                </div>
            `;
        }).join('');

        const detailContent = (historyHtml + currentBatchesHtml) || `<div class="submission-detail-empty">Няма качени упражнения все още.</div>`;

        return `
            <tr class="clickable-row" onclick="toggleExerciseDetails('${rowId}')">
                <td><button type="button" class="btn-icon expand-toggle" id="toggle-${rowId}" title="Детайли по качвания"><i class="fa-solid fa-chevron-right"></i></button></td>
                <td><span class="row-avatar a${index % 5}">${name.slice(0, 1).toUpperCase()}</span><strong>${name}</strong></td>
                <td>${gradedBadge}</td>
                <td>${gradeIndicatorCell}</td>
            </tr>
            <tr class="submission-detail-row" id="detail-${rowId}" hidden>
                <td colspan="4">${detailContent}</td>
            </tr>
        `;
    }).join("");
}

// Единна кликаема/статична индикация за оценка от упражнения. В "pending" състояние е
// бутон (кехлибарен) - при клик въвежда оценката и трие качванията. В "entered"
// състояние е статичен елемент (зелен), защото вече е трайно записана в grade log.
function gradeIndicator(classId, safeName, state) {
    if (state === 'entered') {
        return `<span class="grade-indicator entered"><i class="fa-solid fa-star"></i> ${EXCELLENT_GRADE_VALUE} (Отличен)</span>`;
    }
    return `<button type="button" class="grade-indicator pending" onclick="event.stopPropagation(); markExerciseGraded('${classId}', '${safeName}')" title="Цъкни, за да въведеш оценката">
        <i class="fa-regular fa-star"></i> ${EXCELLENT_GRADE_VALUE} (Отличен)
    </button>`;
}

function toggleExerciseDetails(rowId) {
    const row = document.getElementById(`detail-${rowId}`);
    const toggleBtn = document.getElementById(`toggle-${rowId}`);
    if (!row) return;
    row.hidden = !row.hidden;
    if (toggleBtn) toggleBtn.classList.toggle('expanded', !row.hidden);
}

async function deleteExerciseUpload(uploadId, classId) {
    if (!confirm("Сигурни ли сте, че искате да изтриете това качване? Файлът също ще бъде премахнат.")) return;

    try {
        const response = await fetch(`${API_URL}/admin/exercises/${uploadId}`, { method: "DELETE" });
        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.detail || `HTTP грешка: ${response.status}`);
        }

        await loadExercisesData();
    } catch (err) {
        alert("Грешка при изтриване на качването: " + err.message);
    }
}

// Пази кои ученици в момента имат заявка за въвеждане на оценка "в полет", за да не
// се задейства двоен submit при бърз двоен клик преди таблицата да се презареди
const exerciseGradingInFlight = new Set();

// Отбелязва най-старите 5 качвания на ученика като изведени с оценка Отличен -
// сървърът трайно записва оценката (с имената на файловете) и трие тези 5 качвания
async function markExerciseGraded(classId, studentName) {
    const key = `${classId}|${studentName}`;
    if (exerciseGradingInFlight.has(key)) return;
    if (!confirm(`Да се въведе оценка ${EXCELLENT_GRADE_VALUE} (Отличен) за "${studentName}" и да се изтрият тези 5 качвания?`)) return;

    exerciseGradingInFlight.add(key);
    try {
        const formData = new FormData();
        formData.append("class_id", classId);
        formData.append("student_name", studentName);

        const response = await fetch(`${API_URL}/admin/exercises/mark-graded`, {
            method: "POST",
            body: formData
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.detail || `HTTP грешка: ${response.status}`);
        }

        await loadExercisesData();
    } catch (err) {
        alert("Грешка при въвеждане на оценката: " + err.message);
    } finally {
        exerciseGradingInFlight.delete(key);
    }
}