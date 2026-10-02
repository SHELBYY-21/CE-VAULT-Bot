// The dashboard view is open without a passphrase/session (owner decision).
// Ledger writes and CSV export stay protected by their own route checks.
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return children;
}
