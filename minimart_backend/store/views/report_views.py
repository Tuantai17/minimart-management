from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAdminUser

from store.services.report_services import get_revenue_summary, get_revenue_range

class RevenueSummaryAPIView(APIView):
    """
    GET /api/reports/revenue/summary/
    Trả về số liệu báo cáo doanh thu tổng hợp.
    Chỉ dành cho Admin/Staff.
    """
    permission_classes = [IsAdminUser]

    def get(self, request):
        data = get_revenue_summary()
        return Response(data, status=200)


class RevenueRangeAPIView(APIView):
    """
    GET /api/reports/revenue/range/?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD
    Báo cáo doanh thu theo khoảng ngày tùy chọn.
    """
    permission_classes = [IsAdminUser]

    def get(self, request):
        start_date = request.query_params.get('start_date')
        end_date = request.query_params.get('end_date')

        if not start_date or not end_date:
            return Response({"error": "Vui lòng cung cấp cả start_date và end_date (YYYY-MM-DD)."}, status=400)

        try:
            data = get_revenue_range(start_date, end_date)
            return Response(data, status=200)
        except ValueError as e:
            return Response({"error": str(e)}, status=400)
