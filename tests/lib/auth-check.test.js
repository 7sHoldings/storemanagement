import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isOwner, isEmployee, canAccessStore, canMutate,
  fetchProfile, clearProfileCache,
} from '@/lib/auth-check';

const owner = { id: 'o1', role: 'owner' };
const employeeA = { id: 'e1', role: 'employee', store_id: 'storeA' };

describe('isOwner / isEmployee', () => {
  it('isOwner is true only for owner role', () => {
    expect(isOwner(owner)).toBe(true);
    expect(isOwner(employeeA)).toBe(false);
    expect(isOwner(null)).toBe(false);
    expect(isOwner(undefined)).toBe(false);
  });
  it('isEmployee is true only for employee role', () => {
    expect(isEmployee(employeeA)).toBe(true);
    expect(isEmployee(owner)).toBe(false);
    expect(isEmployee(null)).toBe(false);
  });
});

describe('canAccessStore', () => {
  it('returns false when there is no profile', () => {
    expect(canAccessStore(null, 'storeA')).toBe(false);
  });
  it('owner can access any store', () => {
    expect(canAccessStore(owner, 'storeA')).toBe(true);
    expect(canAccessStore(owner, 'storeB')).toBe(true);
    expect(canAccessStore(owner, null)).toBe(true);
  });
  it('employee can only access their assigned store', () => {
    expect(canAccessStore(employeeA, 'storeA')).toBe(true);
    expect(canAccessStore(employeeA, 'storeB')).toBe(false);
    expect(canAccessStore(employeeA, null)).toBe(false);
  });
});

describe('canMutate', () => {
  it('false for missing profile', () => {
    expect(canMutate(null, 'daily_sales')).toBe(false);
  });
  it('true for owners regardless of entity', () => {
    expect(canMutate(owner, 'daily_sales')).toBe(true);
    expect(canMutate(owner, 'purchases')).toBe(true);
  });
  it('false for employees (writes are owner-only)', () => {
    expect(canMutate(employeeA, 'daily_sales')).toBe(false);
  });
});

describe('fetchProfile + clearProfileCache', () => {
  beforeEach(() => {
    clearProfileCache();
    global.fetch = vi.fn();
  });
  afterEach(() => { delete global.fetch; });

  it('caches the profile and serves repeat reads from the cache', async () => {
    global.fetch.mockResolvedValueOnce({ json: async () => ({ profile: { id: 'p', role: 'owner' } }) });
    const first = await fetchProfile();
    expect(first).toEqual({ id: 'p', role: 'owner' });
    const second = await fetchProfile();
    expect(second).toEqual({ id: 'p', role: 'owner' });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('bypasses the cache with { force: true }', async () => {
    global.fetch.mockResolvedValue({ json: async () => ({ profile: { id: 'p', role: 'owner' } }) });
    await fetchProfile();
    await fetchProfile({ force: true });
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('returns null and does not throw on a network error', async () => {
    global.fetch.mockRejectedValueOnce(new Error('offline'));
    const r = await fetchProfile({ force: true });
    expect(r).toBeNull();
  });

  it('clearProfileCache forces the next call to hit the network', async () => {
    global.fetch.mockResolvedValue({ json: async () => ({ profile: { id: 'p' } }) });
    await fetchProfile();
    clearProfileCache();
    await fetchProfile();
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});
