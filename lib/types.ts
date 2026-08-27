export type TxType = 'income' | 'expense';
export type SharedKind = 'expense' | 'settlement';

export interface Profile {
  id: string;
  display_name: string;
  color: string;
}

export interface Category {
  id: string;
  owner_id: string;
  name: string;
  type: TxType;
  icon: string;
}

export interface PersonalTransaction {
  id: string;
  owner_id: string;
  category_id: string | null;
  type: TxType;
  amount: number;
  occurred_on: string; // yyyy-mm-dd
  note: string | null;
}

export interface SharedTransaction {
  id: string;
  payer_id: string;
  kind: SharedKind;
  amount: number;
  payer_share: number; // 0~1，仅 kind='expense' 时有意义
  category: string | null;
  occurred_on: string;
  note: string | null;
}
