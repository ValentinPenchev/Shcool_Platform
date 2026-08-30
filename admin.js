const API_URL = "http://127.0.0.1:8000/api";
let chartInstance = null;

document.addEventListener("DOMContentLoaded", async () => {
    // 1. Първо зареждаме средите, за да попълним падащите менюта
    await loadGroupsDropdowns();
    // 2. След това зареждаме статистиката за таблото
    await loadDashboardData();
});

// Навигация между секциите
function showSection(secId) {
    document.querySelectorAll('.panel-section').forEach(sec => sec.style.display = 'none');
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));

    document.getElementById('sec-' + secId).style.display = 'block';

    if (secId === 'dashboard') loadDashboardData();
    if (secId === 'assignments' || secId === 'classes') loadGroupsDropdowns();
}

// -----------------------------------------------------------------------------
// 1. ТАБЛО И ГРАФИКИ
// -----------------------------------------------------------------------------
async function loadDashboardData() {
    const filterElem = document.getElementById('filter-group');
    const groupId = filterElem ? filterElem.value : "";
    const url = groupId ? `${API_URL}/admin/submissions?group_id=${groupId}` : `${API_URL}/admin/submissions`;
    
    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP грешка: ${res.status}`);
        
        const data = await res.json();

        document.getElementById('stat-count').innerText = data.length;
        
        let totalPct = 0;
        let plagiarismCount = 0;
        let gradeRanges = { 'Отличен (90-100%)': 0, 'Добър (70-89%)': 0, 'Среден (<70%)': 0 };

        const tbody = document.querySelector('#submissions-table tbody');
        tbody.innerHTML = '';

        data.forEach(sub => {
            totalPct += sub.percentage;
            if (sub.plagiarism_flag) plagiarismCount++;

            if (sub.percentage >= 90) gradeRanges['Отличен (90-100%)']++;
            else if (sub.percentage >= 70) gradeRanges['Добър (70-89%)']++;
            else gradeRanges['Среден (<70%)']++;

            tbody.innerHTML += `
                <tr>
                    <td><strong>${sub.student_name}</strong> <br><small>(${sub.class_id})</small></td>
                    <td>${sub.filename}</td>
                    <td><strong>${sub.percentage}%</strong> (${sub.score}/${sub.max_score} т.)</td>
                    <td>${sub.plagiarism_flag ? `<span style="color:var(--warning-color); font-weight:bold;">⚠️ ${sub.plagiarism_note}</span>` : '🆗 Не'}</td>
                    <td><a href="${sub.file_url}" target="_blank">Изтегли</a></td>
                </tr>
            `;
        });

        const avg = data.length > 0 ? (totalPct / data.length).toFixed(1) : 0;
        document.getElementById('stat-avg').innerText = `${avg}%`;
        document.getElementById('stat-plagiarism').innerText = plagiarismCount;

        renderChart(gradeRanges);
    } catch (err) {
        console.error("Грешка при зареждане на статистиката:", err);
    }
}

function renderChart(gradeRanges) {
    const canvas = document.getElementById('scoresChart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (chartInstance) chartInstance.destroy();

    chartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: Object.keys(gradeRanges),
            datasets: [{
                data: Object.values(gradeRanges),
                backgroundColor: ['#16a34a', '#f59e0b', '#dc2626']
            }]
        },
        options: { responsive: true, plugins: { title: { display: true, text: 'Разпределение на успеваемостта' } } }
    });
}

// -----------------------------------------------------------------------------
// 2. УПРАВЛЕНИЕ НА КЛАСОВЕ
// -----------------------------------------------------------------------------
document.getElementById('create-class-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const classId = document.getElementById('class-id').value.trim();
    const className = document.getElementById('class-name').value.trim();
    const namesText = document.getElementById('class-names-text').value.trim();
    const excelFile = document.getElementById('class-excel-file').files[0];

    const formData = new FormData();
    formData.append('group_id', classId);
    formData.append('group_name', className);

    if (namesText) {
        const namesArray = namesText.split('\n').map(n => n.trim()).filter(n => n.length > 0);
        formData.append('students_json', JSON.stringify(namesArray));
    }

    if (excelFile) {
        formData.append('file', excelFile);
    }

    if (!namesText && !excelFile) {
        alert('Моля, въведете имена или качете Excel файл!');
        return;
    }

    try {
        const res = await fetch(`${API_URL}/admin/groups`, {
            method: 'POST',
            body: formData
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.detail || 'Грешка при запазване на класа.');
        }

        alert('Класът е запазен успешно!');
        document.getElementById('create-class-form').reset();
        await loadGroupsDropdowns();
    } catch (err) {
        alert('Грешка при изпращане: ' + err.message + '\n\nУверете се, че Python сървърът (Uvicorn) работи на http://127.0.0.1:8000');
    }
});

async function loadGroupsDropdowns() {
    try {
        const res = await fetch(`${API_URL}/admin/groups`);
        if (!res.ok) throw new Error("Сървърът не отговаря");
        
        const groups = await res.json();

        const filterSelect = document.getElementById('filter-group');
        const assignSelect = document.getElementById('assign-group-select');
        const classesList = document.getElementById('classes-list');

        if (filterSelect) filterSelect.innerHTML = '<option value="">-- Всички класове --</option>';
        if (assignSelect) assignSelect.innerHTML = '<option value="">-- Изберете клас --</option>';
        if (classesList) classesList.innerHTML = '';

        groups.forEach(g => {
            const count = g.students_json ? g.students_json.length : 0;

            if (filterSelect) filterSelect.innerHTML += `<option value="${g.group_id}">${g.group_name}</option>`;
            if (assignSelect) assignSelect.innerHTML += `<option value="${g.group_id}">${g.group_name}</option>`;
            if (classesList) classesList.innerHTML += `<li><strong>${g.group_name}</strong> <code>(${g.group_id})</code> - ${count} ученика</li>`;
        });
    } catch (err) {
        console.error("Грешка при зареждане на средите:", err);
    }
}

// -----------------------------------------------------------------------------
// 3. НОВА ЗАДАЧА & ЛИНКОВЕ
// -----------------------------------------------------------------------------
document.getElementById('create-assignment-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const groupId = document.getElementById('assign-group-select').value;
    const title = document.getElementById('assign-title').value.trim();

    if (!groupId) {
        alert('Моля, изберете клас от падащото меню!');
        return;
    }

    const criteria = {
        font: document.getElementById('crit-font').checked,
        table: document.getElementById('crit-table').checked,
        image: document.getElementById('crit-image').checked
    };

    const formData = new FormData();
    formData.append('group_id', groupId);
    formData.append('title', title);
    formData.append('criteria_json', JSON.stringify(criteria));

    try {
        const res = await fetch(`${API_URL}/admin/assignments`, {
            method: 'POST',
            body: formData
        });

        if (!res.ok) throw new Error('Грешка при създаване на задачата.');

        const data = await res.json();
        
        const fullLink = `${window.location.origin}/index.html?task=${data.assignment_id}`;
        document.getElementById('generated-link-url').value = fullLink;
        document.getElementById('generated-link-box').style.display = 'block';

    } catch (err) {
        alert('Грешка: ' + err.message);
    }
});

function copyLink() {
    const input = document.getElementById('generated-link-url');
    input.select();
    navigator.clipboard.writeText(input.value);
    alert('Линкът е копиран!');
}