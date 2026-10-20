from threading import Lock
from time import monotonic


class RecentCache:
    """Guarda el resultado de una lectura unos segundos, para no repetir el mismo viaje a Supabase."""

    def __init__(self):
        self._lock = Lock()
        self._saved: dict[str, tuple[float, object]] = {}

    def get(self, key: str, seconds: float, load):
        now = monotonic()
        with self._lock:
            found = self._saved.get(key)
            if found is not None and now - found[0] <= seconds:
                return found[1]
        value = load()
        with self._lock:
            self._saved[key] = (monotonic(), value)
        return value
