DEFAULT_EFFICIENCY = 0.6
MIN_EFFICIENCY = 0.01
MAX_EFFICIENCY = 1.0
MIN_MARGIN = 0.0
MAX_MARGIN = 0.95
WEEKLY_HOURS = 44
MONTH_DAYS = 26
WORK_DAYS = 6
YEAR_WEEKS = 52
HOLIDAY_HOURS = 8

DEFAULT_RATES = {
    "efficiency": 0.7,
    "weekly_pay": 850.0,
    "weekly_hours": float(WEEKLY_HOURS),
    "holiday_days": 17.5,
    "margin": 0.5,
    "plastix_price": 360.0,
    "plastix_cm": 120.0,
    "design_amounts": [250.0, 300.0, 350.0],
    "design_multipliers": [1.0, 1.2, 1.4],
    "print_under_10": 40.0,
    "print_mid": 35.0,
    "print_over_20": 30.0,
    "print_hours": 0.0,
}


def clamp_efficiency(value) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return DEFAULT_EFFICIENCY
    if number < MIN_EFFICIENCY:
        return MIN_EFFICIENCY
    if number > MAX_EFFICIENCY:
        return MAX_EFFICIENCY
    return round(number, 4)


def _positive(value, fallback: float) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return fallback
    if number <= 0:
        return fallback
    return number


def _money(value, fallback: float) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return fallback
    if number < 0:
        return fallback
    return round(number, 2)


def sheet_efficiency(value) -> float:
    if value is None or value == "":
        return DEFAULT_RATES["efficiency"]
    return clamp_efficiency(value)


def _margin(value) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return DEFAULT_RATES["margin"]
    if number < MIN_MARGIN:
        return MIN_MARGIN
    if number > MAX_MARGIN:
        return MAX_MARGIN
    return round(number, 4)


def _trio(value, fallback: list[float]) -> list[float]:
    if not isinstance(value, (list, tuple)) or len(value) != 3:
        return list(fallback)
    cleaned = []
    for item, base in zip(value, fallback):
        try:
            number = float(item)
        except (TypeError, ValueError):
            return list(fallback)
        if number < 0:
            return list(fallback)
        cleaned.append(round(number, 4))
    return cleaned


def weekly_from_salary(profile: dict) -> float:
    try:
        base = float((profile or {}).get("salary_base") or 0)
    except (TypeError, ValueError):
        return 0.0
    if base <= 0:
        return 0.0
    period = (profile or {}).get("salary_period") or "monthly"
    if period == "weekly":
        return round(base, 2)
    if period == "biweekly":
        return round(base / 2, 2)
    return round(base * WORK_DAYS / MONTH_DAYS, 2)


def pay_profile(name: str, people) -> dict:
    from app.services.salary import technician_matches

    matches = [
        person for person in people or []
        if technician_matches(name, str(person.get("name") or ""))
    ]
    blank = {"weekly": 0.0, "efficiency": DEFAULT_EFFICIENCY, "salary_base": 0.0, "salary_period": "monthly"}
    if not matches:
        return blank
    salary = max(matches, key=weekly_from_salary)
    worker = next((person for person in matches if (person.get("role") or "mechanic") != "admin"), matches[0])
    return {
        "weekly": weekly_from_salary(salary),
        "efficiency": clamp_efficiency(worker.get("labor_efficiency")),
        "salary_base": float(salary.get("salary_base") or 0),
        "salary_period": salary.get("salary_period") or "monthly",
    }


def hour_for(profile: dict, rates: dict) -> float:
    weekly = float((profile or {}).get("weekly") or 0)
    if weekly <= 0:
        return 0.0
    sample = dict(rates or {})
    sample["weekly_pay"] = weekly
    return hourly_rate(sample)


def hourly_rate(rates: dict) -> float:
    weekly = _positive(rates.get("weekly_pay"), DEFAULT_RATES["weekly_pay"])
    hours = _positive(rates.get("weekly_hours"), DEFAULT_RATES["weekly_hours"])
    holiday_days = _money(rates.get("holiday_days"), DEFAULT_RATES["holiday_days"])
    base = weekly / hours
    month_pay = weekly / WORK_DAYS * MONTH_DAYS
    year_hours = YEAR_WEEKS * hours - holiday_days * HOLIDAY_HOURS
    if year_hours <= 0:
        return round(base, 6)
    return base + month_pay / year_hours


def print_quote(rates: dict) -> float:
    hours = _money(rates.get("print_hours"), 0)
    if hours <= 0:
        return 0.0
    if hours < 10:
        price = _money(rates.get("print_under_10"), DEFAULT_RATES["print_under_10"])
    elif hours <= 20:
        price = _money(rates.get("print_mid"), DEFAULT_RATES["print_mid"])
    else:
        price = _money(rates.get("print_over_20"), DEFAULT_RATES["print_over_20"])
    return float(round(hours * price))


def _minutes(value, fallback: int) -> int:
    try:
        number = int(float(value))
    except (TypeError, ValueError):
        return fallback
    if number < 0:
        return 0
    if number > 9999:
        return 9999
    return number


def _piece_overrides(raw) -> dict:
    from app.services.commission_sheet import PIECES

    incoming = raw.get("pieces") if isinstance(raw, dict) else None
    if isinstance(incoming, list):
        incoming = {row["id"]: row for row in incoming if isinstance(row, dict) and row.get("id")}
    if not isinstance(incoming, dict):
        incoming = {}
    cleaned = {}
    for piece in PIECES:
        source = incoming.get(piece.piece_id)
        if not isinstance(source, dict):
            source = {}
        cleaned[piece.piece_id] = {
            "name": piece.name,
            "mount_minutes": _minutes(source.get("mount_minutes"), piece.mount_minutes),
            "arm_minutes": _minutes(source.get("arm_minutes"), piece.arm_minutes),
            "weld_minutes": _minutes(source.get("weld_minutes"), piece.weld_minutes),
            "finish_minutes": _minutes(source.get("finish_minutes"), piece.finish_minutes),
        }
    return cleaned


def merge_rates(incoming) -> dict:
    raw = incoming if isinstance(incoming, dict) else {}
    merged = {
        "efficiency": sheet_efficiency(raw.get("efficiency")),
        "weekly_pay": _money(raw.get("weekly_pay"), DEFAULT_RATES["weekly_pay"]),
        "weekly_hours": _positive(raw.get("weekly_hours"), DEFAULT_RATES["weekly_hours"]),
        "holiday_days": _money(raw.get("holiday_days"), DEFAULT_RATES["holiday_days"]),
        "margin": _margin(raw.get("margin", DEFAULT_RATES["margin"])),
        "plastix_price": _money(raw.get("plastix_price"), DEFAULT_RATES["plastix_price"]),
        "plastix_cm": _positive(raw.get("plastix_cm"), DEFAULT_RATES["plastix_cm"]),
        "design_amounts": _trio(raw.get("design_amounts"), DEFAULT_RATES["design_amounts"]),
        "design_multipliers": _trio(raw.get("design_multipliers"), DEFAULT_RATES["design_multipliers"]),
        "print_under_10": _money(raw.get("print_under_10"), DEFAULT_RATES["print_under_10"]),
        "print_mid": _money(raw.get("print_mid"), DEFAULT_RATES["print_mid"]),
        "print_over_20": _money(raw.get("print_over_20"), DEFAULT_RATES["print_over_20"]),
        "print_hours": _money(raw.get("print_hours"), 0),
        "pieces": _piece_overrides(raw),
    }
    if merged["weekly_pay"] <= 0:
        merged["weekly_pay"] = DEFAULT_RATES["weekly_pay"]
    return merged


def calculator_view(rates: dict) -> dict:
    price = float(rates.get("plastix_price") or 0)
    width = float(rates.get("plastix_cm") or 0)
    return {
        "efficiency": rates.get("efficiency"),
        "margin": rates.get("margin"),
        "plastix_price": price,
        "plastix_cm": width,
        "plastix_per_cm": round(price / width, 4) if width else 0.0,
    }


def present_rates(rates: dict) -> dict:
    shown = dict(rates)
    shown["hourly"] = round(hourly_rate(rates), 4)
    shown["print_quote"] = print_quote(rates)
    shown["pieces"] = [
        {"id": piece_id, **fields}
        for piece_id, fields in rates.get("pieces", {}).items()
    ]
    return shown


def fixed_rates() -> dict:
    return merge_rates({})


def read_rates(db) -> dict:
    try:
        result = db.table("workshop_tariff").select("rates").eq("id", 1).limit(1).execute()
    except Exception:
        return merge_rates(DEFAULT_RATES)
    rows = result.data or []
    stored = rows[0].get("rates") if rows else {}
    return merge_rates(stored)


def remember_change(db, change: dict) -> bool:
    previous = round(float(change["previous"]), 4)
    nxt = round(float(change["next"]), 4)
    if previous == nxt:
        return True
    row = {
        "kind": change["kind"],
        "previous_value": previous,
        "next_value": nxt,
    }
    if change.get("mechanic_id"):
        row["mechanic_id"] = str(change["mechanic_id"])
    try:
        db.table("rate_changes").insert(row).execute()
    except Exception:
        return False
    return True


def list_changes(db, query: dict) -> list:
    try:
        request = (
            db.table("rate_changes")
            .select("id, kind, mechanic_id, previous_value, next_value, changed_at")
            .eq("kind", query["kind"])
            .order("changed_at", desc=True)
            .limit(20)
        )
        if query.get("mechanic_id"):
            request = request.eq("mechanic_id", str(query["mechanic_id"]))
        return request.execute().data or []
    except Exception:
        return []


def write_rates(db, incoming) -> dict:
    merged = merge_rates(incoming)
    db.table("workshop_tariff").upsert({"id": 1, "rates": merged}).execute()
    return merged
