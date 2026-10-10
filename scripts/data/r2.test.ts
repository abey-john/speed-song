import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { isR2Configured, getR2PublicUrl } from './r2';

describe('scripts/data/r2', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('detects when R2 is not fully configured', () => {
    delete process.env.R2_ACCOUNT_ID;
    delete process.env.R2_ACCESS_KEY_ID;
    expect(isR2Configured()).toBe(false);
  });

  it('detects when all R2 credentials are present', () => {
    process.env.R2_ACCOUNT_ID = 'test_acc';
    process.env.R2_ACCESS_KEY_ID = 'test_key';
    process.env.R2_SECRET_ACCESS_KEY = 'test_secret';
    process.env.R2_BUCKET_NAME = 'test_bucket';
    process.env.R2_PUBLIC_URL = 'https://pub-test.r2.dev';

    expect(isR2Configured()).toBe(true);
  });

  it('formats public R2 URL cleanly', () => {
    process.env.R2_PUBLIC_URL = 'https://audio.example.com/';
    expect(getR2PublicUrl('track123')).toBe('https://audio.example.com/track123.m4a');
  });
});
