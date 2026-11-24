/** Mocked API browser smoke only. Requires an isolated app with a dummy DATABASE_URL. */
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const base = process.env.OPE_TEST_BASE_URL;
if (!base || !['127.0.0.1', 'localhost'].includes(new URL(base).hostname)) throw new Error('OPE_TEST_BASE_URL must point to an isolated localhost app');
const pw = process.env.OPE_TEST_PLAYWRIGHT;
const { chromium } = pw ? await import(pathToFileURL(pw).href) : await import('playwright');
console.log('Starting isolated browser smoke');
const browser = await chromium.launch({ headless: true, executablePath: process.env.OPE_TEST_CHROME, timeout: 60000 });
console.log('Browser launched');
const artifacts = await mkdtemp(path.join(tmpdir(), 'iecnet-transport-browser-'));
const errors = [];
const unexpected = [];
const now = '2026-11-24T00:00:00.000Z';
const clients = ['A', 'B'].map((name, index) => ({ id: `c${index + 1}`, name: `Client ${name}`, code: name, latestContractDate: now }));
const user = { id: 'browser-admin', role: 'ADMIN', username: 'smoke', name: 'Smoke Admin', isActive: true };
const makeDocument = (id, type, status = 'DRAFT') => ({
  id, type, status, documentDate: now, documentNumber: `I.00${id}/ARM/XI/2026`, seqNo: Number(id), numberYear: 2026,
  subject: `${type} fixture`, notes: '', clientId: null, clientSnapshot: null,
  ppnRate: 0, pph23Rate: 0, subtotal: 100000, ppnAmount: 0, pph23Amount: 0, total: 100000, createdAt: now, updatedAt: now,
  items: [{ id: `i${id}`, documentId: id, position: 0, employeeId: null, employeeName: null, days: null, rate: null,
    expenseDate: now, clientId: 'c1', clientSnapshot: { name: 'Client A', code: 'A' }, description: 'Fixture cost', amount: 100000 }],
});
let documents = [makeDocument('1', 'MEALS'), makeDocument('2', 'TRANSPORT'), makeDocument('3', 'TRANSPORT', 'VOID')];
let posted;
let lastListUrl;
let checks = 0;
const check = (name) => { checks++; console.log(`PASS ${name}`); };
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1080 }, serviceWorkers: 'block' });
  const payload = Buffer.from(JSON.stringify({ sub: user.id, role: 'ADMIN', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url');
  const signature = createHmac('sha256', process.env.SESSION_SECRET ?? 'transport-isolated-test-only').update(payload).digest('base64url');
  await context.addCookies([{ name: 'iecnet_session', value: `${payload}.${signature}`, url: base }]);
  await context.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const json = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
    if (url.pathname === '/api/auth/me') return json(user);
    if (url.pathname === '/api/notifications') return json({ items: [], unreadCount: 0, total: 0, hasMore: false });
    if (url.pathname === '/api/settings') return json({ companyName: 'Test', defaultSignerName: 'Test Signer', numberingPrefix: 'AP.2137', numberingReset: 'YEARLY', defaultPpnRate: 11 });
    if (url.pathname === '/api/employees') return json({ items: [], total: 0 });
    if (url.pathname === '/api/ope/client-options') return json(clients);
    if (url.pathname === '/api/ope' && request.method() === 'GET') {
      lastListUrl = url;
      let items = documents.filter(row => url.searchParams.get('group') ? row.type !== 'BUSINESS_TRIP' : row.type === url.searchParams.get('type'));
      const status = url.searchParams.get('status');
      items = items.filter(row => !status || (status === 'NON_VOID' ? row.status !== 'VOID' : row.status === status));
      const q = (url.searchParams.get('q') ?? '').toLowerCase();
      items = items.filter(row => !q || [row.documentNumber, row.subject, ...row.items.map(item => item.clientSnapshot?.name)].some(value => value?.toLowerCase().includes(q)));
      return json({ items, total: items.length, limit: 25, offset: 0 });
    }
    if (url.pathname === '/api/ope' && request.method() === 'POST') {
      posted = request.postDataJSON();
      const row = { ...makeDocument('4', posted.type), ...posted };
      row.items = posted.items.map((item, index) => ({ ...makeDocument('4', posted.type).items[0], ...item, id: `new-${index}`, clientSnapshot: clients.find(client => client.id === item.clientId) }));
      row.subtotal = row.items.reduce((sum, item) => sum + item.amount, 0);
      row.ppnRate = posted.usePpn ? 11 : 0; row.pph23Rate = posted.usePph23 ? 2 : 0;
      row.ppnAmount = Math.round(row.subtotal * row.ppnRate / 100); row.pph23Amount = Math.round(row.subtotal * row.pph23Rate / 100);
      row.total = row.subtotal + row.ppnAmount - row.pph23Amount;
      documents.push(row);
      return json(row, 201);
    }
    const id = url.pathname.match(/^\/api\/ope\/([^/]+)$/)?.[1];
    if (id && request.method() === 'GET') return json(documents.find(row => row.id === id));
    unexpected.push(`${request.method()} ${url.pathname}`);
    return json({ error: 'Unexpected test API call' }, 500);
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.setDefaultTimeout(15000);
  await page.goto(`${base}/ope`);
  await page.getByRole('tab', { name: 'Meals & Transport', exact: true }).click();
  await page.getByRole('button', { name: 'Aksi I.002/ARM/XI/2026' }).first().waitFor();
  assert.equal(lastListUrl.searchParams.get('group'), 'MEALS_TRANSPORT');
  assert.equal(lastListUrl.searchParams.has('type'), false);
  assert.equal(lastListUrl.searchParams.get('status'), 'NON_VOID');
  assert.equal(await page.getByRole('button', { name: 'Aksi I.003/ARM/XI/2026' }).count(), 0);
  check('shared tab uses group query, badges and default Non-Void');

  await page.getByRole('button', { name: 'Buat Meals & Transport', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('heading', { name: 'Buat OPE Meals', exact: true }).waitFor();
  await dialog.getByLabel('Perihal').fill('Transport smoke');
  await dialog.getByLabel('Deskripsi', { exact: false }).fill('Taksi retained');
  await dialog.getByLabel('Nominal item 1', { exact: true }).fill('100000');
  await dialog.locator('#ope-document-type').click();
  await page.getByRole('option', { name: 'Transport', exact: true }).click();
  await dialog.getByRole('heading', { name: 'Buat OPE Transport', exact: true }).waitFor();
  assert.equal(await dialog.getByLabel('Perihal').inputValue(), 'Transport smoke');
  assert.equal(await dialog.getByLabel('Deskripsi', { exact: false }).inputValue(), 'Taksi retained');
  check('create defaults Meals; changing to Transport retains fields and updates title');
  const chooseClient = async (index, name) => {
    await dialog.getByRole('combobox', { name: `Client item ${index}`, exact: true }).click();
    await page.getByPlaceholder(`Cari client item ${index}...`).fill(name);
    await page.getByRole('option', { name: new RegExp(name) }).click();
  };
  await chooseClient(1, 'Client A');
  await dialog.getByRole('button', { name: 'Tambah item' }).click();
  await chooseClient(2, 'Client B');
  await dialog.getByLabel('Deskripsi', { exact: false }).nth(1).fill('Bandara');
  await dialog.getByLabel('Nominal item 2', { exact: true }).fill('50000');
  await dialog.locator('#ope-ppn').click(); await dialog.locator('#ope-pph').click();
  await dialog.getByRole('button', { name: 'Simpan Draft', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  assert.equal(posted.type, 'TRANSPORT'); assert.equal(posted.items.length, 2);
  assert.equal(posted.usePpn, true); assert.equal(posted.usePph23, true);
  check('searchable per-row clients and multi-client Transport submit correct payload');

  const searchDone = page.waitForResponse(response => new URL(response.url()).searchParams.get('q') === 'Client B');
  await page.getByRole('textbox', { name: 'Cari dokumen OPE' }).fill('Client B');
  await searchDone;
  await page.getByRole('button', { name: 'Aksi I.004/ARM/XI/2026' }).first().waitFor();
  assert.equal(await page.getByRole('button', { name: 'Aksi I.001/ARM/XI/2026' }).count(), 0);
  await page.getByRole('textbox', { name: 'Cari dokumen OPE' }).fill('');
  await page.getByRole('button', { name: 'Aksi I.001/ARM/XI/2026' }).first().waitFor();
  check('client search sends query to API and clearing restores the list');

  await page.getByRole('combobox', { name: 'Filter status' }).click();
  await page.getByRole('option', { name: 'Void', exact: true }).click();
  await page.getByRole('button', { name: 'Aksi I.003/ARM/XI/2026' }).first().waitFor();
  await page.getByRole('combobox', { name: 'Filter status' }).click();
  await page.getByRole('option', { name: 'Non-Void', exact: true }).click();
  await page.getByRole('button', { name: 'Aksi I.004/ARM/XI/2026' }).first().waitFor();
  check('Void filter remains accessible and Non-Void hides cancelled documents');

  await page.getByRole('button', { name: 'Aksi I.004/ARM/XI/2026' }).first().click();
  await page.getByRole('menuitem', { name: 'Edit Draft', exact: true }).click();
  const kind = page.getByRole('dialog').locator('#ope-document-type');
  assert.equal(await kind.inputValue(), 'Transport'); assert.equal(await kind.getAttribute('readonly'), '');
  await page.getByRole('dialog').getByRole('button', { name: 'Batal', exact: true }).click();
  await page.getByRole('button', { name: 'Buat Meals & Transport', exact: true }).click();
  await page.getByRole('heading', { name: 'Buat OPE Meals', exact: true }).waitFor();
  await page.getByRole('dialog').getByRole('button', { name: 'Batal', exact: true }).click();
  check('saved Transport kind readonly; reopening create resets default Meals');

  await page.getByRole('button', { name: 'Aksi I.004/ARM/XI/2026' }).first().click();
  await page.getByRole('menuitem', { name: 'Preview / Print', exact: true }).click();
  const frame = page.frameLocator('iframe');
  await frame.getByRole('heading', { name: 'OPE - TRANSPORT', exact: true }).waitFor();
  assert.ok((await frame.locator('body').innerText()).includes('Client B'));
  assert.ok((await frame.locator('body').innerText()).includes('163.500'));
  await page.getByRole('button', { name: 'Print / Simpan PDF', exact: true }).waitFor({ state: 'visible' });
  check('preview uses Transport title, saved clients and net total');
  const html = await frame.locator('html').evaluate(element => element.outerHTML);
  const print = await context.newPage();
  await print.setContent(html.replace('<head>', `<head><base href="${base}/">`));
  await print.evaluate(async () => {
    await Promise.all(Array.from(document.querySelectorAll('svg image')).map(image => new Promise((resolve, reject) => {
      const loader = new Image(); loader.onload = resolve; loader.onerror = reject; loader.src = image.getAttribute('href');
    })));
  });
  const pdf = await print.pdf({ path: path.join(artifacts, 'transport.pdf'), preferCSSPageSize: true, printBackground: true });
  assert.equal(pdf.subarray(0, 4).toString(), '%PDF'); assert.ok(pdf.length > 10000);
  await print.close();
  check('Transport print HTML generates an A4 PDF with loaded letterhead');
  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();

  await page.getByRole('button', { name: 'Aksi I.001/ARM/XI/2026' }).first().click();
  await page.getByRole('menuitem', { name: 'Preview / Print', exact: true }).click();
  await page.frameLocator('iframe').getByRole('heading', { name: 'OPE - MEALS', exact: true }).waitFor();
  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
  check('historical Meals still previews as OPE - MEALS');

  await page.getByRole('tab', { name: 'Business Trip', exact: true }).click();
  await page.getByRole('button', { name: 'Buat Business Trip', exact: true }).click();
  await page.getByRole('heading', { name: 'Buat OPE Business Trip', exact: true }).waitFor();
  assert.equal(await page.getByRole('dialog').locator('#ope-document-type').count(), 0);
  await page.getByRole('dialog').getByRole('button', { name: 'Batal', exact: true }).click();
  await page.getByRole('tab', { name: 'Meals & Transport', exact: true }).click();
  await page.getByRole('button', { name: 'Aksi I.004/ARM/XI/2026' }).first().waitFor();
  check('Business Trip keeps its separate form without expense type selection');

  await page.setViewportSize({ width: 390, height: 844 });
  const mobile = page.locator('div.md\\:hidden').filter({ has: page.getByRole('button', { name: 'Aksi I.004/ARM/XI/2026' }) });
  await mobile.getByText('Transport', { exact: true }).first().waitFor();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  await page.screenshot({ path: path.join(artifacts, 'mobile.png'), fullPage: true });
  check('mobile list shows Transport badge without horizontal page overflow');
  assert.deepEqual(errors, []); assert.deepEqual(unexpected, []);
  console.log(`PASS ${checks} browser scenarios; API mocked; no database writes. Artifacts: ${artifacts}`);
} finally { await browser.close(); }
