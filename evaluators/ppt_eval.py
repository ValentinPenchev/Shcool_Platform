import io
from pptx import Presentation

def evaluate_ppt(file_bytes: bytes, criteria: dict) -> dict:
    """Оценява .pptx файл спрямо предоставените критерии."""
    prs = Presentation(io.BytesIO(file_bytes))
    
    score = 0
    max_score = 0
    details = []

    # 1. Брой слайдове (min_slides)
    if "min_slides" in criteria:
        rule = criteria["min_slides"]
        rule_points = rule.get("points", 1) if isinstance(rule, dict) else 1
        required_slides = rule.get("count", 3) if isinstance(rule, dict) else 3
        max_score += rule_points

        slides_count = len(prs.slides)
        if slides_count >= required_slides:
            score += rule_points
            details.append({
                "criterion": "Брой слайдове",
                "passed": True,
                "score": rule_points,
                "max": rule_points,
                "note": f"Презентацията съдържа {slides_count} слайда (минимално изисквани: {required_slides})."
            })
        else:
            details.append({
                "criterion": "Брой слайдове",
                "passed": False,
                "score": 0,
                "max": rule_points,
                "note": f"Презентацията съдържа само {slides_count} слайда (минимално изисквани: {required_slides})."
            })

    percentage = round((score / max_score) * 100) if max_score > 0 else 0
    return {
        "score": score,
        "max_score": max_score,
        "percentage": percentage,
        "details": details
    }