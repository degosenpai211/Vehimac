"""Reglas puras de OT: búsqueda, periodos y resumen de piezas. Sin I/O."""

from datetime import date, timedelta
from decimal import Decimal

from app.schemas.work_order import BillingType, OrderItemCreate, WorkOrderStatus
from app.utils.search import sanitize_search  # noqa: F401

OT_NUMBER_PREFIX = "OT"
DEFAULT_BILLING_TYPE = BillingType.sin_factura.value
DEFAULT_WORK_DESCRIPTION = "Orden"

PERIOD_ALL = "all"
PERIOD_TODAY = "today"
PERIOD_WEEK = "week"
PERIOD_OVERDUE = "overdue"
PERIOD_DUE_TODAY = "due_today"
PERIOD_TOMORROW = "tomorrow"
PERIOD_DAY_AFTER = "day_after"
PERIOD_NEXT_WEEK = "next_week"
AGENDA_PERIODS = frozenset({
    PERIOD_DUE_TODAY,
    PERIOD_TOMORROW,
    PERIOD_DAY_AFTER,
    PERIOD_NEXT_WEEK,
})
ORDER_PERIOD_DESCRIPTION = " | ".join((
    PERIOD_TODAY,
    PERIOD_WEEK,
    PERIOD_OVERDUE,
    PERIOD_ALL,
    PERIOD_DUE_TODAY,
    PERIOD_TOMORROW,
    PERIOD_DAY_AFTER,
    PERIOD_NEXT_WEEK,
))

WEEK_LAST_DAY_OFFSET = 6
TOMORROW_OFFSET_DAYS = 1
DAY_AFTER_OFFSET_DAYS = 2
DAYS_IN_WEEK = 7

STATUS_ENTREGADO = WorkOrderStatus.entregado.value
DATE_ISO_LENGTH = 10


def as_order_date(value: date | str | None) -> date | None:
    if isinstance(value, str):
        return date.fromisoformat(value[:DATE_ISO_LENGTH]) if value else None
    return value


def _matches_today(entry: date | None, delivery: date | None, today: date) -> bool:
    if delivery == today:
        return True
    if entry and delivery:
        return entry <= today <= delivery
    return entry == today


def _matches_week(entry: date | None, delivery: date | None, today: date) -> bool:
    start = today - timedelta(days=today.weekday())
    end = start + timedelta(days=WEEK_LAST_DAY_OFFSET)
    if delivery and start <= delivery <= end:
        return True
    if entry and start <= entry <= end:
        return True
    if entry and delivery:
        return entry <= end and delivery >= start
    return False


def _matches_overdue(status: str | None, delivery: date | None, today: date) -> bool:
    if status == STATUS_ENTREGADO:
        return False
    return bool(delivery and delivery < today)


def _next_week_range(today: date) -> tuple[date, date]:
    days_until_monday = (DAYS_IN_WEEK - today.weekday()) or DAYS_IN_WEEK
    start = today + timedelta(days=days_until_monday)
    return start, start + timedelta(days=WEEK_LAST_DAY_OFFSET)


def _matches_agenda(status: str | None, delivery: date | None, period: str, today: date) -> bool:
    if status == STATUS_ENTREGADO or not delivery:
        return False
    if period == PERIOD_DUE_TODAY:
        return delivery == today
    if period == PERIOD_TOMORROW:
        return delivery == today + timedelta(days=TOMORROW_OFFSET_DAYS)
    if period == PERIOD_DAY_AFTER:
        return delivery == today + timedelta(days=DAY_AFTER_OFFSET_DAYS)
    start, end = _next_week_range(today)
    return start <= delivery <= end


def matches_period(order: dict, period: str | None) -> bool:
    if not period or period == PERIOD_ALL:
        return True
    today = date.today()
    entry = as_order_date(order.get("entry_date"))
    delivery = as_order_date(order.get("estimated_delivery_date"))
    status = order.get("status")
    if period == PERIOD_TODAY:
        return _matches_today(entry, delivery, today)
    if period == PERIOD_WEEK:
        return _matches_week(entry, delivery, today)
    if period == PERIOD_OVERDUE:
        return _matches_overdue(status, delivery, today)
    if period in AGENDA_PERIODS:
        return _matches_agenda(status, delivery, period, today)
    return True


def _piece_value(piece: OrderItemCreate | dict, field: str, default=None):
    if isinstance(piece, dict):
        return piece.get(field, default)
    return getattr(piece, field)


def piece_as_summary(piece: OrderItemCreate | dict) -> dict:
    if isinstance(piece, dict):
        return {
            "work_description": piece.get("description", DEFAULT_WORK_DESCRIPTION),
            "part_description": piece.get("part_name"),
            "mechanic": piece.get("mechanic"),
            "designer": piece.get("designer"),
        }
    return {
        "work_description": piece.description,
        "part_description": piece.part_name,
        "mechanic": piece.mechanic,
        "designer": piece.designer,
    }


def summary_from_pieces(pieces: list) -> dict:
    total = sum(Decimal(str(_piece_value(piece, "amount", 0))) for piece in pieces)
    return {**piece_as_summary(pieces[0]), "price_charged": float(total)}
