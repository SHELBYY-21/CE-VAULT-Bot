import type { Metadata } from 'next';
import { BRAND_NAME, BRAND_PRODUCT, BRAND_TAGLINE } from '@/config/brand';
import './globals.css';

export const metadata: Metadata = {
  title: `${BRAND_NAME} · USDT Ledger`,
  description: `${BRAND_NAME} — ${BRAND_PRODUCT} · ${BRAND_TAGLINE}`,
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
