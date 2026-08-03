import logging
from rest_framework import viewsets, permissions, status
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.response import Response
from rest_framework.decorators import action
from rest_framework.pagination import PageNumberPagination
from rest_framework.exceptions import NotFound
from django.db.models import Prefetch
from store.models import SupportTicket, SupportMessage
from store.serializers.support_serializers import SupportMessageSerializer
from store.services.support_service import SupportService
from django.core.exceptions import ObjectDoesNotExist

logger = logging.getLogger(__name__)

# [AUDIT FIX HIGH-08] Giới hạn độ dài tin nhắn chống OOM/DB bloat
MAX_MESSAGE_LENGTH = 5000


# ─── Pagination cho lịch sử tin nhắn ────────────────────────────────────────
class MessagePagination(PageNumberPagination):
    page_size = 30
    page_size_query_param = 'page_size'
    max_page_size = 100


# ─── Pagination cho danh sách ticket ─────────────────────────────────────────
class TicketListPagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = 'page_size'
    max_page_size = 100


# ─── 1. API KHÁCH HÀNG ────────────────────────────────────────────────────────
class SupportViewSet(viewsets.GenericViewSet):
    permission_classes = [permissions.IsAuthenticated]
    throttle_scope = 'support_send'

    def get_throttles(self):
        if self.action == 'send':
            return [ScopedRateThrottle()]
        return super().get_throttles()

    @action(detail=False, methods=['GET'])
    def history(self, request):
        # Đảm bảo luôn có ticket dù user chưa chat
        ticket, _ = SupportTicket.objects.get_or_create(user=request.user)

        # Lấy từ mới nhất xuống cũ nhất để page 1 là tin mới nhất
        messages_qs = SupportMessage.objects.filter(
            ticket=ticket,
            delete_at__isnull=True
        ).order_by('-created_at')

        paginator = MessagePagination()
        page = paginator.paginate_queryset(messages_qs, request)
        
        # Đảo ngược mảng để FE nhận được theo thứ tự thời gian (từ trên xuống dưới)
        if page is not None:
            page.reverse()
            
        return paginator.get_paginated_response(
            SupportMessageSerializer(page, many=True).data
        )

    @action(detail=False, methods=['POST'])
    def send(self, request):
        ticket, _ = SupportTicket.objects.get_or_create(user=request.user)
        message_text = request.data.get('message', '')
        if not message_text.strip():
            return Response({"error": "Tin nhắn không được để trống."}, status=400)
        # [AUDIT FIX HIGH-08] Giới hạn độ dài
        if len(message_text) > MAX_MESSAGE_LENGTH:
            return Response(
                {"error": f"Tin nhắn không được vượt quá {MAX_MESSAGE_LENGTH} ký tự."},
                status=400
            )
        msg = SupportService.send_message(ticket, request.user, False, message_text)
        return Response(SupportMessageSerializer(msg).data, status=201)


# ─── 2. API NHÂN VIÊN / ADMIN CMS ────────────────────────────────────────────
class AdminSupportViewSet(viewsets.GenericViewSet):
    permission_classes = [permissions.IsAdminUser]

    # ── Helper: Đóng gói thông tin User đúng chuẩn API Contract ──────────────
    def _build_user_info(self, user, request):
        if not user:
            return None
        avatar_url = None
        try:
            avatar = user.profile.avatar_url
            if avatar:
                avatar_url = request.build_absolute_uri(avatar.url)
        except ObjectDoesNotExist:
            # Dùng debug log vì avatar lỗi là chuyện thường
            logger.debug("Không lấy được avatar cho user_id=%s", user.id)

        if user.is_superuser:
            role = 'admin'
        elif user.is_staff:
            role = 'staff'
        else:
            role = 'customer'

        return {
            "id": user.id,
            "email": user.email,
            "name": user.first_name or user.username,
            "username": user.username,
            "role": role,
            "is_staff": user.is_staff,
            "is_superuser": user.is_superuser,
            "avatar_url": avatar_url,
        }

    # ── Phân quyền xem Ticket ──────────────────────────────────────────────────
    def get_queryset(self):
        user = self.request.user
        if user.is_superuser:
            # Admin thấy TOÀN BỘ ticket
            return SupportTicket.objects.all()
        # Staff chỉ thấy ticket của Customer (không thấy ticket của Staff/Admin)
        return SupportTicket.objects.filter(
            user__is_staff=False,
            user__is_superuser=False
        )

    # Trả 404 NotFound thay vì 403 PermissionDenied
    # 403 tiết lộ rằng ticket TỒN TẠI (lỗ hổng dò ID)
    # 404 che giấu hoàn toàn sự tồn tại của resource
    def get_object(self):
        queryset = self.get_queryset()
        pk = self.kwargs.get('pk')
        try:
            obj = queryset.get(pk=pk)
        except SupportTicket.DoesNotExist:
            raise NotFound("Không tìm thấy ticket.")
        return obj

    # ── GET /admin-support/ ───────────────────────────────────────────────────
    def list(self, request):
        # Không dùng annotate(last_msg_id) để tránh tốn query thừa
        tickets_qs = self.get_queryset().select_related(
            'user', 'user__profile'
        ).prefetch_related(
            Prefetch(
                'messages',
                queryset=SupportMessage.objects.filter(
                    delete_at__isnull=True
                ).select_related('sender_user', 'sender_user__profile').order_by('-created_at'),
                to_attr='prefetched_messages'
            )
        ).order_by('is_resolved', '-updated_at')

        # Bỏ fallback list(tickets_qs) tránh double query
        paginator = TicketListPagination()
        page = paginator.paginate_queryset(tickets_qs, request)

        result = []
        for t in page:
            last_msg = t.prefetched_messages[0] if getattr(t, 'prefetched_messages', None) else None
            result.append({
                "id": t.id,
                "is_resolved": t.is_resolved,
                "created_at": t.created_at,
                "updated_at": t.updated_at,
                "last_message_preview": last_msg.message[:80] if last_msg else None,
                "last_message_time": last_msg.created_at if last_msg else None,
                "owner": self._build_user_info(t.user, request),
                "last_sender": self._build_user_info(
                    last_msg.sender_user, request
                ) if last_msg else None,
            })

        return paginator.get_paginated_response(result)

    # ── GET /admin-support/{id}/history/ ──────────────────────────────────────
    @action(detail=True, methods=['GET'])
    def history(self, request, pk=None):
        ticket = self.get_object()

        # Pagination lấy từ mới nhất, sau đó đảo ngược
        messages_qs = SupportMessage.objects.filter(
            ticket=ticket,
            delete_at__isnull=True
        ).order_by('-created_at').select_related('sender_user', 'sender_user__profile')

        paginator = MessagePagination()
        page = paginator.paginate_queryset(messages_qs, request)

        # Đảo ngược để FE nhận đúng thứ tự cũ → mới
        page.reverse()

        messages_data = [{
            "id": msg.id,
            "message": msg.message,
            "is_read": msg.is_read,
            "created_at": msg.created_at,
            "sender": self._build_user_info(msg.sender_user, request),
        } for msg in page]

        ticket_info = {
            "id": ticket.id,
            "is_resolved": ticket.is_resolved,
            "owner": self._build_user_info(ticket.user, request),
        }

        return Response({
            "ticket": ticket_info,
            "count": paginator.page.paginator.count,
            "next": paginator.get_next_link(),
            "previous": paginator.get_previous_link(),
            "results": messages_data,
        })

    # ── POST /admin-support/{id}/reply/ ───────────────────────────────────────
    @action(detail=True, methods=['POST'])
    def reply(self, request, pk=None):
        ticket = self.get_object()
        message_text = request.data.get('message', '')
        if not message_text.strip():
            return Response({"error": "Tin nhắn không được để trống."}, status=400)
        # [AUDIT FIX HIGH-08] Giới hạn độ dài
        if len(message_text) > MAX_MESSAGE_LENGTH:
            return Response(
                {"error": f"Tin nhắn không được vượt quá {MAX_MESSAGE_LENGTH} ký tự."},
                status=400
            )
        msg = SupportService.send_message(ticket, request.user, True, message_text)
        return Response(SupportMessageSerializer(msg).data, status=201)

    # Dùng PATCH vì cập nhật trạng thái, không tạo mới
    # ── PATCH /admin-support/{id}/resolve/ ────────────────────────────────────
    @action(detail=True, methods=['PATCH'])
    def resolve(self, request, pk=None):
        ticket = self.get_object()
        ticket.is_resolved = True
        ticket.save(update_fields=['is_resolved'])
        return Response({"detail": "Ticket đã đánh dấu hoàn thành.", "is_resolved": True})

    # ── PATCH /admin-support/{id}/reopen/ ─────────────────────────────────────
    @action(detail=True, methods=['PATCH'])
    def reopen(self, request, pk=None):
        ticket = self.get_object()
        ticket.is_resolved = False
        ticket.save(update_fields=['is_resolved'])
        return Response({"detail": "Ticket đã mở lại.", "is_resolved": False})
