import io
from docx import Document

def evaluate_word(file_bytes: bytes, criteria: dict) -> dict:
    """Оценява .docx файл спрямо предоставените критерии."""
    doc = Document(io.BytesIO(file_bytes))
    score = 0
    max_score = 0
    details = []

    # 1. Текст / Форматиране
    if "font" in criteria:
        rule = criteria["font"]
        rule_points = rule.get("points", 1) if isinstance(rule, dict) else 1
        max_score += rule_points

        has_text = any(p.text.strip() for p in doc.paragraphs)
        if has_text:
            score += rule_points
            details.append({
                "criterion": "Форматиране / Текст",
                "passed": True,
                "score": rule_points,
                "max": rule_points,
                "note": "Намерен е съдържателен текст в документа."
            })
        else:
            details.append({
                "criterion": "Форматиране / Текст",
                "passed": False,
                "score": 0,
                "max": rule_points,
                "note": "Документът е празен или липсва текст."
            })

    # 2. Таблица
    if "table" in criteria:
        rule = criteria["table"]
        rule_points = rule.get("points", 1) if isinstance(rule, dict) else 1
        max_score += rule_points

        tables_count = len(doc.tables)
        if tables_count > 0:
            score += rule_points
            details.append({
                "criterion": "Наличие на таблица",
                "passed": True,
                "score": rule_points,
                "max": rule_points,
                "note": f"Намерена е таблица в документа (общо: {tables_count})."
            })
        else:
            details.append({
                "criterion": "Наличие на таблица",
                "passed": False,
                "score": 0,
                "max": rule_points,
                "note": "Не е намерена таблица в документа."
            })

    # 3. Изображение
    if "image" in criteria:
        rule = criteria["image"]
        rule_points = rule.get("points", 1) if isinstance(rule, dict) else 1
        max_score += rule_points

        has_image = any("image" in rel.target_ref for rel in doc.part.rels.values())
        if has_image:
            score += rule_points
            details.append({
                "criterion": "Вмъкнато изображение",
                "passed": True,
                "score": rule_points,
                "max": rule_points,
                "note": "Намерено е изображение в документа."
            })
        else:
            details.append({
                "criterion": "Вмъкнато изображение",
                "passed": False,
                "score": 0,
                "max": rule_points,
                "note": "Липсва вмъкнато изображение."
            })

    percentage = round((score / max_score) * 100) if max_score > 0 else 0
    return {
        "score": score,
        "max_score": max_score,
        "percentage": percentage,
        "details": details
    }