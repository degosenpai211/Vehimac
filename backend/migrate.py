#!/usr/bin/env python3
"""
Script de migración de datos desde CSV (exportados desde Excel) a Supabase.

Uso:
    python migrate.py --data-dir ./datos

Archivos esperados en el directorio:
    - inventario.csv
    - pedidos.csv      (clientes)
    - trabajo.csv      (órdenes de trabajo)
    - finanzas.csv

Cada CSV debe corresponder a una pestaña del Excel original.
"""

import argparse
import re
import sys
from datetime import datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path

import pandas as pd
from dotenv import load_dotenv

load_dotenv()

from app.database import get_supabase  # noqa: E402


def normalize_text(value) -> str | None:
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return None
    text = str(value).strip()
    if not text or text.lower() in ("nan", "none", "n/a", "-", ""):
        return None
    return re.sub(r"\s+", " ", text)


def parse_date(value) -> str | None:
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return None
    if isinstance(value, datetime):
        return value.date().isoformat()
    text = str(value).strip()
    if not text or text.lower() in ("nan", "none", "-"):
        return None

    formats = [
        "%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%d/%m/%y", "%d-%m-%y",
        "%Y/%m/%d", "%m/%d/%Y", "%d.%m.%Y",
    ]
    for fmt in formats:
        try:
            return datetime.strptime(text, fmt).date().isoformat()
        except ValueError:
            continue

    try:
        parsed = pd.to_datetime(text, dayfirst=True, errors="coerce")
        if pd.notna(parsed):
            return parsed.date().isoformat()
    except Exception:
        pass
    return None


def parse_decimal(value, default: Decimal = Decimal("0")) -> Decimal:
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return default
    text = str(value).strip()
    if not text or text.lower() in ("nan", "none", "-"):
        return default
    text = text.replace("$", "").replace(" ", "")
    if "," in text and "." in text:
        text = text.replace(".", "").replace(",", ".")
    elif "," in text:
        text = text.replace(",", ".")
    try:
        return Decimal(text)
    except InvalidOperation:
        return default


def parse_int(value, default: int = 0) -> int:
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return default
    try:
        return int(float(str(value).replace(",", ".")))
    except (ValueError, TypeError):
        return default


def normalize_status(value) -> str:
    text = (normalize_text(value) or "en_proceso").lower()
    mapping = {
        "en proceso": "en_proceso",
        "en_proceso": "en_proceso",
        "proceso": "en_proceso",
        "pendiente": "en_proceso",
        "terminado": "terminado",
        "listo": "terminado",
        "entregado": "entregado",
        "finalizado": "entregado",
        "cerrado": "entregado",
    }
    return mapping.get(text, "en_proceso")


def normalize_finance_type(value) -> str:
    text = (normalize_text(value) or "gasto").lower()
    if text in ("ingreso", "ingresos", "entrada", "cobro", "venta"):
        return "ingreso"
    return "gasto"


def find_column(df: pd.DataFrame, candidates: list[str]) -> str | None:
    cols_lower = {c.lower().strip(): c for c in df.columns}
    for candidate in candidates:
        if candidate.lower() in cols_lower:
            return cols_lower[candidate.lower()]
    for col in df.columns:
        for candidate in candidates:
            if candidate.lower() in col.lower():
                return col
    return None


def load_existing_names(db, table: str, column: str = "name") -> set[str]:
    result = db.table(table).select(column).execute()
    return {(r[column] or "").lower() for r in (result.data or [])}


def clear_tables(db) -> None:
    for table in ["finances", "work_orders", "vehicles", "clients"]:
        db.table(table).delete().neq("id", "00000000-0000-0000-0000-000000000000").execute()


def migrate_products(db, filepath: Path, skip_existing: bool = True) -> tuple[int, int]:
    if not filepath.exists():
        print(f"  ⚠ No encontrado: {filepath.name}")
        return 0, 0

    existing = load_existing_names(db, "products") if skip_existing else set()
    df = pd.read_csv(filepath, encoding="utf-8-sig")
    count, skipped = 0, 0
    for _, row in df.iterrows():
        name = normalize_text(row.get(find_column(df, ["nombre", "producto", "descripcion", "name"]) or df.columns[0]))
        if not name:
            continue
        if name.lower() in existing:
            skipped += 1
            continue

        data = {
            "name": name,
            "category": normalize_text(row.get(find_column(df, ["categoria", "category", "tipo"]) or "")) or "General",
            "quantity": parse_int(row.get(find_column(df, ["cantidad", "stock", "qty", "quantity"]) or 0)),
            "unit_price": float(parse_decimal(row.get(find_column(df, ["precio", "precio unitario", "unit_price", "valor"]) or 0))),
        }
        created = parse_date(row.get(find_column(df, ["fecha", "created_at", "fecha creacion"]) or ""))
        if created:
            data["created_at"] = f"{created}T12:00:00+00:00"

        db.table("products").insert(data).execute()
        existing.add(name.lower())
        count += 1
    return count, skipped


def migrate_clients(db, filepath: Path, skip_existing: bool = True) -> tuple[dict[str, str], int]:
    """Retorna mapa nombre_cliente -> id y cantidad omitida"""
    client_map: dict[str, str] = {}
    skipped = 0
    if not filepath.exists():
        print(f"  ⚠ No encontrado: {filepath.name}")
        return client_map, skipped

    existing = load_existing_names(db, "clients") if skip_existing else set()
    all_clients = db.table("clients").select("id, name").execute()
    for c in all_clients.data or []:
        client_map[c["name"].lower()] = c["id"]

    df = pd.read_csv(filepath, encoding="utf-8-sig")
    for _, row in df.iterrows():
        name = normalize_text(row.get(find_column(df, ["nombre", "cliente", "name"]) or df.columns[0]))
        if not name:
            continue
        if name.lower() in existing:
            skipped += 1
            continue

        data = {
            "name": name,
            "phone": normalize_text(row.get(find_column(df, ["telefono", "teléfono", "phone", "contacto"]) or "")),
            "whatsapp": normalize_text(row.get(find_column(df, ["whatsapp", "wa"]) or "")),
            "balance": float(min(0, parse_decimal(row.get(find_column(df, ["adelanto", "saldo", "balance", "pending_debt", "deuda"]) or 0)))),
            "notes": normalize_text(row.get(find_column(df, ["notas", "observaciones", "notes"]) or "")),
        }
        if not data["whatsapp"] and data["phone"]:
            data["whatsapp"] = data["phone"]

        result = db.table("clients").insert(data).execute()
        if result.data:
            client_map[name.lower()] = result.data[0]["id"]
            existing.add(name.lower())

            vehicle_info = normalize_text(row.get(find_column(df, ["vehiculo", "vehículo", "auto", "vehicle"]) or ""))
            if vehicle_info:
                db.table("vehicles").insert({
                    "client_id": result.data[0]["id"],
                    "make": vehicle_info,
                }).execute()

    return client_map, skipped


def migrate_work_orders(db, filepath: Path, client_map: dict[str, str]) -> int:
    if not filepath.exists():
        print(f"  ⚠ No encontrado: {filepath.name}")
        return 0

    df = pd.read_csv(filepath, encoding="utf-8-sig")
    count = 0
    for _, row in df.iterrows():
        work_desc = normalize_text(row.get(find_column(df, ["descripcion", "descripción", "trabajo", "work_description", "detalle"]) or ""))
        if not work_desc:
            work_desc = normalize_text(row.get(find_column(df, ["pieza", "parte", "part_description"]) or ""))
        if not work_desc:
            continue

        client_name = normalize_text(row.get(find_column(df, ["cliente", "nombre", "name"]) or ""))
        client_id = client_map.get(client_name.lower()) if client_name else None

        entry = parse_date(row.get(find_column(df, ["fecha entrada", "entrada", "entry_date", "fecha"]) or ""))
        estimated = parse_date(row.get(find_column(df, ["fecha entrega", "entrega estimada", "estimated_delivery", "fecha estimada"]) or ""))

        data = {
            "client_id": client_id,
            "vehicle_type": normalize_text(row.get(find_column(df, ["tipo auto", "vehiculo", "vehículo", "vehicle_type", "auto"]) or "")),
            "part_description": normalize_text(row.get(find_column(df, ["pieza", "parte", "part_description"]) or "")),
            "work_description": work_desc,
            "price_charged": float(parse_decimal(row.get(find_column(df, ["precio", "precio cobrado", "price", "monto", "total"]) or 0))),
            "mechanic": normalize_text(row.get(find_column(df, ["mecanico", "mecánico", "mechanic", "tecnico"]) or "")),
            "status": normalize_status(row.get(find_column(df, ["estado", "status", "fase"]) or "")),
            "estimated_delivery_date": estimated,
        }
        if entry:
            data["entry_date"] = entry

        db.table("work_orders").insert(data).execute()
        count += 1
    return count


def migrate_finances(db, filepath: Path) -> int:
    if not filepath.exists():
        print(f"  ⚠ No encontrado: {filepath.name}")
        return 0

    df = pd.read_csv(filepath, encoding="utf-8-sig")
    count = 0
    for _, row in df.iterrows():
        desc = normalize_text(row.get(find_column(df, ["descripcion", "descripción", "concepto", "description", "detalle"]) or ""))
        if not desc:
            desc = normalize_text(row.get(find_column(df, ["tipo", "categoria", "category"]) or "")) or "Sin descripción"

        amount = parse_decimal(row.get(find_column(df, ["monto", "amount", "importe", "valor", "precio"]) or 0))
        if amount <= 0:
            continue

        fin_date = parse_date(row.get(find_column(df, ["fecha", "date"]) or ""))

        data = {
            "type": normalize_finance_type(row.get(find_column(df, ["tipo", "type", "movimiento"]) or "")),
            "description": desc,
            "amount": float(amount),
            "category": normalize_text(row.get(find_column(df, ["categoria", "categoría", "category", "rubro"]) or "")) or "General",
        }
        if fin_date:
            data["date"] = fin_date

        db.table("finances").insert(data).execute()
        count += 1
    return count


def main():
    parser = argparse.ArgumentParser(description="Migrar datos CSV a Supabase")
    parser.add_argument("--data-dir", type=Path, default=Path("./datos"), help="Directorio con archivos CSV")
    parser.add_argument("--dry-run", action="store_true", help="Solo validar archivos sin insertar")
    parser.add_argument("--clear", action="store_true", help="Vaciar tablas antes de migrar")
    parser.add_argument("--force", action="store_true", help="Insertar aunque existan duplicados por nombre")
    args = parser.parse_args()

    data_dir = args.data_dir
    if not data_dir.exists():
        print(f"Error: directorio no encontrado: {data_dir}")
        print("Crea el directorio y coloca los CSV exportados desde Excel.")
        sys.exit(1)

    files = {
        "inventario": data_dir / "inventario.csv",
        "pedidos": data_dir / "pedidos.csv",
        "trabajo": data_dir / "trabajo.csv",
        "finanzas": data_dir / "finanzas.csv",
    }

    print("=== Vehimac - Migración de datos ===\n")
    print(f"Directorio: {data_dir.resolve()}\n")

    for key, path in files.items():
        status = "✓" if path.exists() else "✗"
        print(f"  [{status}] {key}: {path.name}")

    if args.dry_run:
        print("\nModo dry-run: no se insertaron datos.")
        for key, path in files.items():
            if path.exists():
                df = pd.read_csv(path, encoding="utf-8-sig")
                print(f"  {key}: {len(df)} filas, columnas: {list(df.columns)}")
        return

    print("\nIniciando migración...\n")
    db = get_supabase()
    skip_existing = not args.force

    if args.clear:
        print("⚠ Vaciando tablas...")
        clear_tables(db)

    print("1. Inventario...")
    n_products, skip_p = migrate_products(db, files["inventario"], skip_existing)
    print(f"   → {n_products} productos insertados ({skip_p} omitidos)")

    print("2. Clientes (pedidos)...")
    client_map, skip_c = migrate_clients(db, files["pedidos"], skip_existing)
    print(f"   → {len(client_map)} clientes en mapa ({skip_c} omitidos)")

    print("3. Órdenes de trabajo...")
    n_orders = migrate_work_orders(db, files["trabajo"], client_map)
    print(f"   → {n_orders} órdenes insertadas")

    print("4. Finanzas...")
    n_finances = migrate_finances(db, files["finanzas"])
    print(f"   → {n_finances} registros insertados")

    print(f"\n✓ Migración completada: {n_products + n_orders + n_finances} registros nuevos")


if __name__ == "__main__":
    main()
