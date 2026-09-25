from dataclasses import dataclass
from calendar import monthrange
from datetime import date, timedelta

MONTHS = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
]
PAID_TOLERANCE = 0.009
ADVANCE_DESCRIPTION_PREFIX = "Adelanto "
HISTORY_COUNT = 6
KIND_WEEKLY = "weekly"
KIND_BIWEEKLY = "biweekly"
KIND_MONTHLY = "monthly"
WEEK_STEP_DAYS = 7
FORTNIGHT_STEP_DAYS = 14
DAYS_FROM_MONDAY_TO_SATURDAY = 5
DAYS_FROM_MONDAY_TO_SECOND_SATURDAY = 12
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


def week_monday(d: date) -> date:
    return d - timedelta(days=d.weekday())


def week_saturday(monday: date) -> date:
    return monday + timedelta(days=DAYS_FROM_MONDAY_TO_SATURDAY)


def fortnight_saturday(monday: date) -> date:
    return monday + timedelta(days=DAYS_FROM_MONDAY_TO_SECOND_SATURDAY)


def fortnight_start_monday(day: date) -> date:
    monday = week_monday(day)
    if monday.isocalendar()[1] % 2 == 1:
        return monday - timedelta(days=WEEK_STEP_DAYS)
    return monday


@dataclass(frozen=True)
class DateSpan:
    start: date
    end: date


def clip_span(span: DateSpan, started: date | None) -> DateSpan | None:
    if started is None:
        return span
    if span.end < started:
        return None
    if span.start < started:
        return DateSpan(start=started, end=span.end)
    return span


@dataclass(frozen=True)
class PeriodConfig:
    kind: str
    pay_day: int | None = None
    started: date | None = None


def recent_periods(today: date, config: PeriodConfig) -> list[dict]:
    kind = config.kind or KIND_MONTHLY
    if kind == KIND_WEEKLY:
        return _recent_weekly(today, config.started)
    if kind == KIND_BIWEEKLY:
        return _recent_biweekly(today, config.started)
    return _recent_monthly(today, config.started)


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


def _week_label(start: date, saturday: date) -> str:
    return f"Semana {start.strftime('%d/%m')}–{saturday.strftime('%d/%m')}"


def _recent_weekly(today: date, started: date | None) -> list[dict]:
    monday = week_monday(today)
    out: list[dict] = []
    for _ in range(HISTORY_COUNT):
        saturday = week_saturday(monday)
        clipped = clip_span(DateSpan(monday, saturday), started)
        if clipped is not None:
            out.append(_period_item({
                "key": f"w:{monday.isoformat()}",
                "start": clipped.start,
                "end": clipped.end,
                "payday": saturday,
                "label": _week_label(clipped.start, saturday),
                "legal_window": False,
            }))
        monday -= timedelta(days=WEEK_STEP_DAYS)
    return out


def _recent_biweekly(today: date, started: date | None) -> list[dict]:
    monday = fortnight_start_monday(today)
    out: list[dict] = []
    for _ in range(HISTORY_COUNT):
        saturday = fortnight_saturday(monday)
        clipped = clip_span(DateSpan(monday, saturday), started)
        if clipped is not None:
            out.append(_period_item({
                "key": f"q:{monday.isoformat()}",
                "start": clipped.start,
                "end": clipped.end,
                "payday": saturday,
                "label": f"Quincena {clipped.start.strftime('%d/%m')}–{saturday.strftime('%d/%m')}",
                "legal_window": False,
            }))
        monday -= timedelta(days=FORTNIGHT_STEP_DAYS)
    return out


def _monthly_label(start: date) -> str:
    name = f"{MONTHS[start.month - 1]} {start.year}"
    if start.day == 1:
        return name
    return f"{name} · desde {start.strftime('%d/%m')}"


def _recent_monthly(today: date, started: date | None) -> list[dict]:
    out: list[dict] = []
    y, m = today.year, today.month
    for _ in range(HISTORY_COUNT):
        last = monthrange(y, m)[1]
        start = date(y, m, 1)
        end = date(y, m, last)
        clipped = clip_span(DateSpan(start, end), started)
        if clipped is not None:
            out.append(_period_item({
                "key": f"m:{y:04d}-{m:02d}",
                "start": clipped.start,
                "end": clipped.end,
                "payday": end,
                "label": _monthly_label(clipped.start),
                "legal_window": True,
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


@dataclass(frozen=True)
class AdvanceRequest:
    salary_base: float
    already_paid: float
    amount: float


def leftover_base(salary_base: float, already_paid: float) -> float:
    leftover = float(salary_base or 0) - float(already_paid or 0)
    if leftover <= PAID_TOLERANCE:
        return 0.0
    return round(leftover, 2)


def advance_fits(req: AdvanceRequest) -> bool:
    if req.amount <= 0:
        return False
    if req.salary_base <= 0:
        return False
    return leftover_base(req.salary_base, req.already_paid) + PAID_TOLERANCE >= req.amount


def description_is_advance(text: str | None) -> bool:
    return str(text or "").startswith(ADVANCE_DESCRIPTION_PREFIX)


def advances_in(pays: list) -> float:
    total = 0.0
    for row in pays:
        if description_is_advance(row.get("description")):
            total += float(row.get("amount") or 0)
    return round(total, 2)


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
