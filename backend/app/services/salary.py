from dataclasses import dataclass
from calendar import monthrange
from datetime import date, timedelta

MONTHS = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
]
WEEKDAYS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"]
WEEK_LENGTH_DAYS = 7
FORTNIGHT_LENGTH_DAYS = 14
HISTORY_COUNT = 6
KIND_WEEKLY = "weekly"
KIND_BIWEEKLY = "biweekly"
KIND_MONTHLY = "monthly"
MAX_MONTH_STEPS = 240
PROCESS_LABELS = {
    "diseno": "Diseño",
    "soldadura": "Soldadura",
    "afinado": "Afinado",
    "pintura": "Pintura",
    "instalacion": "Instalación",
}


def add_business_days(start: date, days: int) -> date:
    """Suma días hábiles (lun–vie). El plazo legal de 5 días empieza al día siguiente del pago."""
    d = start
    added = 0
    while added < days:
        d += timedelta(days=1)
        if d.weekday() < 5:
            added += 1
    return d


def clamp_month_day(year: int, month: int, day: int) -> date:
    last = monthrange(year, month)[1]
    return date(year, month, min(max(int(day or last), 1), last))


def _shift_month(year: int, month: int, delta: int) -> tuple[int, int]:
    m = month + delta
    y = year
    while m < 1:
        m += 12
        y -= 1
    while m > 12:
        m -= 12
        y += 1
    return y, m


def add_calendar_months(day: date, delta: int) -> date:
    year, month = _shift_month(day.year, day.month, delta)
    return clamp_month_day(year, month, day.day)


def week_monday(d: date) -> date:
    return d - timedelta(days=d.weekday())


@dataclass(frozen=True)
class PeriodConfig:
    kind: str
    pay_day: int | None = None
    started: date | None = None


def recent_periods(today: date, config: PeriodConfig) -> list[dict]:
    kind = config.kind or KIND_MONTHLY
    if config.started:
        return _recent_from_anchor(today, config)
    if kind == KIND_WEEKLY:
        return _recent_weekly(today, config.pay_day)
    if kind == KIND_BIWEEKLY:
        return _recent_biweekly(today)
    return _recent_monthly(today, config.pay_day)


def _period_item(parts: dict) -> dict:
    legal = bool(parts.get("legal_window"))
    payday = parts["payday"]
    return {
        "key": parts["key"],
        "start": parts["start"],
        "end": parts["end"],
        "payday": payday,
        "deadline": add_business_days(payday, 5) if legal else payday,
        "label": parts["label"],
        "legal_window": legal,
    }


def _cycle_end(start: date, kind: str) -> date:
    if kind == KIND_WEEKLY:
        return start + timedelta(days=WEEK_LENGTH_DAYS - 1)
    if kind == KIND_BIWEEKLY:
        return start + timedelta(days=FORTNIGHT_LENGTH_DAYS - 1)
    return add_calendar_months(start, 1) - timedelta(days=1)


def _current_cycle_start(today: date, started: date, kind: str) -> date:
    if today < started:
        return started
    if kind == KIND_WEEKLY:
        steps = (today - started).days // WEEK_LENGTH_DAYS
        return started + timedelta(days=steps * WEEK_LENGTH_DAYS)
    if kind == KIND_BIWEEKLY:
        steps = (today - started).days // FORTNIGHT_LENGTH_DAYS
        return started + timedelta(days=steps * FORTNIGHT_LENGTH_DAYS)
    start = started
    steps = 0
    while _cycle_end(start, kind) < today and steps < MAX_MONTH_STEPS:
        start = add_calendar_months(start, 1)
        steps += 1
    return start


def _shift_cycle_start(start: date, kind: str, delta: int) -> date:
    if kind == KIND_WEEKLY:
        return start + timedelta(days=WEEK_LENGTH_DAYS * delta)
    if kind == KIND_BIWEEKLY:
        return start + timedelta(days=FORTNIGHT_LENGTH_DAYS * delta)
    return add_calendar_months(start, delta)


def _cycle_label(start: date, end: date, kind: str) -> str:
    span = f"{start.strftime('%d/%m')}–{end.strftime('%d/%m')}"
    if kind == KIND_WEEKLY:
        return f"Semana {span}"
    if kind == KIND_BIWEEKLY:
        return f"Quincena {span}"
    return f"Mes {span}"


def _recent_from_anchor(today: date, config: PeriodConfig) -> list[dict]:
    started = config.started
    kind = config.kind or KIND_MONTHLY
    if started is None:
        return []
    current_start = _current_cycle_start(today, started, kind)
    prefix = {KIND_WEEKLY: "w", KIND_BIWEEKLY: "q", KIND_MONTHLY: "m"}.get(kind, "m")
    legal = kind == KIND_MONTHLY
    out = []
    cursor = current_start
    for _ in range(HISTORY_COUNT):
        if cursor < started:
            break
        end = _cycle_end(cursor, kind)
        out.append(_period_item({
            "key": f"{prefix}:{cursor.isoformat()}",
            "start": cursor,
            "end": end,
            "payday": end,
            "label": _cycle_label(cursor, end, kind),
            "legal_window": legal,
        }))
        cursor = _shift_cycle_start(cursor, kind, -1)
    return out


def _recent_monthly(today: date, pay_day: int | None) -> list[dict]:
    out = []
    y, m = today.year, today.month
    for _ in range(HISTORY_COUNT):
        last = monthrange(y, m)[1]
        payday = clamp_month_day(y, m, pay_day if pay_day else 30)
        out.append(_period_item({
            "key": f"m:{y:04d}-{m:02d}",
            "payday": payday,
            "end": date(y, m, last),
            "start": date(y, m, 1),
            "label": f"{MONTHS[m - 1]} {y}",
            "legal_window": True,
        }))
        y, m = _shift_month(y, m, -1)
    return out


def _recent_weekly(today: date, pay_day: int | None) -> list[dict]:
    weekday = int(pay_day) if pay_day is not None else 4
    weekday = min(max(weekday, 0), 6)
    monday = week_monday(today)
    payday = monday + timedelta(days=weekday)
    if payday > today:
        payday -= timedelta(days=7)
    out = []
    p = payday
    for _ in range(HISTORY_COUNT):
        start = week_monday(p)
        end = start + timedelta(days=6)
        out.append(_period_item({
            "key": f"w:{p.isoformat()}",
            "payday": p,
            "end": end,
            "start": start,
            "label": f"Semana {start.strftime('%d/%m')}–{end.strftime('%d/%m')}",
            "legal_window": False,
        }))
        p -= timedelta(days=7)
    return out


def _recent_biweekly(today: date) -> list[dict]:
    out = []
    y, m = today.year, today.month
    for _ in range(4):
        last = monthrange(y, m)[1]
        out.append(_period_item({
            "key": f"q:{y:04d}-{m:02d}-b",
            "payday": date(y, m, last),
            "end": date(y, m, last),
            "start": date(y, m, 16),
            "label": f"2.ª quincena {MONTHS[m - 1]} {y}",
            "legal_window": False,
        }))
        out.append(_period_item({
            "key": f"q:{y:04d}-{m:02d}-a",
            "payday": date(y, m, 15),
            "end": date(y, m, 15),
            "start": date(y, m, 1),
            "label": f"1.ª quincena {MONTHS[m - 1]} {y}",
            "legal_window": False,
        }))
        y, m = _shift_month(y, m, -1)
    return out


def as_start_date(value) -> date | None:
    raw = str(value or "")[:10]
    if not raw:
        return None
    try:
        return date.fromisoformat(raw)
    except ValueError:
        return None


def periods_since(periods: list[dict], started: date | None) -> list[dict]:
    if started is None or not periods:
        return periods
    month_start = date(started.year, started.month, 1)
    filtered = [period for period in periods if period["start"] >= month_start]
    return filtered or periods[:1]


def pick_period(periods: list[dict], today: date) -> dict:
    if not periods:
        raise ValueError("Sin períodos de salario")
    for period in periods:
        if period["start"] <= today:
            return period
    return periods[0]


def period_status(period: dict, paid_sum: float, salary_base: float, mode: str, today: date) -> str:
    base = float(salary_base or 0)
    paid = float(paid_sum or 0)
    needs_base = mode in ("fixed", "both") and base > 0
    if needs_base and paid + 0.009 >= base:
        return "pagado"
    if not needs_base and paid > 0:
        return "pagado"
    if paid > 0:
        return "parcial"
    payday = period["payday"]
    deadline = period["deadline"]
    if today < payday:
        return "proximo"
    if period.get("legal_window") and today <= deadline:
        return "en_plazo"
    if today > deadline:
        return "vencido"
    return "pendiente"


def technician_matches(tech: str | None, name: str) -> bool:
    if not tech or not name:
        return False
    t = str(tech).split("—")[0].split("-")[0].strip().lower()
    n = name.strip().lower()
    return t == n or t.startswith(n)


def jobs_for_worker(items: list[dict], orders_by_id: dict, name: str, start: date, end: date) -> list[dict]:
    found = []
    seen = set()
    for item in items:
        process = item.get("process") or {}
        if not isinstance(process, dict):
            continue
        for step in process.get("steps") or []:
            if not technician_matches(step.get("technician"), name):
                continue
            assigned = (step.get("assigned_at") or "")[:10]
            in_range = True
            if assigned:
                try:
                    d = date.fromisoformat(assigned)
                    in_range = start <= d <= end
                except ValueError:
                    in_range = True
            if not in_range:
                continue
            oid = item.get("work_order_id")
            key = (oid, step.get("id"), item.get("id"))
            if key in seen:
                continue
            seen.add(key)
            order = orders_by_id.get(oid) or {}
            found.append({
                "ot_number": order.get("ot_number"),
                "work_description": order.get("work_description") or item.get("description"),
                "part_name": item.get("part_name"),
                "step": PROCESS_LABELS.get(step.get("id"), step.get("id") or ""),
            })
    return found[:20]
