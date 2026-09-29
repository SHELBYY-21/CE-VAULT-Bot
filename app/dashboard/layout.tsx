import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { DASHBOARD_COOKIE, validDashboardSession } from '@/lib/dashboardSession';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const store = await cookies();
  if (!validDashboardSession(store.get(DASHBOARD_COOKIE)?.value)) redirect('/login');
  return children;
}
