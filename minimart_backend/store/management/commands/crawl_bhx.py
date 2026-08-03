from django.core.management.base import BaseCommand
from store.services.crawler_service import scrape_bhx_category

class Command(BaseCommand):
    help = 'Cào dữ liệu sản phẩm từ Bách Hóa Xanh'

    def add_arguments(self, parser):
        parser.add_argument('--category', type=str, default='rau-sach', help='Slug danh mục BHX (vd: rau-sach, cu, trai-cay)')
        parser.add_argument('--limit', type=int, default=20, help='Số lượng sản phẩm tối đa')

    def handle(self, *args, **options):
        category = options['category']
        limit = options['limit']
        
        self.stdout.write(self.style.SUCCESS(f"Đang bắt đầu cào mục '{category}' (giới hạn {limit})..."))
        
        new_count, total = scrape_bhx_category(category, limit)
        
        self.stdout.write(self.style.SUCCESS(
            f"Hoàn thành! Đã cào {total} sản phẩm. Thêm mới {new_count} bản ghi vào CrawlerProduct."
        ))
