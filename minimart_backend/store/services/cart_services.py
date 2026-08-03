from django.db import transaction
from rest_framework.exceptions import ValidationError
from store.models import Product, Cart, CartItem


def add_to_cart(user, product_id, quantity=1):
    try:
        product = Product.objects.get(id=product_id)
    except Product.DoesNotExist:
        raise ValidationError({"error": "Sản phẩm không tồn tại!"})

    if not product.is_active:
        raise ValidationError({"error": "Sản phẩm này đã ngừng kinh doanh!"})

    with transaction.atomic():
        cart, _ = Cart.objects.get_or_create(user=user)

        # Khóa dòng CartItem để tránh Race Condition (Double-click bug)
        existing_item = CartItem.objects.select_for_update().filter(cart=cart, product_id=product_id).first()

        if existing_item:
            new_quantity = existing_item.quantity + quantity

            # Soft check tồn kho trước khi cộng dồn
            # Đây là kiểm tra để báo lỗi sớm cho UX, KHÔNG phải hard check
            # Hard check thật sự diễn ra trong create_order với select_for_update
            # → chấp nhận rằng stock có thể stale nhẹ ở đây, đổi lại UX tốt hơn
            if new_quantity > product.stock_quantity:
                raise ValidationError({
                    "error": f"Không đủ hàng! Bạn đang có {existing_item.quantity} sản phẩm trong giỏ, kho chỉ còn {product.stock_quantity}."
                })

            existing_item.quantity = new_quantity
            existing_item.save()
            return existing_item, False  # False = update, không phải tạo mới

        # Soft check tồn kho lúc thêm mới (cùng lý do như trên)
        if quantity > product.stock_quantity:
            raise ValidationError({
                "error": f"Không đủ hàng! Kho chỉ còn {product.stock_quantity} sản phẩm."
            })

        # Chốt giá tại thời điểm thêm vào giỏ (price snapshot)
        # Đây là behavior đúng — nếu admin đổi giá sau, giỏ hàng vẫn giữ giá cũ
        # Không phải bug — giá sẽ được re-confirm lúc checkout nếu cần
        price_to_use = product.discount_price if product.discount_price else product.price

        new_item = CartItem.objects.create(
            cart=cart,
            product=product,
            quantity=quantity,
            unit_price=price_to_use
        )

        return new_item, True  # True = tạo mới