from time import sleep
from unittest import TestCase, main

from app.utils.recent_cache import RecentCache


class RecentCacheTests(TestCase):
    def test_second_read_does_not_load_again(self):
        cache = RecentCache()
        calls = {"count": 0}

        def load():
            calls["count"] += 1
            return ["orden"]

        self.assertEqual(cache.get("orders", 30, load), ["orden"])
        self.assertEqual(cache.get("orders", 30, load), ["orden"])
        self.assertEqual(calls["count"], 1)

    def test_expired_read_loads_again(self):
        cache = RecentCache()
        calls = {"count": 0}

        def load():
            calls["count"] += 1
            return calls["count"]

        self.assertEqual(cache.get("orders", 0.05, load), 1)
        sleep(0.06)
        self.assertEqual(cache.get("orders", 0.05, load), 2)

    def test_failed_load_is_not_saved(self):
        cache = RecentCache()
        calls = {"count": 0}

        def load():
            calls["count"] += 1
            if calls["count"] == 1:
                raise RuntimeError("red")
            return "ok"

        with self.assertRaises(RuntimeError):
            cache.get("orders", 30, load)
        self.assertEqual(cache.get("orders", 30, load), "ok")
        self.assertEqual(calls["count"], 2)


if __name__ == "__main__":
    main()
