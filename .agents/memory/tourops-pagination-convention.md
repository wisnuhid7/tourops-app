# Server pagination convention (TourOps)

Repo sudah punya SATU pola paginasi — jangan ciptakan format baru.

## Kontrak
- Param query: `page` (default 1, clamp >= 1), `pageSize` (default 50, clamp 1..200).
- Respons sukses: `{ rows, total, page, pageSize }` — klien hitung `Math.ceil(total / pageSize)` sendiri (tidak ada `totalPages` di server).
- Contoh implementasi: `artifacts/tourops/src/pages/admin/payments.tsx:51-52,67-75,107-109,186-191` (URL/key lengkap sebagai SATU string react-query).
- Transport meniru pola ini: `transportRoutes.ts` GET bookings/invoices/payments + `storage.ts` method `get*Page(companyId, page, pageSize)` yang aditif (method lama tanpa paginasi tetap ada, dipanggil pihak lain).

## Aturan desain penting
- **Jangan paginasi endpoint yang memberi opsi `<Select>` form** (katalog: bus-types, routes, route-pricing, companies). Limit 50 membuat daftar opsi terpotong diam-diam. Paginasi hanya list yang tumbuh terus: bookings/invoices/payments.
- Tiap list yang dipaginasi WAJIB punya kontrol halaman di UI-nya.
- Empty-state pakai `total === 0`, BUKAN `rows.length === 0` (halaman melewati akhir = rows kosong tapi total > 0 → jangan tampilkan "tidak ada data").
- Reset `page` ke 1 saat filter berubah (mis. ganti company).
- **Diketahui & DITERIMA (jangan diangkat ulang tanpa diminta)**: `invoices` dipaginasi TAPI juga mengisi `<Select>` invoice di form pembayaran (`transport.tsx:1195`, `invoices?.rows.filter(...)`). Jadi dropdown hanya memuat invoice di halaman aktif (maks 50); dengan filter company bisa tampak kosong walau datanya ada di halaman lain. User memutuskan **biarkan apa adanya** (diterima sebagai limitasi), bukan bug yang harus dibetulkan.

## Frontend wiring (transport.tsx)
- React-query key dua elemen: `["/api/transport/bookings", \`?page=${page}&pageSize=${pageSize}${companyId ? `&companyId=${companyId}` : ""}\`]` — `queryClient.ts` join dengan "/", jadi jadi `/api/transport/bookings/?page=...` (trailing slash sudah terjadi sebelumnya dan ditoleransi Express).
- Ada `useEffect` guard `if (page > totalPages) setPage(totalPages)`.
- State `page` TERPISAH per list dalam satu komponen (invoices & payments berbagi `InvoicesPaymentsTab`).

## Terkait
- Index pendukung di `lib/db/src/schema/schema.ts`: `transport_*_company_id_idx` + kolom ORDER BY (`created_at`/`submitted_at`). Index hanya aktif setelah `drizzle-kit push`/Publish — schema-only tidak menyentuh DB live.
- i18n status dinamis: ``t(`booking_status_${x}` as any)`` (lihat `leader-dashboard.tsx:181`); key baru wajib masuk ke ketiga blok bahasa en/es/id di `hooks/translations.ts`.
