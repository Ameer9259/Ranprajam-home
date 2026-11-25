-- สิทธิ์เข้าถึงผ่าน Data API (โปรเจกต์ Supabase ใหม่ไม่เปิดให้อัตโนมัติ ต้อง GRANT เอง)
-- GRANT ควบคุมว่า role เข้าตารางได้ไหม ส่วน RLS ด้านล่างควบคุมว่าเห็นแถวไหน
grant select on table public.customers, public.receipts to authenticated;
grant select, insert, update, delete on table public.card_tiers, public.settings, public.admins to authenticated;

alter table customers enable row level security;
alter table receipts enable row level security;
alter table settings enable row level security;
alter table card_tiers enable row level security;
alter table admins enable row level security;

-- ลูกค้าอ่านได้เฉพาะของตัวเอง (เทียบเบอร์จาก JWT)
create policy "customer reads own" on customers
  for select using (phone = (auth.jwt() ->> 'phone'));
create policy "customer reads own receipts" on receipts
  for select using (customer_id in (select id from customers where phone = (auth.jwt() ->> 'phone')));

-- แอดมินอ่านข้อมูลลูกค้าและใบเสร็จได้ทั้งหมด
create policy "admin reads customers" on customers for select using (is_admin());
create policy "admin reads receipts" on receipts for select using (is_admin());

-- ระดับบัตร: ทุกคนอ่านได้ แอดมินแก้ได้
create policy "anyone reads tiers" on card_tiers for select using (true);
create policy "admin manages tiers" on card_tiers for all using (is_admin()) with check (is_admin());

-- ค่าตั้งต้น: เฉพาะแอดมิน
create policy "admin manages settings" on settings for all using (is_admin()) with check (is_admin());

-- แอดมิน: ทุกคนอ่านแถวของตัวเองได้ แอดมินหลักจัดการได้
create policy "read own admin row" on admins for select using (user_id = auth.uid());
create policy "main admin manages admins" on admins for all using (is_main_admin()) with check (is_main_admin());

-- ห้ามเขียน receipts/customers ตรง ต้องผ่าน add_receipt เท่านั้น
revoke insert, update, delete on customers, receipts from anon, authenticated;
