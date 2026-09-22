Tourops Interactive Test Suite & Role Testing Tool
Tools pengujian interaktif untuk Tourops App telah selesai dibuat dan siap digunakan pada folder tools/test-suite/. Tools ini menyediakan Web UI modern untuk menguji seluruh 17 Role, 12 Domain Business Flow, RBAC Security Audit Matrix, serta skenario Full-Cycle End-to-End.

🚀 Cara Menjalankan & Mengakses
Semua service pendukung saat ini sudah berjalan aktif di latar belakang:

Test Suite Dashboard UI: http://localhost:5050
Tourops Web App: http://localhost:5173
Tourops Backend API: http://localhost:5001
Jika ingin menjalankan test suite secara manual di terminal:

bash

# Dari root project:
pnpm test:ui
# Atau langsung dengan node:
node tools/test-suite/src/server.js
🌟 Fitur Utama Dashboard Test Suite
Buka browser ke http://localhost:5050 untuk mengakses dashboard interaktif:

1. 1-Click Role Impersonation (17 Role)
Terdapat kartu login untuk setiap 17 role (dikategorikan menjadi Executive & Administration, Operations & Planning, Domain Managers, External Suppliers, Field & Service Operations, dan Customer).
Tombol "Login & Open App ↗" akan secara otomatis:
Melakukan autentikasi session ke backend Tourops.
Memasang session cookie terenkripsi ke browser.
Membuka portal yang sesuai di http://localhost:5173 (Admin Portal, Staff Portal, atau Customer Portal) tanpa perlu mengetik username/password secara manual.
Tombol "Copy JSON" untuk menyalin data kredensial role.
2. 12 Domain Flows Automation
Dapat dijalankan satu per satu melalui tombol "Run Flow" atau sekaligus melalui tombol "▶ Run All 12 Flows":

Flow 1: Authentication, Session & Security Perimeter (auth)
Flow 2: Public Tour Discovery & Marketplace Catalog (publicCatalog)
Flow 3: Global Master Data Management (masterData)
Flow 4: Supplier Fleet & Lodging Catalog (suppliers)
Flow 5: Tour Assembly, Itinerary & Component Packaging (tourAssembly)
Flow 6: Dynamic Pricing Engine, Quotes & Overrides (pricing)
Flow 7: Booking Engine & Operational Allocations (bookings)
Flow 8: Passenger Management, Portal & Invitations (passengers)
Flow 9: Operations & 5-Step Service Fulfillment (operations)
Flow 10: Tour Leader Manifest & Passenger Privacy Scoping (tourLeader)
Flow 11: Accounting, Financial Reconciliation & Ledgers (accounting)
Flow 12: RBAC Security Matrix Auditor (rbacMatrix)
3. Exhaustive RBAC Security Matrix
Menilai kepatuhan izin akses secara mendalam pada 119 titik kombinasi endpoint vs 17 role.
Memastikan tidak ada privilege escalation atau unauthorized data access (Semua 119/119 pemeriksaan statusnya aman).
4. End-to-End Multi-Role Scenario (fullCycle)
Menyimulasikan siklus penuh kehidupan tur nyata yang melibatkan banyak peran berurutan:
Super Admin memverifikasi kesiapan environment dan database.
Hotel & Transport Manager memastikan ketersediaan armada bus & lodging.
Tour Builder merakit paket tur dan itinerary.
Customer menelusuri katalog tur publik.
Operations Manager memantau 5-tahap service fulfillment checklist.
Tour Leader mengakses passenger manifest tanpa membocorkan privasi finansial customer.
Accounting mengaudit buku besar penerimaan dan pelunasan transaksi.
5. Live Execution Terminal
Log streaming secara real-time yang menampilkan waktu eksekusi (latensi milidetik), HTTP status code, dan rincian respons per langkah.
📊 Hasil Verifikasi
Seluruh pengujian otomatis telah dieksekusi dan diverifikasi:

text

=== API FLOWS RUN RESULTS ===
Flow [auth]: PASSED ✅
Flow [publicCatalog]: PASSED ✅
Flow [masterData]: PASSED ✅
Flow [suppliers]: PASSED ✅
Flow [tourAssembly]: PASSED ✅
Flow [pricing]: PASSED ✅
Flow [bookings]: PASSED ✅
Flow [passengers]: PASSED ✅
Flow [operations]: PASSED ✅
Flow [tourLeader]: PASSED ✅
Flow [accounting]: PASSED ✅
Flow [rbacMatrix]: PASSED ✅
=== E2E SCENARIO RUN RESULTS ===
Scenario [fullCycle]: PASSED ✅
  - [OK] Step 1: Pre-flight Environment Readiness
  - [OK] Step 2: Supply Chain Availability (Lodging & Fleet)
  - [OK] Step 3: Tour Itinerary & Component Packaging
  - [OK] Step 4: Customer Tour Discovery & Selection
  - [OK] Step 5: Operations Dispatch & 5-Step Workflow Review
  - [OK] Step 6: Tour Leader Manifest Readiness
  - [OK] Step 7: Financial Audit & Invoicing Reconciliation