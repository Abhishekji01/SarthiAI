import { test, expect } from '@playwright/test';
import { signedInStudent } from './helpers';

const PDF = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(1500, 0x20), Buffer.from('\n%%EOF')]);

test.describe('F7: documents', () => {
  test('upload to the vault, download through an expiring link, tick and delete', async ({ page, request }) => {
    await signedInStudent(page, request);
    await page.goto('/documents');
    await page.getByLabel('What is it?').selectOption('marksheets');
    await page.getByTestId('vault-file').setInputFiles({ name: 'Semester 3 marks.pdf', mimeType: 'application/pdf', buffer: PDF });
    await expect(page.getByText('Semester 3 marks.pdf')).toBeVisible();
    await expect(page.getByRole('button', { name: 'I have: Mark sheets' })).toHaveAttribute('aria-pressed', 'true');
    const fileRequest = page.context().waitForEvent('request', (r) => r.url().includes('/api/documents/file/'));
    await page.getByRole('button', { name: 'Download Semester 3 marks.pdf' }).click();
    const req = await fileRequest;
    expect(req.url()).toMatch(/\/api\/documents\/file\/[a-f\d]{24}\?token=/);
    expect(req.headers().authorization).toBeUndefined(); // the signed link alone grants access, briefly
    const res = await req.response();
    expect(res?.headers()['content-disposition']).toMatch(/attachment; filename="Semester 3 marks.pdf"/);
    await page.getByRole('button', { name: 'Delete Semester 3 marks.pdf' }).click();
    await expect(page.getByText('Semester 3 marks.pdf')).toHaveCount(0);
  });

  test('a scholarship shows its document checklist with "I have it" ticks', async ({ page, request }) => {
    const { token } = await signedInStudent(page, request);
    let found: { id: string } | undefined;
    for (let n = 1; n <= 8 && !found; n += 1) {
      const list = await (await request.get(`/api/opportunities?type=scholarship&limit=50&page=${n}&includeClosed=true`, { headers: { Authorization: `Bearer ${token}` } })).json();
      for (const o of list.data) {
        const docs = await (await request.get(`/api/opportunities/${o.id}/documents`, { headers: { Authorization: `Bearer ${token}` } })).json();
        if (docs.data.some((d: { kind: string | null }) => d.kind)) { found = o; break; }
      }
      if (!list.data.length) break;
    }
    test.skip(!found, 'no scholarship with checklist items in the seeded data');
    await page.goto(`/opportunity/${found!.id}`);
    await expect(page.getByRole('heading', { name: 'Documents you’ll need' })).toBeVisible();
    const tick = page.getByRole('button', { name: 'I have it' }).first();
    await tick.click();
    await expect(tick).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByText(/1 of \d+ ready/)).toBeVisible();
  });
});
