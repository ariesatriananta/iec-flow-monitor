# OPE: tahapan implementasi

## Milestone

1. Fondasi: tabel header/detail, API khusus Admin, perhitungan, validasi,
   penomoran, snapshot identitas, dan audit log.
2. UI: menu OPE di bawah Invoice; tab Business Trip dan Meals; daftar,
   form header/detail, pilihan client, dan perubahan status.
3. Dokumen: preview/print dengan kop dan footer Invoice; pengujian integrasi
   penyimpanan, multi-client, historis, dan status.

M1 belum menambahkan menu/form/print OPE. Business Trip OPE terpisah dari
pengajuan perjalanan dinas HR. OPE tidak memengaruhi termin, invoice,
nilai kontrak, atau progres pembayaran kontrak.

## Database

Migration: `drizzle/0034_real_baron_strucker.sql`. Menambahkan hanya
`ope_documents`, `ope_items`, foreign keys, dan indexes baru.
Tidak dijalankan otomatis saat implementasi.

Relasi client/karyawan memakai `ON DELETE SET NULL`; salinan identitas
tetap tersimpan agar dokumen historis tidak hilang dan penghapusan master
yang sudah ada tetap dapat berjalan. Item dokumen memakai `ON DELETE CASCADE`.

Jalankan migration pada database tujuan sebelum menguji API OPE dengan sesi
Admin. Jangan menjalankan migration lama lagi apabila sudah diterapkan.

## Aturan

- Client baru harus aktif dan memiliki kontrak ACTIVE.
- Dropdown satu baris per client, urut kontrak ACTIVE terbaru (`createdAt`).
- Pilihan historis dibaca dari snapshot, bukan hasil join master saat cetak.
- Business Trip: client di header, employee/hari/tarif di setiap item.
- Meals: tidak memiliki client header; tanggal/client/deskripsi/nominal per item.
- Nominal rupiah bulat positif, minimal satu item; pajak default off.
- Subtotal = sum item; PPN = 11% subtotal jika on; PPh 23 = 2% subtotal jika on.
- Pajak dibulatkan sekali pada subtotal ke rupiah terdekat (half up).
- Total = subtotal + PPN - PPh 23. API menghitung ulang seluruh angka.
- Nomor: `OPE/BT/2026/0001` atau `OPE/ML/2026/0001`.
  Urutan terpisah per jenis/tahun; tahun ditetapkan saat dibuat dan nomor
  tetap dipertahankan ketika tanggal dokumen draft diedit.
- Status awal DRAFT; DRAFT -> ISSUED/VOID; ISSUED -> PAID/VOID.
  Isi dokumen hanya dapat diedit saat DRAFT.
- Audit ditulis setelah transaksi commit; error audit tidak membatalkan OPE.

## Kontrak API

Semua endpoint memerlukan sesi ADMIN:

- `GET /api/ope?type=MEALS&status=DRAFT&limit=25&offset=0`: daftar paginated.
- `GET /api/ope/client-options`: client berkontrak aktif.
- `GET /api/ope/:id`: header beserta detail terurut.
- `POST /api/ope`: membuat dokumen DRAFT.
- `PUT /api/ope/:id`: mengganti isi DRAFT atau mengubah status.

Payload Business Trip:

```json
{
  "type": "BUSINESS_TRIP",
  "documentDate": "2026-11-10",
  "clientId": "existing-client-id",
  "subject": "Biaya perjalanan audit",
  "usePpn": false,
  "usePph23": false,
  "items": [
    { "employeeId": "existing-employee-id", "days": 2, "rate": 15000000 }
  ]
}
```

Payload Meals:

```json
{
  "type": "MEALS",
  "documentDate": "2026-11-10",
  "subject": "Biaya konsumsi audit",
  "usePpn": true,
  "usePph23": true,
  "items": [
    {
      "expenseDate": "2026-11-09",
      "clientId": "existing-client-id",
      "description": "Konsumsi tim",
      "amount": 1000000
    }
  ]
}
```

Perubahan status: `{ "status": "ISSUED" }`.
Field nomor, snapshot, subtotal, pajak, total tidak diterima sebagai sumber hitung.
Respons API memakai string untuk numeric PostgreSQL; helper
`src/lib/api/ope.ts` mengonversinya menjadi number dan tanggal menjadi Date.

## Verifikasi integrasi setelah migration

Gunakan data client/karyawan yang sudah tersedia pada database uji.

1. Client dengan beberapa kontrak ACTIVE muncul sekali; urutan sesuai tanggal
   pembuatan kontrak ACTIVE terbaru. Client tanpa kontrak ACTIVE tidak muncul.
2. Business Trip 2 hari x Rp15.000.000 menghasilkan Rp30.000.000 tanpa pajak.
3. Meals berisi dua client, nominal Rp600.000 + Rp400.000, kedua pajak on:
   subtotal Rp1.000.000, PPN Rp110.000, PPh Rp20.000, total Rp1.090.000.
4. Kirim angka total palsu; API tetap memakai hasil hitung detail.
5. Input kosong, hari pecahan/negatif, tanggal invalid, atau nominal berlebih ditolak.
6. Issued tidak dapat diedit; Paid/Void tidak dapat dibuka kembali.
7. Dua request pembuatan bersamaan mendapat nomor berbeda. Edit/status bersamaan
   tidak boleh mengubah isi setelah dokumen Issued.
8. STAFF/tanpa sesi tidak dapat menggunakan endpoint OPE.
9. Transaksi gagal tidak meninggalkan header tanpa item; aktivitas sukses masuk audit.
10. Perubahan nama/alamat master tidak mengganti snapshot dokumen lama.

Pengujian integrasi menulis database ini dilakukan setelah migration oleh Owner;
unit test dan pemeriksaan statis tidak membuktikan perilaku live database.
