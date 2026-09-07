import { GroupExpense, GroupExpenseShare, GroupSettlement } from './types';

/**
 * 多人群组往来账 —— 核心算法
 * ------------------------------------------------------------
 * 1. computeGroupBalances：计算每个成员的"净余额"
 *      净余额 > 0 → 这个人被大家欠钱（垫付得多、该分摊的少）
 *      净余额 < 0 → 这个人欠大家钱
 *    计算方式：
 *      净余额 = Σ(TA 作为 payer 垫付的账单金额)
 *              - Σ(TA 在每笔账单里应承担的分摊金额 share_amount)
 *              + Σ(TA 作为还款人付出的 settlement 金额)   [还债会让净余额趋近 0]
 *              - Σ(TA 作为收款人收到的 settlement 金额)
 *
 * 2. simplifyDebts：把复杂的多人欠款关系化简成最少笔数的转账建议。
 *    做法是经典的贪心算法：每次把"欠最多的人"和"被欠最多的人"直接匹配，
 *    虽不保证全局最优，但通常已经非常接近最少笔数，实现简单、足够实用。
 */

export interface SettleSuggestion {
  from: string; // 该转账的人（欠钱的人）
  to: string; // 收款人（被欠钱的人）
  amount: number;
}

export function computeGroupBalances(
  memberIds: string[],
  expenses: GroupExpense[],
  shares: GroupExpenseShare[],
  settlements: GroupSettlement[]
): Record<string, number> {
  const balance: Record<string, number> = {};
  memberIds.forEach((id) => (balance[id] = 0));

  for (const exp of expenses) {
    balance[exp.payer_id] = (balance[exp.payer_id] ?? 0) + Number(exp.amount);
  }
  for (const s of shares) {
    balance[s.user_id] = (balance[s.user_id] ?? 0) - Number(s.share_amount);
  }
  for (const st of settlements) {
    balance[st.from_user] = (balance[st.from_user] ?? 0) + Number(st.amount);
    balance[st.to_user] = (balance[st.to_user] ?? 0) - Number(st.amount);
  }

  for (const k in balance) balance[k] = round2(balance[k]);
  return balance;
}

export function simplifyDebts(balances: Record<string, number>): SettleSuggestion[] {
  const creditors: { id: string; amt: number }[] = [];
  const debtors: { id: string; amt: number }[] = [];

  for (const [id, amt] of Object.entries(balances)) {
    if (amt > 0.005) creditors.push({ id, amt });
    else if (amt < -0.005) debtors.push({ id, amt: -amt });
  }
  creditors.sort((a, b) => b.amt - a.amt);
  debtors.sort((a, b) => b.amt - a.amt);

  const result: SettleSuggestion[] = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const pay = round2(Math.min(debtors[i].amt, creditors[j].amt));
    if (pay > 0.005) {
      result.push({ from: debtors[i].id, to: creditors[j].id, amount: pay });
    }
    debtors[i].amt = round2(debtors[i].amt - pay);
    creditors[j].amt = round2(creditors[j].amt - pay);
    if (debtors[i].amt < 0.005) i++;
    if (creditors[j].amt < 0.005) j++;
  }
  return result;
}

/**
 * 均摊金额计算：把 total 平均分给 n 个人，自动把因为四舍五入产生的
 * 1 分钱误差分配给前几位，保证总和精确等于 total（避免出现 0.1+0.1+0.1 != 0.3 的问题）。
 */
export function splitEqually(total: number, n: number): number[] {
  if (n <= 0) return [];
  const cents = Math.round(total * 100);
  const base = Math.floor(cents / n);
  const remainder = cents - base * n;
  const result: number[] = [];
  for (let i = 0; i < n; i++) {
    const extra = i < remainder ? 1 : 0;
    result.push(round2((base + extra) / 100));
  }
  return result;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
