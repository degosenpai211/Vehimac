from unittest import TestCase, main

import httpx

from app.database import READ_TIMEOUT_SECONDS, supabase_http_client


class SupabaseHttpTests(TestCase):
    def test_client_does_not_keep_a_stale_http2_connection(self):
        client = supabase_http_client()
        self.assertIsInstance(client._transport, httpx.HTTPTransport)
        self.assertEqual(client.timeout.read, READ_TIMEOUT_SECONDS)


if __name__ == "__main__":
    main()
