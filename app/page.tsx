import { redirect } from 'next/navigation';

/**
 * The public entry point is the user-owned CE VAULT Empire Desk site.
 * Keep the Render /dashboard and /api routes available separately.
 * No financial information or token is passed in this redirect.
 */
export default function Home() {
  redirect('https://ce-vault-empire-desk.ce-ceo21.chatgpt.site');
}
