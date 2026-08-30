import io
import zipfile
from pptx import Presentation
from pptx.enum.shapes import MSO_SHAPE_TYPE

def evaluate_ppt(file_bytes: bytes, criteria: list):
    prs = Presentation(io.BytesIO(file_bytes))
    
    score = 0
    max_score = 0
    details = []

    for rule in criteria:
        rule_points = rule.get("points", 1)
        max_score += rule_points
        passed = False
        message = ""

        rule_type = rule.get("type")

        # 1. Проверка за брой слайдове
        if rule_type == "MIN_SLIDES":
            min_slides = rule.get("min_slides", 3)
            actual_slides = len(prs.slides)
            if actual_slides >= min_slides:
                passed = True
                message = f"Презентацията има {actual_slides} слайда (минимум {min_slides})."
            else:
                message = f"Недостатъчен брой слайдове: {actual_slides} от минимум {min_slides}."

        # 2. Проверка за изображения
        elif rule_type == "HAS_IMAGES":
            min_images = rule.get("min_images", 1)
            img_count = sum(
                1 for slide in prs.slides 
                for shape in slide.shapes 
                if shape.shape_type == MSO_SHAPE_TYPE.PICTURE
            )
            if img_count >= min_images:
                passed = True
                message = f"Намерени {img_count} изображения в презентацията."
            else:
                message = f"Очаквани поне {min_images} изображения, намерени {img_count}."

        # 3. Проверка за SmartArt графики
        elif rule_type == "HAS_SMARTART":
            has_smartart = False
            for slide in prs.slides:
                for shape in slide.shapes:
                    if shape.shape_type == MSO_SHAPE_TYPE.GRAPHIC_FRAME:
                        has_smartart = True
                        break
            if has_smartart:
                passed = True
                message = f"Намерена SmartArt графика в презентацията."
            else:
                message = f"Липсва SmartArt графика."

        # 4. Проверка за вградено видео или аудио
        elif rule_type == "HAS_MEDIA":
            has_media = False
            # Проверяваме вътрешния ZIP архив за медийни файлове
            with zipfile.ZipFile(io.BytesIO(file_bytes)) as z:
                media_files = [f for f in z.namelist() if f.startswith("ppt/media/")]
                if len(media_files) > 0:
                    has_media = True
            
            if has_media:
                passed = True
                message = f"Открити вградени мултимедийни файлове (видео/аудио)."
            else:
                message = f"Не са намерени вградени видео или аудио файлове."

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