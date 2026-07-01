import re


def normalize_bolivia_phone(phone: str | None) -> str | None:
    if not phone:
        return None
    digits = re.sub(r"\D", "", phone)
    if not digits:
        return None
    if digits.startswith("591"):
        return f"+{digits}"
    if len(digits) == 8:
        return f"+591{digits}"
    if len(digits) == 9 and digits.startswith("0"):
        return f"+591{digits[1:]}"
    return f"+591{digits}" if not phone.startswith("+") else phone
