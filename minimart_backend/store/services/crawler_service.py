import requests
import logging
from django.utils import timezone
from store.models import CrawlerProduct

logger = logging.getLogger(__name__)

# [RE-RESEARCHED API] Cache endpoints
BHX_API_URL = "https://api.bachhoaxanh.com/gw/Category/V2/GetCate"

def scrape_bhx_category(category_url, limit=50):
    """
    Cào dữ liệu từ API Bách Hóa Xanh theo danh mục.
    VD: category_url='rau-sach'
    """
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'xapikey': 'bhx-api-core-2022',
        'platform': 'webnew',
        'deviceid': '581b9082-ccf1-4f8a-88ed-395f1fffbaa8',
        'reversehost': 'http://bhxapi.live',
        'referer-url': f'https://www.bachhoaxanh.com/{category_url}',
    }
    
    params = {
        'provinceId': '1027',
        'wardId': '0',
        'districtId': '0',
        'storeId': '2546',
        'categoryUrl': category_url,
        'isMobile': 'true',
        'isV2': 'true',
        'pageSize': limit,
    }
    
    try:
        response = requests.get(BHX_API_URL, params=params, headers=headers, timeout=15)
        if response.status_code != 200:
            logger.error(f"BHX API trả về lỗi {response.status_code}: {response.text}")
            return 0, 0
            
        data = response.json()
        
        products = data.get('products', [])
        count = 0
        
        for item in products:
            # Bóc tách dữ liệu JSON từ BHX
            external_id = str(item.get('id'))
            name = item.get('fullName')
            # BHX trả về list giá, lấy giá đầu tiên
            prices = item.get('productPrices', [])
            price = prices[0].get('price') if prices else 0
            unit = item.get('unit')
            avatar = item.get('avatar')
            
            # Link chi tiết sản phẩm của BHX thường có format: /san-pham/tên-không-dấu-id
            # Ở đây ta chỉ lưu link thô nếu cần, hoặc để trống
            source_url = f"https://www.bachhoaxanh.com/san-pham/{item.get('urlKey')}-{external_id}"
            
            # Cập nhật hoặc tạo mới vào DB MiniMart
            obj, created = CrawlerProduct.objects.update_or_create(
                external_id=external_id,
                source='BHX',
                defaults={
                    'name': name,
                    'price': price,
                    'unit': unit,
                    'image_url': avatar,
                    'category_name': category_url, # Lưu tạm category_url gốc
                    'source_url': source_url,
                }
            )
            if created:
                count += 1
                
        return count, len(products)

    except requests.exceptions.RequestException as e:
        logger.error(f"Lỗi khi cào BHX category '{category_url}': {str(e)}")
        return 0, 0
