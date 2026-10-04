import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'CE Vault · USDT Ledger',
  description: 'CE Vault — ระบบบันทึกธุรกรรม USDT Arbitrage / P2P',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="th">
      <body className="min-h-screen antialiased">
        <div className="aurora" aria-hidden />
        {children}
      </body>
    </html>
  );
}
