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
DATABASE_URL=postgresql://USER:PASSWORD@HOST/DB?sslmode=require
```
