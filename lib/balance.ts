import { SharedTransaction } from './types';

/**
 * 双人往来账 —— 自动平账核心算法
 * ------------------------------------------------------------
 * 记账模型：
 *  - kind = 'expense'：payer_id 垫付了 amount 元。
 *      payer_share (0~1) 表示"垫付人自己应承担的比例"，
 *      剩余 (1 - payer_share) 部分即对方应偿还给垫付人的金额。
 *      例：AA 分摊 → payer_share = 0.5；
 *          A 全额帮 B 付款 → payer_share = 0；
 *          A 只是代收/自己消费 70%，B 承担 30% → payer_share = 0.7。
 *  - kind = 'settlement'：payer_id 向对方转账 amount 元用于还款，
 *      直接冲减 payer_id 欠对方的金额（即"结清 / 部分还款"）。
 *
 * 计算方式：
 *  以 userA 视角累计"净应收"（正数=对方欠A，负数=A欠对方）：
 *    + 每笔 A 垫付的 expense 的应收部分 (amount * (1 - payer_share))
 *    - 每笔 B 垫付的 expense 的应收部分 (amount * (1 - payer_share))
 *    - 每笔 B 支付给 A 的 settlement（减少 B 对 A 的欠款）
 *    + 每笔 A 支付给 B 的 settlement（减少 A 对 B 的欠款，即增加 A 净应收的反向抵消）
 *
 * 返回统一结构 { fromUserId, toUserId, amount }，
 * amount = 0 时代表已结清，无需再互转。
 */

export interface BalanceResult {
  /** 净应收方（即被欠钱的人），已结清时为 null */
  toUserId: string | null;
  /** 净应付方（即欠钱的人），已结清时为 null */
  fromUserId: string | null;
  /** 需要结清的金额，保留两位小数，已结清为 0 */
  amount: number;
}

export function computeBalance(
  transactions: SharedTransaction[],
  userA: string,
  userB: string
): BalanceResult {
  let netToA = 0; // 正数：B 欠 A；负数：A 欠 B

  for (const tx of transactions) {
    if (tx.kind === 'expense') {
      const owed = round2(tx.amount * (1 - tx.payer_share));
      if (tx.payer_id === userA) netToA += owed;
      else if (tx.payer_id === userB) netToA -= owed;
    } else if (tx.kind === 'settlement') {
      // settlement 的 payer 是"还钱的人"，收款方是另一方
      if (tx.payer_id === userB) netToA -= tx.amount; // B 还给 A，B 的欠款减少 => A净应收减少
      else if (tx.payer_id === userA) netToA += tx.amount; // A 还给 B，等价于 A 之前欠 B，现在减少欠款 => netToA(负数)向 0 靠拢
    }
  }

  netToA = round2(netToA);

  if (Math.abs(netToA) < 0.005) {
    return { toUserId: null, fromUserId: null, amount: 0 };
  }
  if (netToA > 0) {
    return { toUserId: userA, fromUserId: userB, amount: netToA };
  }
  return { toUserId: userB, fromUserId: userA, amount: -netToA };
}

/**
 * 一键结清：生成一笔刚好抹平当前欠款的 settlement 记录（写入前调用）。
 * 调用方负责把返回值插入 shared_transactions 表。
 */
export function buildSettlementPayload(balance: BalanceResult): Omit<SharedTransaction, 'id'> | null {
  if (!balance.fromUserId || !balance.toUserId || balance.amount <= 0) return null;
  return {
    payer_id: balance.fromUserId, // 欠钱的人发起"还款"
    kind: 'settlement',
    amount: balance.amount,
    payer_share: 0,
    category: '结清',
    occurred_on: new Date().toISOString().slice(0, 10),
    note: '一键结清',
  };
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
