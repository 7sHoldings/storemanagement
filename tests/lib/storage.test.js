import { describe, it, expect, vi } from 'vitest';
import { uploadInvoice, uploadReceipt, getInvoiceUrl, deleteInvoice, fileToBase64 } from '@/lib/storage';

function mockBucket({ uploadError = null, removeError = null, publicUrl = 'https://x/y.jpg' } = {}) {
  return {
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn().mockResolvedValue({ error: uploadError }),
        remove: vi.fn().mockResolvedValue({ error: removeError }),
        getPublicUrl: vi.fn(() => ({ data: { publicUrl } })),
      })),
    },
  };
}

const blobFile = (name = 'pic.jpg', type = 'image/jpeg') =>
  new File([new Uint8Array([1, 2, 3])], name, { type });

describe('uploadInvoice', () => {
  it('rejects when no file is supplied', async () => {
    await expect(uploadInvoice(mockBucket(), null, { storeName: 'S', vendorName: 'V', date: '2026-05-12' }))
      .rejects.toThrow(/no file/i);
  });

  it('returns { path, url } on success', async () => {
    const supabase = mockBucket({ publicUrl: 'https://storage/url.jpg' });
    const res = await uploadInvoice(supabase, blobFile(), { storeName: 'Bells', vendorName: 'Acme', date: '2026-05-12' });
    expect(res.url).toBe('https://storage/url.jpg');
    expect(res.path).toMatch(/^acme\/bells\/2026-05-12-/);
    expect(res.path).toMatch(/\.jpg$/);
  });

  it('surfaces a supabase upload error', async () => {
    const supabase = mockBucket({ uploadError: { message: 'denied' } });
    await expect(uploadInvoice(supabase, blobFile(), { storeName: 'S', vendorName: 'V', date: '2026-05-12' }))
      .rejects.toMatchObject({ message: 'denied' });
  });
});

describe('uploadReceipt', () => {
  it('builds a {store}/{date}/{kind}-{rand}.{ext} path and returns the public URL', async () => {
    const supabase = mockBucket({ publicUrl: 'https://r/y.png' });
    const res = await uploadReceipt(supabase, blobFile('shot.png', 'image/png'), { storeName: '7s Bells', date: '2026-05-12', kind: 'expense' });
    expect(res.url).toBe('https://r/y.png');
    expect(res.path).toMatch(/^7s-bells\/2026-05-12\/expense-/);
    expect(res.path).toMatch(/\.png$/);
  });

  it('falls back to .jpg when the extension is unknown', async () => {
    const supabase = mockBucket();
    const res = await uploadReceipt(supabase, blobFile('weird.heic9'), { storeName: 'S', date: '2026-05-12', kind: 'k' });
    expect(res.path).toMatch(/\.jpg$/);
  });
});

describe('getInvoiceUrl / deleteInvoice', () => {
  it('getInvoiceUrl returns null for falsy input', () => {
    expect(getInvoiceUrl(mockBucket(), null)).toBeNull();
  });

  it('getInvoiceUrl returns the resolved public URL from supabase', () => {
    const supabase = mockBucket({ publicUrl: 'https://x.com/file.jpg' });
    expect(getInvoiceUrl(supabase, 'some/path.jpg')).toBe('https://x.com/file.jpg');
  });

  it('deleteInvoice silently returns when given no path', async () => {
    await expect(deleteInvoice(mockBucket(), null)).resolves.toBeUndefined();
  });

  it('deleteInvoice rejects when supabase reports an error', async () => {
    const supabase = mockBucket({ removeError: { message: 'forbidden' } });
    await expect(deleteInvoice(supabase, 'a/b.jpg')).rejects.toMatchObject({ message: 'forbidden' });
  });
});

describe('fileToBase64', () => {
  it('strips the data: prefix and returns the base64 payload', async () => {
    const file = new File(['hello'], 'hi.txt', { type: 'text/plain' });
    const b64 = await fileToBase64(file);
    // "hello" → base64 = "aGVsbG8="
    expect(b64).toBe('aGVsbG8=');
  });
});
