from calendar import monthrange
from datetime import date, timedelta
from decimal import Decimal

GROUPS = [
    {"id": "ingresos", "label": "Ingresos"},
    {"id": "directos", "label": "Costos directos"},
    {"id": "indirectos", "label": "Costos indirectos"},
]

CATALOG = [
    {"id": "servicios", "label": "Ingresos por servicios", "group": "ingresos", "kind": "ingreso", "source": "auto"},
    {"id": "otros_ingresos", "label": "Otros ingresos", "group": "ingresos", "kind": "ingreso", "source": "manual"},
    {"id": "filamentos", "label": "Filamentos", "group": "directos", "kind": "gasto", "source": "manual"},
    {"id": "plastic_27", "label": "Plastic 27", "group": "directos", "kind": "gasto", "source": "qr"},
    {"id": "insumos", "label": "Insumos varios", "group": "indirectos", "kind": "gasto", "source": "manual"},
    {"id": "sueldos", "label": "Sueldos y salarios", "group": "indirectos", "kind": "gasto", "source": "auto"},
    {"id": "alquiler_1", "label": "Alquiler 1", "group": "indirectos", "kind": "gasto", "source": "rent"},
    {"id": "alquiler_2", "label": "Alquiler 2", "group": "indirectos", "kind": "gasto", "source": "rent"},
    {"id": "servicios_basicos", "label": "Servicios básicos", "group": "indirectos", "kind": "gasto", "source": "manual"},
    {"id": "oficina", "label": "Material de escritorio y oficina", "group": "indirectos", "kind": "gasto", "source": "manual"},
    {"id": "marketing", "label": "Marketing y publicidad", "group": "indirectos", "kind": "gasto", "source": "manual"},
    {"id": "comisiones", "label": "Comisiones", "group": "indirectos", "kind": "gasto", "source": "manual"},
    {"id": "mantenimiento", "label": "Mantenimiento de equipos", "group": "indirectos", "kind": "gasto", "source": "manual"},
    {"id": "herramientas", "label": "Compra de herramientas y equipos", "group": "indirectos", "kind": "gasto", "source": "manual"},
    {"id": "otros_varios", "label": "Otros - Varios", "group": "indirectos", "kind": "gasto", "source": "manual"},
    {"id": "otros_egresos", "label": "Otros egresos", "group": "indirectos", "kind": "gasto", "source": "manual"},
    {"id": "previsiones", "label": "Previsiones", "group": "indirectos", "kind": "gasto", "source": "manual"},
    {"id": "intereses", "label": "Intereses", "group": "indirectos", "kind": "gasto", "source": "manual"},
    {"id": "fiscales", "label": "Fiscales", "group": "indirectos", "kind": "gasto", "source": "manual"},
    {"id": "tributarios", "label": "Tributarios", "group": "indirectos", "kind": "gasto", "source": "manual"},
]

BY_ID = {c["id"]: c for c in CATALOG}
BY_LABEL = {c["label"].lower(): c["id"] for c in CATALOG}

ALIASES = {
    "adelantos": "servicios",
    "servicios": "servicios",
    "qr": "servicios",
    "salarios": "sueldos",
    "sueldos y salarios": "sueldos",
    "plastic 27": "plastic_27",
    "plastix-27": "plastic_27",
    "plastix 27": "plastic_27",
    "filamentos": "filamentos",
    "insumos varios": "insumos",
    "alquiler 1": "alquiler_1",
    "alquiler 2": "alquiler_2",
    "servicios básicos": "servicios_basicos",
    "servicios basicos": "servicios_basicos",
    "material de escritorio y oficina": "oficina",
    "marketing y publicidad": "marketing",
    "comisiones": "comisiones",
    "mantenimiento de equipos": "mantenimiento",
    "compra de herramientas y equipos": "herramientas",
    "otros - varios": "otros_varios",
    "otros ingresos": "otros_ingresos",
    "otros egresos": "otros_egresos",
    "previsiones": "previsiones",
    "intereses": "intereses",
    "fiscales": "fiscales",
    "tributarios": "tributarios",
    "ingresos por servicios": "servicios",
    "general": None,
}


def map_category(category: str | None, tipo: str | None) -> str:
    raw = (category or "").strip().lower()
    if raw in ALIASES:
        mapped = ALIASES[raw]
        if mapped:
            return mapped
        return "otros_ingresos" if tipo == "ingreso" else "otros_egresos"
    if raw in BY_LABEL:
        return BY_LABEL[raw]
    if raw in BY_ID:
        return raw
    return "otros_ingresos" if tipo == "ingreso" else "otros_egresos"


def week_bounds(today: date, offset: int) -> tuple[date, date]:
    monday = today - timedelta(days=today.weekday()) + timedelta(weeks=offset)
    sunday = monday + timedelta(days=6)
    return monday, sunday


def month_bounds(today: date, offset: int) -> tuple[date, date]:
    y, m = today.year, today.month + offset
    while m < 1:
        m += 12
        y -= 1
    while m > 12:
        m -= 12
        y += 1
    start = date(y, m, 1)
    end = date(y, m, monthrange(y, m)[1])
    return start, end


def period_label(grain: str, start: date, end: date) -> str:
    months = [
        "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
        "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
    ]
    if grain == "month":
        return f"{months[start.month - 1]} {start.year}"
    return f"{start.strftime('%d/%m')} – {end.strftime('%d/%m/%Y')}"


def money(value) -> float:
    return float(Decimal(str(value or 0)))
