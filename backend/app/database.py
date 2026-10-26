from concurrent.futures import ThreadPoolExecutor
from functools import lru_cache

import httpx
from supabase import Client, ClientOptions, create_client

from app.config import settings

_IN_CHUNK = 80
PAGE_SIZE = 1000
CONNECT_TIMEOUT_SECONDS = 10.0
READ_TIMEOUT_SECONDS = 20.0
KEEPALIVE_SECONDS = 5.0


def request_timeout() -> httpx.Timeout:
    return httpx.Timeout(
        connect=CONNECT_TIMEOUT_SECONDS,
        read=READ_TIMEOUT_SECONDS,
        write=READ_TIMEOUT_SECONDS,
        pool=CONNECT_TIMEOUT_SECONDS,
    )


def supabase_http_client() -> httpx.Client:
    """HTTP/1.1 y conexiones que no se reutilizan después de unos segundos.

    El cliente de Supabase 2.11 no acepta este cliente inyectado. Los tiempos
    de espera se pasan por las opciones, para no quedar 120 segundos esperando.
    """
    limits = httpx.Limits(keepalive_expiry=KEEPALIVE_SECONDS)
    return httpx.Client(
        timeout=request_timeout(),
        limits=limits,
        follow_redirects=True,
        http2=False,
    )


def supabase_options() -> ClientOptions:
    timeout = request_timeout()
    return ClientOptions(
        postgrest_client_timeout=timeout,
        storage_client_timeout=timeout,
        function_client_timeout=timeout,
    )


@lru_cache
def get_supabase() -> Client:
    return create_client(settings.supabase_url, settings.supabase_key, supabase_options())


def in_parallel(*fns):
    """Corre llamadas independientes a Supabase a la vez (cada .execute() es un viaje de red)."""
    fns = [fn for fn in fns if fn is not None]
    if not fns:
        return []
    if len(fns) == 1:
        return [fns[0]()]
    with ThreadPoolExecutor(max_workers=len(fns)) as pool:
        return list(pool.map(lambda f: f(), fns))


def fetch_all(make_query, order_by: str = "id") -> list:
    """Todas las filas de una consulta, de a páginas: Supabase corta cada respuesta en 1000.

    make_query arma la consulta de cero en cada llamada, porque range() se acumula sobre la misma.
    """
    rows = []
    while True:
        page = make_query().order(order_by).range(len(rows), len(rows) + PAGE_SIZE - 1).execute().data or []
        rows.extend(page)
        if len(page) < PAGE_SIZE:
            return rows


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
