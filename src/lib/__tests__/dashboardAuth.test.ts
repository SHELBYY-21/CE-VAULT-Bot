import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { verifyIdToken } = vi.hoisted(() => ({ verifyIdToken: vi.fn() }));
vi.mock('@/lib/firebaseAdmin', () => ({
  adminAuth: { verifyIdToken },
}));

import { requireDashboardAdmin } from '../dashboardAuth';

const req = (token?: string) => new NextRequest('https://ce-vault.example/api/dashboard/data', {
  headers: token ? { Authorization: `Bearer ${token}` } : {},
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('dashboard financial-read authorization', () => {
  it('fails closed when no dashboard admin allowlist is configured', async () => {
    vi.stubEnv('DASHBOARD_ALLOWED_UIDS', '');
    const denied = await requireDashboardAdmin(req('any-token'));
    expect(denied?.status).toBe(503);
    expect(verifyIdToken).not.toHaveBeenCalled();
  });

  it('rejects requests without Firebase ID tokens', async () => {
    vi.stubEnv('DASHBOARD_ALLOWED_UIDS', 'uid-1');
    expect((await requireDashboardAdmin(req()))?.status).toBe(401);
    expect(verifyIdToken).not.toHaveBeenCalled();
  });

  it('rejects invalid/revoked/expired credentials', async () => {
    vi.stubEnv('DASHBOARD_ALLOWED_UIDS', 'uid-1');
    verifyIdToken.mockRejectedValue(new Error('expired'));
    expect((await requireDashboardAdmin(req('invalid-token')))?.status).toBe(401);
    expect(verifyIdToken).toHaveBeenCalledWith('invalid-token', true);
  });

  it('rejects users not listed as approved admins', async () => {
    vi.stubEnv('DASHBOARD_ALLOWED_UIDS', 'uid-1, uid-2');
    verifyIdToken.mockResolvedValue({ uid: 'other-user' });
    expect((await requireDashboardAdmin(req('valid-token')))?.status).toBe(403);
  });

  it('permits a verified Firebase UID in the allowlist', async () => {
    vi.stubEnv('DASHBOARD_ALLOWED_UIDS', 'uid-1, uid-2');
    verifyIdToken.mockResolvedValue({ uid: 'uid-2' });
    expect(await requireDashboardAdmin(req('valid-token'))).toBeNull();
  });
});
