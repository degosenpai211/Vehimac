from datetime import datetime, date

from app.services.commission_sheet import OTHER_PIECE_ID, normalize_commission, piece_minutes, task_pay
from app.services.salary import technician_matches
from app.services.tariff import hour_for, merge_rates, pay_profile
from app.utils.dates import bolivia_day

DELIVERED = ("entregado", "finalizado")


def _day(value) -> str:
    raw = str(value or "")[:10]
    return raw if len(raw) == 10 else ""


def _money(value) -> float:
    try:
        amount = float(value or 0)
    except (TypeError, ValueError):
        return 0.0
    return round(amount, 2)


def _order_price(order: dict) -> float:
    total = _money(order.get("total_amount"))
    if total > 0:
        return total
    return _money(order.get("price_charged"))


def _clock(value) -> str:
    raw = str(value or "").strip()
    if len(raw) < 16 or raw[10:11] != "T":
        return ""
    return raw[:16]


def _steps_for(items: list[dict], name: str) -> list[dict]:
    found = []
    for item in items:
        process = item.get("process") or {}
        if not isinstance(process, dict):
            continue
        part = (item.get("part_name") or item.get("description") or "").strip()
        part_amount = _money(item.get("amount"))
        closed = bolivia_day(process.get("delivered_at"))
        for step in process.get("steps") or []:
            if not isinstance(step, dict) or not technician_matches(step.get("technician"), name):
                continue
            status = step.get("status") or "en_proceso"
            if status not in ("pendiente", "en_proceso", "completado"):
                status = "en_proceso"
            found.append({
                "id": step.get("id") or "",
                "item_id": str(item.get("id") or ""),
                "order_id": str(item.get("work_order_id") or ""),
                "part_name": part,
                "part_amount": part_amount,
                "status": status,
                "assigned_on": _day(step.get("assigned_at")),
                "assigned_at": _clock(step.get("assigned_at")),
                "completed_at": _clock(step.get("completed_at")),
                "closed_on": closed if status == "completado" else "",
            })
    return found


def _named_on_commission(items: list[dict], name: str) -> bool:
    for item in items:
        process = item.get("process") or {}
        if not isinstance(process, dict):
            continue
        commission = normalize_commission(process.get("commission"))
        if technician_matches(commission["mount_technician"], name):
            return True
        if technician_matches(commission["arm_technician"], name):
            return True
        if technician_matches(commission["custom_technician"], name):
            return True
    return False


def _on_order(order: dict, items: list[dict], name: str) -> bool:
    if technician_matches(order.get("mechanic"), name) or technician_matches(order.get("designer"), name):
        return True
    for item in items:
        if technician_matches(item.get("mechanic"), name) or technician_matches(item.get("designer"), name):
            return True
    if _named_on_commission(items, name):
        return True
    return bool(_steps_for(items, name))


def _assigned_on(steps: list[dict]) -> str:
    dates = [step["assigned_on"] for step in steps if step.get("assigned_on")]
    return min(dates) if dates else ""


def _assigned_at(steps: list[dict]) -> str:
    clocks = [step["assigned_at"] for step in steps if step.get("assigned_at")]
    return min(clocks) if clocks else ""


def _finished_on(order: dict) -> str:
    if order.get("status") not in DELIVERED:
        return ""
    return bolivia_day(order.get("updated_at"))


def _overdue(order: dict, today: date) -> bool:
    if order.get("status") in DELIVERED:
        return False
    raw = str(order.get("estimated_delivery_date") or "")[:10]
    if len(raw) != 10:
        return False
    try:
        due = date.fromisoformat(raw)
    except ValueError:
        return False
    return due < today


def _step_technician(process: dict, step_id: str) -> str:
    for step in process.get("steps") or []:
        if isinstance(step, dict) and step.get("id") == step_id:
            return str(step.get("technician") or "")
    return ""


def _empty_pay() -> dict:
    return {"mount": 0.0, "arm": 0.0, "weld": 0.0, "finish": 0.0, "other": 0.0, "total": 0.0}


def _saved_block(raw, key: str) -> dict | None:
    if not isinstance(raw, dict):
        return None
    applied = raw.get("applied")
    if not isinstance(applied, dict):
        return None
    block = applied.get(key)
    return block if isinstance(block, dict) else None


def _once(amount: float) -> float:
    return 1.0 if amount > 0 else 0.0


def _add_pay(totals: dict, earned: dict) -> None:
    totals[earned["task"]] += task_pay(earned["piece_id"], earned)


def _add_saved(totals: dict, task: str, saved: dict) -> None:
    try:
        totals[task] += float(saved.get(task) or 0)
    except (TypeError, ValueError):
        return


def _pay_for(items: list[dict], rate: dict) -> dict:
    name = rate["name"]
    efficiency = rate["efficiency"]
    hourly = rate.get("hourly")
    totals = _empty_pay()
    for item in items:
        process = item.get("process") or {}
        if not isinstance(process, dict):
            continue
        raw = process.get("commission")
        commission = normalize_commission(raw)
        saved = _saved_block(raw, "pay")
        piece_id = commission["piece_id"]
        if piece_id == OTHER_PIECE_ID:
            if technician_matches(commission["custom_technician"], name):
                amount = saved.get("other") if saved else commission["custom_amount"]
                totals["other"] += float(amount or 0)
            continue
        if not piece_id:
            continue
        if technician_matches(commission["mount_technician"], name):
            if saved:
                _add_saved(totals, "mount", saved)
            else:
                _add_pay(totals, {"piece_id": piece_id, "task": "mount", "quantity": _once(commission["mount_count"]), "efficiency": efficiency, "hourly": hourly})
        if technician_matches(commission["arm_technician"], name):
            if saved:
                _add_saved(totals, "arm", saved)
            else:
                _add_pay(totals, {"piece_id": piece_id, "task": "arm", "quantity": _once(commission["arm_count"]), "efficiency": efficiency, "hourly": hourly})
        if technician_matches(_step_technician(process, "soldadura"), name):
            if saved:
                _add_saved(totals, "weld", saved)
            else:
                _add_pay(totals, {"piece_id": piece_id, "task": "weld", "quantity": commission["weld_cm"], "efficiency": efficiency, "hourly": hourly})
        if technician_matches(_step_technician(process, "afinado"), name):
            if saved:
                _add_saved(totals, "finish", saved)
            else:
                _add_pay(totals, {"piece_id": piece_id, "task": "finish", "quantity": commission["finish_cm"], "efficiency": efficiency, "hourly": hourly})
    for key in ("mount", "arm", "weld", "finish", "other"):
        totals[key] = round(totals[key], 2)
    totals["total"] = round(sum(totals[key] for key in ("mount", "arm", "weld", "finish", "other")), 2)
    return totals


def _span_minutes(start, end) -> float | None:
    start_text = str(start or "")
    end_text = str(end or "")
    if len(start_text) < 16 or len(end_text) < 16 or "T" not in start_text or "T" not in end_text:
        return None
    try:
        began = datetime.fromisoformat(start_text[:16])
        ended = datetime.fromisoformat(end_text[:16])
    except ValueError:
        return None
    minutes = (ended - began).total_seconds() / 60
    if minutes < 0:
        return None
    return round(minutes, 1)


def _empty_time() -> dict:
    return {
        task: {"allowed": 0.0, "actual": 0.0, "open": 0}
        for task in ("mount", "arm", "weld", "finish")
    }


def _bump_time(totals: dict, task: str, allowed: float, actual: float | None) -> None:
    totals[task]["allowed"] = round(totals[task]["allowed"] + allowed, 2)
    if actual is None:
        if allowed > 0:
            totals[task]["open"] += 1
        return
    totals[task]["actual"] = round(totals[task]["actual"] + actual, 1)


def _time_for(items: list[dict], name: str, efficiency: float) -> dict:
    totals = _empty_time()
    for item in items:
        process = item.get("process") or {}
        if not isinstance(process, dict):
            continue
        raw = process.get("commission")
        commission = normalize_commission(raw)
        saved = _saved_block(raw, "allowed")
        piece_id = commission["piece_id"]
        if not piece_id or piece_id == OTHER_PIECE_ID:
            continue
        jobs = (
            ("mount", commission["mount_technician"], _once(commission["mount_count"]), None),
            ("arm", commission["arm_technician"], _once(commission["arm_count"]), None),
            ("weld", _step_technician(process, "soldadura"), commission["weld_cm"], "soldadura"),
            ("finish", _step_technician(process, "afinado"), commission["finish_cm"], "afinado"),
        )
        for task, owner, quantity, step_id in jobs:
            if not technician_matches(owner, name) or quantity <= 0:
                continue
            if saved is not None:
                try:
                    allowed = float(saved.get(task) or 0)
                except (TypeError, ValueError):
                    allowed = 0.0
            else:
                minutes = piece_minutes(piece_id, task)
                allowed = round(quantity * minutes / efficiency, 2) if minutes else 0.0
            actual = None
            if step_id:
                for step in process.get("steps") or []:
                    if isinstance(step, dict) and step.get("id") == step_id:
                        actual = _span_minutes(step.get("assigned_at"), step.get("completed_at"))
            _bump_time(totals, task, allowed, actual)
    return totals


def _items_by_order(items: list) -> dict[str, list]:
    grouped: dict[str, list] = {}
    for item in items or []:
        grouped.setdefault(str(item.get("work_order_id") or ""), []).append(item)
    return grouped


def _has_technician(items: list[dict]) -> bool:
    for item in items:
        process = item.get("process") or {}
        if not isinstance(process, dict):
            continue
        for step in process.get("steps") or []:
            if isinstance(step, dict) and str(step.get("technician") or "").strip():
                return True
    return False


STEP_IDS = ("diseno", "soldadura", "afinado", "pintura", "instalacion")


def _missing_steps(items: list[dict]) -> list[dict]:
    pieces = []
    source = items or [{}]
    for item in source:
        process = item.get("process") or {}
        named = set()
        if isinstance(process, dict):
            for step in process.get("steps") or []:
                if isinstance(step, dict) and str(step.get("technician") or "").strip():
                    named.add(step.get("id"))
        missing = [step_id for step_id in STEP_IDS if step_id not in named]
        if not missing:
            continue
        part = (item.get("part_name") or item.get("description") or "").strip()
        pieces.append({"part_name": part, "missing": missing})
    return pieces


def unassigned_orders(source: dict) -> list[dict]:
    grouped = _items_by_order(source.get("items"))
    rows = []
    for order in source.get("orders") or []:
        if order.get("status") in DELIVERED:
            continue
        oid = str(order.get("id") or "")
        if _has_technician(grouped.get(oid, [])):
            continue
        client = order.get("clients") or {}
        client_name = client.get("name") if isinstance(client, dict) else ""
        rows.append({
            "id": oid,
            "ot_number": order.get("ot_number"),
            "client_name": client_name or "",
            "work_description": order.get("work_description") or "",
            "pieces": _missing_steps(grouped.get(oid, [])),
        })
    rows.sort(key=lambda row: row.get("ot_number") or 0, reverse=True)
    return rows


def build_workload(source: dict, today: date) -> list[dict]:
    grouped = _items_by_order(source.get("items"))
    rows = []
    for person in source.get("people") or []:
        if (person.get("role") or "mechanic") == "admin":
            continue
        name = (person.get("name") or "").strip()
        if not name:
            continue
        profile = pay_profile(name, source.get("people") or [])
        efficiency = profile["efficiency"]
        hourly = hour_for(profile, merge_rates(source.get("rates") or {}))
        orders = []
        for order in source.get("orders") or []:
            oid = str(order.get("id") or "")
            pieces = grouped.get(oid, [])
            if not _on_order(order, pieces, name):
                continue
            steps = _steps_for(pieces, name)
            client = order.get("clients") or {}
            client_name = client.get("name") if isinstance(client, dict) else ""
            late = _overdue(order, today)
            status = order.get("status") or "en_proceso"
            orders.append({
                "id": oid,
                "ot_number": order.get("ot_number"),
                "client_name": client_name or "",
                "work_description": order.get("work_description") or "",
                "price": _order_price(order),
                "status": "entregado" if status == "finalizado" else status,
                "assigned_on": _assigned_on(steps),
                "assigned_at": _assigned_at(steps),
                "entry_on": _day(order.get("entry_date")),
                "finished_on": _finished_on(order),
                "estimated_delivery_date": _day(order.get("estimated_delivery_date")),
                "overdue": late,
                "steps": steps,
                "pay": _pay_for(pieces, {"name": name, "efficiency": efficiency, "hourly": hourly}),
                "time": _time_for(pieces, name, efficiency),
            })
        orders.sort(key=lambda row: row.get("ot_number") or 0, reverse=True)
        delivered = sum(1 for row in orders if row["status"] == "entregado")
        overdue = sum(1 for row in orders if row["overdue"])
        rows.append({
            "id": str(person.get("id") or ""),
            "name": name,
            "role": person.get("role") or "mechanic",
            "labor_efficiency": efficiency,
            "weekly_pay": profile["weekly"],
            "hourly_with_bonus": round(hourly, 2),
            "salary_base": profile["salary_base"],
            "salary_period": profile["salary_period"],
            "total": len(orders),
            "open": len(orders) - delivered,
            "overdue": overdue,
            "delivered": delivered,
            "orders": orders,
        })
    rows.sort(key=lambda row: row["name"].lower())
    return rows


def _public_steps(process) -> list[dict]:
    found = []
    if not isinstance(process, dict):
        return found
    for step in process.get("steps") or []:
        if not isinstance(step, dict):
            continue
        found.append({
            "id": step.get("id") or "",
            "technician": str(step.get("technician") or ""),
            "status": step.get("status") or "pendiente",
            "assigned_at": _clock(step.get("assigned_at")),
            "completed_at": _clock(step.get("completed_at")),
        })
    return found


def open_orders(source: dict) -> list[dict]:
    grouped = _items_by_order(source.get("items"))
    rows = []
    for order in source.get("orders") or []:
        if order.get("status") in DELIVERED:
            continue
        oid = str(order.get("id") or "")
        client = order.get("clients") or {}
        client_name = client.get("name") if isinstance(client, dict) else ""
        pieces = []
        for item in grouped.get(oid, []):
            part = (item.get("part_name") or item.get("description") or "").strip()
            pieces.append({
                "id": str(item.get("id") or ""),
                "part_name": part or "Pieza",
                "steps": _public_steps(item.get("process")),
            })
        rows.append({
            "id": oid,
            "ot_number": order.get("ot_number"),
            "client_name": client_name or "",
            "pieces": pieces,
        })
    rows.sort(key=lambda row: row.get("ot_number") or 0, reverse=True)
    return rows
