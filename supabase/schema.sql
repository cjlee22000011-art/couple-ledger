-- ============================================================
-- 个人 + 双人记账应用 — Supabase 数据库结构
-- 在 Supabase 控制台的 SQL Editor 中整段运行即可
-- ============================================================

-- 1. 用户资料表（补充 auth.users）
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  color text not null default '#B3562B', -- 该用户在图表/往来账中的代表色
  created_at timestamptz not null default now()
);

-- 2. 情侣配对关系表（一条记录 = 一对情侣共享一个往来账本）
create table if not exists couples (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references profiles(id) on delete cascade,
  user_b uuid not null references profiles(id) on delete cascade,
  invite_code text unique not null,      -- A 生成邀请码，B 输入邀请码加入
  created_at timestamptz not null default now(),
  constraint different_users check (user_a <> user_b)
);

-- 3. 分类表（个人自定义，income/expense 通用）
create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  name text not null,
  type text not null check (type in ('income', 'expense')),
  icon text not null default '💰',
  created_at timestamptz not null default now(),
  unique (user_id, name, type)
);

-- 4. 个人账本流水
create table if not exists personal_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  category_id uuid references categories(id) on delete set null,
  type text not null check (type in ('income', 'expense')),
  amount numeric(12,2) not null check (amount > 0),
  occurred_on date not null default current_date,
  note text,
  created_at timestamptz not null default now()
);

-- 5. 双人往来账流水（核心表）
-- kind = 'expense'   : payer_id 垫付了 amount，payer_share 是"垫付人自己应承担"的比例(0~1)，
--                       剩余 (1-payer_share) 部分算对方欠 payer 的钱
-- kind = 'settlement' : payer_id 向对方转账 amount 用于还款/结清，直接冲减欠款
create table if not exists shared_transactions (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references couples(id) on delete cascade,
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
-- 行级安全策略 (RLS)：个人数据仅本人可见，往来账双方可见
-- ============================================================
alter table profiles enable row level security;
alter table couples enable row level security;
alter table categories enable row level security;
alter table personal_transactions enable row level security;
alter table shared_transactions enable row level security;

create policy "查看自己的资料" on profiles for select using (auth.uid() = id);
create policy "查看伴侣的资料" on profiles for select using (
  exists (select 1 from couples c where (c.user_a = auth.uid() and c.user_b = profiles.id)
                                      or (c.user_b = auth.uid() and c.user_a = profiles.id))
);
create policy "创建自己的资料" on profiles for insert with check (auth.uid() = id);
create policy "更新自己的资料" on profiles for update using (auth.uid() = id);

create policy "查看自己所在的情侣关系" on couples for select using (auth.uid() in (user_a, user_b));
create policy "创建情侣关系" on couples for insert with check (auth.uid() in (user_a, user_b));
create policy "解除情侣关系" on couples for delete using (auth.uid() in (user_a, user_b));

create policy "管理自己的分类" on categories for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "管理自己的个人流水" on personal_transactions for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "情侣双方可读写往来账" on shared_transactions for all using (
  exists (select 1 from couples c where c.id = shared_transactions.couple_id
            and auth.uid() in (c.user_a, c.user_b))
) with check (
  exists (select 1 from couples c where c.id = shared_transactions.couple_id
            and auth.uid() in (c.user_a, c.user_b))
);

-- 新用户注册时自动写入 profiles（displayName 取邮箱前缀，之后可在设置页修改）
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, split_part(new.email, '@', 1));
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
