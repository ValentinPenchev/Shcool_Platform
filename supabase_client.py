import os
import re
from datetime import datetime, timedelta
from supabase import create_client, Client

# Базов адрес на проекта
SUPABASE_URL = "https://rtxicehpuddssvicmiwf.supabase.co"

# Anon ключ - позволява качване и публично четене, но storage RLS политиките му
# забраняват изтриване (remove() minaва без грешка, но файлът реално не се трие)
SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ0eGljZWhwdWRkc3N2aWNtaXdmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgwNTc5NDksImV4cCI6MjEwMzYzMzk0OX0.NIY9thV8j7tC9K-oN2P2LIDKKGXf9xSoutYTNVmjz0A"

# Service role ключ (Supabase Dashboard -> Project Settings -> API -> service_role) -
# заобикаля RLS и е нужен, за да работи реалното изтриване на файлове от Storage.
# Задава се като environment variable SUPABASE_SERVICE_KEY (напр. в Render), никога в кода.
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY")

# Име на Public Bucket-а в Supabase Storage
BUCKET_NAME = "student-files"

# Инициализиране на клиента - ползва service role ключа, ако е наличен, иначе anon ключа
supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY or SUPABASE_ANON_KEY)

# Supabase Storage не позволява кирилица (и други символи извън ASCII) в ключа на
# обекта - заявката бива отхвърлена с InvalidKey дори при percent-encoding, защото
# сървърът декодира и валидира ключа отново. Затова транслитерираме, преди да качим.
_CYRILLIC_TO_LATIN = {
    "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "ж": "zh", "з": "z",
    "и": "i", "й": "y", "к": "k", "л": "l", "м": "m", "н": "n", "о": "o", "п": "p",
    "р": "r", "с": "s", "т": "t", "у": "u", "ф": "f", "х": "h", "ц": "ts", "ч": "ch",
    "ш": "sh", "щ": "sht", "ъ": "a", "ь": "y", "ю": "yu", "я": "ya",
}
_CYRILLIC_TO_LATIN.update({k.upper(): v.capitalize() for k, v in _CYRILLIC_TO_LATIN.items()})


def sanitize_storage_segment(text: str) -> str:
    """Транслитерира кирилица на латиница и премахва символи, невалидни за Storage ключ."""
    transliterated = "".join(_CYRILLIC_TO_LATIN.get(ch, ch) for ch in text)
    safe = re.sub(r"[^A-Za-z0-9._-]+", "_", transliterated).strip("_")
    return safe or "file"


def upload_to_supabase(file_bytes: bytes, filename: str, path_in_bucket: str) -> str:
    """
    Качва файла в Supabase Storage и връща публичния линк за достъп/сваляне.
    """
    try:
        # file_options стойностите се изпращат като HTTP хедъри, затова трябва да са низове, не bool
        supabase.storage.from_(BUCKET_NAME).upload(
            path=path_in_bucket,
            file=file_bytes,
            file_options={"content-type": "application/octet-stream", "upsert": "true"}
        )

        # Генериране на публичен URL
        public_url = supabase.storage.from_(BUCKET_NAME).get_public_url(path_in_bucket)
        return public_url
    except Exception as e:
        print(f"Грешка при качване в Supabase Storage: {e}")
        raise


def cleanup_expired_files(days: int = 60):
    """
    Намира и изтрива файлове от Storage и записи от базата данни, по-стари от 60 дни.
    """
    try:
        cutoff_date = (datetime.utcnow() - timedelta(days=days)).isoformat()
        
        # 1. Извличане на старите записи от таблица submissions
        response = supabase.table("submissions").select("*").lt("created_at", cutoff_date).execute()
        old_records = response.data

        if not old_records:
            return

        paths_to_delete = []
        ids_to_delete = []

        for rec in old_records:
            if "id" in rec:
                ids_to_delete.append(rec["id"])
            if rec.get("storage_path"):
                paths_to_delete.append(rec["storage_path"])

        # 2. Премахване на файловете от Supabase Storage
        if paths_to_delete:
            supabase.storage.from_(BUCKET_NAME).remove(paths_to_delete)

        # 3. Премахване на записите от таблицата
        if ids_to_delete:
            supabase.table("submissions").delete().in_("id", ids_to_delete).execute()

        print(f"Почистването завърши успешно: Премахнати са {len(ids_to_delete)} остарели записи/файла.")
    except Exception as e:
        print(f"Забележка при почистването на остарели файлове: {e}")

    # Същото 60-дневно правило и за свободните качвания на упражнения. Обвито отделно,
    # за да не пречи, докато таблицата exercise_uploads все още не е създадена в Supabase.
    try:
        cutoff_date = (datetime.utcnow() - timedelta(days=days)).isoformat()
        response = supabase.table("exercise_uploads").select("*").lt("created_at", cutoff_date).execute()
        old_records = response.data

        if not old_records:
            return

        paths_to_delete = [rec["storage_path"] for rec in old_records if rec.get("storage_path")]
        ids_to_delete = [rec["id"] for rec in old_records if "id" in rec]

        if paths_to_delete:
            supabase.storage.from_(BUCKET_NAME).remove(paths_to_delete)
        if ids_to_delete:
            supabase.table("exercise_uploads").delete().in_("id", ids_to_delete).execute()

        print(f"Почистването на упражнения завърши успешно: Премахнати са {len(ids_to_delete)} остарели записи/файла.")
    except Exception as e:
        print(f"Забележка при почистването на остарели упражнения: {e}")