import type { Config } from 'tailwindcss';

// 设计基调：像一本纸质"账本"。米纸底色 + 墨蓝主色，
// 双人账本用两种人物色区分"我"与"对方"，而不是用泛用的品牌色。
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: '#F7F3EC',
        ink: '#20303D',
        'ink-soft': '#5B6B76',
        ledger: '#123A40',
        'ledger-light': '#1F5F63',
        me: '#B3562B',
        partner: '#3F6FA6',
        income: '#2F7A4F',
        expense: '#B3562B',
        line: '#DFD6C4',
        card: '#FFFDF8',
      },
      fontFamily: {
        display: ['"Noto Serif SC"', 'serif'],
        body: ['"Noto Sans SC"', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      borderRadius: {
        card: '10px',
      },
    },
  },
  plugins: [],
};
export default config;
