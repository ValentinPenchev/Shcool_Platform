import io
from openpyxl import load_workbook

def evaluate_excel(file_bytes: bytes, criteria: list):
    # Първо прочитане: Извличане на формулите (формулен режим)
    wb_formulas = load_workbook(io.BytesIO(file_bytes), data_only=False)
    sheet_formulas = wb_formulas.active

    # Второ прочитане: Извличане на стойностите и форматирането
    wb_values = load_workbook(io.BytesIO(file_bytes), data_only=True)
    sheet_values = wb_values.active

    score = 0
    max_score = 0
    details = []

    for rule in criteria:
        rule_points = rule.get("points", 1)
        max_score += rule_points
        passed = False
        message = ""

        rule_type = rule.get("type")
        cell_ref = rule.get("cell")  # Напр. "C10"

        # 1. Проверка за формула (SUM, AVERAGE, IF и др.)
        if rule_type == "CHECK_FORMULA":
            expected_func = rule.get("function", "SUM").upper()
            cell_val = str(sheet_formulas[cell_ref].value or "")
            
            if cell_val.startswith("=") and expected_func in cell_val.upper():
                passed = True
                message = f"Клетка {cell_ref} съдържа правилната формула {expected_func}."
            else:
                message = f"В клетка {cell_ref} липсва формула {expected_func} (Намерено: '{cell_val}')."

        # 2. Проверка за Абсолютен адрес ($)
        elif rule_type == "CHECK_ABSOLUTE_ADDRESS":
            cell_val = str(sheet_formulas[cell_ref].value or "")
            if "$" in cell_val:
                passed = True
                message = f"Клетка {cell_ref} използва абсолютен адрес ($)."
            else:
                message = f"Клетка {cell_ref} не използва абсолютен адрес с '$'."

        # 3. Проверка за точна стойност в клетка
        elif rule_type == "CHECK_VALUE":
            expected_val = rule.get("value")
            actual_val = sheet_values[cell_ref].value
            
            if str(actual_val) == str(expected_val):
                passed = True
                message = f"Клетка {cell_ref} съдържа правилната стойност ({actual_val})."
            else:
                message = f"Невярна стойност в {cell_ref}: очаквано {expected_val}, намерено {actual_val}."

        # 4. Проверка за форматиране на число (Валута/Процент)
        elif rule_type == "CHECK_NUMBER_FORMAT":
            num_format = sheet_values[cell_ref].number_format
            expected_format = rule.get("format_type")  # Напр. "CURRENCY" или "PERCENT"
            
            if expected_format == "PERCENT" and "%" in num_format:
                passed = True
                message = f"Клетка {cell_ref} е форматирана като процент."
            elif expected_format == "CURRENCY" and ("$" in num_format or "лв" in num_format or "€" in num_format):
                passed = True
                message = f"Клетка {cell_ref} е форматирана като валута."
            else:
                message = f"Клетка {cell_ref} няма очакваното форматиране."

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