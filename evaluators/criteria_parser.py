import re

# Всеки evaluator (word_eval, excel_eval, ppt_eval) чете само тези конкретни ключове
# от речника с критерии. Абзаците от качения Word документ с критерии се разпознават
# по ключови думи и се превръщат в тях, за да могат реално да участват в оценяването.
# Някои ключове (напр. font_color, bold, merged_cells, cell_shading) се проверяват
# и от word_eval, и от excel_eval - всеки evaluator ги тълкува по свой начин.
_PRESENCE_KEYWORDS = {
    # Word
    "table": ["таблиц"],
    "image": ["изображ", "картинк", "снимк", "илюстрац"],
    "font": ["форматир"],
    "paragraph_alignment": ["подравн"],
    "font_name": ["шрифт"],
    "font_size": ["големин", "размер на шрифт", "размер на текст"],
    "bold": ["удебел"],
    "italic": ["курсив"],
    "underline": ["подчерта"],
    "special_characters": ["специални символи", "специален символ"],
    "merged_cells": ["обединени клетки", "обединяване на клетки"],
    "cell_shading": ["оцветяване"],
    "font_color": ["цвят"],
    # Excel
    "formulas": ["формул"],
    "chart": ["диаграм", "график"],
    "absolute_reference": ["абсолютен адрес", "относителен адрес", "абсолютна референция", "относителна референция"],
    "data_types": ["типове данни", "тип данни", "формат на клетки", "валута", "currency"],
    "borders": ["рамк"],
    "sort_filter": ["сортиране", "филтриране", "филтър"],
    "summary_report": ["обобщ"],
    # PowerPoint
    "has_media": ["аудио", "видео"],
    "has_smartart": ["smartart"],
    "has_transitions": ["преход"],
    "has_animations": ["анимаци"],
}

# Критерии с изрично число (напр. "минимум 5 колони") - добавят се само ако числото е намерено
_COUNT_PATTERNS = {
    "min_columns": re.compile(r"(\d+)\s*колон", re.IGNORECASE),
    "min_rows": re.compile(r"(\d+)\s*ред", re.IGNORECASE),
}

# Приема и "точки"/"точка", и съкратеното "т." (напр. "2 т.")
_POINTS_PATTERN = re.compile(r"(\d+)\s*(?:точк[а-я]*|т\.)", re.IGNORECASE)
_EXPLICIT_SLIDE_COUNT_PATTERN = re.compile(r"(?:минимум|поне)\s*(\d+)\s*слайд", re.IGNORECASE)
_SLIDE_HEADER_PATTERN = re.compile(r"^слайд\s+(\d+)", re.IGNORECASE)


def _detect_min_slides(paragraphs):
    """
    Определя минимален брой слайдове по два начина: изрично посочен брой
    ("минимум/поне N слайда") или, ако липсва, по най-високия номер от
    заглавия от вида "Слайд N: ..." (напр. документ, изброяващ Слайд 1..7).
    """
    for text in paragraphs:
        match = _EXPLICIT_SLIDE_COUNT_PATTERN.search(text.lower())
        if match:
            count = int(match.group(1))
            return {"points": 1, "count": count, "description": f"Минимум {count} слайда"}

    max_header = 0
    for text in paragraphs:
        match = _SLIDE_HEADER_PATTERN.match(text.strip().lower())
        if match:
            max_header = max(max_header, int(match.group(1)))

    if max_header > 0:
        return {
            "points": 1,
            "count": max_header,
            "description": f"Изведено от {max_header} описани слайда в критериите"
        }

    return None


def extract_criteria_from_text(paragraphs):
    """
    Превръща списък от текстови абзаци (напр. от Word документ с критерии) в речник
    с критерии в единния формат, който evaluator-ите разбират. Абзаци, които не
    съдържат разпознато ключово понятие, се пропускат.

    Точките за критерий, изведен от подточка без собствена стойност (напр. булет
    под заглавие "Ефекти в слайдовете - 4 т."), се наследяват от последната
    видяна стойност по-горе в документа.
    """
    criteria = {}

    min_slides = _detect_min_slides(paragraphs)
    if min_slides:
        criteria["min_slides"] = min_slides

    current_section_points = 1

    for text in paragraphs:
        text_lower = text.lower()

        points_match = _POINTS_PATTERN.search(text_lower)
        if points_match:
            current_section_points = int(points_match.group(1))
            points = current_section_points
        else:
            points = current_section_points

        for key, keywords in _PRESENCE_KEYWORDS.items():
            if not any(kw in text_lower for kw in keywords):
                continue
            existing = criteria.get(key)
            if not existing or points > existing["points"]:
                criteria[key] = {"points": points, "description": text}

        for key, pattern in _COUNT_PATTERNS.items():
            match = pattern.search(text_lower)
            if not match:
                continue
            count = int(match.group(1))
            existing = criteria.get(key)
            if not existing or points > existing["points"]:
                criteria[key] = {"points": points, "count": count, "description": text}

        if "диаграм" in text_lower and ("вид" in text_lower or "тип" in text_lower):
            existing = criteria.get("chart_type")
            if not existing or points > existing["points"]:
                criteria["chart_type"] = {"points": points, "description": text}

    return criteria
