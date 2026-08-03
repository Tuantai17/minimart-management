import zoneinfo
import logging
from datetime import datetime, timedelta
from decimal import Decimal
from django.utils import timezone
from django.db.models import Sum, Count, Q
from django.db.models.functions import Coalesce
from store.models import Order

VN_TZ = zoneinfo.ZoneInfo("Asia/Ho_Chi_Minh")
logger = logging.getLogger(__name__)

def _build_time_q(start_time, end_time=None):
    """Helper to build Q object for time filtering (completed_at fallback created_at)."""
    q_range = (start_time, end_time) if end_time else (start_time, timezone.now())
    q_completed = Q(completed_at__range=q_range) if end_time else Q(completed_at__gte=start_time)
    q_fallback = Q(completed_at__isnull=True, created_at__range=q_range) if end_time else Q(completed_at__isnull=True, created_at__gte=start_time)
    return q_completed | q_fallback

def get_revenue_summary() -> dict:
    now = timezone.now().astimezone(VN_TZ)
    mks = {
        '24h': now - timedelta(hours=24),
        '7d': (now - timedelta(days=7)).replace(hour=0, minute=0, second=0, microsecond=0),
        'month': now.replace(day=1, hour=0, minute=0, second=0, microsecond=0),
        'year': now.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0),
    }

    base_qs = Order.objects.filter(status='COMPLETED')
    try:
        aggs = {}
        for k, start in mks.items():
            aggs[f'rev_{k}'] = Coalesce(Sum('total_amount', filter=_build_time_q(start)), Decimal('0'))
            aggs[f'cnt_{k}'] = Count('id', filter=_build_time_q(start))
        res = base_qs.aggregate(**aggs)
    except Exception as e:
        logger.error(f"Revenue aggregation failed: {e}")
        res = {k: 0 for k in ['rev_24h', 'cnt_24h', 'rev_7d', 'cnt_7d', 'rev_month', 'cnt_month', 'rev_year', 'cnt_year']}

    def fmt(dt, tpl): return tpl.format(dt.strftime("%H:%M ngày %d/%m" if "%H:%M" in tpl else "%d/%m"))
    
    today = now.strftime("%d/%m")
    return {
        "currency": "VND", "timezone": "Asia/Ho_Chi_Minh", "statuses": ["COMPLETED"], "generated_at": now.isoformat(),
        "summary": {
            "last_24_hours": {"revenue": int(res['rev_24h']), "order_count": res['cnt_24h'], "label": fmt(mks['24h'], "Từ {}")},
            "last_7_days":   {"revenue": int(res['rev_7d']), "order_count": res['cnt_7d'], "label": fmt(mks['7d'], "Từ {} - " + today)},
            "current_month": {"revenue": int(res['rev_month']), "order_count": res['cnt_month'], "label": fmt(mks['month'], "Từ {} - " + today)},
            "current_year":  {"revenue": int(res['rev_year']), "order_count": res['cnt_year'], "label": fmt(mks['year'], "Từ {} - " + today)},
        }
    }

def get_revenue_range(start_str: str, end_str: str) -> dict:
    try:
        start_dt = datetime.strptime(start_str, "%Y-%m-%d").replace(hour=0, minute=0, second=0, tzinfo=VN_TZ)
        end_dt = datetime.strptime(end_str, "%Y-%m-%d").replace(hour=23, minute=59, second=59, tzinfo=VN_TZ)
        if start_dt > end_dt: raise ValueError("Start date > End date")
    except (ValueError, TypeError) as e:
        raise ValueError(f"Invalid date range: {e}")

    try:
        res = Order.objects.filter(status='COMPLETED').aggregate(
            rev=Coalesce(Sum('total_amount', filter=_build_time_q(start_dt, end_dt)), Decimal('0')),
            cnt=Count('id', filter=_build_time_q(start_dt, end_dt))
        )
    except Exception as e:
        logger.error(f"Range aggregation failed: {e}")
        res = {'rev': 0, 'cnt': 0}

    return {
        "currency": "VND", "timezone": "Asia/Ho_Chi_Minh", "statuses": ["COMPLETED"],
        "generated_at": timezone.now().astimezone(VN_TZ).isoformat(),
        "range": {
            "start_date": start_str, "end_date": end_str,
            "revenue": int(res['rev']), "order_count": res['cnt'],
            "label": f"Từ {start_dt.strftime('%d/%m')} - {end_dt.strftime('%d/%m')}"
        }
    }
