import { redirect } from 'next/navigation';

/** The public entry point is this site's dashboard. */
export default function Home() {
  redirect('/dashboard');
}
