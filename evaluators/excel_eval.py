import io
import openpyxl

def evaluate_excel(file_bytes: bytes, criteria: dict) -> dict:
    """Оценява .xlsx файл спрямо предоставените критерии."""
    wb = openpyxl.load_workbook(io.BytesIO(file_bytes), data_only=False)
    ws = wb.active
    
    score = 0
    max_score = 0
    details = []

    # 1. Формули (formulas)
    if "formulas" in criteria:
        rule = criteria["formulas"]
        rule_points = rule.get("points", 1) if isinstance(rule, dict) else 1
        max_score += rule_points

        has_formula = False
        for row in ws.iter_rows():
            for cell in row:
                if cell.value and str(cell.value).startswith("="):
                    has_formula = True
                    break
            if has_formula:
                break

        if has_formula:
            score += rule_points
            details.append({
                "criterion": "Използване на формули",
                "passed": True,
                "score": rule_points,
                "max": rule_points,
                "note": "Намерени са валидни Excel формули."
            })
        else:
            details.append({
                "criterion": "Използване на формули",
                "passed": False,
                "score": 0,
                "max": rule_points,
                "note": "Не са намерени формули в електронната таблица."
            })

    # 2. Графика / Диаграма (chart)
    if "chart" in criteria:
        rule = criteria["chart"]
        rule_points = rule.get("points", 1) if isinstance(rule, dict) else 1
        max_score += rule_points

        has_chart = len(ws._charts) > 0
        if has_chart:
            score += rule_points
            details.append({
                "criterion": "Наличие на диаграма",
                "passed": True,
                "score": rule_points,
                "max": rule_points,
                "note": "Намерена е диаграма в работния лист."
            })
        else:
            details.append({
                "criterion": "Наличие на диаграма",
                "passed": False,
                "score": 0,
                "max": rule_points,
                "note": "Липсва диаграма в работния лист."
            })

    percentage = round((score / max_score) * 100) if max_score > 0 else 0
    return {
        "score": score,
        "max_score": max_score,
        "percentage": percentage,
        "details": details
    }