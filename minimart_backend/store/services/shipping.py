import math
import logging
import requests
from django.conf import settings

logger = logging.getLogger(__name__)


def parse_and_validate_coords(lat_raw, lng_raw) -> tuple[float, float]:
    """
    Parse và validate tọa độ từ request data.
    Raise ValueError nếu không parse được hoặc ngoài phạm vi hợp lệ.
    Dùng chung cho order_views.py và order_services.py.
    """
    try:
        lat = float(lat_raw)
        lng = float(lng_raw)
    except (TypeError, ValueError):
        raise ValueError("Tọa độ không hợp lệ")
    if not (-90 <= lat <= 90) or not (-180 <= lng <= 180):
        raise ValueError("Tọa độ ngoài phạm vi hợp lệ")
    return lat, lng


def _haversine_km(lat1, lng1, lat2, lng2):
    """Tính khoảng cách đường chim bay (km) — dùng khi Goong lỗi."""
    R = 6371
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lng2 - lng1)
    a = math.sin(dphi/2)**2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam/2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def calculate_shipping(delivery_lat: float, delivery_lng: float) -> dict:
    """
    Trả về dict: { 'distance_km': float, 'shipping_fee': int }
    """
    # Validate input vì type hint float không enforce ở runtime
    if not (-90 <= delivery_lat <= 90) or not (-180 <= delivery_lng <= 180):
        raise ValueError(f"Tọa độ không hợp lệ: lat={delivery_lat}, lng={delivery_lng}")

    warehouse_lat = settings.WAREHOUSE_LAT
    warehouse_lng = settings.WAREHOUSE_LNG
    distance_km = None


    # Gọi API Goong
    if settings.GOONG_API_KEY:
        try:
            resp = requests.get(
                "https://rsapi.goong.io/DistanceMatrix",
                params={
                    "origins":      f"{warehouse_lat},{warehouse_lng}",
                    "destinations": f"{delivery_lat},{delivery_lng}",
                    "vehicle":      "bike",
                    "api_key":      settings.GOONG_API_KEY,
                },
                timeout=5,
            )
            data    = resp.json()
            element = data["rows"][0]["elements"][0]
            if element["status"] == "OK":
                distance_km = element["distance"]["value"] / 1000  # meters → km
        except (requests.exceptions.RequestException, ValueError, KeyError, IndexError) as e:
            # Log warning để dễ debug khi Goong API lỗi, tránh nuốt lỗi hoàn toàn
            logger.warning(f"Goong API thất bại, fallback về Haversine: {e}")

    # --- Fallback: Haversine (đường chim bay) khi Goong không trả kết quả ---
    if distance_km is None:
        distance_km = _haversine_km(
            warehouse_lat, warehouse_lng, delivery_lat, delivery_lng
        )

    # --- Tính phí ---
    fee = max(
        settings.SHIPPING_BASE_FEE,
        round(distance_km * settings.SHIPPING_RATE_PER_KM),
    )

    return {
        "distance_km":  round(distance_km, 2),
        "shipping_fee": fee,
    }