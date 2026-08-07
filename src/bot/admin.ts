import fs from 'fs/promises';
import path from 'path';
import { initStore, registerAdminById, getAdminUsernames } from './store';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const ADMINS_FILE = path.join(DATA_DIR, 'admins.json');

let localAdmins: Set<string> = new Set();

export async function initAdminStore(): Promise<void> {
  await initStore();
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const content = await fs.readFile(ADMINS_FILE, 'utf-8');
    const data = JSON.parse(content);
    if (Array.isArray(data)) {
      localAdmins = new Set(data.map((a: string) => a.toLowerCase().replace(/^@/, '')));
    }
  } catch {
    // If file doesn't exist, seed default owner from env
    const owner = process.env.BOT_OWNER?.toLowerCase().replace(/^@/, '');
    if (owner) {
      localAdmins.add(owner);
      await saveAdmins();
    }
  }
}

async function saveAdmins(): Promise<void> {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(ADMINS_FILE, JSON.stringify(Array.from(localAdmins), null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to save admins file:', err);
  }
}

export function isAdmin(usernameOrId: string | number): boolean {
  const target = String(usernameOrId).toLowerCase().replace(/^@/, '');
  if (localAdmins.has(target)) return true;
  const dbAdmins = getAdminUsernames();
  return dbAdmins.includes(target);
}

export async function addAdmin(usernameOrId: string | number, telegramId?: number): Promise<boolean> {
  const uname = String(usernameOrId).toLowerCase().replace(/^@/, '');
  localAdmins.add(uname);
  await saveAdmins();
  if (telegramId) {
    await registerAdminById(telegramId, uname);
  }
  return true;
}
