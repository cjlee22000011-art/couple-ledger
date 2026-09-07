# 我们的账本 · 个人记账 + 多人群组往来账

技术栈：Next.js (App Router，静态导出) + Tailwind CSS + Supabase（Postgres + Auth + RLS）+ Recharts。

> 这一版加回了**登录注册**，并把"往来账"从固定两人升级成**任意人数的群组**：
> 创建群组、生成邀请码分享给朋友，每笔账单可以指定"谁付的钱"，以及**每个参与人各自分摊多少钱**（不要求平均），
> 系统会自动算出每个人的净余额，并给出"最少笔数"的转账建议。

---

## 一、架构与数据设计

```
浏览器 (React 静态站点，托管在 GitHub Pages / Vercel / Cloudflare Pages)
        │  直接调用 Supabase REST API（用 anon/publishable key，受 RLS 保护）
        ▼
Supabase 项目
  ├─ Auth：邮箱 + 密码登录注册
  ├─ Postgres 表：
  │    profiles                用户资料（关联 auth.users）
  │    categories               个人自定义分类
  │    personal_transactions    个人账本流水
  │    groups                    群组（人数不限：情侣二人 / 一群朋友都行）
  │    group_members             群组成员关系
  │    group_expenses            群组账单（谁垫付了多少钱）
  │    group_expense_shares      每笔账单里，每个人各自要分摊的金额（可自定义，不要求平均）
  │    group_settlements         群组内的还款/结清记录
  └─ RLS 策略：个人数据仅本人可见；群组数据仅该群组成员可读写
```

完整建表 SQL 见 [`supabase/schema.sql`](./supabase/schema.sql)。

### 群组往来账核心模型

一笔账单 = `group_expenses` 里一行（谁付的、多少钱、哪个群组） + `group_expense_shares` 里若干行
（这笔账单每个参与人分别要承担多少钱）。**分摊金额完全自定义**，比如三人聚餐，可以是
"张三 100、李四 80、王五 120"这种不均等的分法，只要求这些金额加起来等于账单总额。

结清用 `group_settlements` 记录"谁转账给谁多少钱"。

### 自动平账算法（`lib/groupBalance.ts`）

1. **`computeGroupBalances`**：给每个成员算一个"净余额"
   ```
   净余额 = Σ(TA 作为付款人垫付的账单金额)
           - Σ(TA 在每笔账单里应分摊的金额)
           + Σ(TA 作为还款人付出的结清金额)
           - Σ(TA 作为收款人收到的结清金额)
   ```
   净余额 > 0 表示"大家欠 TA 钱"，< 0 表示"TA 欠大家钱"。

2. **`simplifyDebts`**：把多人之间复杂的欠款关系化简成**最少笔数**的转账建议。
   算法是经典的贪心策略——每次把"欠最多的人"和"被欠最多的人"直接匹配掉一部分，
   循环直到所有人余额清零。比如 A 欠 B 100、B 欠 C 100，简化后就是"A 直接转 100 给 C"，
   而不需要 A→B→C 转两次。

3. **`splitEqually`**：均摊金额时自动处理四舍五入的 1 分钱误差（比如 3 人分 10 元，
   不会出现 3.33+3.33+3.33=9.99 少 1 分钱的问题，会自动把零头分给前几位）。

---

## 二、本地运行（Windows 用 PowerShell，Mac/Linux 用终端）

```powershell
# 1. 安装依赖
# 如果你是在旧项目文件夹基础上覆盖更新的，建议先删掉旧的锁文件重新生成，
# 避免出现 package.json 和 package-lock.json 版本对不上导致 `npm ci` 报错：
# Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue
# Remove-Item package-lock.json -ErrorAction SilentlyContinue
npm install

# 2. 配置环境变量
Copy-Item .env.local.example .env.local
# 编辑 .env.local，填入 Supabase 项目的 URL 和 anon/publishable key
# （Supabase 控制台 → Project Settings → API Keys）

# 3. 初始化数据库
# 打开 Supabase SQL Editor，粘贴并运行 supabase/schema.sql

# 4. 启动开发服务器
npm run dev
# 打开 http://localhost:3000
```

打开网页后会看到登录/注册界面，用邮箱注册几个账号（自己、女友、朋友们），
登录后在"群组往来账"页面创建一个群组，把生成的邀请码分享给朋友，
对方注册登录后输入邀请码即可加入同一个群组一起记账。

> **关于邮箱验证**：Supabase 项目默认开启"注册后需要点击邮件里的确认链接才能登录"。
> 如果是自己人小范围使用，可以去 Supabase 控制台 **Authentication → Providers → Email**
> 关掉 "Confirm email"，这样注册后可以直接登录，不用等确认邮件。

---

## 三、部署到 GitHub Pages

因为所有数据读写都通过浏览器直接调用 Supabase 的 REST API（有 RLS 保护），
整个前端可以用静态导出打包，部署到 GitHub Pages。

### 步骤

1. **仓库必须是 Public（公开）**——GitHub Pages 免费版不支持私有仓库启用 Pages。
2. **创建 GitHub 仓库**，推送代码上去。
3. **配置 Secrets**（仓库 Settings → Secrets and variables → Actions）：
   - `NEXT_PUBLIC_SUPABASE_URL` —— 纯净的 Project URL，形如 `https://xxxx.supabase.co`，
     **末尾不要带 `/rest/v1` 或多余斜杠**
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` —— Supabase 新版 API Keys 页面里的 **Publishable key**
     （老项目叫 "anon public" key，是同一个用途）
4. **开启 GitHub Pages**：仓库 Settings → Pages → Build and deployment → Source 选择 **GitHub Actions**。
5. **推送到 `main` 分支**，GitHub Actions 会自动执行 [`deploy.yml`](./.github/workflows/deploy.yml)。
6. 访问 `https://<username>.github.io/<repo>/`。

### Supabase 侧：允许你的 Pages 域名做登录跳转
Supabase **Authentication → URL Configuration** 里，把
`https://<username>.github.io` 加入 **Site URL** 和 **Redirect URLs**。

---

## 四、（可选）部署到 Vercel / Cloudflare Pages

- Build 命令：`next build`
- 输出目录：Vercel 无需设置；Cloudflare Pages 设为 `out`
- 同样配置好两个 `NEXT_PUBLIC_SUPABASE_*` 环境变量，`NEXT_PUBLIC_BASE_PATH` 留空。

---

## 五、目录结构

```
app/
  layout.tsx        根布局，挂载 AuthProvider + 顶部导航
  page.tsx           首页：根据登录状态跳转
  login/page.tsx      登录/注册
  personal/page.tsx    个人账本：记账 + 列表
  groups/page.tsx        群组列表：创建群组 / 用邀请码加入
  groups/detail/page.tsx  群组详情：记账（自定义分摊）、净余额、结清建议
  stats/page.tsx           统计：月度/年度收支趋势 + 分类占比
  settings/page.tsx         个人资料、自定义分类
lib/
  supabaseClient.ts  Supabase 客户端单例
  AuthContext.tsx    登录态 / 个人资料的全局 Context
  groupBalance.ts     多人往来账核心算法：净余额计算 + 债务化简 + 均摊
  types.ts             全局 TypeScript 类型
  date.ts               日期/金额格式化小工具
supabase/
  schema.sql          建表 + RLS 策略 + 新用户触发器
.github/workflows/
  deploy.yml            GitHub Pages 自动部署工作流
```

---

## 六、常见问题排查

- **`npm ci` 报 "Invalid: lock file's xxx does not satisfy xxx"**：说明 `package.json` 和
  `package-lock.json` 版本对不上。删掉 `node_modules` 和 `package-lock.json` 重新 `npm install`。
- **CSS 报 `@import rules must precede all rules`**：`globals.css` 里的 `@import` 字体引入
  必须写在文件**最顶部**，在 `@tailwind` 之前。
- **网页显示 `Invalid path specified in request URL` / 请求网址出现两次 `/rest/v1/`**：
  `NEXT_PUBLIC_SUPABASE_URL` 填错了，多带了路径。去 Supabase **Settings → General**
  确认纯净的 Project URL，格式必须是 `https://项目ID.supabase.co`，不带任何后缀。
- **GitHub Pages 提示 "Upgrade or make this repository public to enable Pages"**：
  免费账号的私有仓库不能用 Pages，去仓库 Settings → General → Danger Zone 把仓库改成 Public。
- **从旧版本（无登录版）升级**：先在 Supabase SQL Editor 执行
  `supabase/schema.sql` 文件最下方注释掉的"清空旧表"那几行 `drop table ... cascade`，
  再运行完整建表脚本。

---

## 七、后续可扩展方向
- 用 Supabase Storage 保存账单小票图片
- 群组内按百分比分摊（目前是均摊或自定义金额，可以再加一种"按比例"模式）
- 预算提醒（月度支出超过设定阈值时提示）
- 群组内多币种支持（出国旅行分账常见需求）
