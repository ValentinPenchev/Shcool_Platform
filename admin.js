const API_URL = "https://shcool-platform.onrender.com/api";

// Дискретни изскачащи съобщения вместо блокиращи alert() диалози
function showToast(message, type = "info") {
    let container = document.getElementById("toast-container");
    if (!container) {
        container = document.createElement("div");
        container.id = "toast-container";
        container.className = "toast-container";
        document.body.appendChild(container);
    }
    const icons = {
        success: "fa-circle-check",
        error: "fa-circle-exclamation",
        warning: "fa-triangle-exclamation",
        info: "fa-circle-info"
    };
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.innerHTML = `<i class="fa-solid ${icons[type] || icons.info}"></i><span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
        toast.classList.add("hide");
        setTimeout(() => toast.remove(), 250);
    }, 4000);
}

// Тъмна тема - предпочитанието се пази локално във всеки браузър (localStorage)
function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    const icon = document.getElementById("theme-toggle-icon");
    const label = document.getElementById("theme-toggle-label");
    if (icon) icon.className = theme === "dark" ? "fa-solid fa-sun" : "fa-solid fa-moon";
    if (label) label.textContent = theme === "dark" ? "Светла тема" : "Тъмна тема";
}

function toggleTheme() {
    const current = document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
    const next = current === "dark" ? "light" : "dark";
    try {
        localStorage.setItem("vpclassroom-theme", next);
    } catch (err) {
        console.warn("Не може да се запази предпочитанието за тема:", err);
    }
    applyTheme(next);
}

(function initTheme() {
    let saved = "light";
    try {
        saved = localStorage.getItem("vpclassroom-theme") || "light";
    } catch (err) {
        console.warn("Не може да се прочете предпочитанието за тема:", err);
    }
    applyTheme(saved);
})();

// -----------------------------------------------------------------------------
// ВХОД С ПАРОЛА - всички /api/admin/* заявки изискват хедъра X-Admin-Password,
// проверен от бекенда. Паролата се пази локално (localStorage), за да не се
// въвежда всеки път; при грешна/оттеглена парола adminFetch връща 401 и
// автоматично връща обратно към екрана за вход.
// -----------------------------------------------------------------------------
const ADMIN_PASSWORD_STORAGE_KEY = "vpclassroom-admin-password";
let adminPassword = null;

// Всички заявки към /api/admin/* трябва да минават през тази функция, а не през
// голия fetch() - добавя паролата и автоматично разлогва при 401 отговор
async function adminFetch(url, options = {}) {
    const headers = new Headers(options.headers || {});
    headers.set("X-Admin-Password", adminPassword || "");
    const response = await fetch(url, { ...options, headers });
    if (response.status === 401) {
        try { localStorage.removeItem(ADMIN_PASSWORD_STORAGE_KEY); } catch (err) {}
        adminPassword = null;
        document.getElementById("login-overlay").style.display = "flex";
        document.getElementById("app-layout").hidden = true;
        showToast("Сесията е изтекла. Въведете паролата отново.", "warning");
    }
    return response;
}

function enterApp() {
    document.getElementById("login-overlay").style.display = "none";
    document.getElementById("app-layout").hidden = false;
    initializeAdminApp();
}

async function initializeAdminApp() {
    // Изчакваме класовете и задачите, за да са налични имената им (напр. в колоната "Задача"),
    // преди първото зареждане на статистиката
    await Promise.all([loadClasses(), loadAssignments()]);
    // Статистиката се зарежда наум, за да е готова при влизане в клас, а на екрана
    // се показва Таблото
    await loadDashboardData();
    setupCriteriaDropZone();
    loadTemplates();
    showSection('home');
}

function adminLogout() {
    try { localStorage.removeItem(ADMIN_PASSWORD_STORAGE_KEY); } catch (err) {}
    location.reload();
}

document.getElementById("login-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const pwd = document.getElementById("login-password").value;
    const errorEl = document.getElementById("login-error");
    errorEl.style.display = "none";

    try {
        const res = await fetch(`${API_URL}/admin/groups`, { headers: { "X-Admin-Password": pwd } });
        if (!res.ok) throw new Error("Грешна парола");
        adminPassword = pwd;
        try { localStorage.setItem(ADMIN_PASSWORD_STORAGE_KEY, pwd); } catch (err) {}
        enterApp();
    } catch (err) {
        errorEl.style.display = "block";
    }
});

document.addEventListener("DOMContentLoaded", async () => {
    let saved = null;
    try { saved = localStorage.getItem(ADMIN_PASSWORD_STORAGE_KEY); } catch (err) {}

    if (!saved) return; // остава на екрана за вход (той е видим по подразбиране)

    adminPassword = saved;
    try {
        const res = await fetch(`${API_URL}/admin/groups`, { headers: { "X-Admin-Password": saved } });
        if (!res.ok) throw new Error("Невалидна запазена парола");
        enterApp();
    } catch (err) {
        try { localStorage.removeItem(ADMIN_PASSWORD_STORAGE_KEY); } catch (e) {}
        adminPassword = null;
    }
});

// Шаблони за задачи - зарежда ги в падащото меню и в списъка за управление
let templatesCache = [];

async function loadTemplates() {
    try {
        const res = await adminFetch(`${API_URL}/admin/templates`);
        if (!res.ok) throw new Error("Грешка при заявката към сървъра");
        templatesCache = await res.json();

        const select = document.getElementById("assign-template-select");
        if (select) {
            const currentValue = select.value;
            select.innerHTML = '<option value="">-- Без шаблон --</option>' +
                templatesCache.map(t => `<option value="${t.id}">${t.title}</option>`).join("");
            select.value = currentValue;
        }

        renderTemplatesList();
    } catch (err) {
        console.error("Грешка при зареждане на шаблоните:", err);
    }
}

function renderTemplatesList() {
    const container = document.getElementById("templates-list");
    if (!container) return;

    if (templatesCache.length === 0) {
        container.innerHTML = `<p class="stat-sub" style="padding:8px 0;">Няма запазени шаблони.</p>`;
        return;
    }

    container.innerHTML = templatesCache.map(t => `
        <div class="template-row">
            <span><i class="fa-regular fa-file-lines"></i> ${t.title}</span>
            <button type="button" class="btn-danger-icon" onclick="deleteTemplate(${t.id})" title="Изтрий шаблона"><i class="fa-regular fa-trash-can"></i></button>
        </div>
    `).join("");
}

async function deleteTemplate(templateId) {
    if (!confirm("Сигурни ли сте, че искате да изтриете този шаблон?")) return;
    try {
        const response = await adminFetch(`${API_URL}/admin/templates/${templateId}`, { method: "DELETE" });
        if (!response.ok) throw new Error("Грешка при изтриване от сървъра");
        showToast("Шаблонът е изтрит.", "success");
        await loadTemplates();
    } catch (err) {
        showToast("Грешка при изтриване на шаблона: " + err.message, "error");
    }
}

// Мобилно меню - страничната лента се превръща в изскачащо чекмедже под ~900px
function toggleMobileSidebar() {
    document.getElementById("sidebar").classList.toggle("mobile-open");
    document.getElementById("sidebar-overlay").classList.toggle("active");
}

function closeMobileSidebar() {
    document.getElementById("sidebar").classList.remove("mobile-open");
    document.getElementById("sidebar-overlay").classList.remove("active");
}

// -----------------------------------------------------------------------------
// РАБОТЕН ПАНЕЛ НА КЛАС - когато е "заключен" клас (чрез Класове в страничната
// лента), Статистика/Задачи/Упражнения се показват само за него, а горна лента
// (workspace-bar) дава бърз достъп до петте му раздела, вкл. новите Ученици/Присъствие.
// -----------------------------------------------------------------------------
let lockedClassId = null;

function toggleClassesAccordion() {
    const li = document.getElementById("menu-classes-accordion");
    const list = document.getElementById("classes-accordion-list");
    const expanded = li.classList.toggle("expanded");
    list.hidden = !expanded;
    document.getElementById("classes-accordion-caret").style.transform = expanded ? "rotate(180deg)" : "";
}

function renderClassesAccordionList() {
    const list = document.getElementById("classes-accordion-list");
    if (!list) return;
    const entries = Object.entries(classesData);
    if (entries.length === 0) {
        list.innerHTML = `<li><span class="stat-sub" style="padding:8px 12px; display:block;">Няма класове</span></li>`;
        return;
    }
    list.innerHTML = entries.map(([classId, data]) => `
        <li class="${lockedClassId === classId ? 'active' : ''}">
            <a href="#" onclick="enterClassWorkspace('${classId}'); return false;">${data.className}</a>
        </li>
    `).join("");
}

function applyWorkspaceLock() {
    const bar = document.getElementById("workspace-bar");
    const locked = !!lockedClassId;
    bar.style.display = locked ? "flex" : "none";

    ["dashboard-class-filter-group", "assignments-class-filter-group", "exercises-class-filter-group"].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = locked ? "none" : "";
    });

    if (locked) {
        const data = classesData[lockedClassId] || {};
        const name = data.className || lockedClassId;
        document.getElementById("workspace-class-name").textContent = name;
        document.getElementById("workspace-class-badge").textContent = name.slice(0, 2);
        renderWorkspaceClassMenu();
    }

    renderClassesAccordionList();
}

// Падащо меню в горната лента на работния панел - позволява смяна на класа без излизане от него
function renderWorkspaceClassMenu() {
    const menu = document.getElementById("workspace-class-menu");
    if (!menu) return;
    menu.innerHTML = Object.entries(classesData).map(([classId, data]) => `
        <button type="button" class="${classId === lockedClassId ? 'active' : ''}" onclick="switchWorkspaceClass('${classId}')">${data.className}</button>
    `).join("");
}

function toggleWorkspaceClassMenu() {
    const wrap = document.getElementById("workspace-class-switcher");
    const menu = document.getElementById("workspace-class-menu");
    const expanded = wrap.classList.toggle("expanded");
    menu.hidden = !expanded;
}

function switchWorkspaceClass(classId) {
    document.getElementById("workspace-class-switcher").classList.remove("expanded");
    document.getElementById("workspace-class-menu").hidden = true;
    const currentTab = document.querySelector(".workspace-tab.active");
    enterClassWorkspace(classId);
    if (currentTab) showSection(currentTab.dataset.tab);
}

document.addEventListener("click", (e) => {
    const wrap = document.getElementById("workspace-class-switcher");
    if (wrap && wrap.classList.contains("expanded") && !wrap.contains(e.target)) {
        wrap.classList.remove("expanded");
        document.getElementById("workspace-class-menu").hidden = true;
    }
});

function enterClassWorkspace(classId) {
    lockedClassId = classId;
    applyWorkspaceLock();
    showSection('dashboard');
}

function exitClassWorkspace() {
    goToOverview();
}

// "Табло" (и логото) - излиза от работния панел на класа и показва началния екран
function goToOverview() {
    lockedClassId = null;
    applyWorkspaceLock();
    const filterGroup = document.getElementById("filter-group");
    const filterAssignments = document.getElementById("filter-assignments-class");
    if (filterGroup) filterGroup.value = "";
    if (filterAssignments) filterAssignments.value = "";
    renderClassChips();
    showSection('home');
}

// Бързи действия от Таблото - секциите вече не са в страничната лента,
// затова се отварят оттук (създаване на задача и управление на класове/ученици)
function goToCreateAssignment() {
    showSection('assignments');
    document.getElementById("assign-title")?.focus();
}

function goToAddStudent() {
    showSection('classes');
    document.getElementById("class-id")?.focus();
}

function toggleAccountMenu() {
    const wrap = document.getElementById("sidebar-account");
    const menu = document.getElementById("sidebar-account-menu");
    const expanded = wrap.classList.toggle("expanded");
    menu.hidden = !expanded;
}

document.addEventListener("click", (e) => {
    const wrap = document.getElementById("sidebar-account");
    if (wrap && wrap.classList.contains("expanded") && !wrap.contains(e.target)) {
        wrap.classList.remove("expanded");
        document.getElementById("sidebar-account-menu").hidden = true;
    }
});

// Превключване между секциите в интерфейса
function showSection(sectionId) {
    closeMobileSidebar();
    document.querySelectorAll('.dashboard-section').forEach(sec => sec.style.display = 'none');
    document.getElementById(`sec-${sectionId}`).style.display = 'block';

    document.querySelectorAll('.sidebar-menu li').forEach(li => li.classList.remove('active'));
    const activeMenu = document.getElementById(`menu-${sectionId}`);
    if (activeMenu) activeMenu.classList.add('active');

    document.querySelectorAll('.workspace-tab').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === sectionId));

    // Статистиката се презарежда автоматично при отваряне и се опреснява периодично,
    // за да не се налага ръчно презареждане при ново предадено решение
    if (sectionId === 'dashboard') {
        if (lockedClassId) document.getElementById("filter-group").value = lockedClassId;
        loadDashboardData();
        startDashboardPolling();
    } else {
        stopDashboardPolling();
    }

    if (sectionId === 'assignments') {
        if (lockedClassId) {
            document.getElementById("filter-assignments-class").value = lockedClassId;
            document.getElementById("assign-group-select").value = lockedClassId;
            loadAssignments(lockedClassId);
        }
    }

    if (sectionId === 'exercises') {
        const select = document.getElementById("exercise-class-filter");
        if (lockedClassId) {
            select.value = lockedClassId;
        } else if (select && !select.value && Object.keys(classesData).length > 0) {
            select.value = Object.keys(classesData)[0];
            renderClassChips();
        }
        loadExercisesData();
    }

    if (sectionId === 'workspace-students') {
        loadWorkspaceStudents();
    }

    if (sectionId === 'attendance') {
        loadAttendanceData();
    }

    if (sectionId === 'files') {
        loadFilesSection();
    }


    if (sectionId === 'home') {
        // Горната лента е контекст на конкретен клас - на Таблото никога не се показва,
        // независимо през кой път сме стигнали дотук
        if (lockedClassId) {
            lockedClassId = null;
            applyWorkspaceLock();
            renderClassChips();
        }
        loadHomeData();
    }
}

// -----------------------------------------------------------------------------
// ТАБЛО (начален екран) - поздрав според часа, обобщени числа, плочки на класовете
// и календар със сроковете на задачите + собствените събития на учителя
// -----------------------------------------------------------------------------
const TEACHER_NAME = "Валентин";

// Задачите тук се държат отделно от assignmentsCache, защото той се филтрира по клас
// при влизане в работния панел, а Таблото показва обобщение за всички класове
let homeAssignments = [];
let calendarEvents = [];
let calendarViewDate = new Date();
let calendarSelectedDate = toDateKey(new Date());

// Ключ на дата (YYYY-MM-DD) по местно време - toISOString() би върнал UTC и би
// изместил деня с часовата зона
function toDateKey(date) {
    const pad = (n) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

async function loadHomeData() {
    renderHomeGreeting();

    try {
        const [assignmentsRes, eventsRes] = await Promise.all([
            adminFetch(`${API_URL}/admin/assignments`),
            adminFetch(`${API_URL}/admin/calendar-events`)
        ]);
        homeAssignments = assignmentsRes.ok ? await assignmentsRes.json() : [];
        calendarEvents = eventsRes.ok ? await eventsRes.json() : [];
    } catch (err) {
        console.error("Грешка при зареждане на таблото:", err);
    }

    renderHomeStats();
    renderHomeClasses();
    renderHomeDeadlines();
    renderCalendar();

    const dateInput = document.getElementById("calendar-event-date");
    if (dateInput && !dateInput.value) dateInput.value = calendarSelectedDate;
}

function renderHomeGreeting() {
    const now = new Date();
    const hour = now.getHours();
    let greeting = "Добър ден";
    if (hour < 12) greeting = "Добро утро";
    else if (hour >= 18) greeting = "Добър вечер";

    document.getElementById("home-greeting").textContent = `${greeting}, ${TEACHER_NAME} 👋`;
    const dateText = now.toLocaleDateString("bg-BG", { day: "numeric", month: "long", year: "numeric" });
    document.getElementById("home-hero-sub").textContent = `Ето какво се случва в платформата днес, ${dateText}`;
}

function renderHomeStats() {
    const classIds = Object.keys(classesData);
    const totalStudents = Object.values(classesData).reduce((sum, c) => sum + (c.students || []).length, 0);

    document.getElementById("home-stat-students").textContent = totalStudents;
    document.getElementById("home-stat-students-sub").textContent = `в ${classIds.length} ${classIds.length === 1 ? "клас" : "класа"}`;
    document.getElementById("home-stat-classes").textContent = classIds.length;

    const todayKey = toDateKey(new Date());
    const now = Date.now();
    // "Активна" е задача без краен срок или такава, чийто срок още не е минал
    const active = homeAssignments.filter(a => !a.deadline || new Date(a.deadline).getTime() >= now).length;
    const dueToday = homeAssignments.filter(a => a.deadline && toDateKey(new Date(a.deadline)) === todayKey).length;

    document.getElementById("home-stat-active").textContent = active;
    document.getElementById("home-stat-active-sub").textContent = `от ${homeAssignments.length} общо`;
    document.getElementById("home-stat-due-today").textContent = dueToday;
    document.getElementById("home-stat-submissions").textContent = submissionsCache.length;
}

function renderHomeClasses() {
    const grid = document.getElementById("home-class-grid");
    if (!grid) return;

    const entries = Object.entries(classesData);
    if (entries.length === 0) {
        grid.innerHTML = `<span class="stat-sub">Още няма класове. Създайте първия си клас с бутона горе.</span>`;
        return;
    }

    grid.innerHTML = entries.map(([classId, data], i) => {
        const name = data.className || classId;
        const count = (data.students || []).length;
        return `
            <button type="button" class="home-class-card" onclick="enterClassWorkspace('${classId}')">
                <span class="class-badge c${i % 5}">${name.slice(0, 2)}</span>
                <span class="home-class-card-info">
                    <strong>${name}</strong>
                    <span>${count} ${count === 1 ? "ученик" : "ученици"}</span>
                </span>
            </button>
        `;
    }).join("");
}

// Следващите задачи с краен срок - допълва числото "Със срок днес" с конкретния списък
function renderHomeDeadlines() {
    const container = document.getElementById("home-deadlines");
    if (!container) return;

    const now = Date.now();
    const upcoming = homeAssignments
        .filter(a => a.deadline && new Date(a.deadline).getTime() >= now)
        .sort((a, b) => new Date(a.deadline) - new Date(b.deadline))
        .slice(0, 5);

    if (upcoming.length === 0) {
        container.innerHTML = `<span class="stat-sub">Няма задачи с предстоящ краен срок.</span>`;
        return;
    }

    const todayKey = toDateKey(new Date());
    container.innerHTML = upcoming.map(a => {
        const deadline = new Date(a.deadline);
        const dayKey = toDateKey(deadline);
        const daysLeft = Math.round((new Date(`${dayKey}T00:00:00`) - new Date(`${todayKey}T00:00:00`)) / 86400000);
        let whenText = deadline.toLocaleDateString("bg-BG", { day: "numeric", month: "long" });
        if (daysLeft === 0) whenText = "днес";
        else if (daysLeft === 1) whenText = "утре";
        const tier = daysLeft <= 1 ? "grade-low" : (daysLeft <= 3 ? "grade-mid" : "grade-high");
        const className = a.group_id && classesData[a.group_id] ? classesData[a.group_id].className : (a.group_id || "");
        return `
            <div class="home-deadline-row">
                <span class="stat-icon blue" style="width:34px;height:34px;font-size:13px;"><i class="fa-regular fa-clipboard"></i></span>
                <span class="home-deadline-info">
                    <strong>${a.title || "Задача"}</strong>
                    <span>${className}</span>
                </span>
                <span class="badge-status grade-badge ${tier}">${whenText}</span>
            </div>
        `;
    }).join("");
}

// ---------------------------- Календар ---------------------------------------
const CALENDAR_TYPE_COLORS = {
    deadline: "#2563eb",
    exam: "#dc2626",
    meeting: "#7c3aed",
    holiday: "#16a34a",
    event: "#f59e0b"
};
const CALENDAR_TYPE_LABELS = {
    deadline: "Краен срок",
    exam: "Контролно",
    meeting: "Среща",
    holiday: "Ваканция",
    event: "Събитие"
};

// Обединява сроковете на задачите (автоматични) с ръчно въведените събития
function getAllCalendarEntries() {
    const fromAssignments = homeAssignments
        .filter(a => a.deadline)
        .map(a => ({
            id: `assignment-${a.id}`,
            title: a.title || "Задача",
            dateKey: toDateKey(new Date(a.deadline)),
            type: "deadline",
            classId: a.group_id || a.class_id || null,
            isAssignment: true
        }));

    const fromEvents = calendarEvents.map(e => ({
        id: e.id,
        title: e.title || "Събитие",
        dateKey: (e.event_date || "").slice(0, 10),
        type: e.event_type || "event",
        classId: e.class_id || null,
        isAssignment: false
    }));

    return [...fromAssignments, ...fromEvents];
}

function renderCalendar() {
    const grid = document.getElementById("calendar-grid");
    const title = document.getElementById("calendar-title");
    if (!grid) return;

    const year = calendarViewDate.getFullYear();
    const month = calendarViewDate.getMonth();
    title.textContent = calendarViewDate.toLocaleDateString("bg-BG", { month: "long", year: "numeric" });

    const firstOfMonth = new Date(year, month, 1);
    // Понеделник е първи ден от седмицата (getDay() връща 0 за неделя)
    const leadingDays = (firstOfMonth.getDay() + 6) % 7;
    const gridStart = new Date(year, month, 1 - leadingDays);

    const entries = getAllCalendarEntries();
    const todayKey = toDateKey(new Date());

    let html = "";
    for (let i = 0; i < 42; i++) {
        const day = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i);
        const key = toDateKey(day);
        const dayEntries = entries.filter(e => e.dateKey === key);
        const classes = ["calendar-day"];
        if (day.getMonth() !== month) classes.push("other-month");
        if (key === todayKey) classes.push("today");
        if (key === calendarSelectedDate) classes.push("selected");

        const dots = [...new Set(dayEntries.map(e => e.type))].slice(0, 3)
            .map(type => `<span class="calendar-day-dot" style="background:${CALENDAR_TYPE_COLORS[type] || CALENDAR_TYPE_COLORS.event}"></span>`)
            .join("");

        html += `
            <button type="button" class="${classes.join(' ')}" onclick="selectCalendarDay('${key}')">
                ${day.getDate()}
                ${dots ? `<span class="calendar-day-dots">${dots}</span>` : ""}
            </button>
        `;
    }
    grid.innerHTML = html;

    renderCalendarEvents();
}

function selectCalendarDay(dateKey) {
    calendarSelectedDate = dateKey;
    const dateInput = document.getElementById("calendar-event-date");
    if (dateInput) dateInput.value = dateKey;
    renderCalendar();
}

function shiftCalendarMonth(delta) {
    calendarViewDate = new Date(calendarViewDate.getFullYear(), calendarViewDate.getMonth() + delta, 1);
    renderCalendar();
}

function goToCalendarToday() {
    calendarViewDate = new Date();
    calendarSelectedDate = toDateKey(new Date());
    renderCalendar();
}

function renderCalendarEvents() {
    const container = document.getElementById("calendar-events");
    if (!container) return;

    const dayEntries = getAllCalendarEntries().filter(e => e.dateKey === calendarSelectedDate);
    const dateLabel = new Date(`${calendarSelectedDate}T00:00:00`)
        .toLocaleDateString("bg-BG", { day: "numeric", month: "long" });

    if (dayEntries.length === 0) {
        container.innerHTML = `<span class="stat-sub">Няма събития на ${dateLabel}.</span>`;
        return;
    }

    container.innerHTML = dayEntries.map(entry => {
        const color = CALENDAR_TYPE_COLORS[entry.type] || CALENDAR_TYPE_COLORS.event;
        const className = entry.classId && classesData[entry.classId]
            ? ` · ${classesData[entry.classId].className}`
            : "";
        const deleteBtn = entry.isAssignment
            ? ""
            : `<button type="button" class="btn-danger-icon" onclick="deleteCalendarEvent(${entry.id})" title="Изтрий събитието"><i class="fa-regular fa-trash-can"></i></button>`;
        return `
            <div class="calendar-event-row">
                <span class="calendar-event-bar" style="background:${color}"></span>
                <span class="calendar-event-info">
                    <strong>${entry.title}</strong>
                    <span>${CALENDAR_TYPE_LABELS[entry.type] || "Събитие"}${className}</span>
                </span>
                ${deleteBtn}
            </div>
        `;
    }).join("");
}

document.getElementById("calendar-event-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const titleInput = document.getElementById("calendar-event-title");
    const dateInput = document.getElementById("calendar-event-date");
    const typeInput = document.getElementById("calendar-event-type");

    const formData = new FormData();
    formData.append("title", titleInput.value.trim());
    formData.append("event_date", dateInput.value);
    formData.append("event_type", typeInput.value);

    try {
        const res = await adminFetch(`${API_URL}/admin/calendar-events`, { method: "POST", body: formData });
        if (res.status === 404 || res.status === 405) {
            throw new Error("Сървърът още не е обновен със събитията в календара. Изчакайте внедряването в Render.");
        }
        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.detail || `HTTP грешка: ${res.status}`);
        }
        titleInput.value = "";
        calendarSelectedDate = dateInput.value;
        calendarViewDate = new Date(`${dateInput.value}T00:00:00`);
        await loadHomeData();
        showToast("Събитието е добавено.", "success");
    } catch (err) {
        showToast("Грешка при запис на събитието: " + err.message, "error");
    }
});

async function deleteCalendarEvent(eventId) {
    if (!confirm("Да изтрия ли това събитие?")) return;
    try {
        const res = await adminFetch(`${API_URL}/admin/calendar-events/${eventId}`, { method: "DELETE" });
        if (!res.ok) throw new Error(`HTTP грешка: ${res.status}`);
        await loadHomeData();
    } catch (err) {
        showToast("Грешка при изтриване на събитието: " + err.message, "error");
    }
}

// Локално кеширани данни за класовете (пълния списък ученици за нуждите на редакция)
const classesData = {};
// Локално кеширани заглавия на задачите, за да се показват в таблото със статистика
const assignmentTitleById = {};

// Зареждане на класовете от базата данни
async function loadClasses() {
    try {
        const res = await adminFetch(`${API_URL}/admin/groups`);
        const classes = await res.json();

        const filterGroup = document.getElementById("filter-group");
        const assignGroupSelect = document.getElementById("assign-group-select");
        const filterAssignmentsClass = document.getElementById("filter-assignments-class");
        const exerciseClassFilter = document.getElementById("exercise-class-filter");

        filterGroup.innerHTML = '<option value="">Всички класове</option>';
        assignGroupSelect.innerHTML = "";
        if(filterAssignmentsClass) filterAssignmentsClass.innerHTML = '<option value="">Всички класове</option>';
        if(exerciseClassFilter) exerciseClassFilter.innerHTML = "";

        classes.forEach(c => {
            const classId = c.group_id || c.id;
            const className = c.group_name || c.name;
            const classStudents = c.students_json || c.students || [];
            const inactiveStudents = c.inactive_students_json || [];
            const avatars = c.student_avatars_json || {};
            classesData[classId] = { className, students: classStudents, inactiveStudents, avatars };

            filterGroup.innerHTML += `<option value="${classId}">${className}</option>`;
            assignGroupSelect.innerHTML += `<option value="${classId}">${className}</option>`;
            if(filterAssignmentsClass) filterAssignmentsClass.innerHTML += `<option value="${classId}">${className}</option>`;
            if(exerciseClassFilter) exerciseClassFilter.innerHTML += `<option value="${classId}">${className}</option>`;
        });

        renderClassesTable(Object.entries(classesData));
        renderClassChips();
        renderClassesAccordionList();
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
            <tr><td colspan="6">
                <div class="empty-state">
                    <div class="empty-icon"><i class="fa-solid fa-inbox"></i></div>
                    <h4>Все още нямате създадени класове</h4>
                    <p>Добавете първия си клас, за да започнете да управлявате ученици.</p>
                    <button type="button" class="btn-primary" onclick="focusCreateClassForm()"><i class="fa-solid fa-plus"></i> Създай първи клас</button>
                </div>
            </td></tr>
        `;
        return;
    }
    classesTable.innerHTML = entries
        .map(([classId, data], index) => renderClassRow(classId, data, index))
        .join("");
}

// Цветова значка за клас (циклично по индекс в списъка)
function classBadgeColorIndex(index) {
    return `c${index % 5}`;
}

// Маркъп на един ред в таблицата с класове (кликването върху реда отваря резултатите на класа в Статистика).
// Линкът за упражнения е винаги видим тук, за да не се налага влизане в Упражнения
// и избор на клас само за да се копира линкът. Редът се разгъва до списък с ученици
// с чекбоксове за групови действия (изтриване/деактивиране/преместване в друг клас).
function renderClassRow(classId, data, colorIndex = 0) {
    const className = data.className;
    const students = data.students || [];
    const exerciseUrl = buildExerciseLink(classId);
    const rowId = `class-${classId}`;

    return `
        <tr id="class-row-${classId}" class="clickable-row" onclick="viewClassResults('${classId}')" title="Отвори резултатите за този клас">
            <td data-label=""><button type="button" class="btn-icon expand-toggle" id="toggle-${rowId}" onclick="event.stopPropagation(); toggleClassRoster('${classId}')" title="Управление на ученици"><i class="fa-solid fa-chevron-right"></i></button></td>
            <td data-label="Клас">
                <div class="class-name-cell">
                    <span class="class-badge ${classBadgeColorIndex(colorIndex)}">${(className || classId).slice(0, 2)}</span>
                    <strong>${className}</strong>
                </div>
            </td>
            <td data-label="ID">${classId}</td>
            <td data-label="Ученици"><i class="fa-solid fa-user-group" style="color: var(--text-muted); margin-right: 6px;"></i>${students.length} ученици</td>
            <td data-label="Линк за упражнения">
                <div class="file-name-cell">
                    <a href="${exerciseUrl}" target="_blank" rel="noopener" class="task-link" onclick="event.stopPropagation();">${exerciseUrl}</a>
                    <button type="button" class="btn-icon" onclick="event.stopPropagation(); copyExerciseLink('${classId}')" title="Копирай линка за упражнения"><i class="fa-regular fa-copy"></i></button>
                </div>
            </td>
            <td data-label="Действия">
                <button type="button" class="btn-icon" onclick="event.stopPropagation(); editClass('${classId}')" title="Редактирай класа"><i class="fa-regular fa-pen-to-square"></i></button>
                <button type="button" class="btn-danger-icon" onclick="event.stopPropagation(); deleteClass('${classId}')" title="Изтрий класа"><i class="fa-regular fa-trash-can"></i></button>
            </td>
        </tr>
        <tr class="submission-detail-row" id="detail-${rowId}" hidden>
            <td colspan="6">${buildClassRosterHtml(classId)}</td>
        </tr>
    `;
}

// Отваря Статистика, филтрирана само за резултатите/материалите на избрания клас
function viewClassResults(classId) {
    syncClassFilter(classId);
    showSection('dashboard');
}

// Извиква фокус върху формата за нов клас/задача - използва се от бутоните
// в "празните състояния" на таблиците (Все още нямате X -> [Създай първи X])
function focusCreateClassForm() {
    showSection('classes');
    document.getElementById("class-id")?.scrollIntoView({ behavior: "smooth", block: "center" });
    document.getElementById("class-id")?.focus();
}

function focusCreateAssignmentForm() {
    showSection('assignments');
    document.getElementById("assign-title")?.scrollIntoView({ behavior: "smooth", block: "center" });
    document.getElementById("assign-title")?.focus();
}

// Разгъва/свива панела за управление на учениците на даден клас
function toggleClassRoster(classId) {
    const rowId = `class-${classId}`;
    const row = document.getElementById(`detail-${rowId}`);
    const toggleBtn = document.getElementById(`toggle-${rowId}`);
    if (!row) return;
    row.hidden = !row.hidden;
    if (toggleBtn) toggleBtn.classList.toggle('expanded', !row.hidden);
}

// Изгражда чеклиста с активни ученици + груповите действия + списъка с деактивирани
// instanceId разграничава два едновременни визуализации на един и същ клас в DOM
// (напр. общата таблица "Ученици" и работния панел на клас) - без него чекбоксите
// и груповите действия биха се объркали кой контейнер да четат
function buildClassRosterHtml(classId, instanceId) {
    instanceId = instanceId || classId;
    const scopeId = `roster-instance-${instanceId}`;
    const moveSelectId = `move-target-${instanceId}`;

    const data = classesData[classId] || { students: [], inactiveStudents: [] };
    const students = data.students || [];
    const inactive = data.inactiveStudents || [];

    const otherClassesOptions = Object.entries(classesData)
        .filter(([id]) => id !== classId)
        .map(([id, d]) => `<option value="${id}">${d.className}</option>`)
        .join("");

    const checklistHtml = students.length === 0
        ? `<p class="stat-sub">Няма активни ученици в този клас.</p>`
        : `<ul class="roster-checklist">${students.map(name => `
            <li>
                <label class="checkbox-label">
                    <input type="checkbox" class="roster-checkbox" data-class="${classId}" value="${escapeJsString(name)}">
                    ${name}
                </label>
            </li>
        `).join("")}</ul>`;

    const inactiveHtml = inactive.length === 0 ? "" : `
        <div class="roster-inactive-section">
            <strong>Деактивирани ученици:</strong>
            <div class="inactive-chip-row">
                ${inactive.map(name => `
                    <span class="inactive-chip">
                        ${name}
                        <button type="button" onclick="reactivateStudent('${classId}', '${escapeJsString(name)}')" title="Активирай отново"><i class="fa-solid fa-rotate-left"></i></button>
                    </span>
                `).join("")}
            </div>
        </div>
    `;

    return `
        <div class="roster-panel" id="${scopeId}">
            <div class="roster-toolbar">
                <label class="checkbox-label">
                    <input type="checkbox" onchange="toggleAllRosterCheckboxes('${classId}', this.checked, '${scopeId}')">
                    Избери всички
                </label>
                <button type="button" class="btn-danger-icon-text" onclick="bulkDeleteStudents('${classId}', '${scopeId}')"><i class="fa-regular fa-trash-can"></i> Изтрий избраните</button>
                <button type="button" class="btn-secondary" onclick="bulkDeactivateStudents('${classId}', '${scopeId}')"><i class="fa-solid fa-user-slash"></i> Деактивирай избраните</button>
                <select id="${moveSelectId}" class="custom-select roster-move-select">
                    <option value="">-- Премести в клас --</option>
                    ${otherClassesOptions}
                </select>
                <button type="button" class="btn-secondary" onclick="bulkMoveStudents('${classId}', '${moveSelectId}', '${scopeId}')"><i class="fa-solid fa-right-left"></i> Премести</button>
            </div>
            ${checklistHtml}
            ${inactiveHtml}
        </div>
    `;
}

function toggleAllRosterCheckboxes(classId, checked, scopeId) {
    const scope = scopeId ? document.getElementById(scopeId) : document;
    if (!scope) return;
    scope.querySelectorAll(`.roster-checkbox[data-class="${classId}"]`).forEach(cb => { cb.checked = checked; });
}

function getCheckedRosterNames(classId, scopeId) {
    const scope = scopeId ? document.getElementById(scopeId) : document;
    if (!scope) return [];
    return Array.from(scope.querySelectorAll(`.roster-checkbox[data-class="${classId}"]:checked`)).map(cb => cb.value);
}

// Записва обновен състав на класа (активни + по избор неактивни ученици/аватари) и
// обновява локалния кеш и таблицата
async function saveClassRoster(classId, className, students, inactiveStudents, avatars) {
    const formData = new FormData();
    formData.append("group_id", classId);
    formData.append("group_name", className);
    formData.append("students_json", JSON.stringify(students));
    if (inactiveStudents !== undefined) {
        formData.append("inactive_students_json", JSON.stringify(inactiveStudents));
    }
    if (avatars !== undefined) {
        formData.append("avatars_json", JSON.stringify(avatars));
    }

    const response = await adminFetch(`${API_URL}/admin/groups`, { method: "POST", body: formData });
    if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || `HTTP грешка: ${response.status}`);
    }

    const previousInactive = (classesData[classId] && classesData[classId].inactiveStudents) || [];
    const previousAvatars = (classesData[classId] && classesData[classId].avatars) || {};
    classesData[classId] = {
        className,
        students,
        inactiveStudents: inactiveStudents !== undefined ? inactiveStudents : previousInactive,
        avatars: avatars !== undefined ? avatars : previousAvatars
    };
    renderClassesTable(Object.entries(classesData));
    renderClassChips();
    renderClassesAccordionList();
}

async function bulkDeleteStudents(classId, scopeId) {
    const checked = getCheckedRosterNames(classId, scopeId);
    if (checked.length === 0) { showToast("Изберете поне един ученик.", "warning"); return; }
    if (!confirm(`Сигурни ли сте, че искате трайно да изтриете ${checked.length} ученици от класа?`)) return;

    const data = classesData[classId];
    const newStudents = (data.students || []).filter(name => !checked.includes(name));
    try {
        await saveClassRoster(classId, data.className, newStudents);
        showToast("Учениците бяха изтрити от класа.", "success");
        refreshRosterViewsForClass(classId);
    } catch (err) {
        showToast("Грешка при изтриване: " + err.message, "error");
    }
}

async function bulkDeactivateStudents(classId, scopeId) {
    const checked = getCheckedRosterNames(classId, scopeId);
    if (checked.length === 0) { showToast("Изберете поне един ученик.", "warning"); return; }
    if (!confirm(`Да се деактивират ли ${checked.length} ученици? Ще изчезнат от активния списък, но данните им се пазят.`)) return;

    const data = classesData[classId];
    const newStudents = (data.students || []).filter(name => !checked.includes(name));
    const newInactive = [...new Set([...(data.inactiveStudents || []), ...checked])];
    try {
        await saveClassRoster(classId, data.className, newStudents, newInactive);
        showToast("Учениците бяха деактивирани.", "success");
        refreshRosterViewsForClass(classId);
    } catch (err) {
        showToast("Грешка при деактивиране: " + err.message, "error");
    }
}

async function reactivateStudent(classId, name) {
    const data = classesData[classId];
    const newInactive = (data.inactiveStudents || []).filter(n => n !== name);
    const newStudents = [...new Set([...(data.students || []), name])];
    try {
        await saveClassRoster(classId, data.className, newStudents, newInactive);
        showToast(`${name} е активиран отново.`, "success");
        refreshRosterViewsForClass(classId);
    } catch (err) {
        showToast("Грешка при активиране: " + err.message, "error");
    }
}

async function bulkMoveStudents(classId, moveSelectId, scopeId) {
    const targetClassId = document.getElementById(moveSelectId).value;
    if (!targetClassId) { showToast("Изберете целеви клас.", "warning"); return; }
    const checked = getCheckedRosterNames(classId, scopeId);
    if (checked.length === 0) { showToast("Изберете поне един ученик.", "warning"); return; }

    const sourceData = classesData[classId];
    const targetData = classesData[targetClassId];
    if (!confirm(`Да се преместят ли ${checked.length} ученици в клас "${targetData.className}"?`)) return;

    const newSourceStudents = (sourceData.students || []).filter(name => !checked.includes(name));
    const newTargetStudents = [...new Set([...(targetData.students || []), ...checked])];

    try {
        await saveClassRoster(classId, sourceData.className, newSourceStudents);
        await saveClassRoster(targetClassId, targetData.className, newTargetStudents);
        showToast("Учениците бяха преместени.", "success");
        refreshRosterViewsForClass(classId);
    } catch (err) {
        showToast("Грешка при преместване: " + err.message, "error");
    }
}

// Обновява панела с ученици в работния панел на клас, ако точно този клас е зареден там
// (renderClassesTable вече опреснява общата таблица като част от saveClassRoster)
function refreshRosterViewsForClass(classId) {
    if (lockedClassId === classId) {
        const container = document.getElementById("workspace-roster-container");
        if (container) container.innerHTML = buildClassRosterHtml(classId, "workspace");
    }
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
    const previousInactive = (classesData[classId] && classesData[classId].inactiveStudents) || [];
    const previousAvatars = (classesData[classId] && classesData[classId].avatars) || {};
    classesData[classId] = { className, students, inactiveStudents: previousInactive, avatars: previousAvatars };

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
    renderClassesAccordionList();
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

// Зарежда данните на съществуваща задача обратно във формата за редакция (краен
// срок, линк) - критериите и помощният файл остават непроменени на сървъра, ако
// тук не се избере нов файл/шаблон, вместо тихо да се изтрият при запис
let editingAssignmentId = null;

function isoToDatetimeLocalValue(isoString) {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return "";
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function editAssignment(assignmentId) {
    const data = assignmentsCache.find(a => a.id === assignmentId);
    if (!data) return;

    editingAssignmentId = assignmentId;

    document.getElementById("assign-group-select").value = data.group_id || data.class_id || "";
    document.getElementById("assign-title").value = data.title || "";
    document.getElementById("assign-deadline").value = data.deadline ? isoToDatetimeLocalValue(data.deadline) : "";
    document.getElementById("assign-reference-link").value = data.reference_link || "";
    document.getElementById("assign-description").value = data.description || "";
    renderAssignmentDescriptionPreview();

    document.getElementById("assignment-form-title").textContent = `Редактиране на задача: ${data.title}`;
    document.getElementById("assignment-form-submit-btn").innerHTML = '<i class="fa-solid fa-check"></i> Запази промените';
    document.getElementById("assignment-form-cancel-btn").style.display = "inline-block";

    document.getElementById("assign-group-select").scrollIntoView({ behavior: "smooth", block: "center" });
}

function cancelAssignmentEdit() {
    editingAssignmentId = null;
    document.getElementById("create-assignment-form").reset();
    document.getElementById("assign-template-title").style.display = "none";
    document.getElementById("assignment-form-title").textContent = "Създай Задача";
    document.getElementById("assignment-form-submit-btn").innerHTML = '<i class="fa-solid fa-plus"></i> Създай Задача';
    document.getElementById("assignment-form-cancel-btn").style.display = "none";
    renderAssignmentDescriptionPreview();
}

// Живо превключва Markdown -> HTML в панела за описание на задача
function renderAssignmentDescriptionPreview() {
    const source = document.getElementById("assign-description")?.value || "";
    const preview = document.getElementById("assign-description-preview");
    if (!preview) return;
    if (!source.trim()) {
        preview.innerHTML = `<span class="stat-sub">Тук ще се покаже прегледът...</span>`;
        return;
    }
    preview.innerHTML = (typeof marked !== "undefined") ? marked.parse(source) : source;
}

// Изтриване на клас
async function deleteClass(classId) {
    if (!confirm(`Сигурни ли сте, че искате да изтриете класа "${classId}"? Това действие не може да бъде отменено.`)) return;

    try {
        const response = await adminFetch(`${API_URL}/admin/groups/${encodeURIComponent(classId)}`, { method: "DELETE" });
        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.detail || `HTTP грешка: ${response.status}`);
        }

        delete classesData[classId];
        renderClassesTable(Object.entries(classesData));
        document.querySelectorAll(`#filter-group option[value="${classId}"], #assign-group-select option[value="${classId}"], #filter-assignments-class option[value="${classId}"], #exercise-class-filter option[value="${classId}"]`)
            .forEach(opt => opt.remove());
        renderClassChips();
        renderClassesAccordionList();

        if (editingClassId === classId) cancelClassEdit();
        if (lockedClassId === classId) exitClassWorkspace();

        loadAssignments();
    } catch (err) {
        showToast("Грешка при изтриване на класа: " + err.message, "error");
    }
}

// Изтрива класа, който в момента е зареден в работния панел
function deleteWorkspaceClass() {
    if (lockedClassId) deleteClass(lockedClassId);
}

// Раздел "Ученици" в работния панел на клас - показва списъка веднага, без разгъване
function loadWorkspaceStudents() {
    if (!lockedClassId) return;
    const data = classesData[lockedClassId];
    if (!data) return;

    document.getElementById("workspace-students-subtitle").textContent = `Клас: ${data.className} (${lockedClassId})`;
    document.getElementById("workspace-class-id-display").value = lockedClassId;
    document.getElementById("workspace-class-name-input").value = data.className;
    document.getElementById("workspace-roster-container").innerHTML = buildClassRosterHtml(lockedClassId, "workspace");
    populateNoteStudentSelect(data);
    loadStudentNotes();
}

function escapeHtml(str) {
    return String(str ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// Попълва падащото меню за избор на ученик в картата "Бързи бележки"
function populateNoteStudentSelect(data) {
    const select = document.getElementById("note-student-select");
    if (!select) return;
    const students = data.students || [];
    select.innerHTML = '<option value="" disabled selected>-- Изберете ученик --</option>' +
        students.map(name => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join("");
}

let studentNotesCache = [];

// Зарежда бързите бележки за текущия клас в работния панел
async function loadStudentNotes() {
    if (!lockedClassId) return;
    const container = document.getElementById("student-notes-list");
    if (!container) return;
    try {
        const res = await adminFetch(`${API_URL}/admin/notes?group_id=${encodeURIComponent(lockedClassId)}`);
        studentNotesCache = res.ok ? await res.json() : [];
    } catch (err) {
        studentNotesCache = [];
    }
    renderStudentNotes();
}

function renderStudentNotes() {
    const container = document.getElementById("student-notes-list");
    if (!container) return;
    if (!studentNotesCache.length) {
        container.innerHTML = `<div class="empty-state" style="padding: 24px 20px;">
            <i class="fa-regular fa-note-sticky" style="font-size:28px; color: var(--text-muted); margin-bottom: 8px;"></i>
            <p>Все още няма добавени бележки за този клас.</p>
        </div>`;
        return;
    }
    const sorted = [...studentNotesCache].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    container.innerHTML = `<div class="student-notes-scroll">` + sorted.map(note => `
        <div class="student-note-item">
            <div class="student-note-main">
                <strong>${escapeHtml(note.student_name)}</strong>
                <span>${escapeHtml(note.note)}</span>
            </div>
            <div class="student-note-meta">
                <span class="student-note-date">${formatNoteDate(note.created_at)}</span>
                <button type="button" class="btn-icon-danger" onclick="deleteStudentNote(${note.id})" title="Изтрий">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>
        </div>
    `).join("") + `</div>`;
}

function formatNoteDate(iso) {
    try {
        const d = new Date(iso);
        return d.toLocaleDateString("bg-BG", { day: "2-digit", month: "2-digit", year: "numeric" }) + " " +
            d.toLocaleTimeString("bg-BG", { hour: "2-digit", minute: "2-digit" });
    } catch {
        return "";
    }
}

document.getElementById("student-note-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!lockedClassId) return;
    const studentName = document.getElementById("note-student-select").value;
    const noteText = document.getElementById("note-text-input").value.trim();
    if (!studentName || !noteText) return;

    const formData = new FormData();
    formData.append("class_id", lockedClassId);
    formData.append("student_name", studentName);
    formData.append("note", noteText);

    try {
        const res = await adminFetch(`${API_URL}/admin/notes`, { method: "POST", body: formData });
        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.detail || `HTTP грешка: ${res.status}`);
        }
        document.getElementById("note-text-input").value = "";
        await loadStudentNotes();
        showToast("Бележката е добавена.", "success");
    } catch (err) {
        showToast("Грешка: " + err.message, "error");
    }
});

async function deleteStudentNote(noteId) {
    if (!confirm("Да изтрия ли тази бележка?")) return;
    try {
        const res = await adminFetch(`${API_URL}/admin/notes/${noteId}`, { method: "DELETE" });
        if (!res.ok) throw new Error(`HTTP грешка: ${res.status}`);
        await loadStudentNotes();
        showToast("Бележката е изтрита.", "success");
    } catch (err) {
        showToast("Грешка: " + err.message, "error");
    }
}

document.getElementById("workspace-class-info-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!lockedClassId) return;

    const newName = document.getElementById("workspace-class-name-input").value.trim();
    const data = classesData[lockedClassId];
    try {
        await saveClassRoster(lockedClassId, newName, data.students || [], data.inactiveStudents || []);
        showToast("Класът е обновен успешно!", "success");
        applyWorkspaceLock();
    } catch (err) {
        showToast("Грешка при запазване: " + err.message, "error");
    }
});

// -----------------------------------------------------------------------------
// ПРИСЪСТВИЕ - раздел в работния панел на клас, по дата
// -----------------------------------------------------------------------------
let attendanceCache = [];

function formatDateForInput(date) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function goToTodayAttendance() {
    document.getElementById("attendance-date-input").value = formatDateForInput(new Date());
    loadAttendanceData();
}

function shiftAttendanceDate(delta) {
    const input = document.getElementById("attendance-date-input");
    const current = input.value ? new Date(input.value + "T00:00:00") : new Date();
    current.setDate(current.getDate() + delta);
    input.value = formatDateForInput(current);
    loadAttendanceData();
}

async function loadAttendanceData() {
    if (!lockedClassId) return;
    const input = document.getElementById("attendance-date-input");
    if (!input.value) input.value = formatDateForInput(new Date());

    const data = classesData[lockedClassId];
    const className = data ? data.className : lockedClassId;
    document.getElementById("attendance-subtitle").textContent = `Клас: ${className}`;
    document.getElementById("attendance-list-title").textContent = `Ученици в клас ${className}`;

    try {
        const res = await adminFetch(`${API_URL}/admin/attendance?group_id=${encodeURIComponent(lockedClassId)}&record_date=${input.value}`);
        if (!res.ok) throw new Error("Грешка при заявката към сървъра");
        attendanceCache = await res.json();
    } catch (err) {
        console.error("Грешка при зареждане на присъствието:", err);
        attendanceCache = [];
    }

    renderAttendanceList();
}

// Ученик без запис за деня се показва като "Отсъства" по подразбиране (учителят маркира
// присъстващите при преброяване), но нищо не се записва в базата, докато не се кликне
function effectiveAttendanceStatus(name, statusByName) {
    return statusByName[name] === 'present' ? 'present' : 'absent';
}

// Илюстрирани аватари (момиче/момче) - реалните картинки от референтния дизайн,
// качени в assets/avatars/
const AVATAR_IMG_GIRL = "assets/avatars/girl.png";
const AVATAR_IMG_BOY = "assets/avatars/boy.png";

// Ако учителят е задал ръчно момче/момиче за ученика (чрез моливчето на аватара), това
// има предимство; иначе - отгатва по края на първото име (бълг. имена, завършващи на
// "а"/"я", обикновено са женски) като чисто козметично начално предположение
function studentAvatarGender(name, classId) {
    const override = classId && classesData[classId] && classesData[classId].avatars
        ? classesData[classId].avatars[name]
        : null;
    if (override === "girl" || override === "boy") return override;

    const firstName = (name || "").trim().split(/\s+/)[0] || "";
    const lastChar = firstName.slice(-1).toLowerCase();
    return (lastChar === "а" || lastChar === "я") ? "girl" : "boy";
}

function guessAvatarImage(name, classId) {
    return studentAvatarGender(name, classId) === "girl" ? AVATAR_IMG_GIRL : AVATAR_IMG_BOY;
}

// Превключва ръчно зададения пол на аватара за ученика и го записва трайно
async function toggleStudentAvatar(classId, name) {
    const data = classesData[classId];
    if (!data) return;
    const current = studentAvatarGender(name, classId);
    const next = current === "boy" ? "girl" : "boy";
    const newAvatars = { ...(data.avatars || {}), [name]: next };

    try {
        await saveClassRoster(classId, data.className, data.students || [], data.inactiveStudents, newAvatars);
        renderAttendanceList();
    } catch (err) {
        showToast("Грешка при смяна на аватара: " + err.message, "error");
    }
}

function renderAttendanceList() {
    if (!lockedClassId) return;
    const data = classesData[lockedClassId] || { students: [] };
    const students = data.students || [];
    const statusByName = {};
    attendanceCache.forEach(r => { statusByName[r.student_name] = r.status; });

    const container = document.getElementById("attendance-list");
    if (students.length === 0) {
        container.innerHTML = `<p class="stat-sub" style="padding:12px;">Няма ученици в този клас.</p>`;
    } else {
        container.innerHTML = students.map((name) => {
            const status = effectiveAttendanceStatus(name, statusByName);
            const buttonText = status === 'present' ? `${name}<br>(Присъства)` : name;
            const safeName = escapeJsString(name);
            return `
                <div class="attendance-card">
                    <div class="attendance-avatar-outer">
                        <div class="attendance-avatar-wrap" title="${safeName}">
                            <img src="${guessAvatarImage(name, lockedClassId)}" alt="${safeName}" class="avatar">
                        </div>
                        <button type="button" class="avatar-edit-btn" onclick="event.stopPropagation(); toggleStudentAvatar('${lockedClassId}', '${safeName}')" title="Смени момче/момиче">
                            <i class="fa-solid fa-pen"></i>
                        </button>
                    </div>
                    <button type="button" class="status-button ${status}" data-student-name="${safeName}" onclick="toggleAttendanceCard('${safeName}')">${buttonText}</button>
                </div>
            `;
        }).join("");
    }

    const total = students.length;
    const present = students.filter(name => effectiveAttendanceStatus(name, statusByName) === 'present').length;
    const absent = total - present;
    document.getElementById("attendance-total").textContent = total;
    document.getElementById("attendance-present").textContent = present;
    document.getElementById("attendance-absent").textContent = absent;
}

function toggleAttendanceCard(name) {
    const existing = attendanceCache.find(r => r.student_name === name);
    const currentStatus = existing ? existing.status : 'absent';
    const nextStatus = currentStatus === 'present' ? 'absent' : 'present';
    setAttendance(name, nextStatus);
}

async function setAttendance(name, status) {
    if (!lockedClassId) return;
    const input = document.getElementById("attendance-date-input");
    const formData = new FormData();
    formData.append("class_id", lockedClassId);
    formData.append("student_name", name);
    formData.append("record_date", input.value);
    formData.append("status", status);

    try {
        const res = await adminFetch(`${API_URL}/admin/attendance`, { method: "POST", body: formData });
        if (!res.ok) throw new Error("Грешка при заявката към сървъра");
        const existing = attendanceCache.find(r => r.student_name === name);
        if (existing) { existing.status = status; } else { attendanceCache.push({ student_name: name, status }); }
        renderAttendanceList();
        pulseAttendanceCard(name);
    } catch (err) {
        showToast("Грешка при отбелязване на присъствие: " + err.message, "error");
    }
}

function pulseAttendanceCard(name) {
    const btn = document.querySelector(`.status-button[data-student-name="${CSS.escape(name)}"]`);
    if (!btn) return;
    btn.classList.add("pulse");
    setTimeout(() => btn.classList.remove("pulse"), 400);
}

async function markAllAttendance(status) {
    if (!lockedClassId) return;
    const data = classesData[lockedClassId] || { students: [] };
    const students = data.students || [];
    if (students.length === 0) return;

    const input = document.getElementById("attendance-date-input");
    const formData = new FormData();
    formData.append("class_id", lockedClassId);
    formData.append("record_date", input.value);
    formData.append("status", status);
    formData.append("students_json", JSON.stringify(students));

    try {
        const res = await adminFetch(`${API_URL}/admin/attendance/bulk`, { method: "POST", body: formData });
        if (!res.ok) throw new Error("Грешка при заявката към сървъра");
        attendanceCache = students.map(name => ({ student_name: name, status }));
        renderAttendanceList();
        showToast("Присъствието е отбелязано за всички.", "success");
    } catch (err) {
        showToast("Грешка при масово отбелязване: " + err.message, "error");
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

        const res = await adminFetch(url);
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
            <tr><td colspan="6">
                <div class="empty-state">
                    <div class="empty-icon"><i class="fa-solid fa-inbox"></i></div>
                    <h4>Все още нямате създадени задачи${lockedClassId ? ' за този клас' : ''}</h4>
                    <p>Създайте първата задача, за да я видите тук.</p>
                    <button type="button" class="btn-primary" onclick="focusCreateAssignmentForm()"><i class="fa-solid fa-plus"></i> Създай първа задача</button>
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

// Присъствието се води във външно приложение - отваря се в нов таб
const ATTENDANCE_APP_URL = "https://vpclassroom-manageme-wl5w.bolt.host/";

function openAttendanceApp() {
    window.open(ATTENDANCE_APP_URL, "_blank", "noopener");
}

// -----------------------------------------------------------------------------
// ФАЙЛОВЕ - самостоятелен модул: заявка с уникален линк, по който всеки може да
// качи файл (без задължително име), а файловете се управляват оттук
// -----------------------------------------------------------------------------
let fileRequestsCache = [];

function buildFileRequestLink(requestId) {
    return `${window.location.origin}${getSiteBasePath()}index.html?files=${encodeURIComponent(requestId)}`;
}

function formatFileSize(bytes) {
    if (!bytes && bytes !== 0) return "—";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function loadFilesSection() {
    await loadFileRequests();
    await loadFileUploads();
}

async function loadFileRequests() {
    const list = document.getElementById("file-requests-list");
    if (!list) return;

    try {
        const res = await adminFetch(`${API_URL}/admin/file-requests`);
        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.detail || `HTTP грешка: ${res.status}`);
        }
        fileRequestsCache = await res.json();
    } catch (err) {
        list.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon"><i class="fa-solid fa-triangle-exclamation"></i></div>
                <h4>Модулът още не е готов</h4>
                <p>${err.message}</p>
            </div>`;
        return;
    }

    const filter = document.getElementById("file-uploads-filter");
    if (filter) {
        const current = filter.value;
        filter.innerHTML = `<option value="">Всички заявки</option>` +
            fileRequestsCache.map(r => `<option value="${r.request_id}">${r.title}</option>`).join("");
        filter.value = current;
    }

    if (fileRequestsCache.length === 0) {
        list.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon"><i class="fa-solid fa-link"></i></div>
                <h4>Още няма заявки</h4>
                <p>Създайте първата заявка отгоре, за да получите линк за качване.</p>
            </div>`;
        return;
    }

    list.innerHTML = fileRequestsCache.map(req => {
        const link = buildFileRequestLink(req.request_id);
        return `
            <div class="file-request-row">
                <div class="file-request-info">
                    <strong>${req.title}</strong>
                    ${req.note ? `<span class="file-request-note">${req.note}</span>` : ""}
                    <a href="${link}" target="_blank" rel="noopener" class="task-link file-request-link">${link}</a>
                </div>
                <span class="badge-status">${req.upload_count || 0} файла</span>
                <div class="file-request-actions">
                    <button type="button" class="btn-icon" title="Копирай линка" onclick="copyFileRequestLink('${req.request_id}')"><i class="fa-regular fa-copy"></i></button>
                    <button type="button" class="btn-danger-icon" title="Изтрий заявката и файловете по нея" onclick="deleteFileRequest('${req.request_id}', ${JSON.stringify(req.title).replace(/"/g, '&quot;')})"><i class="fa-regular fa-trash-can"></i></button>
                </div>
            </div>`;
    }).join("");
}

function copyFileRequestLink(requestId) {
    const link = buildFileRequestLink(requestId);
    navigator.clipboard.writeText(link)
        .then(() => showToast("Линкът е копиран.", "success"))
        .catch(() => showToast("Копирането не бе разрешено от браузъра.", "error"));
}

async function createFileRequest(event) {
    event.preventDefault();
    const title = document.getElementById("file-request-title").value.trim();
    const note = document.getElementById("file-request-note").value.trim();
    if (!title) return;

    const formData = new FormData();
    formData.append("title", title);
    formData.append("note", note);

    try {
        const res = await adminFetch(`${API_URL}/admin/file-requests`, { method: "POST", body: formData });
        if (res.status === 404 || res.status === 405) {
            throw new Error("Сървърът още не е обновен с модула за файлове. Изчакайте внедряването в Render.");
        }
        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.detail || `HTTP грешка: ${res.status}`);
        }

        document.getElementById("create-file-request-form").reset();
        showToast("Линкът за качване е готов.", "success");
        await loadFileRequests();
    } catch (err) {
        showToast("Грешка: " + err.message, "error");
    }
}

async function deleteFileRequest(requestId, title) {
    if (!confirm(`Да се изтрие ли заявката "${title}" заедно с всички качени по нея файлове?`)) return;

    try {
        const res = await adminFetch(`${API_URL}/admin/file-requests/${requestId}`, { method: "DELETE" });
        if (!res.ok) throw new Error(`HTTP грешка: ${res.status}`);
        showToast("Заявката е изтрита.", "success");
        await loadFilesSection();
    } catch (err) {
        showToast("Грешка при изтриване: " + err.message, "error");
    }
}

async function loadFileUploads() {
    const tbody = document.querySelector("#file-uploads-table tbody");
    if (!tbody) return;

    const requestId = document.getElementById("file-uploads-filter")?.value || "";
    const query = requestId ? `?request_id=${encodeURIComponent(requestId)}` : "";

    let uploads = [];
    try {
        const res = await adminFetch(`${API_URL}/admin/file-request-uploads${query}`);
        if (!res.ok) throw new Error(`HTTP грешка: ${res.status}`);
        uploads = await res.json();
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><h4>Няма връзка със сървъра</h4><p>${err.message}</p></div></td></tr>`;
        return;
    }

    if (uploads.length === 0) {
        tbody.innerHTML = `
            <tr><td colspan="7">
                <div class="empty-state">
                    <div class="empty-icon"><i class="fa-solid fa-inbox"></i></div>
                    <h4>Няма качени файлове</h4>
                    <p>Файловете, качени по вашите линкове, ще се появят тук.</p>
                </div>
            </td></tr>`;
        return;
    }

    const titleByRequest = {};
    fileRequestsCache.forEach(r => { titleByRequest[r.request_id] = r.title; });

    tbody.innerHTML = uploads.map((u, i) => {
        const safeName = JSON.stringify(u.filename || "Файл").replace(/"/g, '&quot;');
        const uploader = u.uploader_name || '<span class="stat-sub">Анонимен</span>';
        return `
            <tr>
                <td>${i + 1}</td>
                <td><div class="file-name-cell"><i class="fa-regular fa-file-lines"></i>${u.filename || "Файл"}</div></td>
                <td>${titleByRequest[u.request_id] || u.request_id}</td>
                <td>${uploader}</td>
                <td>${formatFileSize(u.size_bytes)}</td>
                <td>${formatSubmittedAt(u.created_at)}</td>
                <td>
                    <button type="button" class="btn-icon" title="Прегледай" onclick="openFilePreview('${u.file_url}', ${safeName}, ${JSON.stringify(formatSubmittedAt(u.created_at)).replace(/"/g, '&quot;')})"><i class="fa-regular fa-eye"></i></button>
                    <a href="${u.file_url}" download="${u.filename || ''}" class="btn-icon" title="Свали"><i class="fa-solid fa-download"></i></a>
                    <button type="button" class="btn-danger-icon" title="Изтрий" onclick="deleteFileUpload(${u.id})"><i class="fa-regular fa-trash-can"></i></button>
                </td>
            </tr>`;
    }).join("");
}

document.getElementById("create-file-request-form")?.addEventListener("submit", createFileRequest);

async function deleteFileUpload(uploadId) {
    if (!confirm("Да се изтрие ли този файл?")) return;

    try {
        const res = await adminFetch(`${API_URL}/admin/file-request-uploads/${uploadId}`, { method: "DELETE" });
        if (!res.ok) throw new Error(`HTTP грешка: ${res.status}`);
        showToast("Файлът е изтрит.", "success");
        await loadFilesSection();
    } catch (err) {
        showToast("Грешка при изтриване: " + err.message, "error");
    }
}

function buildStudentLink(assignmentId) {
    return `${window.location.origin}${getSiteBasePath()}index.html?id=${assignmentId}`;
}

// Маркъп на един ред в таблицата със задачи, включително уникалния линк за ученици
function renderAssignmentRow(a) {
    const studentUrl = buildStudentLink(a.id);
    const deadlineText = a.deadline ? formatSubmittedAt(a.deadline) : '<span class="stat-sub">Няма</span>';
    const materialsIcons = [
        a.reference_file_url ? `<a href="${a.reference_file_url}" target="_blank" rel="noopener" class="btn-icon" title="Помощен файл"><i class="fa-regular fa-file"></i></a>` : '',
        a.reference_link ? `<a href="${a.reference_link}" target="_blank" rel="noopener" class="btn-icon" title="Помощен линк"><i class="fa-solid fa-link"></i></a>` : ''
    ].filter(Boolean).join('') || '<span class="stat-sub">—</span>';

    return `
        <tr id="assignment-row-${a.id}">
            <td data-label="Заглавие"><strong>${a.title}</strong></td>
            <td data-label="Клас">${a.group_id || a.class_id || ''}</td>
            <td data-label="Краен срок">${deadlineText}</td>
            <td data-label="Материали">${materialsIcons}</td>
            <td data-label="Линк"><a href="${studentUrl}" target="_blank" class="task-link">${studentUrl}</a></td>
            <td data-label="Действия">
                <button type="button" class="btn-icon" onclick="copyAssignmentLink('${a.id}')" title="Копирай линка"><i class="fa-regular fa-copy"></i></button>
                <button type="button" class="btn-icon" onclick="editAssignment('${a.id}')" title="Редактирай задачата"><i class="fa-regular fa-pen-to-square"></i></button>
                <button type="button" class="btn-danger-icon" onclick="deleteAssignment('${a.id}')" title="Изтрий задачата"><i class="fa-regular fa-trash-can"></i></button>
            </td>
        </tr>
    `;
}

function copyAssignmentLink(assignmentId) {
    const url = buildStudentLink(assignmentId);
    navigator.clipboard?.writeText(url).then(() => {
        showToast("Линкът е копиран.", "success");
    }).catch(() => {
        prompt("Копирайте линка ръчно:", url);
    });
}

async function deleteAssignment(assignmentId) {
    if (!confirm("Сигурни ли сте, че искате да изтриете тази задача? Това действие не може да бъде отменено.")) return;

    try {
        const response = await adminFetch(`${API_URL}/admin/assignments/${encodeURIComponent(assignmentId)}`, { method: "DELETE" });
        if (!response.ok) throw new Error("Грешка при изтриване от сървъра");

        document.getElementById(`assignment-row-${assignmentId}`)?.remove();
        document.querySelector(`#filter-assignment option[value="${assignmentId}"]`)?.remove();
    } catch (err) {
        showToast("Грешка при изтриване на задачата: " + err.message, "error");
    }
}

// Функция за филтриране на таблицата със задачи (винаги позволява връщане към всички активни задачи)
function filterAssignmentsTable() {
    const selectedClass = document.getElementById("filter-assignments-class").value;
    loadAssignments(selectedClass);
}

// Разчита списък с ученици, поставен директно от електронен дневник - премахва
// водещ номер/индекс на реда ("1.", "1)", "№", таб-разделена номерирана колона)
// и прескача редове, съдържащи само заглавие на колона (напр. "№  Име Фамилия")
const ROSTER_HEADER_WORDS = new Set(["№", "no", "name", "име", "имена", "ученик", "ученици", "фамилия"]);

function parseStudentRoster(text) {
    return text.split("\n")
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .map(line => line.replace(/^(?:№\s*|\d+\s*[.)\-:]?\s*)/, "").replace(/\t+/g, " ").trim())
        .filter(name => {
            if (!name) return false;
            // Пропуска редове, съставени изцяло от заглавни думи (напр. "Име, Фамилия")
            const tokens = name.toLowerCase().split(/[^a-zа-я]+/).filter(Boolean);
            const isHeaderOnly = tokens.length > 0 && tokens.every(t => ROSTER_HEADER_WORDS.has(t));
            return !isHeaderOnly;
        });
}

// Добавяне/редактиране на клас и мигновено визуализиране
document.getElementById("create-class-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = document.getElementById("class-id").value.trim();
    const name = document.getElementById("class-name").value.trim();
    const studentsText = document.getElementById("class-names-text").value;
    const studentsArray = parseStudentRoster(studentsText);

    if (!editingClassId && classesData[id]) {
        if (!confirm(`Клас с ID "${id}" вече съществува. Искате ли да презапишете данните му?`)) return;
    }

    const formData = new FormData();
    formData.append("group_id", id);
    formData.append("group_name", name);
    formData.append("students_json", JSON.stringify(studentsArray));

    try {
        const response = await adminFetch(`${API_URL}/admin/groups`, {
            method: "POST",
            body: formData
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.detail || `HTTP грешка: ${response.status}`);
        }

        showToast(editingClassId ? "Класът е обновен успешно!" : "Класът е запазен успешно!", "success");
        upsertClassInUI(id, name, studentsArray);

        if (editingClassId) {
            cancelClassEdit();
        } else {
            document.getElementById("create-class-form").reset();
        }
    } catch (err) {
        showToast("Грешка при запазване на класа: " + err.message, "error");
    }
});

// Добавяне на нова задача
// Показва/скрива полето за име на шаблон според чекбокса "Запази като шаблон"
document.getElementById("assign-save-as-template")?.addEventListener("change", (e) => {
    document.getElementById("assign-template-title").style.display = e.target.checked ? "block" : "none";
});

document.getElementById("create-assignment-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const group_id = document.getElementById("assign-group-select").value;
    const title = document.getElementById("assign-title").value.trim();
    const fileInput = document.getElementById("criteria-file-input");
    const templateId = document.getElementById("assign-template-select").value;
    const deadline = document.getElementById("assign-deadline").value;
    const referenceLink = document.getElementById("assign-reference-link").value.trim();
    const referenceFileInput = document.getElementById("assign-reference-file");
    const saveAsTemplate = document.getElementById("assign-save-as-template").checked;
    const templateTitle = document.getElementById("assign-template-title").value.trim();
    const description = document.getElementById("assign-description").value;

    const formData = new FormData();
    formData.append("group_id", group_id);
    formData.append("title", title);

    // ДОБАВЕНО: Винаги изпращаме празен JSON за критерии, за да предотвратим 422 грешки от FastAPI
    formData.append("criteria_json", "{}");

    if (templateId) {
        formData.append("template_id", templateId);
    } else if (fileInput.files.length > 0) {
        formData.append("criteria_file", fileInput.files[0]);
    }
    if (deadline) formData.append("deadline", deadline);
    if (referenceLink) formData.append("reference_link", referenceLink);
    if (referenceFileInput.files.length > 0) formData.append("reference_file", referenceFileInput.files[0]);
    if (editingAssignmentId) formData.append("assignment_id", editingAssignmentId);
    if (description.trim()) formData.append("description", description);

    try {
        const response = await adminFetch(`${API_URL}/admin/assignments`, {
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

        const result = await response.json();

        // Ако е поискано запазване като шаблон, взимаме реално записаните критерии
        // (след парсване на Word файла или от избрания шаблон) и ги пазим за бъдеще
        if (saveAsTemplate && templateTitle) {
            try {
                const createdAssignment = await (await fetch(`${API_URL}/assignments/${encodeURIComponent(result.assignment_id)}`)).json();
                const templateForm = new FormData();
                templateForm.append("title", templateTitle);
                templateForm.append("criteria_json", JSON.stringify(createdAssignment.criteria || {}));
                await adminFetch(`${API_URL}/admin/templates`, { method: "POST", body: templateForm });
                await loadTemplates();
            } catch (tplErr) {
                console.error("Грешка при запазване на шаблона:", tplErr);
            }
        }

        showToast(editingAssignmentId ? "Задачата е обновена успешно!" : "Задачата е създадена успешно!", "success");
        if (editingAssignmentId) {
            cancelAssignmentEdit();
        } else {
            document.getElementById("create-assignment-form").reset();
            document.getElementById("assign-template-title").style.display = "none";
            renderAssignmentDescriptionPreview();
        }

        const currentFilter = document.getElementById("filter-assignments-class").value;
        await loadAssignments(currentFilter);
    } catch (err) {
        showToast("Грешка при създаване на задачата: " + err.message, "error");
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

        const res = await adminFetch(url);
        if (!res.ok) throw new Error("Грешка при заявката към сървъра");
        const submissions = await res.json();
        // Най-новите предавания най-отгоре
        submissions.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
        submissionsCache = submissions;

        const totalStudentsCount = classId && classesData[classId]
            ? (classesData[classId].students || []).length
            : Object.values(classesData).reduce((sum, c) => sum + (c.students || []).length, 0);

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

        document.getElementById("stat-excellent").innerText = submissions.filter(s => s.grade === 6).length;
        document.getElementById("stat-late").innerText = submissions.filter(s => s.is_late).length;

        const uniqueSubmittedStudents = new Set(submissions.map(s => s.student_name)).size;
        document.getElementById("stat-missing").innerText = Math.max(0, totalStudentsCount - uniqueSubmittedStudents);

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
        const lateBadge = sub.is_late
            ? '<span class="badge-status grade-badge grade-low" style="margin-left:6px;"><i class="fa-regular fa-clock"></i> Закъснял</span>'
            : '';
        const taskTitle = assignmentTitleById[sub.assignment_id] || (sub.assignment_id ? sub.assignment_id : '—');
        const studentName = sub.student_name || 'Неизвестен';
        const submittedAt = formatSubmittedAt(sub.created_at);
        const fileActions = (sub.file_url && sub.file_url !== '#')
            ? `
                <button type="button" class="btn-icon" title="Прегледай материала" onclick="openFilePreview('${sub.file_url}', ${JSON.stringify(sub.filename || 'Файл').replace(/"/g, '&quot;')}, ${JSON.stringify(`${studentName} · ${submittedAt}`).replace(/"/g, '&quot;')})"><i class="fa-regular fa-eye"></i></button>
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
                <td data-label=""><button type="button" class="btn-icon expand-toggle" id="toggle-${sub.id}" title="Детайли по критерии"><i class="fa-solid fa-chevron-right"></i></button></td>
                <td data-label="№">${index + 1}</td>
                <td data-label="Ученик"><span class="row-avatar a${index % 5}">${studentName.slice(0, 1).toUpperCase()}</span><strong>${studentName}</strong></td>
                <td data-label="Задача">${taskTitle}</td>
                <td data-label="Файл"><div class="file-name-cell"><i class="fa-regular fa-file-lines"></i>${sub.filename || sub.file_name || 'Файл'}</div></td>
                <td data-label="Предадено на">${submittedAt}</td>
                <td data-label="Точки / Успех" onclick="event.stopPropagation();">
                    <span class="score-display" id="score-display-${sub.id}">
                        <strong>${sub.score || 0}</strong> / ${sub.max_score || 100} точки
                        <button type="button" class="btn-icon" onclick="startEditScore(${sub.id})" title="Редактирай точките"><i class="fa-regular fa-pen-to-square"></i></button>
                    </span>
                    <span class="score-edit" id="score-edit-${sub.id}" style="display:none;">
                        <input type="number" id="score-input-${sub.id}" value="${sub.score || 0}" min="0" step="0.5" class="inline-edit-input">
                        <span>/</span>
                        <input type="number" id="maxscore-input-${sub.id}" value="${sub.max_score || 100}" min="1" step="0.5" class="inline-edit-input">
                        <button type="button" class="btn-icon" onclick="saveEditScore(${sub.id})" title="Запази"><i class="fa-solid fa-check"></i></button>
                        <button type="button" class="btn-icon" onclick="cancelEditScore(${sub.id})" title="Отказ"><i class="fa-solid fa-xmark"></i></button>
                    </span>
                </td>
                <td data-label="Оценка">${gradeCell}</td>
                <td data-label="Статус"><span class="badge-status">${statusBadge}</span>${lateBadge}</td>
                <td data-label="Материал" onclick="event.stopPropagation();">${fileActions}<button type="button" class="btn-danger-icon" onclick="deleteSubmission(${sub.id})" title="Изтрий предаването"><i class="fa-regular fa-trash-can"></i></button></td>
            </tr>
            <tr class="submission-detail-row" id="${detailRowId}" hidden>
                <td colspan="10">${buildSubmissionDetailsHtml(sub)}</td>
            </tr>
        `;
    }).join("");

    renderSubmissionsPagination(filtered.length);
}

// Бързо редактиране на точките на предаване направо в реда, без модален прозорец
function startEditScore(id) {
    document.getElementById(`score-display-${id}`).style.display = "none";
    document.getElementById(`score-edit-${id}`).style.display = "inline-flex";
    document.getElementById(`score-input-${id}`).focus();
}

function cancelEditScore(id) {
    document.getElementById(`score-display-${id}`).style.display = "inline-flex";
    document.getElementById(`score-edit-${id}`).style.display = "none";
}

async function saveEditScore(id) {
    const score = parseFloat(document.getElementById(`score-input-${id}`).value);
    const maxScore = parseFloat(document.getElementById(`maxscore-input-${id}`).value);
    if (isNaN(score) || isNaN(maxScore)) {
        showToast("Невалидни стойности за точки.", "warning");
        return;
    }

    const formData = new FormData();
    formData.append("score", score);
    formData.append("max_score", maxScore);

    try {
        const res = await adminFetch(`${API_URL}/admin/submissions/${id}/grade`, { method: "POST", body: formData });
        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.detail || `HTTP грешка: ${res.status}`);
        }
        const result = await res.json();
        const sub = submissionsCache.find(s => s.id === id);
        if (sub) {
            sub.score = result.score;
            sub.max_score = result.max_score;
            sub.percentage = result.percentage;
            sub.grade = result.grade;
            sub.grade_label = result.grade_label;
        }
        renderSubmissionsTable();
        showToast("Оценката е обновена.", "success");
    } catch (err) {
        showToast("Грешка при запазване: " + err.message, "error");
    }
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

// -----------------------------------------------------------------------------
// ПРЕГЛЕД НА ФАЙЛ ПРЕДИ СВАЛЯНЕ - .docx/.xlsx/.pptx не се отварят директно в браузъра,
// затова минаваме през Office Online viewer-а, който чете публичния линк от Storage
// -----------------------------------------------------------------------------
const OFFICE_PREVIEW_EXTENSIONS = ["doc", "docx", "xls", "xlsx", "ppt", "pptx"];

function fileExtension(name) {
    return (name || "").split(".").pop().toLowerCase();
}

function buildPreviewUrl(fileUrl, filename) {
    const ext = fileExtension(filename || fileUrl);
    if (OFFICE_PREVIEW_EXTENSIONS.includes(ext)) {
        return `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(fileUrl)}`;
    }
    // PDF, изображения и текстови файлове браузърът показва сам
    return fileUrl;
}

function openFilePreview(fileUrl, filename, meta = "") {
    if (!fileUrl || fileUrl === "#") {
        showToast("Няма прикачен файл за преглед.", "warning");
        return;
    }

    document.getElementById("file-preview-name").textContent = filename || "Файл";
    document.getElementById("file-preview-meta").textContent = meta;

    const downloadLink = document.getElementById("file-preview-download");
    downloadLink.href = fileUrl;
    downloadLink.setAttribute("download", filename || "");
    document.getElementById("file-preview-newtab").href = fileUrl;

    document.getElementById("file-preview-loading").style.display = "flex";
    document.getElementById("file-preview-frame").src = buildPreviewUrl(fileUrl, filename);
    document.getElementById("file-preview-overlay").hidden = false;
    document.body.style.overflow = "hidden";
}

function onFilePreviewLoaded() {
    const loading = document.getElementById("file-preview-loading");
    if (loading) loading.style.display = "none";
}

function closeFilePreview() {
    document.getElementById("file-preview-overlay").hidden = true;
    // Източникът се изчиства, за да спре зареждането и да не остане стар документ
    document.getElementById("file-preview-frame").src = "about:blank";
    document.body.style.overflow = "";
}

function closeFilePreviewOnBackdrop(event) {
    if (event.target.id === "file-preview-overlay") closeFilePreview();
}

document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !document.getElementById("file-preview-overlay")?.hidden) {
        closeFilePreview();
    }
});

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
        const response = await adminFetch(`${API_URL}/admin/submissions/${submissionId}`, { method: "DELETE" });
        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.detail || `HTTP грешка: ${response.status}`);
        }

        submissionsCache = submissionsCache.filter(sub => sub.id !== submissionId);
        renderSubmissionsTable();
    } catch (err) {
        showToast("Грешка при изтриване на предаването: " + err.message, "error");
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
// Резервно изчисление на оценка от процент (сървърът вече винаги я връща, но
// пази съвместимост при евентуален стар/липсващ отговор)
function pointsToGrade(percentage) {
    if (percentage >= 91) return { grade: 6, label: "Отличен" };
    if (percentage >= 76) return { grade: 5, label: "Много добър" };
    if (percentage >= 61) return { grade: 4, label: "Добър" };
    if (percentage >= 41) return { grade: 3, label: "Среден" };
    return { grade: 2, label: "Слаб" };
}

// Генерира и сваля CSV файл (отваря се директно в Excel) от подадени заглавия и редове
function downloadCSV(filenamePrefix, headers, rows) {
    const csvRows = [headers.join(",")];
    rows.forEach(row => {
        const values = row.map(v => `"${String(v ?? "").replace(/"/g, '""')}"`);
        csvRows.push(values.join(","));
    });

    // BOM в началото, за да разпознае Excel коректно кирилицата в UTF-8
    const blob = new Blob(["﻿" + csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${filenamePrefix}_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

// Експортът се генерира на сървъра с openpyxl - готов, форматиран Excel файл
// (лист "Резултати" със стилизирана таблица и лист "Обобщение"), а не суров CSV
async function exportSubmissionsExcel() {
    if (getFilteredSubmissions().length === 0) {
        showToast("Няма данни за експортиране.", "warning");
        return;
    }

    const params = [];
    const classId = document.getElementById("filter-group")?.value;
    const assignmentId = document.getElementById("filter-assignment")?.value;
    const search = document.getElementById("submissions-search")?.value.trim();
    if (classId) params.push(`group_id=${encodeURIComponent(classId)}`);
    if (assignmentId) params.push(`assignment_id=${encodeURIComponent(assignmentId)}`);
    if (search) params.push(`search=${encodeURIComponent(search)}`);

    showToast("Excel файлът се подготвя...", "info");

    try {
        const res = await adminFetch(`${API_URL}/admin/submissions/export${params.length ? `?${params.join("&")}` : ""}`);
        if (res.status === 404 || res.status === 405) {
            throw new Error("Сървърът още не е обновен с новия експорт. Изчакайте да приключи внедряването в Render и опитайте пак.");
        }
        if (!res.ok) throw new Error(`HTTP грешка: ${res.status}`);

        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `rezultati_${new Date().toISOString().slice(0, 10)}.xlsx`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        showToast("Excel файлът беше свален успешно.", "success");
    } catch (err) {
        showToast("Грешка при експортиране: " + err.message, "error");
    }
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

function copyExerciseLink(explicitClassId) {
    const classId = explicitClassId || document.getElementById("exercise-class-filter").value;
    if (!classId) return;
    const url = buildExerciseLink(classId);
    navigator.clipboard?.writeText(url).then(() => {
        showToast("Линкът е копиран.", "success");
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

    // Качванията са основната справка - зареждат се отделно от историята на оценките,
    // за да не изчезват вече записани качвания само защото по-новата справка за
    // оценки временно не отговаря (напр. по време на бавен деплой на бекенда).
    try {
        const uploadsRes = await adminFetch(`${API_URL}/admin/exercises?group_id=${encodeURIComponent(classId)}`);
        if (!uploadsRes.ok) throw new Error("Грешка при заявката към сървъра");
        exercisesCache = await uploadsRes.json();
    } catch (err) {
        console.error("Грешка при зареждане на качванията:", err);
        tbody.innerHTML = `
            <tr><td colspan="4">
                <div class="empty-state">
                    <div class="empty-icon"><i class="fa-solid fa-triangle-exclamation"></i></div>
                    <h4>Грешка при зареждане</h4>
                    <p>Уверете се, че таблицата "exercise_uploads" съществува в Supabase.</p>
                </div>
            </td></tr>
        `;
        return;
    }

    try {
        const gradesRes = await adminFetch(`${API_URL}/admin/exercise-grades?group_id=${encodeURIComponent(classId)}`);
        exerciseGradesCache = gradesRes.ok ? await gradesRes.json() : [];
    } catch (err) {
        console.error("Грешка при зареждане на въведените оценки:", err);
        exerciseGradesCache = [];
    }

    renderExercisesTable(classId);
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
        const allUploads = (uploadsByStudent[name] || []).slice().sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));
        const acceptedUploads = allUploads.filter(u => (u.status || 'accepted') === 'accepted');
        const reviewUploads = allUploads.filter(u => u.status === 'pending' || u.status === 'needs_rework');
        const grades = (gradesByStudent[name] || []).slice().sort((a, b) => new Date(a.entered_at || 0) - new Date(b.entered_at || 0));
        const batches = chunkIntoBatches(acceptedUploads, EXCELLENT_UPLOAD_THRESHOLD);
        const readyBatches = batches.filter(b => b.length === EXCELLENT_UPLOAD_THRESHOLD);
        const inProgressBatch = batches.find(b => b.length < EXCELLENT_UPLOAD_THRESHOLD);
        const inProgressCount = inProgressBatch ? inProgressBatch.length : 0;
        const hasReady = readyBatches.length > 0;
        const pendingCount = allUploads.filter(u => u.status === 'pending').length;
        const rowId = `exercise-student-${index}`;
        const safeName = escapeJsString(name);

        const gradedBadge = grades.length > 0
            ? `<span class="badge-status grade-badge grade-high"><i class="fa-solid fa-circle-check"></i> ${grades.length} ${grades.length === 1 ? 'въведена' : 'въведени'}</span>`
            : '<span class="stat-sub">Няма</span>';

        const reviewBadge = pendingCount > 0
            ? `<span class="badge-status grade-badge grade-mid"><i class="fa-solid fa-hourglass-half"></i> ${pendingCount} ${pendingCount === 1 ? 'чака' : 'чакат'} преглед</span>`
            : '';

        // Единна индикация за оценка: докато не е готова (< 5 приети качвания) е прогрес
        // лента; щом стигне 5 ПРИЕТИ, самата индикация става кликаема (кехлибарена) -
        // при клик трайно се записва и остава зелена ("въведена").
        const gradeIndicatorCell = hasReady
            ? gradeIndicator(classId, safeName, 'pending')
            : `<div class="progress-bar-track"><div class="progress-bar-fill" style="width:${Math.round((inProgressCount / EXCELLENT_UPLOAD_THRESHOLD) * 100)}%"></div></div><span class="stat-sub">${inProgressCount} / ${EXCELLENT_UPLOAD_THRESHOLD} приети</span>`;

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

        // Чакащи преглед / върнати за преработка - НЕ се броят към оценката, докато
        // учителят не ги приеме изрично (предпазва от спам с празни/еднакви файлове)
        const reviewHtml = reviewUploads.length === 0 ? '' : `
            <div class="exercise-batch-card review">
                <div class="batch-card-header">
                    <span class="stat-sub">Чакат преглед - не се броят към оценката:</span>
                </div>
                <ul class="missed-criteria-list exercise-review-list">
                    ${reviewUploads.map(u => `
                        <li class="exercise-review-item">
                            <div class="exercise-review-item-main">
                                <i class="fa-regular fa-file-lines"></i> ${u.filename || 'Файл'} · ${formatSubmittedAt(u.created_at)}
                                <span class="badge-status grade-badge ${u.status === 'needs_rework' ? 'grade-low' : 'grade-mid'}">${u.status === 'needs_rework' ? 'За преработка' : 'Изчаква преглед'}</span>
                            </div>
                            ${u.note ? `<div class="exercise-review-note"><i class="fa-regular fa-comment"></i> ${u.note}</div>` : ''}
                            <div class="exercise-review-actions">
                                ${u.file_url && u.file_url !== '#' ? `<button type="button" class="btn-icon" title="Прегледай" onclick="event.stopPropagation(); openFilePreview('${u.file_url}', ${JSON.stringify(u.filename || 'Файл').replace(/"/g, '&quot;')})"><i class="fa-regular fa-eye"></i></button>` : ''}
                                <button type="button" class="btn-secondary btn-sm" onclick="event.stopPropagation(); reviewExerciseUpload(${u.id}, 'accepted', '${classId}')"><i class="fa-solid fa-check"></i> Прието за практика</button>
                                <button type="button" class="btn-secondary btn-sm" onclick="event.stopPropagation(); reviewExerciseUpload(${u.id}, 'needs_rework', '${classId}')"><i class="fa-solid fa-rotate-left"></i> За преработка</button>
                                <button type="button" class="btn-danger-icon" onclick="event.stopPropagation(); deleteExerciseUpload(${u.id}, '${classId}')" title="Изтрий качването"><i class="fa-regular fa-trash-can"></i></button>
                            </div>
                        </li>
                    `).join('')}
                </ul>
            </div>
        `;

        const currentBatchesHtml = batches.map(batch => {
            const isReady = batch.length === EXCELLENT_UPLOAD_THRESHOLD;
            return `
                <div class="exercise-batch-card ${isReady ? 'pending' : 'progress'}">
                    <div class="batch-card-header">
                        ${isReady
                            ? gradeIndicator(classId, safeName, 'pending')
                            : `<span class="stat-sub">Приети, в процес: ${batch.length} / ${EXCELLENT_UPLOAD_THRESHOLD}</span>`}
                    </div>
                    <ul class="missed-criteria-list">
                        ${batch.map(u => `
                            <li>
                                <i class="fa-regular fa-file-lines"></i> ${u.filename || 'Файл'} · ${formatSubmittedAt(u.created_at)}
                                ${u.file_url && u.file_url !== '#' ? `<button type="button" class="btn-icon" title="Прегледай" onclick="event.stopPropagation(); openFilePreview('${u.file_url}', ${JSON.stringify(u.filename || 'Файл').replace(/"/g, '&quot;')})"><i class="fa-regular fa-eye"></i></button>` : ''}
                                <button type="button" class="btn-danger-icon" onclick="event.stopPropagation(); deleteExerciseUpload(${u.id}, '${classId}')" title="Изтрий качването"><i class="fa-regular fa-trash-can"></i></button>
                            </li>
                        `).join('')}
                    </ul>
                </div>
            `;
        }).join('');

        const detailContent = (reviewHtml + historyHtml + currentBatchesHtml) || `<div class="submission-detail-empty">Няма качени упражнения все още.</div>`;

        return `
            <tr class="clickable-row" onclick="toggleExerciseDetails('${rowId}')">
                <td><button type="button" class="btn-icon expand-toggle" id="toggle-${rowId}" title="Детайли по качвания"><i class="fa-solid fa-chevron-right"></i></button></td>
                <td><span class="row-avatar a${index % 5}">${name.slice(0, 1).toUpperCase()}</span><strong>${name}</strong></td>
                <td>${gradedBadge}</td>
                <td>${gradeIndicatorCell} ${reviewBadge}</td>
            </tr>
            <tr class="submission-detail-row" id="detail-${rowId}" hidden>
                <td colspan="4">${detailContent}</td>
            </tr>
        `;
    }).join("");
}

// Учителят приема/връща за преработка едно чакащо качване - само приетите се
// броят към прага от 5 за оценка Отличен
async function reviewExerciseUpload(uploadId, status, classId) {
    const formData = new FormData();
    formData.append("status", status);
    try {
        const res = await adminFetch(`${API_URL}/admin/exercises/${uploadId}/review`, { method: "POST", body: formData });
        if (!res.ok) throw new Error("Грешка при заявката към сървъра");
        const upload = exercisesCache.find(u => u.id === uploadId);
        if (upload) upload.status = status;
        renderExercisesTable(classId);
        showToast(status === 'accepted' ? "Качването е прието за практика." : "Качването е върнато за преработка.", "success");
    } catch (err) {
        showToast("Грешка при преглед на качването: " + err.message, "error");
    }
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
        const response = await adminFetch(`${API_URL}/admin/exercises/${uploadId}`, { method: "DELETE" });
        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.detail || `HTTP грешка: ${response.status}`);
        }

        await loadExercisesData();
    } catch (err) {
        showToast("Грешка при изтриване на качването: " + err.message, "error");
    }
}

// Експортира трайно въведените оценки от упражнения за текущо избрания клас -
// удобно за прехвърляне в официалния дневник или Шкколо
function exportExerciseGradesCSV() {
    const classId = document.getElementById("exercise-class-filter").value;
    if (!classId) {
        showToast("Изберете клас, за да експортирате оценките му.", "warning");
        return;
    }
    if (exerciseGradesCache.length === 0) {
        showToast("Няма въведени оценки за този клас.", "warning");
        return;
    }

    const className = (classesData[classId] && classesData[classId].className) || classId;
    const headers = ["Ученик", "Клас", "Оценка", "Дата на въвеждане", "Файлове"];
    const rows = exerciseGradesCache.map(g => [
        g.student_name || "",
        className,
        `${g.grade} (Отличен)`,
        formatSubmittedAt(g.entered_at),
        (g.filenames || []).join("; ")
    ]);

    downloadCSV(`ocenki_uprazhnenia_${classId}`, headers, rows);
    showToast("Оценките бяха свалени успешно.", "success");
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

        const response = await adminFetch(`${API_URL}/admin/exercises/mark-graded`, {
            method: "POST",
            body: formData
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.detail || `HTTP грешка: ${response.status}`);
        }

        await loadExercisesData();
    } catch (err) {
        showToast("Грешка при въвеждане на оценката: " + err.message, "error");
    } finally {
        exerciseGradingInFlight.delete(key);
    }
}