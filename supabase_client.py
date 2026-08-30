import os
from datetime import datetime, timedelta
from supabase import create_client, Client

# Базов адрес на проекта
SUPABASE_URL = "https://rtxicehpuddssvicmiwf.supabase.co"

# API ключ
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ0eGljZWhwdWRkc3N2aWNtaXdmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgwNTc5NDksImV4cCI6MjEwMzYzMzk0OX0.NIY9thV8j7tC9K-oN2P2LIDKKGXf9xSoutYTNVmjz0A"

# Име на Public Bucket-а в Supabase Storage
BUCKET_NAME = "student-files"

# Инициализиране на клиента
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)


def upload_to_supabase(file_bytes: bytes, filename: str, path_in_bucket: str) -> str:
    """
    Качва файла в Supabase Storage и връща публичния линк за достъп/сваляне.
    """
    try:
        # Качване на файла (поправено upsert: True като boolean)
        supabase.storage.from_(BUCKET_NAME).upload(
            path=path_in_bucket,
            file=file_bytes,
            file_options={"content-type": "application/octet-stream", "upsert": True}
        )
        
        # Генериране на публичен URL
        public_url = supabase.storage.from_(BUCKET_NAME).get_public_url(path_in_bucket)
        return public_url
    except Exception as e:
        print(f"Грешка при качване в Supabase Storage: {e}")
        # Ако файлът вече съществува, опитваме да вземем линка директно
        try:
            return supabase.storage.from_(BUCKET_NAME).get_public_url(path_in_bucket)
        except:
            raise e


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