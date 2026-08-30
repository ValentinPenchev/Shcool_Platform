import io
from docx import Document
from docx.shared import Pt, RGBColor

def evaluate_word(file_bytes: bytes, criteria: list):
    # Зареждане на файла директно от паметта (RAM)
    doc = Document(io.BytesIO(file_bytes))
    
    score = 0
    max_score = 0
    details = []

    for rule in criteria:
        rule_points = rule.get("points", 1)
        max_score += rule_points
        passed = False
        message = ""

        rule_type = rule.get("type")

        # 1. Проверка за Heading стилове
        if rule_type == "HAS_HEADING":
            min_count = rule.get("min_count", 1)
            headings = [p for p in doc.paragraphs if p.style.name.startswith("Heading")]
            if len(headings) >= min_count:
                passed = True
                message = f"Намерени {len(headings)} заглавни стила."
            else:
                message = f"Очаквани поне {min_count} заглавия, намерени {len(headings)}."

        # 2. Проверка за таблици
        elif rule_type == "HAS_TABLE":
            min_tables = rule.get("min_tables", 1)
            table_count = len(doc.tables)
            if table_count >= min_tables:
                passed = True
                message = f"Намерени {table_count} таблици."
            else:
                message = f"Очаквани поне {min_tables} таблици, намерени {table_count}."

        # 3. Проверка за конкретен шрифт и размер
        elif rule_type == "CHECK_FONT":
            expected_font = rule.get("font_name", "Times New Roman")
            expected_size = rule.get("font_size", 12)
            
            font_matched = False
            for p in doc.paragraphs:
                for r in p.runs:
                    if r.font.name == expected_font and r.font.size and r.font.size.pt == expected_size:
                        font_matched = True
                        break
                if font_matched:
                    break
            
            if font_matched:
                passed = True
                message = f"Намерен текст с шрифт {expected_font} {expected_size}pt."
            else:
                message = f"Не е намерен текст с шрифт {expected_font} {expected_size}pt."

        # 4. Проверка за брой думи
        elif rule_type == "MIN_WORDS":
            min_words = rule.get("min_words", 50)
            total_words = sum(len(p.text.split()) for p in doc.paragraphs)
            if total_words >= min_words:
                passed = True
                message = f"Общ брой думи: {total_words} (минимум {min_words})."
            else:
                message = f"Недостатъчен брой думи: {total_words} от минимум {min_words}."

        if passed:
            score += rule_points

        details.append({
            "name": rule.get("name", rule_type),
            "passed": passed,
            "points": rule_points if passed else 0,
            "max_points": rule_points,
            "message": message
        })

    return {"score": score, "max_score": max_score, "details": details}