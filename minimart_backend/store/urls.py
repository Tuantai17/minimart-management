# Viết URLs sau khi hoàn thành Views
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    CategoryViewSet, ProductViewSet, CartItemViewSet,
    CartViewSet, OrderViewSet, MyOrderViewSet, ReviewViewSet, 
    UserProfileViewSet, BannerViewSet, AddressViewSet, 
    MeView, ChangePasswordView, 
    ForgotPasswordView, VerifyOTPView, 
    ResetPasswordView, 
    StockAlertToggleView, 
    SupportViewSet, 
    AdminSupportViewSet, 
    RevenueSummaryAPIView, RevenueRangeAPIView,
    CrawlerImportView,
    VoucherApplyView, VoucherListView, MyVoucherListView, VoucherClaimView,
    BestSellingProductsAPIView,
    VNPayIPNView,
    FCMDeviceRegisterView, FCMDeviceUnregisterView,
    ReverseGeocodeProxyView,
)

router = DefaultRouter()
router.register(r'categories', CategoryViewSet)
router.register(r'products', ProductViewSet)
router.register(r'carts', CartViewSet, basename='cart')
router.register(r'cart-items', CartItemViewSet, basename='cart-item')
router.register(r'orders', OrderViewSet, basename='order')
router.register(r'my-orders', MyOrderViewSet, basename='my-order')
router.register(r'reviews', ReviewViewSet, basename='review')
router.register(r'user-profiles', UserProfileViewSet, basename='user-profile')
router.register(r'banners', BannerViewSet, basename='banner')
router.register(r'addresses', AddressViewSet, basename='address')
router.register(r'support', SupportViewSet, basename='support')
router.register(r'admin-support', AdminSupportViewSet, basename='admin-support')

urlpatterns = [
    path('products/best-selling/', BestSellingProductsAPIView.as_view(), name='best-selling-products'),
    path('reports/revenue/summary/', RevenueSummaryAPIView.as_view(), name='revenue-summary'),
    path('reports/revenue/range/', RevenueRangeAPIView.as_view(), name='revenue-range'),
    path('', include(router.urls)),
    path('me/', MeView.as_view(), name='me'),
    path('change-password/', ChangePasswordView.as_view()),
    path('forgot-password/', ForgotPasswordView.as_view(), name='forgot-password'),
    path('verify-otp/', VerifyOTPView.as_view(), name='verify-otp'),
    path('reset-password/', ResetPasswordView.as_view(), name='reset-password'),
    path('users/profile/stock-alerts/', StockAlertToggleView.as_view(), name='stock-alerts-toggle'),
    path('crawler/import/', CrawlerImportView.as_view(), name='crawler_import'),
    path('vouchers/apply/', VoucherApplyView.as_view(), name='voucher-apply'),
    path('vouchers/<int:pk>/claim/', VoucherClaimView.as_view(), name='voucher-claim'),
    path('vouchers/', VoucherListView.as_view(), name='voucher-list'),
    path('my-vouchers/', MyVoucherListView.as_view(), name='my-voucher-list'),
    path('webhooks/vnpay-ipn/', VNPayIPNView.as_view(), name='vnpay-ipn'),
    path('devices/', FCMDeviceRegisterView.as_view(), name='fcm-device-register'),
    path('devices/<str:token>/', FCMDeviceUnregisterView.as_view(), name='fcm-device-unregister'),
    path('location/reverse-geocode/', ReverseGeocodeProxyView.as_view(), name='reverse-geocode-proxy'),

]
