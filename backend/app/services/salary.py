from calendar import monthrange
from datetime import date, timedelta

MONTHS = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
]
WEEKDAYS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"]
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


def week_monday(d: date) -> date:
    return d - timedelta(days=d.weekday())


def recent_periods(today: date, period: str, pay_day: int | None) -> list[dict]:
    period = period or "monthly"
    if period == "weekly":
        return _recent_weekly(today, pay_day)
    if period == "biweekly":
        return _recent_biweekly(today)
    return _recent_monthly(today, pay_day)


def _recent_monthly(today: date, pay_day: int | None) -> list[dict]:
    out = []
    y, m = today.year, today.month
    for _ in range(6):
        payday = clamp_month_day(y, m, pay_day if pay_day else 30)
        out.append({
            "key": f"m:{y:04d}-{m:02d}",
            "payday": payday,
            "deadline": add_business_days(payday, 5),
            "start": date(y, m, 1),
            "label": f"{MONTHS[m - 1]} {y}",
            "legal_window": True,
        })
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
    for _ in range(6):
        start = week_monday(p)
        out.append({
            "key": f"w:{p.isoformat()}",
            "payday": p,
            "deadline": p,
            "start": start,
            "label": f"Semana {start.strftime('%d/%m')}–{(start + timedelta(days=6)).strftime('%d/%m')}",
            "legal_window": False,
        })
        p -= timedelta(days=7)
    return out


def _recent_biweekly(today: date) -> list[dict]:
    out = []
    y, m = today.year, today.month
    for _ in range(4):
        last = monthrange(y, m)[1]
        out.append({
            "key": f"q:{y:04d}-{m:02d}-b",
            "payday": date(y, m, last),
            "deadline": date(y, m, last),
            "start": date(y, m, 16),
            "label": f"2.ª quincena {MONTHS[m - 1]} {y}",
            "legal_window": False,
        })
        out.append({
            "key": f"q:{y:04d}-{m:02d}-a",
            "payday": date(y, m, 15),
            "deadline": date(y, m, 15),
            "start": date(y, m, 1),
            "label": f"1.ª quincena {MONTHS[m - 1]} {y}",
            "legal_window": False,
        })
        y, m = _shift_month(y, m, -1)
    return out


def pick_period(periods: list[dict], paid_keys: set[str], today: date) -> dict:
    due_unpaid = [p for p in periods if today >= p["payday"] and p["key"] not in paid_keys]
    if due_unpaid:
        return due_unpaid[0]
    upcoming = [p for p in periods if today < p["payday"]]
    if upcoming:
        return min(upcoming, key=lambda p: p["payday"])
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
