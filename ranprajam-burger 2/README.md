# Ranprajam burger – ระบบสะสมคะแนน

เว็บ HTML/CSS/JS ล้วน โฮสต์บน GitHub Pages ใช้ Supabase เป็นฐานข้อมูลและระบบล็อกอิน

## ตั้งค่า
1. สร้างโปรเจกต์ที่ supabase.com
2. SQL Editor: รัน (โปรเจกต์ใหม่ต้องมี GRANT ซึ่งรวมอยู่ใน 003 แล้ว) `sql/001_schema.sql`, `002_functions.sql`, `003_policies.sql`, `005_phone_only.sql` ตามลำดับ
3. Authentication > Users > Add user สร้างแอดมินด้วยอีเมลและรหัสผ่าน คัดลอก User UID ไปใส่ใน `sql/004_first_admin.sql` แล้วรัน
4. ไม่ต้องตั้งค่า Phone/OTP ลูกค้าดูคะแนนด้วยเบอร์โทรอย่างเดียวผ่านฟังก์ชัน `lookup_points` (ไม่มีค่า SMS)
5. แก้ `js/config.js` ใส่ Project URL และ Publishable key `sb_publishable_...` (ห้ามใส่ Secret key หรือ service_role key)
6. Authentication > URL Configuration: ใส่ URL ของ GitHub Pages เป็น Site URL และ Redirect URLs
7. GitHub: Settings > Pages > Deploy from a branch > main / (root)

## หน้าต่าง ๆ
- `/` หน้าแรก, `/menu.html`, `/about.html`
- `/customer.html` ลูกค้ากรอกเบอร์โทรดูคะแนน (ไม่ต้อง OTP)
- `/admin/` แอดมินกรอกใบเสร็จ ดูรายการรายวัน ตั้งค่าคะแนน จัดการบัตรและแอดมิน

## กฎคะแนน
ยอดตั้งแต่ขั้นต่ำ (ค่าเริ่มต้น 100 บาท) ได้ 10 คะแนนคงที่ต่อใบเสร็จ ได้ไม่เกิน 1 ใบต่อวันต่อลูกค้า ใบที่สองของวันเดียวกันบันทึกได้แต่ไม่ได้คะแนน แอดมินปรับค่าได้ในหน้าแอดมิน

## ก่อนเปิดใช้จริง
แก้ที่อยู่ เบอร์โทร LINE เมนู และเรื่องราวร้านใน `index.html`, `menu.html`, `about.html`
