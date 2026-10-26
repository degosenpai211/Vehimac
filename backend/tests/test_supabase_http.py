from unittest import TestCase, main

import httpx

from app.database import READ_TIMEOUT_SECONDS, supabase_http_client, supabase_options


class SupabaseHttpTests(TestCase):
    def test_client_does_not_keep_a_stale_http2_connection(self):
        client = supabase_http_client()
        self.assertIsInstance(client._transport, httpx.HTTPTransport)
        self.assertEqual(client.timeout.read, READ_TIMEOUT_SECONDS)

    def test_options_use_the_short_timeout_the_installed_client_accepts(self):
        options = supabase_options()
        self.assertEqual(options.postgrest_client_timeout.read, READ_TIMEOUT_SECONDS)
        self.assertEqual(options.storage_client_timeout.read, READ_TIMEOUT_SECONDS)
        self.assertEqual(options.function_client_timeout.read, READ_TIMEOUT_SECONDS)


if __name__ == "__main__":
    main()
