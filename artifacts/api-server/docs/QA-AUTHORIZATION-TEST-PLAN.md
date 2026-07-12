# Rencana Pengujian Otorisasi (Authorization Test Plan)
## TourOps — Travel & Tour Management System

**Dokumen QA / Software Assurance — Referensi Permanen**
**Disiapkan untuk:** Tim QA & Software Architecture
**Cakupan:** Role-Based Access Control (RBAC) untuk 14 peran pengguna
**Lingkungan target:** Staging / QA
**Metode autentikasi:** Login berbasis **username** (bukan email) + password, via `POST /api/auth/login`

---

## 1. Pendahuluan

Dokumen ini merupakan rencana pengujian otorisasi (authorization) yang komprehensif dan dapat digunakan berulang (re-usable) untuk sistem **TourOps**. Tujuannya adalah memberikan tim QA sebuah referensi yang stabil untuk memverifikasi bahwa setiap peran (role) hanya dapat mengakses fungsi dan data yang menjadi haknya, serta **tidak** dapat mengakses fungsi/data di luar wewenangnya (negative testing).

Seluruh skenario pada dokumen ini **diturunkan langsung dari perilaku kode yang berjalan** (rute API nyata, gerbang peran/`requireRole`, pemeriksaan portal login, *field allowlist*, dan *row-scoping*), bukan dari asumsi. Dengan demikian setiap *test case* bersifat *executable* — dapat langsung dijalankan oleh tester terhadap API di lingkungan Staging/QA.

### 1.1. Model Otorisasi Inti

Sistem menerapkan otorisasi berlapis. Memahami primitif berikut adalah prasyarat untuk mengeksekusi test plan ini:

| Konstanta / Mekanisme | Nilai / Perilaku Aktual |
| :--- | :--- |
| **`ADMIN_ROLES`** | `admin`, `super_admin` — akses administratif penuh. |
| **`ALL_STAFF_ROLES`** | Seluruh 13 peran staf (semua peran **kecuali** `customer`). |
| **`TOUR_BUILDER_ROLES`** | `admin`, `super_admin`, `tour_builder` — merakit struktur & harga tur. |
| **`TOUR_CONTENT_ROLES`** | `admin`, `super_admin`, `tour_builder`, `content_editor` — mengedit konten tur. |
| **`requireRole(req, res, roles[])`** | Membandingkan `profile.role` dengan daftar `roles`. Jika tidak login → **HTTP 401** `"Unauthorized"`. Jika login tetapi peran tidak diizinkan → **HTTP 403** `"Forbidden: insufficient role"`. |
| **Pemeriksaan Portal (login)** | `portal=admin` hanya menerima `ADMIN_ROLES`; `portal=staff` menerima seluruh staf + admin; `portal=customer` menerima `customer` + admin. Salah portal → **HTTP 403**. |
| **Field Allowlist (`PATCH /api/tours/:id`)** | `content_editor` hanya boleh mengubah *field* konten/marketing; `tour_builder`/admin boleh mengubah *field* struktur & harga juga. *Field* di luar izin **diabaikan secara diam-diam** (silent drop), bukan ditolak. |
| **Row-scoping** | `city_manager` → dibatasi oleh `countryCode`; `transport_manager` → dibatasi oleh `transportCompanyId`; kepemilikan workflow → `assignedUserId`; booking pelanggan → `userId`/`customerId`. |

### 1.2. Empat Level Sistem

Peran dikelompokkan ke dalam 4 level fungsional yang menjadi dasar pengelompokan test case pada Bagian 2:

1. **Level 1 — Oversight & Management (Pengawasan & Manajemen)**
2. **Level 2 — Inventory / Operations (Operasional & Inventaris / Supplier)**
3. **Level 3 — Product Assembly (Perakitan Produk)**
4. **Level 4 — Consumer (Konsumen)**

---

## 2. Bagian 1 — Kredensial (Mock Data QA & Staging)

Tabel berikut memuat kredensial *mock* untuk seluruh 14 peran. Kolom **Password** berisi password QA berkeamanan tinggi yang **direkomendasikan** untuk dikonfigurasi di lingkungan Staging. Kolom **Username / Email** mengikuti pola akun yang benar-benar di-*seed* oleh sistem.

> ⚠️ **PENTING — Baca "Catatan Rekonsiliasi" (§2.1) sebelum mencoba login.** Login sistem ini menggunakan **username**, bukan email, dan akun *seed* bawaan memakai password default yang berbeda dari kolom di bawah.

### Tabel Kredensial 14 Peran

| Role ID | Nama Peran | Username / Email | Password (QA) | Level Akses |
| :--- | :--- | :--- | :--- | :--- |
| **ADM-01** | Super Admin | `superadmin1` / `superadmin1@tourops.com` | `Pass@Admin#2026!` | Level 1 — Oversight & Management |
| **CMG-01** | Country Manager | `countrymanager1` / `countrymanager1@tourops.com` | `Pass@Country#2026!` | Level 1 — Oversight & Management |
| **CTY-01** | City Manager | `citymanager1` / `citymanager1@tourops.com` | `Pass@City#2026!` | Level 2 — Inventory / Operations |
| **HTL-01** | Hotel Manager | `hotelmanager1` / `hotelmanager1@tourops.com` | `Pass@Hotel#2026!` | Level 2 — Inventory / Operations |
| **TRP-01** | Transport Manager | `transportmanager1` / `transportmanager1@tourops.com` | `Pass@Transport#2026!` | Level 2 — Inventory / Operations |
| **GDE-01** | Guide Manager | `guidemanager1` / `guidemanager1@tourops.com` | `Pass@Guide#2026!` | Level 2 — Inventory / Operations |
| **SGT-01** | Sights Manager | `sightsmanager1` / `sightsmanager1@tourops.com` | `Pass@Sights#2026!` | Level 2 — Inventory / Operations |
| **AIR-01** | Airline Supplier | `airlinesupplier1` / `airlinesupplier1@tourops.com` | `Pass@Airline#2026!` | Level 2 — Inventory / Operations |
| **SUP-01** | Supplier (Umum) | `supplier1` / `supplier1@tourops.com` | `Pass@Supplier#2026!` | Level 2 — Inventory / Operations |
| **FLA-01** | Flight Agent | `flightagent1` / `flightagent1@tourops.com` | `Pass@Flight#2026!` | Level 2 — Inventory / Operations |
| **TBD-01** | Tour Builder | `tourbuilder1` / `tourbuilder1@tourops.com` | `Pass@Builder#2026!` | Level 3 — Product Assembly |
| **CED-01** | Content Editor | `contenteditor1` / `contenteditor1@tourops.com` | `Pass@Content#2026!` | Level 3 — Product Assembly |
| **TAG-01** | Travel Agent | `travelagent1` / `travelagent1@tourops.com` | `Pass@Travel#2026!` | Level 3 — Product Assembly |
| **CUS-01** | Customer | `customer1` / `customer1@tourops.com` | `Pass@Customer#2026!` | Level 4 — Consumer |

### 2.1. Catatan Rekonsiliasi — Cara Autentikasi Sebenarnya

Agar kredensial di atas benar-benar **dapat dipakai** oleh tester, perhatikan fakta-fakta berikut yang berlaku pada basis kode saat ini:

1. **Login memakai `username`, bukan `email`.** Endpoint `POST /api/auth/login` menerima body `{ "username", "password", "portal?" }`. Sistem mencari pengguna melalui `getUserByUsername(username)`. Kolom email pada tabel di atas hanya bersifat informatif dan **tidak** dipakai untuk login.

2. **Pola username akun seed.** Seeder membuat satu akun per peran dengan pola `username = <namaPeranTanpaGarisBawahPertama> + "1"`. Contoh: `super_admin` → `superadmin1`, `country_manager` → `countrymanager1`, `transport_manager` → `transportmanager1`, `airline_supplier` → `airlinesupplier1`, `tour_builder` → `tourbuilder1`, `content_editor` → `contenteditor1`, `travel_agent` → `travelagent1`, `flight_agent` → `flightagent1`. Email di-*generate* sebagai `<username>@tourops.com`.

3. **Password default seed = `password123` (untuk SELURUH akun seed).** Password berkeamanan tinggi pada tabel §2 adalah password **target QA** yang harus diset manual jika kebijakan keamanan Staging mensyaratkannya. **Untuk uji cepat pada DB yang baru di-seed, gunakan `password123`.** (Out of scope: dokumen ini tidak mengubah skrip seeding maupun password akun.)

4. **Peran `admin` vs `super_admin`.** Kode memperlakukan `admin` dan `super_admin` identik (keduanya di `ADMIN_ROLES`), namun seeder **hanya** membuat akun `super_admin` (`superadmin1`). Gunakan `ADM-01 / superadmin1` untuk seluruh pengujian yang menuntut hak administratif penuh.

5. **Parameter `portal` saat login.** Untuk menguji gerbang portal, kirim `portal` yang sesuai: `admin`, `staff`, atau `customer`. Jika peran akun tidak cocok dengan portal, login ditolak **HTTP 403** meskipun username/password benar (kecuali admin, yang diterima di semua portal).

6. **Row-scoping akun seed.** Seeder menautkan `transportmanager1` ke satu `transportCompany` dan `citymanager1` ke satu `country` (`countryCode`) secara deterministik, sehingga pengujian *scoping* Transport Manager & City Manager dapat langsung dijalankan tanpa persiapan tambahan.

7. **Registrasi mandiri.** `POST /api/auth/register` selalu membuat pengguna baru dengan peran default `customer`. Pengguna terautentikasi yang belum memiliki profil akan otomatis mendapat profil `customer` (`getOrCreateProfile`).

---

## 3. Bagian 2 — Test Case Access Control & Role Functionality

**Konvensi umum eksekusi:**
- Setiap test case mengasumsikan tester sudah login sebagai peran yang tertera (via portal yang benar) dan mengirim cookie sesi pada setiap permintaan.
- Kode status yang diharapkan: **200/201** = sukses; **204** = sukses tanpa body; **401** = tidak login; **403** = login tetapi peran/scope tidak berwenang; **400** = payload tidak valid; **404** = data tidak ditemukan.
- Untuk *negative test* pada `PATCH /api/tours/:id`, ingat bahwa *field* terlarang **diabaikan diam-diam** (respons tetap 200, tetapi nilai tidak berubah) — verifikasi dengan **membaca ulang** entitas.

---

### 3.1. Level 1 — Oversight & Management

Peran: **Super Admin (ADM-01)**, **Country Manager (CMG-01)**.

| ID Test Case | Peran | Skenario Pengujian | Langkah Pengujian | Hasil yang Diharapkan |
| :--- | :--- | :--- | :--- | :--- |
| **TC-ADM-01** | Super Admin | Login portal admin | Login `POST /api/auth/login` dengan `{username: superadmin1, password, portal: "admin"}`. | **200 OK**, response memuat `role: "super_admin"`. Sesi admin terbentuk. |
| **TC-ADM-02** | Super Admin | Melihat seluruh profil pengguna | `GET /api/user-profiles`. | **200 OK**, mengembalikan daftar seluruh profil pengguna. |
| **TC-ADM-03** | Super Admin | Membuat akun staf baru | `POST /api/admin/users` dengan payload user + role. | **200/201**, akun baru dibuat dengan peran yang ditentukan. |
| **TC-ADM-04** | Super Admin | Mengubah peran pengguna | `PATCH /api/user-profiles/:id` dengan `{role: "tour_builder"}`. | **200 OK**, peran target berubah. |
| **TC-ADM-05** | Super Admin | Reset password pengguna | `PATCH /api/admin/users/:id/password`. | **200 OK**, password target ter-update. |
| **TC-ADM-06** | Super Admin | Menghapus tur | `DELETE /api/tours/:id`. | **204/200**, tur terhapus (hanya `ADMIN_ROLES`). |
| **TC-ADM-07** | Super Admin | Melihat seluruh pembayaran | `GET /api/payments`. | **200 OK**, daftar seluruh pembayaran (khusus `ADMIN_ROLES`). |
| **TC-ADM-08** | Super Admin | Mengelola booking (edit) | `PATCH /api/bookings/:id` mengubah status booking. | **200 OK**, booking ter-update (khusus `ADMIN_ROLES`). |
| **TC-ADM-09** | Super Admin | Membuat & mengelola assignment | `POST /api/bookings/:id/assignments` lalu `PATCH /api/assignments/:id`. | **200/201**, assignment dibuat/diperbarui (khusus `ADMIN_ROLES`). |
| **TC-ADM-10** | Super Admin | Melihat pesan (messages) global | `GET /api/messages`. | **200 OK** (khusus `ADMIN_ROLES`). |
| **TC-ADM-11** | Super Admin | Melihat statistik penjualan global | `GET /api/admin/stats`. | **200 OK**, statistik global (`super_admin/admin/country_manager`). |
| **TC-CMG-01** | Country Manager | Login portal staff | Login `{username: countrymanager1, portal: "staff"}`. | **200 OK**, `role: "country_manager"`. |
| **TC-CMG-02** | Country Manager | Melihat daftar tur | `GET /api/tours`. | **200 OK** (diizinkan: `super_admin/admin/country_manager/tour_builder/content_editor`). |
| **TC-CMG-03** | Country Manager | Melihat ringkasan akomodasi | `GET /api/tours/accommodation-summary`. | **200 OK** (diizinkan: `super_admin/admin/country_manager`). |
| **TC-CMG-04** | Country Manager | Mengelola master data negara | `POST /api/master/countries` + `PATCH /api/master/countries/:id`. | **200/201** (diizinkan: `super_admin/admin/country_manager`). |
| **TC-CMG-05** | Country Manager | Melihat statistik penjualan | `GET /api/admin/stats`. | **200 OK** (termasuk dalam gerbang stats). |
| **TC-CMG-06** | Country Manager | Menjalankan scraping negara/kota | `POST /api/admin/scrape/countries`. | **200 OK**, job scraping berjalan (`super_admin/admin/country_manager`). |
| **TC-CMG-07 (NEG)** | Country Manager | **Tidak boleh** menghapus tur | `DELETE /api/tours/:id`. | **403 Forbidden** — hanya `ADMIN_ROLES`. |
| **TC-CMG-08 (NEG)** | Country Manager | **Tidak boleh** melihat seluruh pembayaran | `GET /api/payments`. | **403 Forbidden** — hanya `ADMIN_ROLES`. |
| **TC-CMG-09 (NEG)** | Country Manager | **Tidak boleh** mengubah peran pengguna | `PATCH /api/user-profiles/:id`. | **403 Forbidden** — hanya `ADMIN_ROLES`. |
| **TC-CMG-10 (NEG)** | Country Manager | **Tidak boleh** membuat akun pengguna | `POST /api/admin/users`. | **403 Forbidden** — hanya `ADMIN_ROLES`. |

---

### 3.2. Level 2 — Inventory / Operations (Supplier & Operasional)

Peran: **City Manager (CTY-01)**, **Hotel Manager (HTL-01)**, **Transport Manager (TRP-01)**, **Guide Manager (GDE-01)**, **Sights Manager (SGT-01)**, **Airline Supplier (AIR-01)**, **Supplier Umum (SUP-01)**, **Flight Agent (FLA-01)**.

#### City Manager (CTY-01) — row-scoped berdasarkan `countryCode`

| ID Test Case | Peran | Skenario Pengujian | Langkah Pengujian | Hasil yang Diharapkan |
| :--- | :--- | :--- | :--- | :--- |
| **TC-CTY-01** | City Manager | Login portal staff | Login `{username: citymanager1, portal: "staff"}`. | **200 OK**, `role: "city_manager"`. |
| **TC-CTY-02** | City Manager | Melihat kota (ter-scope negara) | `GET /api/master/cities`. | **200 OK**, **hanya** kota yang `countryId`-nya cocok dengan `countryCode` profil. Kota negara lain **tidak** muncul. |
| **TC-CTY-03** | City Manager | Membuat/mengubah kota | `POST /api/master/cities` + `PATCH /api/master/cities/:id`. | **200/201** (diizinkan: `super_admin/admin/country_manager/city_manager`). |
| **TC-CTY-04 (NEG)** | City Manager | **Tidak boleh** melihat kota negara lain | `GET /api/master/cities` lalu periksa hasil. | Daftar **tidak** memuat kota di luar negara yang ditugaskan (row-scoping GET). |
| **TC-CTY-05 (NEG)** | City Manager | **Tidak boleh** mengelola master negara | `POST /api/master/countries`. | **403 Forbidden** — bukan bagian gerbang negara. |
| **TC-CTY-06 (NEG)** | City Manager | **Tidak boleh** membuat tur | `POST /api/tours`. | **403 Forbidden** — hanya `TOUR_BUILDER_ROLES`. |

#### Hotel Manager (HTL-01) / Guide Manager (GDE-01) / Sights Manager (SGT-01)

| ID Test Case | Peran | Skenario Pengujian | Langkah Pengujian | Hasil yang Diharapkan |
| :--- | :--- | :--- | :--- | :--- |
| **TC-HTL-01** | Hotel Manager | Login portal staff | Login `{username: hotelmanager1, portal: "staff"}`. | **200 OK**, `role: "hotel_manager"`. |
| **TC-HTL-02** | Hotel Manager | Melihat workflow tugasnya | `GET /api/supplier/workflows`. | **200 OK**, mengembalikan **hanya** workflow yang `assignedUserId`-nya = user ini (via `getWorkflowsByUser`). |
| **TC-HTL-03** | Hotel Manager | Membuka detail booking yang ditugaskan | `GET /api/supplier/bookings/:id` untuk booking yang punya workflow miliknya. | **200 OK**, memuat booking + travelers + dokumen (dokumen difilter ke unggahan sendiri). |
| **TC-HTL-04 (NEG)** | Hotel Manager | **Tidak boleh** membuka booking yang tidak ditugaskan | `GET /api/supplier/bookings/:id` untuk booking tanpa workflow miliknya. | **403** `"Access denied to this booking"`. |
| **TC-HTL-05 (NEG)** | Hotel Manager | **Tidak boleh** membuat/menghapus hotel master | `POST /api/hotels` atau `DELETE /api/hotels/:id`. | **403 Forbidden** — hanya `ADMIN_ROLES`. |
| **TC-HTL-06 (NEG)** | Hotel Manager | **Tidak boleh** melihat pembayaran | `GET /api/payments`. | **403 Forbidden** — hanya `ADMIN_ROLES`. |
| **TC-GDE-01** | Guide Manager | Login & lihat workflow tugas | Login `{username: guidemanager1, portal: "staff"}` → `GET /api/supplier/workflows`. | **200 OK**, hanya workflow miliknya. |
| **TC-GDE-02 (NEG)** | Guide Manager | **Tidak boleh** mengubah struktur/harga tur | `PATCH /api/tours/:id` dengan `{basePrice: ...}`. | **403 Forbidden** — bukan `TOUR_CONTENT_ROLES`. |
| **TC-SGT-01** | Sights Manager | Login & lihat workflow tugas | Login `{username: sightsmanager1, portal: "staff"}` → `GET /api/supplier/workflows`. | **200 OK**, hanya workflow miliknya. |
| **TC-SGT-02 (NEG)** | Sights Manager | **Tidak boleh** mengakses modul admin users | `GET /api/user-profiles` **diizinkan** (staf), namun `PATCH /api/user-profiles/:id` → **403**. | Baca profil boleh; mengubah peran ditolak (**403**). |

#### Transport Manager (TRP-01) — row-scoped berdasarkan `transportCompanyId`

| ID Test Case | Peran | Skenario Pengujian | Langkah Pengujian | Hasil yang Diharapkan |
| :--- | :--- | :--- | :--- | :--- |
| **TC-TRP-01** | Transport Manager | Login portal staff | Login `{username: transportmanager1, portal: "staff"}`. | **200 OK**, `role: "transport_manager"`. |
| **TC-TRP-02** | Transport Manager | Melihat bus types perusahaannya | `GET /api/transport/bus-types`. | **200 OK**, **hanya** data milik `transportCompanyId` profil (scope diterapkan `getTransportScope`). |
| **TC-TRP-03** | Transport Manager | Membuat data untuk perusahaannya | `POST /api/transport/bus-types` dengan `companyId = perusahaan sendiri`. | **200/201**, dibuat. |
| **TC-TRP-04 (NEG)** | Transport Manager | **Tidak boleh** membuat data untuk perusahaan lain | `POST /api/transport/bus-types` dengan `companyId = perusahaan lain`. | **403** `"Cannot create for another company"`. |
| **TC-TRP-05 (NEG)** | Transport Manager | **Tidak boleh** akses modul transport tanpa tautan perusahaan | (Jika `transportCompanyId` kosong) `GET /api/transport/routes`. | **403** `"Not linked to a transport company"`. |
| **TC-TRP-06 (NEG)** | Transport Manager | **Tidak boleh** melihat seluruh pembayaran booking | `GET /api/payments`. | **403 Forbidden** — hanya `ADMIN_ROLES`. |

#### Airline Supplier (AIR-01), Supplier Umum (SUP-01), Flight Agent (FLA-01)

| ID Test Case | Peran | Skenario Pengujian | Langkah Pengujian | Hasil yang Diharapkan |
| :--- | :--- | :--- | :--- | :--- |
| **TC-AIR-01** | Airline Supplier | Login & lihat workflow tugas | Login `{username: airlinesupplier1, portal: "staff"}` → `GET /api/supplier/workflows`. | **200 OK**, hanya workflow yang ditugaskan padanya. |
| **TC-AIR-02** | Airline Supplier | Update workflow yang ditugaskan | `PATCH /api/workflows/:id` untuk workflow dengan `assignedUserId` = dirinya. | **200 OK**, diperbarui (pemilik boleh update). |
| **TC-AIR-03 (NEG)** | Airline Supplier | **Tidak boleh** update workflow milik orang lain | `PATCH /api/workflows/:id` untuk workflow yang bukan miliknya. | **403 Forbidden** — bukan admin & bukan pemilik. |
| **TC-SUP-01** | Supplier Umum | Login & lihat workflow tugas | Login `{username: supplier1, portal: "staff"}` → `GET /api/supplier/workflows`. | **200 OK**, hanya workflow miliknya. |
| **TC-SUP-02 (NEG)** | Supplier Umum | **Tidak boleh** menembus modul admin | `POST /api/admin/users` / `GET /api/payments` / `DELETE /api/tours/:id`. | **403 Forbidden** pada semua — hanya `ADMIN_ROLES`. |
| **TC-SUP-03 (NEG)** | Supplier Umum | **Tidak boleh** melihat detail booking yang tidak ditugaskan | `GET /api/supplier/bookings/:id` (tidak ditugaskan). | **403** `"Access denied to this booking"`. |
| **TC-FLA-01** | Flight Agent | Login portal staff | Login `{username: flightagent1, portal: "staff"}`. | **200 OK**, `role: "flight_agent"`. |
| **TC-FLA-02** | Flight Agent | Melihat seluruh workflow layanan penerbangan | `GET /api/flight-agent/workflows`. | **200 OK**, seluruh workflow `serviceType = "airline"` (gerbang: `admin/super_admin/flight_agent`). |
| **TC-FLA-03** | Flight Agent | Update workflow penerbangan | `PATCH /api/workflows/:id` untuk workflow `serviceType=airline`. | **200 OK** — flight_agent boleh update tugas airline meski bukan `assignedUserId`. |
| **TC-FLA-04 (NEG)** | Flight Agent | **Tidak boleh** update workflow non-airline milik orang lain | `PATCH /api/workflows/:id` untuk workflow `serviceType != airline` yang bukan miliknya. | **403 Forbidden**. |
| **TC-FLA-05 (NEG)** | Flight Agent | **Tidak boleh** melihat pembayaran | `GET /api/payments`. | **403 Forbidden** — hanya `ADMIN_ROLES`. |

---

### 3.3. Level 3 — Product Assembly (Perakitan Produk)

Peran: **Tour Builder (TBD-01)**, **Content Editor (CED-01)**, **Travel Agent (TAG-01)**.

| ID Test Case | Peran | Skenario Pengujian | Langkah Pengujian | Hasil yang Diharapkan |
| :--- | :--- | :--- | :--- | :--- |
| **TC-TBD-01** | Tour Builder | Login portal staff | Login `{username: tourbuilder1, portal: "staff"}`. | **200 OK**, `role: "tour_builder"`. |
| **TC-TBD-02** | Tour Builder | Membuat tur baru | `POST /api/tours`. | **200/201** (diizinkan: `TOUR_BUILDER_ROLES`). |
| **TC-TBD-03** | Tour Builder | Mengedit **struktur & harga** tur | `PATCH /api/tours/:id` dengan `{title, duration, basePrice, totalPrice, isPublished}`. | **200 OK**, seluruh *field* struktur **tersimpan** (tour_builder memperoleh `CONTENT_FIELDS` + `STRUCTURE_FIELDS`). Verifikasi dengan baca ulang. |
| **TC-TBD-04** | Tour Builder | Menyusun hari & item itinerary | `POST /api/tours/:id/days`, `PATCH /api/tour-days/:id`. | **200/201** (diizinkan: `TOUR_BUILDER_ROLES`). |
| **TC-TBD-05** | Tour Builder | Menyimpan tur secara penuh | `PUT /api/tours/:id/full`. | **200 OK** (diizinkan: `TOUR_BUILDER_ROLES`). |
| **TC-TBD-06 (NEG)** | Tour Builder | **Tidak boleh** menghapus tur | `DELETE /api/tours/:id`. | **403 Forbidden** — hanya `ADMIN_ROLES`. |
| **TC-TBD-07 (NEG)** | Tour Builder | **Tidak boleh** mengubah peran pengguna | `PATCH /api/user-profiles/:id`. | **403 Forbidden** — hanya `ADMIN_ROLES`. |
| **TC-CED-01** | Content Editor | Login portal staff | Login `{username: contenteditor1, portal: "staff"}`. | **200 OK**, `role: "content_editor"`. |
| **TC-CED-02** | Content Editor | Mengedit **field konten** tur | `PATCH /api/tours/:id` dengan `{description, highlights, imageUrl, tags, category}`. | **200 OK**, *field* konten **tersimpan** (diizinkan `TOUR_CONTENT_ROLES`). |
| **TC-CED-03 (NEG)** | Content Editor | **Tidak boleh** mengubah harga/struktur (silent drop) | `PATCH /api/tours/:id` dengan `{basePrice: 999, totalPrice: 999, isPublished: true}`. | Respons **200 OK**, TETAPI baca ulang tur → `basePrice/totalPrice/isPublished` **TIDAK berubah** (di luar `CONTENT_FIELDS`, diabaikan diam-diam). |
| **TC-CED-04 (NEG)** | Content Editor | **Tidak boleh** membuat tur baru | `POST /api/tours`. | **403 Forbidden** — hanya `TOUR_BUILDER_ROLES`. |
| **TC-CED-05 (NEG)** | Content Editor | **Tidak boleh** menyimpan tur penuh | `PUT /api/tours/:id/full`. | **403 Forbidden** — hanya `TOUR_BUILDER_ROLES`. |
| **TC-CED-06 (NEG)** | Content Editor | **Tidak boleh** mengedit hari/itinerary | `POST /api/tours/:id/days` / `PATCH /api/tour-days/:id`. | **403 Forbidden** — hanya `TOUR_BUILDER_ROLES`. |
| **TC-TAG-01** | Travel Agent | Login portal staff | Login `{username: travelagent1, portal: "staff"}`. | **200 OK**, `role: "travel_agent"`. |
| **TC-TAG-02** | Travel Agent | Melihat daftar booking (staf) | `GET /api/bookings`. | **200 OK** (diizinkan: `ALL_STAFF_ROLES`). |
| **TC-TAG-03** | Travel Agent | Membuat booking atas nama customer | `POST /api/bookings` dengan `customerId` pelanggan. | **200/201**, booking dibuat untuk `customerId` (karena staf boleh set `customerId`). |
| **TC-TAG-04 (NEG)** | Travel Agent | **Tidak boleh** mengubah booking (status) | `PATCH /api/bookings/:id`. | **403 Forbidden** — hanya `ADMIN_ROLES`. |
| **TC-TAG-05 (NEG)** | Travel Agent | **Tidak boleh** membuat/mengubah tur | `POST /api/tours` / `PATCH /api/tours/:id`. | **403 Forbidden** — bukan `TOUR_BUILDER_ROLES`/`TOUR_CONTENT_ROLES`. |

---

### 3.4. Level 4 — Consumer (Konsumen)

Peran: **Customer (CUS-01)**.

| ID Test Case | Peran | Skenario Pengujian | Langkah Pengujian | Hasil yang Diharapkan |
| :--- | :--- | :--- | :--- | :--- |
| **TC-CUS-01** | Customer | Registrasi mandiri | `POST /api/auth/register` dengan username/password baru. | **200/201**, akun dibuat dengan peran default `customer`. |
| **TC-CUS-02** | Customer | Login portal customer | Login `{username: customer1, portal: "customer"}`. | **200 OK**, `role: "customer"`. |
| **TC-CUS-03** | Customer | Menjelajah tur publik | `GET /api/tours/public` (tanpa/ dengan login). | **200 OK**, daftar tur publik dapat diakses. |
| **TC-CUS-04** | Customer | Membuat booking untuk dirinya | `POST /api/bookings` (tanpa `customerId`). | **200/201**, booking dibuat dengan `customerId = userId` sendiri (bukan staf → `customerId` diabaikan). |
| **TC-CUS-05** | Customer | Melihat booking miliknya | `GET /api/my-bookings`. | **200 OK**, **hanya** booking milik `userId` sendiri. |
| **TC-CUS-06** | Customer | Melihat detail & pembayaran booking sendiri | `GET /api/my-bookings/:id`, `GET /api/my-bookings/:id/payments`. | **200 OK** untuk booking miliknya. |
| **TC-CUS-07 (NEG)** | Customer | **Tidak boleh** login via portal admin/staff | Login `{username: customer1, portal: "admin"}` lalu `portal: "staff"`. | **403** `"This account does not have admin access"` / `"...staff access"`. |
| **TC-CUS-08 (NEG)** | Customer | **Tidak boleh** melihat daftar booking staf | `GET /api/bookings`. | **403 Forbidden** — hanya `ALL_STAFF_ROLES`. |
| **TC-CUS-09 (NEG)** | Customer | **Tidak boleh** melihat booking pelanggan lain | `GET /api/my-bookings/:id` dengan `:id` milik customer lain. | Tidak mengembalikan data milik orang lain (di-scope `userId`) — **404/403/kosong**. |
| **TC-CUS-10 (NEG)** | Customer | **Tidak boleh** akses daftar profil pengguna | `GET /api/user-profiles`. | **403 Forbidden** — hanya staf. |
| **TC-CUS-11 (NEG)** | Customer | **Tidak boleh** akses pembayaran global | `GET /api/payments`. | **403 Forbidden** — hanya `ADMIN_ROLES`. |
| **TC-CUS-12 (NEG)** | Customer | **Tidak boleh** membuat/menghapus tur | `POST /api/tours` / `DELETE /api/tours/:id`. | **403 Forbidden**. |
| **TC-CUS-13 (NEG)** | Customer | **Tidak boleh** akses workflow staf | `GET /api/workflows` / `GET /api/assignments`. | **403 Forbidden** — hanya `ALL_STAFF_ROLES`. |

---

## 4. Uji Autentikasi & Portal (Lintas Peran)

| ID Test Case | Skenario Pengujian | Langkah Pengujian | Hasil yang Diharapkan |
| :--- | :--- | :--- | :--- |
| **TC-AUTH-01** | Login dengan username salah | `POST /api/auth/login` username tidak ada. | **401** `"Invalid username or password"`. |
| **TC-AUTH-02** | Login dengan password salah | Username benar, password salah. | **401** `"Invalid username or password"`. |
| **TC-AUTH-03** | Login pakai email (bukan username) | Kirim email pada field `username`. | **401** — sistem hanya mencocokkan `username`. |
| **TC-AUTH-04** | Payload login tidak lengkap | Kirim tanpa `password`. | **400** `"Username and password required"`. |
| **TC-AUTH-05** | Akses endpoint terlindungi tanpa sesi | Panggil endpoint ber-`isAuthenticated` tanpa login. | **401** `"Unauthorized"`. |
| **TC-AUTH-06** | Admin masuk semua portal | Login `superadmin1` dengan `portal` = `admin`, `staff`, `customer` bergantian. | **200 OK** di ketiga portal (admin diterima di semua portal). |
| **TC-AUTH-07** | Staf non-admin ke portal customer | Login staf (mis. `tourbuilder1`) `portal: "customer"`. | **403** `"This account does not have customer access"`. |

---

## 5. Observasi Keamanan (Catatan — TIDAK untuk Diperbaiki di Sini)

Selama pemetaan RBAC, ditemukan sejumlah perilaku yang perlu dicatat sebagai **temuan QA** (bukan bagian dari perbaikan pada dokumen ini). Disarankan diangkat sebagai isu terpisah:

1. **`GET /api/hotels` bersifat publik** (tanpa `isAuthenticated`). Siapa pun dapat menginventarisasi seluruh data hotel. *Uji verifikasi:* panggil tanpa sesi → tetap **200 OK**.
2. **Endpoint `/api/rates/hotel`, `/api/rates/guide`, `/api/rates/sights`, `/api/rates/airline` (registrasi pertama) tanpa gerbang peran** — hanya `isAuthenticated`. Terdapat registrasi rute duplikat yang ber-`requireRole`, namun Express memakai **registrasi pertama**, sehingga pengguna terautentikasi apa pun (termasuk `customer`) berpotensi membaca/menulis rate card. *Uji verifikasi:* login sebagai `customer1` → `GET`/`POST /api/rates/hotel`.
3. **`GET /api/master/countries` dan `GET /api/master/sights`** dapat dibaca oleh setiap pengguna terautentikasi tanpa memandang peran (`isAuthenticated` saja). *Uji verifikasi:* login `customer1` → `GET /api/master/countries` → periksa apakah **200 OK**.
4. **`GET /api/tours/:id`, `GET /api/tours/:id/days`, `GET /api/tours/:id/day-items` bersifat publik.** Struktur tur (termasuk yang mungkin belum dipublikasi) dapat diambil siapa saja jika `id` diketahui.
5. **Profil otomatis (`getOrCreateProfile`)**: pengguna terautentikasi yang belum berprofil otomatis mendapat peran `customer`. Pastikan tidak ada jalur yang memberi hak lebih tinggi secara tak sengaja.

> Catatan: Item di atas adalah **observasi** sesuai ruang lingkup tugas (mendokumentasikan & menguji perilaku saat ini). Perbaikan RBAC berada di luar cakupan dokumen ini.

---

## 6. Ringkasan Cakupan

- **14 peran** tercakup, masing-masing memiliki **minimal satu uji akses positif**.
- **Uji negatif eksplisit** disediakan untuk jalur penolakan utama: Content Editor terhadap *field* harga/struktur; staf non-admin terhadap rute khusus admin; supplier/agent terhadap modul lintas-peran; Customer terhadap endpoint staf & booking milik orang lain; manajer ter-scope (negara/kota/perusahaan) terhadap data di luar wilayahnya.
- Seluruh skenario merujuk **rute, gerbang peran, pemeriksaan portal, field allowlist, dan row-scoping yang nyata** pada basis kode, sehingga dapat dieksekusi langsung di Staging/QA.

*— Akhir dokumen —*
