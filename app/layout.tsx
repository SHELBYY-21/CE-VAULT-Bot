import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'CE VAULT · Financial Dashboard',
  description: 'CE VAULT — Financial Dashboard for USDT⇄THB arbitrage ledger',
}

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
