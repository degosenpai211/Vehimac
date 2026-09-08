from concurrent.futures import ThreadPoolExecutor
from functools import lru_cache

from supabase import Client, create_client

from app.config import settings

_IN_CHUNK = 80


@lru_cache
def get_supabase() -> Client:
    return create_client(settings.supabase_url, settings.supabase_key)


def in_parallel(*fns):
    """Corre llamadas independientes a Supabase a la vez (cada .execute() es un viaje de red)."""
    fns = [fn for fn in fns if fn is not None]
    if not fns:
        return []
    if len(fns) == 1:
        return [fns[0]()]
    with ThreadPoolExecutor(max_workers=len(fns)) as pool:
        return list(pool.map(lambda f: f(), fns))


def fetch_in(db, table: str, column: str, ids: list, select: str = "*") -> list:
    """IN por lotes para no armar una URL enorme ni hacer N+1."""
    if not ids:
        return []
    unique = list(dict.fromkeys(ids))
    rows = []
    for i in range(0, len(unique), _IN_CHUNK):
        chunk = unique[i:i + _IN_CHUNK]
        part = db.table(table).select(select).in_(column, chunk).execute()
        rows.extend(part.data or [])
    return rows
