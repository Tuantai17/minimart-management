# ─── models/__init__.py ───────────────────────────────────────────────────────
# Re-export toàn bộ model từ các file con.
# MỌI import dạng `from store.models import X` hay `from ..models import X`
# đều resolve về đây — Django và các consumer KHÔNG thay đổi gì.
# ─────────────────────────────────────────────────────────────────────────────

from .base import ActiveManager

from .product import (
    Category,
    Product,
    Banner,
    StoreLocation,
    CrawlerProduct,
)

from .order import (
    Cart,
    CartItem,
    Order,
    OrderItem,
)

from .review import (
    Review,
    ReviewMedia,
)

from .user import (
    UserProfile,
    Address,
)

from .support import (
    SupportTicket,
    SupportMessage,
)

from .voucher import (
    Voucher,
    UserVoucher,
    UserVoucherUsage,
)

from .device import (
    FCMDevice,
)

__all__ = [
    # Base
    'ActiveManager',
    # Product
    'Category', 'Product', 'Banner', 'StoreLocation', 'CrawlerProduct',
    # Order
    'Cart', 'CartItem', 'Order', 'OrderItem',
    # Review
    'Review', 'ReviewMedia',
    # User
    'UserProfile', 'Address',
    # Support
    'SupportTicket', 'SupportMessage',
    # Voucher
    'Voucher', 'UserVoucher', 'UserVoucherUsage',
    # Device / FCM
    'FCMDevice',
]
