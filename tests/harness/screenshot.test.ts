import { describe, expect, it } from 'vitest';
import type { Page } from 'playwright';
import { screenshot } from '../../harness/render.ts';

const fakePage = (failures: string[]) => {
  let n = 0;
  return {
    calls: () => n,
    page: {
      screenshot: async () => {
        const f = failures[n++];
        if (f) throw new Error(f);
        return Buffer.from('png');
      },
    } as unknown as Page,
  };
};

describe('screenshot retries', () => {
  it('retries the flaky Chromium error and then succeeds', async () => {
    const f = fakePage(['page.screenshot: Protocol error (Page.captureScreenshot): Unable to capture screenshot']);
    expect(String(await screenshot(f.page))).toBe('png');
    expect(f.calls()).toBe(2);
  });
  it('gives up after 3 attempts', async () => {
    const f = fakePage(Array(3).fill('Unable to capture screenshot'));
    await expect(screenshot(f.page)).rejects.toThrow(/Unable to capture/);
    expect(f.calls()).toBe(3);
  });
  it('does not retry unrelated errors', async () => {
    const f = fakePage(['Target page, context or browser has been closed']);
    await expect(screenshot(f.page)).rejects.toThrow(/closed/);
    expect(f.calls()).toBe(1);
  });
});
