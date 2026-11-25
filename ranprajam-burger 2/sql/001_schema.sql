-- ตารางหลัก
create table customers (
  id uuid primary key default gen_random_uuid(),
  phone text unique not null,           -- รูปแบบ 66812345678 (ไม่มี +) ตรงกับ JWT ของ Supabase
  created_at timestamptz default now()
);

create table receipts (
  id bigint generated always as identity primary key,
  customer_id uuid not null references customers(id),
  receipt_no text unique not null,
  amount numeric(10,2) not null check (amount > 0),
  points int not null default 0,
  bill_date date not null,
  created_by uuid references auth.users(id),
  created_at timestamptz default now()
);

-- ได้คะแนนจากใบเสร็จได้ไม่เกินหนึ่งใบต่อวันต่อลูกค้า
create unique index one_earning_receipt_per_day
  on receipts (customer_id, bill_date) where points > 0;

create table settings (
  key text primary key,
  value text not null
);
insert into settings values ('min_amount', '100'), ('points_per_bill', '10');

create table card_tiers (
  id int generated always as identity primary key,
  name text not null,
  min_points int not null unique check (min_points >= 0)
);
insert into card_tiers (name, min_points) values
  ('Classic', 100), ('Silver', 200), ('Gold', 300);

create table admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  added_by uuid references auth.users(id),   -- null = แอดมินหลัก
  created_at timestamptz default now()
);
