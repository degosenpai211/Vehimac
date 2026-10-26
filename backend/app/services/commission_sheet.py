from dataclasses import dataclass

from app.services.tariff import DEFAULT_EFFICIENCY, clamp_efficiency, hour_for, hourly_rate, pay_profile

OTHER_PIECE_ID = "otra"
NOTE_LIMIT = 120
NAME_LIMIT = 80
MAX_QUANTITY = 9999
WEEKLY_PAY = 850
WEEKLY_HOURS = 44
AGUINALDO_PER_HOUR = 1.71477343265053
LABOR_EFFICIENCY = DEFAULT_EFFICIENCY
PAY_TASKS = ("mount", "arm", "weld", "finish")
ADMIN_HELP_MULTIPLIER = 1.25

_COUNT_FIELDS = ("mount_count", "arm_count", "weld_cm", "finish_cm")
_NAME_FIELDS = ("mount_technician", "arm_technician", "custom_technician")


@dataclass(frozen=True)
class CommissionPiece:
    piece_id: str
    name: str
    mount_minutes: int
    arm_minutes: int
    weld_minutes: int
    finish_minutes: int


# Minutos de la hoja 2. La cantidad de cada OT se anota aparte.
PIECES: tuple[CommissionPiece, ...] = (
    CommissionPiece("acc_internos", "Accesorios internos", 20, 20, 3, 7),
    CommissionPiece("tapices_puertas", "Tapices puertas", 20, 20, 3, 7),
    CommissionPiece("jaladores_asiento", "Jaladores de asiento", 20, 0, 6, 7),
    CommissionPiece("laterales_asientos", "Laterales de asientos", 40, 0, 3, 7),
    CommissionPiece("consolas", "Consolas", 90, 30, 3, 7),
    CommissionPiece("airbag_volante", "Airbag volante", 30, 30, 3, 7),
    CommissionPiece("airbag_pasajero", "Airbag pasajero", 60, 20, 3, 7),
    CommissionPiece("torpedo", "Torpedo", 180, 0, 3, 7),
    CommissionPiece("espejos", "Espejos", 20, 60, 0, 10),
    CommissionPiece("jaladores_ext", "Jaladores ext.", 40, 20, 60, 20),
    CommissionPiece("jaladores_int", "Jaladores int.", 20, 20, 45, 20),
    CommissionPiece("chapas", "Chapas", 60, 60, 120, 0),
    CommissionPiece("parachoques", "Parachoques", 60, 40, 3, 7),
    CommissionPiece("faroles", "Faroles", 80, 120, 90, 120),
    CommissionPiece("tanques", "Tanques", 240, 20, 20, 5),
    CommissionPiece("agarraderas", "Par agarraderas", 20, 0, 10, 170),
    CommissionPiece("pico_tanque", "Pico de tanque", 240, 20, 45, 10),
    CommissionPiece("acc_motor", "Accesorios de motor", 20, 20, 5, 7),
)

_BY_ID = {piece.piece_id: piece for piece in PIECES}


def commission_catalog() -> list[dict]:
    return [
        {
            "id": piece.piece_id,
            "name": piece.name,
            "mount_minutes": piece.mount_minutes,
            "arm_minutes": piece.arm_minutes,
            "weld_minutes": piece.weld_minutes,
            "finish_minutes": piece.finish_minutes,
        }
        for piece in PIECES
    ]


def empty_commission() -> dict:
    return {
        "piece_id": "",
        "mount_count": 0.0,
        "arm_count": 0.0,
        "weld_cm": 0.0,
        "finish_cm": 0.0,
        "mount_technician": "",
        "arm_technician": "",
        "custom_amount": 0.0,
        "custom_note": "",
        "custom_technician": "",
        "paint_amount": 0.0,
        "design_size": 0.0,
        "admin_help": False,
    }


def _quantity(value) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return 0.0
    if number < 0:
        return 0.0
    if number > MAX_QUANTITY:
        return float(MAX_QUANTITY)
    return round(number, 2)


def _name(value) -> str:
    return str(value or "").strip()[:NAME_LIMIT]


def piece_minutes(piece_id: str, task: str, rates: dict | None = None) -> int:
    piece = _BY_ID.get(piece_id)
    if piece is None or task not in PAY_TASKS:
        return 0
    stored = (rates or {}).get("pieces") or {}
    custom = stored.get(piece_id) if isinstance(stored, dict) else None
    if isinstance(custom, dict):
        key = f"{task}_minutes"
        if key in custom:
            try:
                return max(0, int(float(custom[key])))
            except (TypeError, ValueError):
                return 0
    return {
        "mount": piece.mount_minutes,
        "arm": piece.arm_minutes,
        "weld": piece.weld_minutes,
        "finish": piece.finish_minutes,
    }[task]


def labor_pay(work: dict) -> float:
    minutes = float(work.get("minutes") or 0)
    quantity = float(work.get("quantity") or 0)
    efficiency = clamp_efficiency(work.get("efficiency", LABOR_EFFICIENCY))
    hourly = work.get("hourly")
    if hourly is None:
        hourly = hourly_rate({
            "weekly_pay": WEEKLY_PAY,
            "weekly_hours": WEEKLY_HOURS,
            "holiday_days": 17.5,
        })
    if minutes <= 0 or quantity <= 0:
        return 0.0
    amount = quantity * (minutes / efficiency) * float(hourly) / 60
    return round(amount, 2)


def task_pay(piece_id: str, job: dict) -> float:
    task = job.get("task")
    return labor_pay({
        "minutes": piece_minutes(piece_id, task, job.get("rates")),
        "quantity": job.get("quantity"),
        "efficiency": job.get("efficiency", LABOR_EFFICIENCY),
        "hourly": job.get("hourly"),
    })


def _admin_help(value) -> bool:
    return value is True


def _with_admin_price(figures: dict, enabled: bool) -> dict:
    base = float(figures["quote"]["total"])
    figures["quote"]["piece_total"] = base
    figures["quote"]["admin_help"] = enabled
    figures["quote"]["admin_multiplier"] = ADMIN_HELP_MULTIPLIER if enabled else 1.0
    if not enabled:
        figures["quote"]["increase"] = 0.0
        return figures
    raised = float(round(base * ADMIN_HELP_MULTIPLIER))
    figures["quote"]["total"] = raised
    figures["quote"]["increase"] = float(round(raised - base))
    return figures


def normalize_commission(raw) -> dict:
    cleaned = empty_commission()
    if not isinstance(raw, dict):
        return cleaned
    cleaned["admin_help"] = _admin_help(raw.get("admin_help"))
    piece_id = str(raw.get("piece_id") or "").strip()
    if piece_id == OTHER_PIECE_ID:
        cleaned["piece_id"] = OTHER_PIECE_ID
        cleaned["custom_amount"] = _quantity(raw.get("custom_amount"))
        cleaned["custom_note"] = str(raw.get("custom_note") or "").strip()[:NOTE_LIMIT]
        cleaned["custom_technician"] = _name(raw.get("custom_technician"))
        return cleaned
    if piece_id not in _BY_ID:
        return cleaned
    cleaned["piece_id"] = piece_id
    for field in _COUNT_FIELDS:
        cleaned[field] = _quantity(raw.get(field))
    for field in ("mount_technician", "arm_technician"):
        cleaned[field] = _name(raw.get(field))
    cleaned["paint_amount"] = _quantity(raw.get("paint_amount"))
    cleaned["design_size"] = min(_quantity(raw.get("design_size")), 3)
    return cleaned


def _step_name(steps, step_id: str) -> str:
    for step in steps or []:
        if isinstance(step, dict) and step.get("id") == step_id:
            return str(step.get("technician") or "")
    return ""


def _design_charge(size: float, rates: dict) -> dict:
    amounts = rates.get("design_amounts") or [250, 300, 350]
    multipliers = rates.get("design_multipliers") or [1, 1.2, 1.4]
    if size <= 0:
        return {"amount": 0.0, "multiplier": 1.0}
    if size < 1:
        return {"amount": float(round(size * float(amounts[0]))), "multiplier": 1.0}
    index = max(0, min(int(size), 3) - 1)
    return {"amount": float(round(amounts[index])), "multiplier": float(multipliers[index])}


def _blank_figures() -> dict:
    return {
        "pay": {"mount": 0.0, "arm": 0.0, "weld": 0.0, "finish": 0.0, "other": 0.0, "total": 0.0},
        "allowed": {"mount": 0.0, "arm": 0.0, "weld": 0.0, "finish": 0.0},
        "quote": {
            "mount": 0.0, "arm": 0.0, "weld": 0.0, "finish": 0.0,
            "paint": 0.0, "design": 0.0, "multiplier": 1.0, "total": 0.0,
        },
        "efficiencies": {},
    }


def _rates_of(context: dict) -> dict:
    from app.services.tariff import merge_rates

    return merge_rates(context.get("rates") or {})


def commission_figures(raw, context: dict) -> dict:
    cleaned = normalize_commission(raw)
    figures = _blank_figures()
    rates = _rates_of(context)
    hourly = hourly_rate(rates)
    people = context.get("people") or []
    steps = context.get("steps") or []
    if cleaned["piece_id"] == OTHER_PIECE_ID:
        figures["pay"]["other"] = cleaned["custom_amount"]
        figures["pay"]["total"] = cleaned["custom_amount"]
        figures["quote"]["total"] = cleaned["custom_amount"]
        return _with_admin_price(figures, cleaned["admin_help"])
    if not cleaned["piece_id"]:
        return _with_admin_price(figures, cleaned["admin_help"])
    names = {
        "mount": cleaned["mount_technician"],
        "arm": cleaned["arm_technician"],
        "weld": _step_name(steps, "soldadura"),
        "finish": _step_name(steps, "afinado"),
    }
    amounts = {
        "mount": cleaned["mount_count"],
        "arm": cleaned["arm_count"],
        "weld": cleaned["weld_cm"],
        "finish": cleaned["finish_cm"],
    }
    quantities = {
        "mount": 1.0 if cleaned["mount_count"] > 0 else 0.0,
        "arm": 1.0 if cleaned["arm_count"] > 0 else 0.0,
        "weld": cleaned["weld_cm"],
        "finish": cleaned["finish_cm"],
    }
    plastix = float(rates["plastix_price"]) / float(rates["plastix_cm"])
    divisor = 1 - float(rates["margin"])
    for task, quantity in quantities.items():
        minutes = piece_minutes(cleaned["piece_id"], task, rates)
        profile = pay_profile(names[task], people) if names[task] else None
        efficiency = profile["efficiency"] if profile else LABOR_EFFICIENCY
        task_hour = hour_for(profile, rates) if profile else hourly
        figures["efficiencies"][task] = efficiency
        if minutes <= 0 or quantity <= 0:
            continue
        figures["allowed"][task] = round(quantity * minutes / efficiency, 2)
        unit = labor_pay({
            "minutes": minutes, "quantity": 1, "efficiency": efficiency, "hourly": task_hour,
        })
        if names[task]:
            figures["pay"][task] = labor_pay({
                "minutes": minutes, "quantity": quantity, "efficiency": efficiency, "hourly": task_hour,
            })
        if task in ("mount", "arm"):
            figures["quote"][task] = float(round(amounts[task]))
            continue
        material = plastix if task == "weld" else 0.0
        if amounts[task] > 0 and divisor > 0:
            figures["quote"][task] = float(round((unit + material) / divisor * amounts[task]))
    figures["quote"]["paint"] = float(round(cleaned["paint_amount"]))
    design = _design_charge(cleaned["design_size"], rates)
    figures["quote"]["design"] = design["amount"]
    figures["quote"]["multiplier"] = design["multiplier"]
    base = sum(figures["quote"][key] for key in ("mount", "arm", "weld", "finish", "paint"))
    figures["quote"]["total"] = float(round(base * design["multiplier"] + design["amount"]))
    figures["pay"]["total"] = round(sum(figures["pay"][key] for key in ("mount", "arm", "weld", "finish", "other")), 2)
    return _with_admin_price(figures, cleaned["admin_help"])


def stamp_commission(raw, context: dict) -> dict:
    cleaned = normalize_commission(raw)
    if not cleaned["piece_id"]:
        return cleaned
    cleaned["applied"] = commission_figures(cleaned, context)
    return cleaned
