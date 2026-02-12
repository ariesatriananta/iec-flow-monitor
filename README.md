# IECNET Flow Monitor (Next.js)

## Run Lokal

```sh
npm install
npm run dev
```

Build dan start production:

```sh
npm run build
npm run start
```

## Deploy ke Vercel

1. Push repo ini ke GitHub/GitLab/Bitbucket.
2. Import project di Vercel.
3. Framework otomatis terdeteksi sebagai Next.js.
4. Deploy.

## Environment Variables

Jika suatu env dipakai di client, gunakan prefix `NEXT_PUBLIC_`.

Placeholder untuk Neon Postgres (belum dipakai sekarang):

```env
DATABASE_URL=""
SESSION_SECRET=""
R2_ACCOUNT_ID=""
R2_ACCESS_KEY_ID=""
R2_SECRET_ACCESS_KEY=""
R2_BUCKET=""
R2_PUBLIC_BASE_URL=""
R2_KEY_PREFIX="iecnet"
R2_ENDPOINT=""
```

## Database (Neon + Drizzle)

Generate dan migrate:

```sh
npm run db:generate
npm run db:migrate
```

Seed data mock:

```sh
npm run db:seed
```

## Cleanup Orphan File R2

Endpoint admin untuk membersihkan file R2 yang tidak lagi direferensikan tabel
`reimbursement_attachments`:

- `POST /api/uploads/reimbursement/cleanup-orphans`

Body opsional:

```json
{
  "dryRun": true,
  "olderThanMinutes": 60,
  "maxDelete": 200,
  "maxScanObjects": 10000
}
```

Catatan:
- Default `dryRun=true` (tidak menghapus file).
- Set `dryRun=false` untuk eksekusi delete.
- Hanya role `ADMIN` yang boleh akses endpoint ini.
