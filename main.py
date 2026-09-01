import io
import json
import hashlib
import uuid
import asyncio
from typing import Optional
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import pandas as pd
import docx

from supabase_client import supabase, upload_to_supabase, cleanup_expired_files, sanitize_storage_segment, BUCKET_NAME
from evaluators.word_eval import evaluate_word
from evaluators.excel_eval import evaluate_excel
from evaluators.ppt_eval import evaluate_ppt
from evaluators.metadata import extract_office_metadata
from evaluators.criteria_parser import extract_criteria_from_text

app = FastAPI(title="Office & Code Evaluator API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Материалите се пазят 60 дни, след което се изтриват автоматично (файл + запис)
CLEANUP_AFTER_DAYS = 60
CLEANUP_INTERVAL_SECONDS = 24 * 60 * 60

# Стандартна българска скала за оценяване (2-6), изведена от процента успех.
# Оценката не се пази отделно в базата - винаги се извежда от вече записания
# процент, за да не се налага промяна на схемата на submissions.
def _percentage_to_grade(percentage: float) -> dict:
    if percentage >= 91:
        grade, label = 6, "Отличен"
    elif percentage >= 76:
        grade, label = 5, "Много добър"
    elif percentage >= 61:
        grade, label = 4, "Добър"
    elif percentage >= 41:
        grade, label = 3, "Среден"
    else:
        grade, label = 2, "Слаб"
    return {"grade": grade, "grade_label": label}

async def periodic_cleanup():
    while True:
        try:
            cleanup_expired_files(CLEANUP_AFTER_DAYS)
        except Exception as e:
            print(f"Забележка при почистване: {e}")
        await asyncio.sleep(CLEANUP_INTERVAL_SECONDS)

@app.on_event("startup")
async def startup_event():
    asyncio.create_task(periodic_cleanup())

@app.get("/api/health")
async def health_check():
    return {"status": "ok", "message": "Backend is running"}

# -----------------------------------------------------------------------------
# 1. УПРАВЛЕНИЕ НА КЛАСОВЕ (GROUPS - CRUD)
# -----------------------------------------------------------------------------

@app.get("/api/admin/groups")
async def get_all_groups():
    try:
        res = supabase.table("groups").select("*").execute()
        return res.data or []
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Грешка при четене на класовете: {str(e)}")

@app.post("/api/admin/groups")
async def create_or_update_group(
    group_id: str = Form(...),
    group_name: str = Form(...),
    students_json: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None)
):
    students = []
    if students_json and students_json.strip():
        try:
            parsed = json.loads(students_json)
            if isinstance(parsed, list):
                students = [str(item).strip() for item in parsed if str(item).strip()]
        except Exception:
            students = [line.strip() for line in students_json.split("\n") if line.strip()]

    if not students and file:
        contents = await file.read()
        filename = file.filename.lower()
        try:
            if filename.endswith(".csv"):
                df = pd.read_csv(io.BytesIO(contents))
            elif filename.endswith(".xlsx"):
                df = pd.read_excel(io.BytesIO(contents))
            else:
                raise HTTPException(status_code=400, detail="Поддържат се само .csv и .xlsx файлове.")

            students = df.iloc[:, 0].dropna().astype(str).str.strip().tolist()
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Грешка при четене на файла: {str(e)}")

    data = {
        "group_id": group_id,
        "group_name": group_name,
        "students_json": students
    }
    
    try:
        res = supabase.table("groups").upsert(data).execute()
        return {"status": "success", "data": res.data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Грешка при запис в базата: {str(e)}")

@app.delete("/api/admin/groups/{group_id}")
async def delete_group(group_id: str):
    try:
        supabase.table("groups").delete().eq("group_id", group_id).execute()
        return {"status": "success", "message": f"Класът {group_id} е изтрит."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Грешка при изтриване на класа: {str(e)}")

# -----------------------------------------------------------------------------
# 2. УПРАВЛЕНИЕ НА ЗАДАЧИ (ASSIGNMENTS - CRUD & FILE CRITERIA)
# -----------------------------------------------------------------------------

@app.get("/api/admin/assignments")
async def get_all_assignments(group_id: Optional[str] = None):
    try:
        query = supabase.table("assignments").select("*")
        if group_id:
            query = query.eq("group_id", group_id)
        res = query.execute()
        assignments = res.data or []

        # Формиране на дигиталната структура за всеки запис
        for a in assignments:
            task_id = a.get("id", "")
            a["link"] = f"/index.html?id={task_id}" if task_id else ""

        return assignments
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Грешка при четене на задачите: {str(e)}")

@app.post("/api/admin/assignments")
async def create_assignment(
    title: str = Form(...),
    group_id: str = Form(...),
    criteria_json: Optional[str] = Form(None),
    criteria_file: Optional[UploadFile] = File(None)
):
    assignment_id = str(uuid.uuid4())[:8]
    criteria_parsed = {}

    if criteria_file and criteria_file.filename.lower().endswith(".docx"):
        try:
            content = await criteria_file.read()
            doc = docx.Document(io.BytesIO(content))
            extracted_texts = [p.text.strip() for p in doc.paragraphs if p.text.strip()]

            # Абзаците се разпознават по ключови думи (напр. "таблица", "изображение",
            # "формула") и се превръщат в ключовете, които evaluator-ите реално четат -
            # генеричните "criterion_N" по-рано не участваха в оценяването изобщо.
            criteria_parsed = extract_criteria_from_text(extracted_texts)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Грешка при четене на Word файла: {str(e)}")
    elif criteria_json and criteria_json.strip():
        try:
            criteria_parsed = json.loads(criteria_json)
        except Exception:
            criteria_parsed = {}

    data = {
        "id": assignment_id,
        "title": title,
        "group_id": group_id,
        "criteria_json": criteria_parsed
    }
    
    try:
        supabase.table("assignments").upsert(data).execute()
        return {
            "status": "success",
            "assignment_id": assignment_id,
            "title": title,
            "group_id": group_id,
            "link": f"/index.html?id={assignment_id}"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Грешка при създаване на задача: {str(e)}")

@app.delete("/api/admin/assignments/{assignment_id}")
async def delete_assignment(assignment_id: str):
    try:
        supabase.table("assignments").delete().eq("id", assignment_id).execute()
        return {"status": "success", "message": f"Задачата {assignment_id} е изтрита."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Грешка при изтриване на задачата: {str(e)}")

@app.get("/api/assignments/{assignment_id}")
async def get_assignment(assignment_id: str):
    res = supabase.table("assignments").select("*").eq("id", assignment_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Задачата не е намерена.")
    
    assignment = res.data[0]
    group_res = supabase.table("groups").select("*").eq("group_id", assignment["group_id"]).execute()
    
    students = group_res.data[0]["students_json"] if group_res.data and "students_json" in group_res.data[0] else []
    group_name = group_res.data[0]["group_name"] if group_res.data and "group_name" in group_res.data[0] else assignment["group_id"]

    return {
        "id": assignment["id"],
        "title": assignment["title"],
        "group_id": assignment["group_id"],
        "group_name": group_name,
        "students": students,
        "criteria": assignment.get("criteria_json", {})
    }

# -----------------------------------------------------------------------------
# 3. ОЦЕНЯВАНЕ И ТАБЛО (SUBMISSIONS)
# -----------------------------------------------------------------------------

@app.post("/api/evaluate")
async def evaluate_file(
    class_id: str = Form(...),
    student_name: str = Form(...),
    criteria_json: str = Form(...),
    assignment_id: Optional[str] = Form(None),
    file: UploadFile = File(...)
):
    contents = await file.read()
    file_hash = hashlib.md5(contents).hexdigest()
    meta = extract_office_metadata(contents)
    creation_time = meta.get("created")

    storage_path = f"{sanitize_storage_segment(class_id)}/{sanitize_storage_segment(student_name)}_{sanitize_storage_segment(file.filename)}"

    try:
        file_url = upload_to_supabase(contents, file.filename, storage_path)
    except Exception:
        file_url = "#"

    filename = file.filename.lower()
    try:
        criteria = json.loads(criteria_json)
    except Exception:
        criteria = {}
    
    if filename.endswith(".docx"):
        result = evaluate_word(contents, criteria)
    elif filename.endswith(".xlsx"):
        result = evaluate_excel(contents, criteria)
    elif filename.endswith(".pptx"):
        result = evaluate_ppt(contents, criteria)
    else:
        raise HTTPException(status_code=400, detail="Форматът не се поддържа.")

    percentage = round((result["score"] / result["max_score"] * 100), 1) if result["max_score"] > 0 else 0
    grade_info = _percentage_to_grade(percentage)

    # Забележка: таблицата submissions няма собствена колона assignment_id, затова
    # го пазим вътре в details_json (вече съществуваща JSON колона), за да не се
    # налага промяна на схемата на базата данни.
    submission_data = {
        "student_name": student_name,
        "class_id": class_id,
        "filename": file.filename,
        "file_url": file_url,
        "storage_path": storage_path,
        "file_hash": file_hash,
        "creation_time": str(creation_time) if creation_time else None,
        "score": result["score"],
        "max_score": result["max_score"],
        "percentage": percentage,
        "details_json": {"assignment_id": assignment_id, "details": result["details"]}
    }

    try:
        supabase.table("submissions").insert(submission_data).execute()
    except Exception as e:
        print(f"Грешка при запис на предаването: {e}")

    return {
        "student_name": student_name,
        "class_id": class_id,
        "filename": file.filename,
        "file_url": file_url,
        "score": result["score"],
        "max_score": result["max_score"],
        "percentage": percentage,
        "grade": grade_info["grade"],
        "grade_label": grade_info["grade_label"],
        "details": result["details"]
    }

@app.get("/api/admin/submissions")
async def get_submissions(group_id: Optional[str] = None, assignment_id: Optional[str] = None):
    try:
        query = supabase.table("submissions").select("*")
        if group_id:
            query = query.eq("class_id", group_id)
        res = query.execute()
        rows = res.data or []

        # assignment_id се пази вътре в details_json - извличаме го тук за удобство
        for row in rows:
            details = row.get("details_json")
            row["assignment_id"] = details.get("assignment_id") if isinstance(details, dict) else None
            grade_info = _percentage_to_grade(row.get("percentage") or 0)
            row["grade"] = grade_info["grade"]
            row["grade_label"] = grade_info["grade_label"]

        if assignment_id:
            rows = [r for r in rows if r.get("assignment_id") == assignment_id]

        return rows
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Грешка при четене: {str(e)}")

@app.delete("/api/admin/submissions/{submission_id}")
async def delete_submission(submission_id: int):
    try:
        res = supabase.table("submissions").select("storage_path").eq("id", submission_id).execute()
        if res.data and res.data[0].get("storage_path"):
            try:
                supabase.storage.from_(BUCKET_NAME).remove([res.data[0]["storage_path"]])
            except Exception as e:
                print(f"Забележка при изтриване на файла от Storage: {e}")

        supabase.table("submissions").delete().eq("id", submission_id).execute()
        return {"status": "success", "message": f"Предаването {submission_id} е изтрито."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Грешка при изтриване: {str(e)}")

# -----------------------------------------------------------------------------
# 3. УПРАЖНЕНИЯ (свободни качвания за практика, без автоматична проверка)
# -----------------------------------------------------------------------------
# Отделени от submissions умишлено - тук не се оценяват критерии, а само се
# брои колко пъти ученикът е качил работа в класа. При 5 качвания получава
# автоматично оценка "Отличен" (6), изчислена винаги от текущия брой записи,
# а не пазена отделно, за да няма разминаване при изтриване на качване.
EXCELLENT_UPLOAD_THRESHOLD = 5

@app.get("/api/groups/{group_id}")
async def get_group_public(group_id: str):
    res = supabase.table("groups").select("*").eq("group_id", group_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Класът не е намерен.")
    group = res.data[0]
    return {
        "group_id": group["group_id"],
        "group_name": group.get("group_name", group_id),
        "students": group.get("students_json", [])
    }

@app.post("/api/exercise/upload")
async def upload_exercise(
    class_id: str = Form(...),
    student_name: str = Form(...),
    file: UploadFile = File(...)
):
    contents = await file.read()
    storage_path = (
        f"exercises/{sanitize_storage_segment(class_id)}/"
        f"{sanitize_storage_segment(student_name)}_{uuid.uuid4().hex[:6]}_{sanitize_storage_segment(file.filename)}"
    )

    try:
        file_url = upload_to_supabase(contents, file.filename, storage_path)
    except Exception:
        file_url = "#"

    try:
        supabase.table("exercise_uploads").insert({
            "class_id": class_id,
            "student_name": student_name,
            "filename": file.filename,
            "storage_path": storage_path,
            "file_url": file_url,
        }).execute()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Грешка при запис на качването: {str(e)}")

    count_res = supabase.table("exercise_uploads").select("id") \
        .eq("class_id", class_id).eq("student_name", student_name).execute()
    count = len(count_res.data or [])

    return {
        "status": "success",
        "filename": file.filename,
        "count": count,
        "remaining": max(0, EXCELLENT_UPLOAD_THRESHOLD - count),
        "excellent": count >= EXCELLENT_UPLOAD_THRESHOLD
    }

@app.get("/api/admin/exercises")
async def get_exercise_uploads(group_id: Optional[str] = None):
    try:
        query = supabase.table("exercise_uploads").select("*")
        if group_id:
            query = query.eq("class_id", group_id)
        res = query.order("created_at", desc=True).execute()
        return res.data or []
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Грешка при четене на упражненията: {str(e)}")

@app.delete("/api/admin/exercises/{upload_id}")
async def delete_exercise_upload(upload_id: int):
    try:
        res = supabase.table("exercise_uploads").select("storage_path").eq("id", upload_id).execute()
        if res.data and res.data[0].get("storage_path"):
            try:
                supabase.storage.from_(BUCKET_NAME).remove([res.data[0]["storage_path"]])
            except Exception as e:
                print(f"Забележка при изтриване на файла от Storage: {e}")

        supabase.table("exercise_uploads").delete().eq("id", upload_id).execute()
        return {"status": "success", "message": f"Качването {upload_id} е изтрито."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Грешка при изтриване: {str(e)}")