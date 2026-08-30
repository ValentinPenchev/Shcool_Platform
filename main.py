import io
import json
import hashlib
import uuid
from typing import Optional
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import pandas as pd

# Модул за връзка със Supabase и автоматично почистване
from supabase_client import supabase, upload_to_supabase, cleanup_expired_files

# Модули за проверка на файловете
from evaluators.word_eval import evaluate_word
from evaluators.excel_eval import evaluate_excel
from evaluators.ppt_eval import evaluate_ppt
from evaluators.metadata import extract_office_metadata

app = FastAPI(title="Office & Code Evaluator API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup_event():
    """При стартиране на сървъра се задейства почистването на файлове и записи по-стари от 60 дни."""
    try:
        cleanup_expired_files(60)
    except Exception as e:
        print(f"Забележка при стартиране (почистване): {e}")

# -----------------------------------------------------------------------------
# 1. КЛАСОВЕ И СРЕДИ (GROUPS)
# -----------------------------------------------------------------------------

@app.get("/api/admin/groups")
async def get_all_groups():
    """Връща всички налични среди/групи от Supabase."""
    try:
        res = supabase.table("groups").select("*").execute()
        return res.data or []
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Грешка при четене от базата данни: {str(e)}")


@app.post("/api/admin/groups")
async def create_or_update_group(
    group_id: str = Form(...),
    group_name: str = Form(...),
    students_json: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None)
):
    """Създава или обновява клас чрез копиран текст или прикачен Excel/CSV файл."""
    students = []

    if students_json and students_json.strip():
        try:
            parsed = json.loads(students_json)
            if isinstance(parsed, list):
                students = [str(item).strip() for item in parsed if str(item).strip()]
        except Exception:
            # Ако е изпратен обикновен текст с нови редове вместо JSON
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

    if not students:
        raise HTTPException(status_code=400, detail="Няма намерени имена на ученици. Въведете ги на нови редове или качете Excel файл.")

    data = {
        "group_id": group_id,
        "group_name": group_name,
        "students_json": students
    }
    
    try:
        res = supabase.table("groups").upsert(data).execute()
        return {"status": "success", "data": res.data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Грешка при запис в Supabase: {str(e)}")

# -----------------------------------------------------------------------------
# 2. ЗАДАЧИ И ЛИНКОВЕ (ASSIGNMENTS)
# -----------------------------------------------------------------------------

@app.post("/api/admin/assignments")
async def create_assignment(
    title: str = Form(...),
    group_id: str = Form(...),
    criteria_json: str = Form(...)
):
    """Създава нова задача за клас и генерира уникален код/линк."""
    assignment_id = str(uuid.uuid4())[:8]
    
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
        supabase.table("assignments").insert(data).execute()
        return {
            "status": "success",
            "assignment_id": assignment_id,
            "link": f"/index.html?task={assignment_id}"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Грешка при създаване на задача: {str(e)}")


@app.get("/api/assignments/{assignment_id}")
async def get_assignment(assignment_id: str):
    """Зарежда информацията за конкретната задача за ученическия панел."""
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
# 3. ОЦЕНЯВАНЕ И ТАБЛО (EVALUATION & SUBMISSIONS)
# -----------------------------------------------------------------------------

@app.post("/api/evaluate")
async def evaluate_file(
    class_id: str = Form(...),
    student_name: str = Form(...),
    criteria_json: str = Form(...),
    file: UploadFile = File(...)
):
    """Извършва оценка, проверка за плагиатство и запазва резултата."""
    contents = await file.read()
    
    file_hash = hashlib.md5(contents).hexdigest()
    meta = extract_office_metadata(contents)
    creation_time = meta.get("created")
    
    storage_path = f"{class_id}/{student_name.replace(' ', '_')}_{file.filename}"
    
    try:
        file_url = upload_to_supabase(contents, file.filename, storage_path)
    except Exception:
        file_url = "#"

    plagiarism_flag = False
    plagiarism_reason = "Няма съвпадения"

    try:
        prev_res = supabase.table("submissions").select("*").execute()
        if prev_res.data:
            for prev in prev_res.data:
                if prev.get("student_name") != student_name:
                    if prev.get("file_hash") == file_hash:
                        plagiarism_flag = True
                        plagiarism_reason = f"100% идентичен файл с този на {prev.get('student_name')} ({prev.get('class_id')})"
                        break
                    if creation_time and prev.get("creation_time") == str(creation_time):
                        plagiarism_flag = True
                        plagiarism_reason = f"Създаден в абсолютно същото време с файла на {prev.get('student_name')}"
                        break
    except Exception as e:
        print(f"Забележка при проверка за плагиатство: {e}")

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
        raise HTTPException(status_code=400, detail="Форматът не се поддържа. Качете .docx, .xlsx или .pptx файл.")

    percentage = round((result["score"] / result["max_score"] * 100), 1) if result["max_score"] > 0 else 0

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
        "plagiarism_flag": plagiarism_flag,
        "plagiarism_note": plagiarism_reason,
        "details_json": result["details"]
    }
    
    try:
        supabase.table("submissions").insert(submission_data).execute()
    except Exception as e:
        print(f"Грешка при записа на резултата в базата: {e}")

    return {
        "student_name": student_name,
        "class_id": class_id,
        "filename": file.filename,
        "file_url": file_url,
        "score": result["score"],
        "max_score": result["max_score"],
        "percentage": percentage,
        "plagiarism_flag": plagiarism_flag,
        "plagiarism_note": plagiarism_reason,
        "details": result["details"]
    }


@app.get("/api/admin/submissions")
async def get_submissions(group_id: Optional[str] = None):
    """Извлича предадените задачи за таблото."""
    try:
        query = supabase.table("submissions").select("*")
        if group_id:
            query = query.eq("class_id", group_id)
        res = query.execute()
        return res.data or []
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Грешка при четене на предадените задачи: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)