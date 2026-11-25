-- โหมดไม่ใช้ OTP: ลูกค้าดูคะแนนด้วยเบอร์โทรอย่างเดียว (ไม่ต้องล็อกอิน Supabase Auth)
-- รันหลัง 003 ลูกค้าไม่ได้อ่านตารางตรง ๆ แต่เรียกฟังก์ชัน lookup_points ที่คืนเฉพาะ คะแนน/วันที่/ระดับบัตร

drop policy if exists "customer reads own" on customers;
drop policy if exists "customer reads own receipts" on receipts;

-- บันทึกการค้นหาไว้จำกัดอัตรา (กันคนไล่เดาเบอร์) ไม่เปิดให้ role ฝั่งเว็บเข้าถึง
create table if not exists lookup_log (
  id bigint generated always as identity primary key,
  ip text not null,
  at timestamptz not null default now()
);
create index if not exists lookup_log_ip_at on lookup_log (ip, at);
alter table lookup_log enable row level security;
revoke all on lookup_log from anon, authenticated;

create or replace function lookup_points(p_phone text) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_phone text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_hdr json;
  v_ip text;
  v_customer uuid;
  v_total int := 0;
begin
  begin v_hdr := current_setting('request.headers', true)::json;
  exception when others then v_hdr := null; end;
  v_ip := coalesce(nullif(trim(split_part(v_hdr ->> 'x-forwarded-for', ',', 1)), ''), 'unknown');

  delete from lookup_log where at < now() - interval '1 hour';
  if (select count(*) from lookup_log where ip = v_ip and at > now() - interval '1 minute') >= 20 then
    raise exception 'too_many_requests';
  end if;
  insert into lookup_log (ip) values (v_ip);

  if v_phone like '0%' then v_phone := '66' || substr(v_phone, 2); end if;
  if v_phone !~ '^66[689][0-9]{8}$' then raise exception 'invalid_phone'; end if;

  select id into v_customer from customers where phone = v_phone;
  select coalesce(sum(points), 0) into v_total from receipts where customer_id = v_customer;

  return json_build_object(
    'total', v_total,
    'tiers', (select coalesce(json_agg(json_build_object('name', name, 'min_points', min_points)
                                       order by min_points), '[]'::json) from card_tiers),
    'history', (select coalesce(json_agg(h), '[]'::json) from (
                  select bill_date, points from receipts
                  where customer_id = v_customer
                  order by bill_date desc, id desc limit 50) h)
  );
end;
$$;

revoke all on function lookup_points(text) from public;
grant execute on function lookup_points(text) to anon, authenticated;
