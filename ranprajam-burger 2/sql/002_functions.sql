create or replace function is_admin() returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from admins where user_id = auth.uid());
$$;

create or replace function is_main_admin() returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from admins where user_id = auth.uid() and added_by is null);
$$;

-- บันทึกใบเสร็จ (เฉพาะแอดมิน)
-- ยอด >= min_amount ได้ points_per_bill คะแนนคงที่ และได้ไม่เกิน 1 ใบต่อวัน
create or replace function add_receipt(
  p_phone text, p_receipt_no text, p_amount numeric, p_bill_date date default null
) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_phone text := regexp_replace(p_phone, '\D', '', 'g');
  v_customer uuid;
  v_date date := coalesce(p_bill_date, (now() at time zone 'Asia/Bangkok')::date);
  v_min numeric; v_pts int; v_points int := 0;
begin
  if not is_admin() then raise exception 'unauthorized'; end if;

  if v_phone like '0%' then v_phone := '66' || substr(v_phone, 2); end if;
  if v_phone !~ '^66[689][0-9]{8}$' then raise exception 'invalid_phone'; end if;

  select value::numeric into v_min from settings where key = 'min_amount';
  select value::int into v_pts from settings where key = 'points_per_bill';

  insert into customers (phone) values (v_phone) on conflict (phone) do nothing;
  select id into v_customer from customers where phone = v_phone;

  if p_amount >= v_min and not exists (
    select 1 from receipts where customer_id = v_customer and bill_date = v_date and points > 0
  ) then v_points := v_pts; end if;

  insert into receipts (customer_id, receipt_no, amount, points, bill_date, created_by)
  values (v_customer, p_receipt_no, p_amount, v_points, v_date, auth.uid());

  return json_build_object('points_earned', v_points);
end;
$$;

-- เพิ่มแอดมินด้วยอีเมล (เฉพาะแอดมินหลัก) ผู้ใช้ต้องถูกสร้างใน Authentication ก่อน
create or replace function add_admin_by_email(p_email text) returns void
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not is_main_admin() then raise exception 'unauthorized'; end if;
  select id into v_id from auth.users where lower(email) = lower(trim(p_email));
  if v_id is null then raise exception 'user_not_found'; end if;
  insert into admins (user_id, added_by) values (v_id, auth.uid()) on conflict do nothing;
end;
$$;

revoke all on function add_receipt(text, text, numeric, date) from public, anon;
revoke all on function add_admin_by_email(text) from public, anon;
grant execute on function add_receipt(text, text, numeric, date) to authenticated;
grant execute on function add_admin_by_email(text) to authenticated;
grant execute on function is_admin() to authenticated;
grant execute on function is_main_admin() to authenticated;
