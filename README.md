# 我们的账本 · 个人 + 双人记账 Web 应用

技术栈：Next.js 14 (App Router，静态导出) + Tailwind CSS + Supabase（Postgres + Auth + RLS）+ Recharts。

---

## 一、架构与数据设计

```
浏览器 (React 静态站点，托管在 GitHub Pages / Vercel / Cloudflare Pages)
        │  直接调用 Supabase REST API（用 anon key，受 RLS 保护）
        ▼
Supabase 项目
  ├─ Auth：邮箱+密码登录
  ├─ Postgres 表：
  │    profiles              用户资料
  │    couples                情侣配对关系（一对用户共享一个往来账）
  │    categories             个人自定义分类
  │    personal_transactions  个人账本流水
  │    shared_transactions    双人往来账流水（核心表）
  └─ RLS 策略：个人数据仅本人可见；往来账仅配对双方可读写
```

完整建表 SQL 见 [`supabase/schema.sql`](./supabase/schema.sql)，可直接整段粘贴到 Supabase 的 SQL Editor 运行。

### 往来账核心模型（`shared_transactions`）

| 字段 | 说明 |
|---|---|
| `kind` | `expense`（一方垫付一笔支出）或 `settlement`（还款/结清） |
| `payer_id` | 实际付款人 |
| `amount` | 总金额 |
| `payer_share` | 付款人自己应承担的比例（0~1）。AA 平摊=0.5，全额帮对方付=0，请客=1，也可自定义 |

自动平账算法见 [`lib/balance.ts`](./lib/balance.ts) 的 `computeBalance()`：
遍历所有 `expense`/`settlement` 记录，按"谁垫付、垫付人自留比例是多少、谁还了钱"累计净额，
最终得到 `{ fromUserId, toUserId, amount }`，`amount = 0` 即代表已结清。"一键结清"按钮会调用
`buildSettlementPayload()` 生成一笔刚好抹平当前欠款的 `settlement` 记录写入数据库。

---

## 二、本地运行

```bash
# 1. 安装依赖
npm install

# 2. 配置环境变量
cp .env.local.example .env.local
# 编辑 .env.local，填入 Supabase 项目的 URL 和 anon key
# （Supabase 控制台 → Project Settings → API）

# 3. 初始化数据库
# 打开 Supabase SQL Editor，粘贴并运行 supabase/schema.sql

# 4. 启动开发服务器
npm run dev
# 打开 http://localhost:3000
```

注册两个账号（分别代表你和女友），登录后在"往来账"页面互相生成/输入邀请码即可绑定。

> **关于邀请码流程的简化说明**：示例中的绑定逻辑为了控制代码量做了简化（`couples.user_b` 会先自引用占位）。
> 生产环境建议新增一张 `invites(id, inviter_id, code, created_at, used_by)` 表，
> 邀请人生成邀请码写入 `invites`，被邀请人输入后再由后端（或一个 Supabase Edge Function/RPC）
> 校验并创建 `couples` 行，这样两边的 `user_id` 都是登录后拿到的真实值，逻辑更严谨、也更安全。

---

## 三、部署到 GitHub Pages（纯前端静态站点）

因为所有数据读写都通过浏览器直接调用 Supabase 的 REST API（有 RLS 保护，anon key 可以公开），
所以整个前端可以用 `next export` 打包成纯静态文件，部署到 GitHub Pages。

### 步骤

1. **创建 GitHub 仓库**，把本项目代码推送上去（仓库名任意，例如 `couple-ledger`）。

2. **在仓库中配置 Secrets**（Settings → Secrets and variables → Actions → New repository secret）：
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`

3. **开启 GitHub Pages**：仓库 Settings → Pages → Build and deployment → Source 选择 **GitHub Actions**。

4. **确认 `next.config.mjs` 的 basePath**：workflow 中已经自动把
   `NEXT_PUBLIC_BASE_PATH` 设为你的仓库名（`github.event.repository.name`），无需手动改动。
   如果你把仓库设为 `<username>.github.io` 这种根域名仓库，则把
   `.github/workflows/deploy.yml` 里的 `NEXT_PUBLIC_BASE_PATH` 改成空字符串。

5. **推送到 `main` 分支**，GitHub Actions 会自动执行 [`deploy.yml`](./.github/workflows/deploy.yml)：
   安装依赖 → `next build`（静态导出到 `out/`）→ 发布到 GitHub Pages。

6. 几分钟后即可通过 `https://<username>.github.io/<repo>/` 访问。

### Supabase 侧还需要做一件事：允许你的 Pages 域名跨域
Supabase Auth 需要在 **Authentication → URL Configuration** 中把
`https://<username>.github.io` 加入 **Redirect URLs / Site URL**，否则登录会被拒绝。

---

## 四、（可选）部署到 Vercel / Cloudflare Pages

如果不需要纯静态限制，也可以直接把仓库导入 Vercel 或 Cloudflare Pages：
- Build 命令：`next build`
- 输出目录：Vercel 无需设置；Cloudflare Pages 设为 `out`
- 同样在项目的环境变量里配置 `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`，
  `NEXT_PUBLIC_BASE_PATH` 留空即可（不需要子路径）。

---

## 五、目录结构

```
app/
  layout.tsx        根布局，挂载 AuthProvider + 顶部导航
  page.tsx           首页：根据登录状态跳转
  login/page.tsx      登录/注册
  personal/page.tsx   个人账本：记账 + 列表
  shared/page.tsx      双人往来账：绑定伴侣、记账、自动平账、一键结清
  stats/page.tsx        统计：月度/年度收支趋势 + 分类占比
  settings/page.tsx      个人资料、自定义分类、解绑伴侣
lib/
  supabaseClient.ts  Supabase 客户端单例
  AuthContext.tsx    登录态 / 个人资料 / 情侣关系的全局 Context
  balance.ts          往来账自动平账核心算法（含注释与使用说明）
  types.ts             全局 TypeScript 类型
  date.ts               日期/金额格式化小工具
supabase/
  schema.sql          建表 + RLS 策略 + 新用户触发器
.github/workflows/
  deploy.yml            GitHub Pages 自动部署工作流
```

---

## 六、后续可扩展方向
- 用 Supabase Storage 保存账单小票图片
- 往来账支持三人及以上的多人分摊（当前模型专为两人设计，扩展需要把 `payer_share` 改成
  `beneficiary_shares: {user_id: amount}` 的 JSON 结构）
- 加上预算提醒（月度支出超过设定阈值时提示）
- 用 PWA（`next-pwa`）让手机上可以"添加到主屏幕"，体验更接近原生 App
