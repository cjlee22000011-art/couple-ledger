-- ============================================================
-- 个人 + 多人群组记账应用 —— 数据库结构（含登录注册 + 群组账单）
-- 在 Supabase 控制台的 SQL Editor 中整段运行即可
-- 如果你是在旧版本基础上升级，请先执行文件最下方的
-- "清空旧表" 那段，再运行本脚本。
-- ============================================================

create extension if not exists pgcrypto;

-- 1. 用户资料表（补充 auth.users）
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  color text not null default '#B3562B',
  created_at timestamptz not null default now()
);

-- 2. 分类表（个人自定义）
create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  name text not null,
  type text not null check (type in ('income', 'expense')),
  icon text not null default '💰',
  created_at timestamptz not null default now(),
  unique (user_id, name, type)
);

-- 3. 个人账本流水
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

-- 4. 群组（可以是你和女友两人，也可以是一群朋友旅行分账）
create table if not exists groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text unique not null default substr(md5(random()::text), 1, 8),
  created_by uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- 5. 群组成员
create table if not exists group_members (
  group_id uuid not null references groups(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

-- 6. 群组账单（一笔支出，由一人垫付）
create table if not exists group_expenses (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  payer_id uuid not null references profiles(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  description text,
  category text default '公共支出',
  occurred_on date not null default current_date,
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now()
);

-- 7. 账单分摊明细：这笔账单里，每个参与人各自应该承担多少钱
create table if not exists group_expense_shares (
  expense_id uuid not null references group_expenses(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  share_amount numeric(12,2) not null check (share_amount >= 0),
  primary key (expense_id, user_id)
);

-- 8. 群组内的还款记录（结清用）
create table if not exists group_settlements (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  from_user uuid not null references profiles(id) on delete cascade,
  to_user uuid not null references profiles(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  occurred_on date not null default current_date,
  note text,
  created_at timestamptz not null default now()
);

-- ============================================================
-- 行级安全策略 (RLS)
-- ============================================================
alter table profiles enable row level security;
alter table categories enable row level security;
alter table personal_transactions enable row level security;
alter table groups enable row level security;
alter table group_members enable row level security;
alter table group_expenses enable row level security;
alter table group_expense_shares enable row level security;
alter table group_settlements enable row level security;

create policy "已登录用户可查看所有资料" on profiles for select using (auth.role() = 'authenticated');
create policy "创建自己的资料" on profiles for insert with check (auth.uid() = id);
create policy "更新自己的资料" on profiles for update using (auth.uid() = id);

create policy "管理自己的分类" on categories for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "管理自己的个人流水" on personal_transactions for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "已登录用户可查找群组" on groups for select using (auth.role() = 'authenticated');
create policy "创建群组" on groups for insert with check (auth.uid() = created_by);
create policy "创建者可修改群组" on groups for update using (auth.uid() = created_by);
create policy "创建者可删除群组" on groups for delete using (auth.uid() = created_by);

create or replace function public.is_group_member(gid uuid, uid uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from group_members gm where gm.group_id = gid and gm.user_id = uid
  );
$$;

create policy "查看自己所在群组的成员" on group_members for select using (
  public.is_group_member(group_id, auth.uid())
);
create policy "本人可加入群组" on group_members for insert with check (auth.uid() = user_id);
create policy "本人可退出群组" on group_members for delete using (auth.uid() = user_id);

create policy "群组成员可读写账单" on group_expenses for all using (
  exists (select 1 from group_members gm where gm.group_id = group_expenses.group_id and gm.user_id = auth.uid())
) with check (
  exists (select 1 from group_members gm where gm.group_id = group_expenses.group_id and gm.user_id = auth.uid())
);

create policy "群组成员可读写分摊明细" on group_expense_shares for all using (
  exists (
    select 1 from group_expenses ge
    join group_members gm on gm.group_id = ge.group_id
    where ge.id = group_expense_shares.expense_id and gm.user_id = auth.uid()
  )
) with check (
  exists (
    select 1 from group_expenses ge
    join group_members gm on gm.group_id = ge.group_id
    where ge.id = group_expense_shares.expense_id and gm.user_id = auth.uid()
  )
);

create policy "群组成员可读写结清记录" on group_settlements for all using (
  exists (select 1 from group_members gm where gm.group_id = group_settlements.group_id and gm.user_id = auth.uid())
) with check (
  exists (select 1 from group_members gm where gm.group_id = group_settlements.group_id and gm.user_id = auth.uid())
);

-- 新用户注册时自动写入 profiles
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

-- ============================================================
-- 如果你是从旧版本升级上来，先执行这段清空旧表，再运行上面的建表脚本：
-- ============================================================
-- drop table if exists group_settlements cascade;
-- drop table if exists group_expense_shares cascade;
-- drop table if exists group_expenses cascade;
-- drop table if exists group_members cascade;
-- drop table if exists groups cascade;
-- drop table if exists shared_transactions cascade;
-- drop table if exists couples cascade;
-- drop table if exists personal_transactions cascade;
-- drop table if exists categories cascade;
-- drop table if exists profiles cascade;
