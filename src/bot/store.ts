import path from 'path';
import fs from 'fs';

export interface SlipRecord {
  id: string;
  telegramUserId: number;
  username: string;
  thbAmount?: number | null;
  usdtAmount?: number | null;
  bank?: string | null;
  last4?: string | null;
  receiverName?: string | null;
  senderName?: string | null;
  date?: string | null;
  time?: string | null;
  confidence?: number | null;
  status: 'PENDING_USDT' | 'CONFIRMED' | 'REJECTED';
  createdAt: string;
}

export interface ActionLog {
  id: string;
  telegramUserId: number;
  username: string;
  action: string;
  details?: string;
  timestamp: string;
}

const memoryStore = {
  admins: new Map<number, string>(),
  slips: new Map<string, SlipRecord>(),
  logs: [] as ActionLog[],
};

let db: any = null;

export async function initStore(): Promise<void> {
  try {
    // Dynamic import better-sqlite3 if available
    const Database = require('better-sqlite3');
    const dataDir = path.resolve(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    const dbPath = path.join(dataDir, 'cevault.db');
    db = new Database(dbPath);

    db.exec(`
      CREATE TABLE IF NOT EXISTS admins (
        telegram_id INTEGER PRIMARY KEY,
        username TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS slips (
        id TEXT PRIMARY KEY,
        telegram_user_id INTEGER,
        username TEXT,
        thb_amount REAL,
        usdt_amount REAL,
        bank TEXT,
        last4 TEXT,
        receiver_name TEXT,
        sender_name TEXT,
        date TEXT,
        time TEXT,
        confidence REAL,
        status TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS action_logs (
        id TEXT PRIMARY KEY,
        telegram_user_id INTEGER,
        username TEXT,
        action TEXT,
        details TEXT,
        timestamp TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ SQLite Store initialized');
  } catch {
    console.log('ℹ️ SQLite not loaded, using fallback memory store');
  }
}

export async function registerAdminById(telegramId: number, username: string): Promise<void> {
  memoryStore.admins.set(telegramId, username);
  if (db) {
    try {
      db.prepare('INSERT OR REPLACE INTO admins (telegram_id, username) VALUES (?, ?)').run(telegramId, username);
    } catch (e) {
      console.warn('SQLite error on registerAdminById:', e);
    }
  }
}

export function getAdminUsernames(): string[] {
  const list: string[] = Array.from(memoryStore.admins.values());
  if (db) {
    try {
      const rows = db.prepare('SELECT username FROM admins').all() as { username: string }[];
      for (const r of rows) {
        if (!list.includes(r.username)) list.push(r.username);
      }
    } catch {}
  }
  return list;
}

export async function persistSlip(slip: SlipRecord): Promise<void> {
  memoryStore.slips.set(slip.id, slip);
  if (db) {
    try {
      db.prepare(`
        INSERT OR REPLACE INTO slips 
        (id, telegram_user_id, username, thb_amount, usdt_amount, bank, last4, receiver_name, sender_name, date, time, confidence, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        slip.id,
        slip.telegramUserId,
        slip.username,
        slip.thbAmount ?? null,
        slip.usdtAmount ?? null,
        slip.bank ?? null,
        slip.last4 ?? null,
        slip.receiverName ?? null,
        slip.senderName ?? null,
        slip.date ?? null,
        slip.time ?? null,
        slip.confidence ?? null,
        slip.status,
        slip.createdAt
      );
    } catch (e) {
      console.warn('SQLite error on persistSlip:', e);
    }
  }
}

export async function logAction(userId: number, username: string, action: string, details?: string): Promise<void> {
  const logItem: ActionLog = {
    id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    telegramUserId: userId,
    username,
    action,
    details,
    timestamp: new Date().toISOString(),
  };
  memoryStore.logs.push(logItem);
  if (db) {
    try {
      db.prepare(`
        INSERT INTO action_logs (id, telegram_user_id, username, action, details, timestamp)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(logItem.id, logItem.telegramUserId, logItem.username, logItem.action, logItem.details ?? null, logItem.timestamp);
    } catch (e) {
      console.warn('SQLite error on logAction:', e);
    }
  }
}
