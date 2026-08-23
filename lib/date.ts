import dayjs from 'dayjs';

export const today = () => dayjs().format('YYYY-MM-DD');
export const monthKey = (d: string) => dayjs(d).format('YYYY-MM');
export const yearKey = (d: string) => dayjs(d).format('YYYY');
export const fmtMoney = (n: number) => `¥${n.toFixed(2)}`;
