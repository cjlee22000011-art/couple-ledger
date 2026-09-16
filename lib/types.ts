export type TxType = 'income' | 'expense';

export interface Profile {
  id: string;
  display_name: string;
  color: string;
}

export interface Category {
  id: string;
  user_id: string;
  name: string;
  type: TxType;
  icon: string;
}

export interface PersonalTransaction {
  id: string;
  user_id: string;
  category_id: string | null;
  type: TxType;
  amount: number;
  occurred_on: string;
  note: string | null;
}

export interface Group {
  id: string;
  name: string;
  invite_code: string;
  created_by: string;
}

export interface GroupMember {
  group_id: string;
  user_id: string;
}

export interface GroupExpense {
  id: string;
  group_id: string;
  payer_id: string;
  amount: number;
  description: string | null;
  category: string | null;
  occurred_on: string;
  created_by: string;
}

export interface GroupExpenseShare {
  expense_id: string;
  user_id: string;
  share_amount: number;
}

export interface GroupSettlement {
  id: string;
  group_id: string;
  from_user: string;
  to_user: string;
  amount: number;
  occurred_on: string;
  note: string | null;
}

export interface GroupCategory {
  id: string;
  group_id: string;
  name: string;
}