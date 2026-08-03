from django.db import models


class ActiveManager(models.Manager):
    """Manager mặc định cho các model có soft-delete (delete_at). Tự động ẩn record đã xóa."""
    def get_queryset(self):
        return super().get_queryset().filter(delete_at__isnull=True)
