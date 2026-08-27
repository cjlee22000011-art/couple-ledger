# 我们的账本 · 个人 + 双人记账 Web 应用

技术栈：Next.js (App Router，静态导出) + Tailwind CSS + Supabase（Postgres，无需登录注册）+ Recharts。

> **无需登录注册**：打开网页后从"你是谁"里选一个身份（比如"我"/"对方"）即可直接使用，
> 选择会记在本设备浏览器里，之后不用重复选。数据库里固定只有两个人，专为你们两人设计。

---

## 一、架构与数据设计

```
浏览器 (React 静态站点，托管在 GitHub Pages / Vercel / Cloudflare Pages)
        │  直接调用 Supabase REST API（用 anon key）
        ▼
Supabase 项目
  └─ Postgres 表：
       profiles              固定两条记录：你和对方（无需注册，选一个身份即可）
       categories             个人自定义分类
       personal_transactions  个人账本流水
       shared_transactions    双人往来账流水（核心表）
```

⚠️ **安全性说明**：去掉登录注册意味着任何拿到你网址的人理论上都能读写数据（因为
Supabase 的 anon key 会被打包进静态网页里）。默认没有开启严格的行级权限控制，
只依赖"网址不公开"这层保护。如果这份账本涉及隐私财务数据，强烈建议开启下面的
"可选：加一层访问码"功能。

完整建表 SQL 见 [`supabase/schema.sql`](./supabase/schema.sql)，可直接整段粘贴到 Supabase 的 SQL Editor 运行。

### 可选：加一层访问码

在 `.env.local`（本地）或 GitHub Secrets（部署）里设置 `NEXT_PUBLIC_ACCESS_CODE=你自己定的码`，
打开网页时会要求先输入这个码才能看到账本内容，正确后记在本机浏览器里，不用重复输入。
这不是真正的账号登录，只是防止陌生人随手点进网址看到内容，请不要指望它防住真正想攻击的人。

### 往来账核心模型（`shared_transactions`）

| 字段 | 说明 |
|---|---|
| `kind` | `expense`（一方垫付一笔支出）或 `settlement`（还款/结清） |
| `payer_id` | 实际付款人（`profiles` 表里两条记录之一） |
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
# Windows PowerShell:
Copy-Item .env.local.example .env.local
# macOS / Linux:
# cp .env.local.example .env.local
# 编辑 .env.local，填入 Supabase 项目的 URL 和 anon key
# （Supabase 控制台 → Project Settings → API）

# 3. 初始化数据库
# 打开 Supabase SQL Editor，粘贴并运行 supabase/schema.sql
# 这一步会自动插入两条初始人物记录："我" 和 "对方"

# 4. 启动开发服务器
npm run dev
# 打开 http://localhost:3000
```

打开网页后会看到"你是谁"的选择界面，选一个身份即可开始记账。想改成你们的真实名字，
去"设置"页修改即可。

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
  layout.tsx        根布局，挂载访问码门槛 + WhoAmIProvider + 顶部导航
  page.tsx           首页：未选身份则显示"你是谁"，已选则跳个人账本
  personal/page.tsx   个人账本：记账 + 列表
  shared/page.tsx      双人往来账：记账、自动平账、一键结清
  stats/page.tsx        统计：月度/年度收支趋势 + 分类占比
  settings/page.tsx      修改两人名字、管理自定义分类
components/
  AppGate.tsx         可选的访问码软门槛
  WhoAmIPicker.tsx     "你是谁"身份选择界面
  Nav.tsx               顶部导航 + 身份切换按钮
lib/
  supabaseClient.ts  Supabase 客户端单例
  WhoAmIContext.tsx  当前身份 / 两人资料的全局 Context（存在 localStorage，无需登录）
  balance.ts          往来账自动平账核心算法（含注释与使用说明）
  types.ts             全局 TypeScript 类型
  date.ts               日期/金额格式化小工具
supabase/
  schema.sql          建表 + 初始两条人物记录 + 开放式访问策略
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
