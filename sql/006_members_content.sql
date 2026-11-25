-- 006: ชื่อสมาชิก, สมัครสมาชิก, เนื้อหาเว็บที่แก้ได้, เมนูพร้อมรูป (รันต่อจาก 005)
alter table customers add column if not exists first_name text;
alter table customers add column if not exists last_name text;
alter table lookup_log add column if not exists kind text not null default 'lookup';

-- จำกัดอัตราต่อ IP (ใช้ภายในฟังก์ชันเท่านั้น)
create or replace function check_rate(p_kind text, p_limit int) returns void
language plpgsql security definer set search_path = public as $$
declare v_hdr json; v_ip text;
begin
  begin v_hdr := current_setting('request.headers', true)::json; exception when others then v_hdr := null; end;
  v_ip := coalesce(nullif(trim(split_part(v_hdr ->> 'x-forwarded-for', ',', 1)), ''), 'unknown');
  delete from lookup_log where at < now() - interval '1 hour';
  if (select count(*) from lookup_log where ip = v_ip and kind = p_kind and at > now() - interval '1 minute') >= p_limit then
    raise exception 'too_many_requests';
  end if;
  insert into lookup_log (ip, kind) values (v_ip, p_kind);
end; $$;
revoke all on function check_rate(text, int) from public, anon, authenticated;

-- ดูคะแนน (เพิ่มชื่อ)
create or replace function lookup_points(p_phone text) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_phone text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_customer uuid; v_first text; v_total int := 0;
begin
  perform check_rate('lookup', 20);
  if v_phone like '0%' then v_phone := '66' || substr(v_phone, 2); end if;
  if v_phone !~ '^66[689][0-9]{8}$' then raise exception 'invalid_phone'; end if;
  select id, first_name into v_customer, v_first from customers where phone = v_phone;
  select coalesce(sum(points), 0) into v_total from receipts where customer_id = v_customer;
  return json_build_object(
    'first_name', v_first,
    'total', v_total,
    'tiers', (select coalesce(json_agg(json_build_object('name', name, 'min_points', min_points) order by min_points), '[]'::json) from card_tiers),
    'history', (select coalesce(json_agg(h), '[]'::json) from (
      select bill_date, points from receipts where customer_id = v_customer
      order by bill_date desc, id desc limit 50) h));
end; $$;

-- สมัครสมาชิก (ชื่อ นามสกุล เบอร์)
create or replace function register_member(p_first text, p_last text, p_phone text) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_phone text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_first text := trim(coalesce(p_first, '')); v_last text := trim(coalesce(p_last, ''));
  v_id uuid; v_old text;
begin
  perform check_rate('register', 10);
  if v_phone like '0%' then v_phone := '66' || substr(v_phone, 2); end if;
  if v_phone !~ '^66[689][0-9]{8}$' then raise exception 'invalid_phone'; end if;
  if char_length(v_first) not between 1 and 60 or char_length(v_last) not between 1 and 60 then
    raise exception 'invalid_name';
  end if;
  select id, first_name into v_id, v_old from customers where phone = v_phone;
  if v_id is null then
    insert into customers (phone, first_name, last_name) values (v_phone, v_first, v_last);
    return json_build_object('status', 'created');
  elsif v_old is null then   -- เคยมีใบเสร็จแต่ยังไม่มีชื่อ
    update customers set first_name = v_first, last_name = v_last where id = v_id;
    return json_build_object('status', 'completed');
  else
    return json_build_object('status', 'exists');   -- ไม่ทับชื่อเดิม
  end if;
end; $$;

-- แอดมิน: รายชื่อสมาชิกพร้อมคะแนน
create or replace function admin_members()
returns table (id uuid, phone text, first_name text, last_name text, created_at timestamptz,
               total_points bigint, visits bigint, last_date date)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
begin
  if not is_admin() then raise exception 'unauthorized'; end if;
  return query
    select c.id, c.phone, c.first_name, c.last_name, c.created_at,
           coalesce(sum(r.points), 0)::bigint, count(r.id)::bigint, max(r.bill_date)
    from customers c left join receipts r on r.customer_id = c.id
    group by c.id order by c.created_at desc;
end; $$;

create or replace function admin_update_member(p_id uuid, p_first text, p_last text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'unauthorized'; end if;
  update customers set first_name = nullif(trim(p_first), ''), last_name = nullif(trim(p_last), '') where id = p_id;
end; $$;

revoke all on function lookup_points(text), register_member(text, text, text), admin_members(), admin_update_member(uuid, text, text) from public;
grant execute on function lookup_points(text), register_member(text, text, text) to anon, authenticated;
grant execute on function admin_members(), admin_update_member(uuid, text, text) to authenticated;

-- ข้อมูลร้านที่แก้ได้ผ่านหน้าแอดมิน
create table if not exists site_content (key text primary key, value text not null default '');
alter table site_content enable row level security;
create policy "anyone reads content" on site_content for select using (true);
create policy "admin manages content" on site_content for all using (is_admin()) with check (is_admin());
grant select on site_content to anon, authenticated;
grant insert, update, delete on site_content to authenticated;
insert into site_content (key, value) values
  ('shop_name', 'Ranprajam burger'), ('tagline', 'เบอร์เกอร์ทำสดใหม่ทุกชิ้น'),
  ('promo_title', 'ซื้อครบ 100 บาท รับ 10 คะแนน'),
  ('promo_text', 'สะสมครบ 100 คะแนนรับบัตร Classic, 200 รับ Silver, 300 รับ Gold'),
  ('address', '123 ถนนตัวอย่าง แขวงตัวอย่าง เขตตัวอย่าง'), ('hours', 'เปิดทุกวัน 10:00 – 21:00 น.'),
  ('phone', '081-234-5678'), ('line_id', '@yourshop'),
  ('map_lat', ''), ('map_lng', ''), ('maps_url', ''),
  ('about_story', 'ใส่เรื่องราวของร้านที่นี่ ผ่านหน้าแอดมิน แท็บ "ข้อมูลร้าน"')
on conflict (key) do nothing;

-- เมนูอาหาร
create table if not exists menu_items (
  id bigint generated always as identity primary key,
  category text not null default 'เบอร์เกอร์',
  name text not null,
  description text not null default '',
  price numeric(10,2) not null check (price >= 0),
  image_path text,
  sort int not null default 0,
  available boolean not null default true
);
alter table menu_items enable row level security;
create policy "anyone reads menu" on menu_items for select using (available or is_admin());
create policy "admin manages menu" on menu_items for all using (is_admin()) with check (is_admin());
grant select on menu_items to anon, authenticated;
grant insert, update, delete on menu_items to authenticated;
insert into menu_items (category, name, description, price, sort)
select * from (values
  ('เบอร์เกอร์', 'เบอร์เกอร์หมู', 'เนื้อหมูสด ผักสด ซอสสูตรร้าน', 59, 1),
  ('เบอร์เกอร์', 'เบอร์เกอร์เนื้อ', 'เนื้อวัวย่าง ชีส ผักสด', 89, 2),
  ('ของทานเล่น', 'เฟรนช์ฟรายส์', '', 39, 3)
) v(category, name, description, price, sort)
where not exists (select 1 from menu_items);

-- ที่เก็บรูปเมนู (อ่านได้ทุกคน อัปโหลด/ลบได้เฉพาะแอดมิน)
insert into storage.buckets (id, name, public) values ('menu-images', 'menu-images', true)
on conflict (id) do nothing;
create policy "public read menu images" on storage.objects for select using (bucket_id = 'menu-images');
create policy "admin add menu images" on storage.objects for insert to authenticated
  with check (bucket_id = 'menu-images' and is_admin());
create policy "admin update menu images" on storage.objects for update to authenticated
  using (bucket_id = 'menu-images' and is_admin());
create policy "admin delete menu images" on storage.objects for delete to authenticated
  using (bucket_id = 'menu-images' and is_admin());
