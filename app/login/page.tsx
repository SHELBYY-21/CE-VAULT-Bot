import { redirect } from 'next/navigation';

/** The dashboard no longer requires a passphrase login; keep old links working. */
export default function LoginPage() {
  redirect('/dashboard');
}
