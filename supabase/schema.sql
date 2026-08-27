-- ============================================================
-- 个人 + 双人记账应用 —— 数据库结构（无登录版）
-- 适用场景：只有你们两个人使用，不需要账号注册/登录，
-- 打开网页后从"我是谁"里选一个身份即可开始记账。
-- 在 Supabase 控制台的 SQL Editor 中整段运行即可
-- ============================================================

-- 1. 人物表：固定只有两条记录，代表你和你的另一半
create table if not exists profiles (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  color text not null default '#B3562B'
);

-- 首次初始化：插入两个人（名字之后可以在"设置"页面改）
-- 注意：只在第一次建表时运行一次，重复运行会插入重复的人
insert into profiles (display_name, color) values
  ('我', '#B3562B'),
  ('对方', '#3F6FA6');

-- 2. 分类表（每个人可以有自己的自定义分类）
create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id) on delete cascade,
  name text not null,
  type text not null check (type in ('income', 'expense')),
  icon text not null default '💰',
  created_at timestamptz not null default now(),
  unique (owner_id, name, type)
);

-- 3. 个人账本流水
create table if not exists personal_transactions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id) on delete cascade,
  category_id uuid references categories(id) on delete set null,
  type text not null check (type in ('income', 'expense')),
  amount numeric(12,2) not null check (amount > 0),
  occurred_on date not null default current_date,
  note text,
  created_at timestamptz not null default now()
);

-- 4. 双人往来账流水（核心表，只有一份，因为只有你们两个人）
-- kind = 'expense'   : payer_id 垫付了 amount，payer_share 是"垫付人自己应承担"的比例(0~1)，
--                       剩余 (1-payer_share) 部分算对方欠 payer 的钱
-- kind = 'settlement' : payer_id 向对方转账 amount 用于还款/结清，直接冲减欠款
create table if not exists shared_transactions (
  id uuid primary key default gen_random_uuid(),
  payer_id uuid not null references profiles(id) on delete cascade,
  kind text not null check (kind in ('expense', 'settlement')),
  amount numeric(12,2) not null check (amount > 0),
  payer_share numeric(4,3) not null default 0.5 check (payer_share >= 0 and payer_share <= 1),
  category text default '公共支出',
  occurred_on date not null default current_date,
  note text,
  created_at timestamptz not null default now()
);

-- ============================================================
-- 关于安全性的重要说明
-- ============================================================
-- 因为去掉了登录注册，前端是用 Supabase 的 "anon key" 直接读写数据库，
-- 这个 key 会被打包进静态网页里，理论上任何拿到你网址的人都能访问/修改数据。
-- 这里默认不开启行级安全策略（RLS），把访问控制交给下面两道"软门槛"：
--   1) 网址本身不会被搜索引擎收录、也没有人知道（生僻的仓库名 + 不做推广）
--   2) 可选：在前端加一个简单的访问码（见 README 的"可选：加一层访问码"章节）
-- 如果这份账本涉及你不希望被陌生人看到的隐私财务数据，
-- 强烈建议开启访问码功能，或改回登录注册模式。
alter table profiles enable row level security;
alter table categories enable row level security;
alter table personal_transactions enable row level security;
alter table shared_transactions enable row level security;

create policy "允许匿名读写 profiles" on profiles for all using (true) with check (true);
create policy "允许匿名读写 categories" on categories for all using (true) with check (true);
create policy "允许匿名读写 personal_transactions" on personal_transactions for all using (true) with check (true);
create policy "允许匿名读写 shared_transactions" on shared_transactions for all using (true) with check (true);
