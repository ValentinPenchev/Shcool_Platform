const API_URL = "https://shcool-platform.onrender.com/api";

document.addEventListener("DOMContentLoaded", async () => {
    await loadGroupsDropdowns();
    await loadSubmissions();
});

// Зарежда класовете в падащото меню при създаване на задача
async function loadGroupsDropdowns() {
    try {
        const res = await fetch(`${API_URL}/admin/groups`);
        if (!res.ok) return;
        const groups = await res.json();
        
        const select = document.getElementById("assign-group-select");
        if (select) {
            select.innerHTML = '<option value="">-- Изберете клас --</option>';
            groups.forEach(g => {
                select.innerHTML += `<option value="${g.group_id}">${g.group_name}</option>`;
            });
        }
    } catch (e) {
        console.error("Грешка при зареждане на средите:", e);
    }
}

// Форма за създаване на нова задача
document.getElementById("create-assignment-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    
    const groupId = document.getElementById("assign-group-select").value;
    const title = document.getElementById("assign-title").value.trim();

    if (!groupId || !title) {
        alert("Моля, попълнете клас и заглавие на задачата.");
        return;
    }

    // Изграждаме критериите като обект
    const criteria = {};
    
    const fontCheck = document.getElementById("crit-font");
    if (fontCheck && fontCheck.checked) criteria.font = { points: 1, enabled: true };

    const tableCheck = document.getElementById("crit-table");
    if (tableCheck && tableCheck.checked) criteria.table = { points: 1, enabled: true };

    const imageCheck = document.getElementById("crit-image");
    if (imageCheck && imageCheck.checked) criteria.image = { points: 1, enabled: true };

    const formData = new FormData();
    formData.append("group_id", groupId);
    formData.append("title", title);
    formData.append("criteria_json", JSON.stringify(criteria));

    try {
        const res = await fetch(`${API_URL}/admin/assignments`, {
            method: "POST",
            body: formData
        });
        
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || "Грешка при създаване на задачата.");

        // Генериране на динамичен линк за учениците
        const basePath = window.location.pathname.substring(0, window.location.pathname.lastIndexOf("/") + 1);
        const fullLink = `${window.location.origin}${basePath}index.html?task=${data.assignment_id}`;

        const linkInput = document.getElementById("generated-link-url");
        if (linkInput) linkInput.value = fullLink;

        const linkBox = document.getElementById("generated-link-box");
        if (linkBox) linkBox.style.display = "block";

        alert("Задачата е създадена успешно!");
    } catch (err) {
        alert("Грешка при създаване: " + err.message);
    }
});

// Зарежда предадените задачи за таблото
async function loadSubmissions() {
    const tableBody = document.getElementById("submissions-table-body");
    if (!tableBody) return;

    try {
        const res = await fetch(`${API_URL}/admin/submissions`);
        if (!res.ok) return;
        const submissions = await res.json();

        tableBody.innerHTML = "";
        submissions.forEach(sub => {
            const row = document.createElement("tr");
            row.innerHTML = `
                <td>${sub.student_name}</td>
                <td>${sub.class_id}</td>
                <td><a href="${sub.file_url}" target="_blank">${sub.filename}</a></td>
                <td>${sub.percentage}% (${sub.score}/${sub.max_score})</td>
                <td>${sub.plagiarism_flag ? `<span style="color:red;">⚠️ ${sub.plagiarism_note}</span>` : '<span style="color:green;">OK</span>'}</td>
            `;
            tableBody.appendChild(row);
        });
    } catch (e) {
        console.error("Грешка при зареждане на предаванията:", e);
    }
}