from unittest.mock import patch

import requests
from django.core.cache import cache
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from store.views.user_views import RECENT_REVERSE_GEOCODE_RESULTS


class ReverseGeocodeProxyTest(APITestCase):
    def setUp(self):
        cache.clear()
        RECENT_REVERSE_GEOCODE_RESULTS.clear()

    def test_requires_coordinates(self):
        response = self.client.get(reverse("reverse-geocode-proxy"))

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["error"], "Missing lat or lng")

    def test_rejects_invalid_coordinates(self):
        response = self.client.get(
            reverse("reverse-geocode-proxy"),
            {"lat": "abc", "lng": "106.757369"},
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["error"], "Invalid lat or lng")

    @patch("store.views.user_views.requests.get")
    def test_returns_fallback_when_upstream_fails(self, mock_get):
        mock_get.side_effect = requests.Timeout("timeout")

        response = self.client.get(
            reverse("reverse-geocode-proxy"),
            {"lat": "10.851568486133067", "lng": "106.75736904144289"},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["source"], "fallback")
        self.assertIn("display_name", response.data)
        self.assertIn("address", response.data)

    @patch("store.views.user_views.requests.get")
    def test_returns_nominatim_payload_when_available(self, mock_get):
        mock_response = mock_get.return_value
        mock_response.raise_for_status.return_value = None
        mock_response.json.return_value = {
            "display_name": "Linh Trung, Thu Duc, TP. Ho Chi Minh",
            "address": {"city": "TP. Ho Chi Minh"},
        }

        response = self.client.get(
            reverse("reverse-geocode-proxy"),
            {"lat": "10.851568486133067", "lng": "106.75736904144289"},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["source"], "nominatim")
        self.assertEqual(response.data["display_name"], "Linh Trung, Thu Duc, TP. Ho Chi Minh")
