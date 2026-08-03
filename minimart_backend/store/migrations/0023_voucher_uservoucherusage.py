# Generated manually — 2026-04-16
# Tương đương output của: python manage.py makemigrations store --name voucher_uservoucherusage

import django.core.validators
import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('store', '0022_reviewmedia_delete_at_reviewmedia_delete_by'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [

        # ── 1. Tạo bảng Voucher ────────────────────────────────────────────────
        migrations.CreateModel(
            name='Voucher',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('code', models.CharField(
                    db_index=True,
                    help_text='Mã giảm giá (vd: SUMMER20). Tự động normalize về UPPERCASE khi lưu.',
                    max_length=50,
                    unique=True,
                )),
                ('discount_type', models.CharField(
                    choices=[('PERCENT', 'Giảm theo phần trăm'), ('FIXED', 'Giảm số tiền cố định')],
                    help_text='PERCENT: giảm %, FIXED: giảm tiền cố định.',
                    max_length=10,
                )),
                ('discount_value', models.DecimalField(
                    decimal_places=2,
                    help_text='PERCENT: 0-100. FIXED: số tiền VNĐ.',
                    max_digits=12,
                    validators=[django.core.validators.MinValueValidator(0)],
                )),
                ('max_discount_amount', models.DecimalField(
                    blank=True,
                    decimal_places=2,
                    help_text='[Chỉ dùng với PERCENT] Mức giảm tối đa bằng tiền (VNĐ). NULL = không giới hạn.',
                    max_digits=12,
                    null=True,
                )),
                ('min_order_amount', models.DecimalField(
                    decimal_places=2,
                    default=0,
                    help_text='Giá trị đơn hàng tối thiểu (subtotal) để áp dụng mã.',
                    max_digits=12,
                    validators=[django.core.validators.MinValueValidator(0)],
                )),
                ('start_date', models.DateTimeField(
                    help_text='Thời điểm bắt đầu hiệu lực. Phải là timezone-aware.',
                )),
                ('end_date', models.DateTimeField(
                    help_text='Thời điểm hết hiệu lực. Phải là timezone-aware.',
                )),
                ('max_usage', models.PositiveIntegerField(
                    blank=True,
                    help_text='Tổng số lượt dùng tối đa toàn hệ thống. NULL = không giới hạn.',
                    null=True,
                )),
                ('usage_count', models.PositiveIntegerField(
                    default=0,
                    help_text='Số lượt đã dùng thực tế. Tăng atomic bằng F() expression.',
                )),
                ('max_usage_per_user', models.PositiveIntegerField(
                    default=1,
                    help_text='Số lượt tối đa mỗi user được dùng mã này. Mặc định: 1 lần/user.',
                )),
                ('is_active', models.BooleanField(
                    default=True,
                    help_text='Tắt/bật mã mà không xóa.',
                )),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('created_by', models.ForeignKey(
                    blank=True,
                    help_text='Admin tạo mã này.',
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='+',
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={
                'verbose_name': 'Mã giảm giá',
                'verbose_name_plural': 'Mã giảm giá',
            },
        ),

        # ── 2. Thêm indexes cho Voucher ────────────────────────────────────────
        migrations.AddIndex(
            model_name='voucher',
            index=models.Index(fields=['code'], name='store_vouch_code_idx'),
        ),
        migrations.AddIndex(
            model_name='voucher',
            index=models.Index(fields=['end_date'], name='store_vouch_end_dat_idx'),
        ),
        migrations.AddIndex(
            model_name='voucher',
            index=models.Index(fields=['is_active'], name='store_vouch_is_acti_idx'),
        ),

        # ── 3. Thêm voucher FK vào Order ───────────────────────────────────────
        migrations.AddField(
            model_name='order',
            name='voucher',
            field=models.ForeignKey(
                blank=True,
                help_text='Voucher đã áp dụng (nếu có).',
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='orders',
                to='store.voucher',
            ),
        ),

        # ── 4. Thêm discount_amount vào Order ─────────────────────────────────
        migrations.AddField(
            model_name='order',
            name='discount_amount',
            field=models.DecimalField(
                decimal_places=2,
                default=0,
                help_text='Số tiền giảm. total = subtotal + shipping_fee - discount_amount.',
                max_digits=12,
            ),
        ),

        # ── 5. Tạo bảng UserVoucherUsage ──────────────────────────────────────
        migrations.CreateModel(
            name='UserVoucherUsage',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('used_at', models.DateTimeField(auto_now_add=True)),
                ('order', models.OneToOneField(
                    help_text='1 đơn hàng chỉ được áp dụng 1 voucher (constraint cứng).',
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='voucher_usage',
                    to='store.order',
                )),
                ('user', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='voucher_usages',
                    to=settings.AUTH_USER_MODEL,
                )),
                ('voucher', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='user_usages',
                    to='store.voucher',
                )),
            ],
            options={
                'verbose_name': 'Lịch sử dùng mã',
                'verbose_name_plural': 'Lịch sử dùng mã',
            },
        ),

        # ── 6. unique_together và index cho UserVoucherUsage ───────────────────
        migrations.AlterUniqueTogether(
            name='uservoucherusage',
            unique_together={('user', 'voucher', 'order')},
        ),
        migrations.AddIndex(
            model_name='uservoucherusage',
            index=models.Index(fields=['user', 'voucher'], name='store_userv_user_vo_idx'),
        ),
    ]
