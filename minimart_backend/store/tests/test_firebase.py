import json
from unittest.mock import patch, MagicMock
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient
from rest_framework import status
from django.contrib.auth.models import User
from store.models import FCMDevice, UserProfile
from store.services.notification_service import send_push_to_user
from firebase_admin.messaging import UnregisteredError


class FirebaseIntegrationTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username='testuser', 
            password='testpassword',
            email='testuser@example.com'
        )
        UserProfile.objects.create(user=self.user)

    # ─── 1. TEST FCM DEVICE REGISTRATION ──────────────────────────────────
    def test_fcm_device_register(self):
        self.client.force_authenticate(user=self.user)
        
        url = reverse('fcm-device-register')
        payload = {
            "token": "fake-fcm-token-123",
            "device_type": "android"
        }
        
        response = self.client.post(url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(FCMDevice.objects.filter(token="fake-fcm-token-123", user=self.user).exists())

        response = self.client.post(url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(FCMDevice.objects.filter(token="fake-fcm-token-123").count(), 1)

    def test_fcm_device_unregister(self):
        self.client.force_authenticate(user=self.user)
        FCMDevice.objects.create(user=self.user, token="token-to-delete", device_type="ios")

        url = reverse('fcm-device-unregister', kwargs={'token': 'token-to-delete'})
        response = self.client.delete(url)
        
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        
        device = FCMDevice.objects.get(token="token-to-delete")
        self.assertFalse(device.is_active)

    # ─── 2. TEST NOTIFICATION SERVICE ──────────────────────────────────────
    @patch('store.services.notification_service.messaging')
    @patch('core.firebase.is_firebase_ready', return_value=True)
    def test_send_push_to_user(self, mock_is_ready, mock_messaging):
        FCMDevice.objects.create(user=self.user, token="token-1", is_active=True)
        FCMDevice.objects.create(user=self.user, token="token-2", is_active=True)
        FCMDevice.objects.create(user=self.user, token="token-3", is_active=False)

        # BatchResponse: 2 active devices → 2 successful responses
        mock_resp = MagicMock()
        mock_resp.success = True
        mock_resp.exception = None
        mock_batch = MagicMock()
        mock_batch.responses = [mock_resp, mock_resp]
        mock_messaging.send_each.return_value = mock_batch

        sent_count = send_push_to_user(
            user=self.user,
            title="Khuyến mãi",
            body="Giảm 50%",
            data={"campaign_id": "123"}
        )

        self.assertEqual(sent_count, 2)
        mock_messaging.send_each.assert_called_once()  # Batch API — 1 lần gọi cho n messages

    @patch('store.services.notification_service.messaging')
    @patch('core.firebase.is_firebase_ready', return_value=True)
    def test_send_push_unregister_error(self, mock_is_ready, mock_messaging):
        device = FCMDevice.objects.create(user=self.user, token="expired-token", is_active=True)

        # send_each returns BatchResponse với response lỗi UnregisteredError
        mock_resp = MagicMock()
        mock_resp.success = False
        mock_resp.exception = messaging.UnregisteredError("Token is expired")
        mock_batch = MagicMock()
        mock_batch.responses = [mock_resp]
        mock_messaging.send_each.return_value = mock_batch
        mock_messaging.UnregisteredError = messaging.UnregisteredError

        send_push_to_user(self.user, "Title", "Body")

        device.refresh_from_db()
        self.assertFalse(device.is_active)

    # ─── 3. TEST FIREBASE AUTH ─────────────────────────────────────────────
    @patch('firebase_admin.auth.verify_id_token')
    @patch('core.firebase.is_firebase_ready', return_value=True)
    def test_firebase_login_new_user(self, mock_is_ready, mock_verify):
        url = reverse('firebase_login')
        
        mock_verify.return_value = {
            "uid": "new-firebase-uid-999",
            "email": "newuser@example.com",
            "email_verified": True,
            "name": "New User"
        }

        payload = {"id_token": "fake-jwt-token"}
        response = self.client.post(url, payload, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('access', response.data)
        self.assertIn('refresh', response.data)
        
        new_user = User.objects.get(email="newuser@example.com")
        self.assertEqual(new_user.profile.firebase_uid, "new-firebase-uid-999")
        self.assertFalse(new_user.has_usable_password())

    @patch('firebase_admin.auth.verify_id_token')
    @patch('core.firebase.is_firebase_ready', return_value=True)
    def test_firebase_login_link_existing_user(self, mock_is_ready, mock_verify):
        url = reverse('firebase_login')
        
        mock_verify.return_value = {
            "uid": "link-uid-555",
            "email": "testuser@example.com",
            "email_verified": True,
            "name": "Test User"
        }

        payload = {"id_token": "fake-jwt-token"}
        response = self.client.post(url, payload, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        self.user.refresh_from_db()
        self.assertEqual(self.user.profile.firebase_uid, "link-uid-555")

    @patch('firebase_admin.auth.verify_id_token')
    @patch('core.firebase.is_firebase_ready', return_value=True)
    def test_firebase_login_unverified_email_does_not_link(self, mock_is_ready, mock_verify):
        url = reverse('firebase_login')
        
        mock_verify.return_value = {
            "uid": "hacker-uid",
            "email": "testuser@example.com",
            "email_verified": False, # Chưa xác thực email
            "name": "Hacker"
        }

        payload = {"id_token": "fake-jwt-token"}
        response = self.client.post(url, payload, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        self.user.refresh_from_db()
        self.assertNotEqual(self.user.profile.firebase_uid, "hacker-uid")
        
        hacker_user = User.objects.get(profile__firebase_uid="hacker-uid")
        self.assertNotEqual(hacker_user.id, self.user.id)
