import { redirect } from 'next/navigation';

/**
 * The public entry point is this site's dashboard.
 * Unauthenticated visitors are sent on to /login by the dashboard layout.
 */
export default function Home() {
  redirect('/dashboard');
}
