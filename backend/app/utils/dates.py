from datetime import date, datetime, timedelta, timezone

# Bolivia no tiene horario de verano: siempre UTC-4.
BOLIVIA_TZ = timezone(timedelta(hours=-4))


def now_bolivia() -> str:
    return datetime.now(BOLIVIA_TZ).strftime("%Y-%m-%dT%H:%M")


def today_bolivia() -> date:
    """Fecha de hoy en Bolivia. El servidor corre en UTC y después de las 20:00 ya está en mañana."""
    return datetime.now(BOLIVIA_TZ).date()


def bolivia_day(value) -> str:
    raw = str(value or "").strip()
    if len(raw) < 10:
        return ""
    if len(raw) == 10:
        return raw
    if raw[10:11] == "T" and "Z" not in raw and "+" not in raw[10:]:
        return raw[:10]
    try:
        moment = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        return ""
    if moment.tzinfo is None:
        return moment.date().isoformat()
    return moment.astimezone(BOLIVIA_TZ).date().isoformat()
