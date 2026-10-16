# SOP Operasional Tourops

Dokumen ini menjelaskan alur penggunaan Tourops secara menyeluruh, dari master data sampai quote, supplier, dan operasional harian.

---

## 1. Tujuan

SOP ini dipakai untuk memastikan:
- data master konsisten
- tour dibuat dengan struktur yang benar
- pricing dan quote akurat
- supplier bekerja dengan alur yang jelas
- data hotel, rate, dan relasi tetap rapi

---

## 2. Ruang Lingkup

Mencakup:
- master data
- hotel, transport, guide, sights, airline
- hotel rates dan rate cards lain
- tour creation dan itinerary
- pricing engine dan quote
- supplier dashboard
- alur approval dan validasi data

---

## 3. Peran Pengguna

### Super Admin / Admin
- mengelola seluruh master data
- membuat dan mengedit tour
- mengatur pricing, quote, dan rate cards
- approve data supplier
- publish tour

### Tour Builder
- menyusun tour
- mengatur itinerary
- menambahkan komponen tour
- menyiapkan tour untuk publish

### Supplier / Hotel Manager / Guide Manager / Transport Manager / Sights Manager / Airline Supplier
- mengelola catalog milik domain masing-masing
- membuat dan memperbarui rate
- memproses tugas di dashboard supplier

### Staff Operasional
- memantau workflow
- mengelola status tugas
- membantu pengecekan data dan tindak lanjut

---

## 4. Prinsip Umum

1. **Master data harus dibuat lebih dulu** sebelum rate, tour, atau quote.
2. **Hotel rate harus terhubung ke hotel catalog**.
3. **Data publik dan data biaya harus dibedakan**.
4. **Status draft tidak boleh dipakai sebagai data final**.
5. **Perubahan besar harus dicek ulang sebelum publish**.

---

## 5. Struktur Menu Utama

- **Master Data**
- **Tours**
- **Pricing Engine**
- **Rate Cards**
- **Supplier Dashboard**
- **Departures**
- **Bookings**

---

## 6. SOP Master Data

### 6.1 Country
Langkah:
1. Buka menu **Master Data**.
2. Pilih tab **Countries**.
3. Tambahkan country baru.
4. Isi kode negara dan nama negara.
5. Simpan.

### 6.2 City
Langkah:
1. Buka tab **Cities**.
2. Tambahkan kota baru.
3. Pilih country yang sesuai.
4. Simpan.

### 6.3 Hotel
Langkah:
1. Buka tab **Hotels**.
2. Tambahkan hotel baru.
3. Isi nama hotel, lokasi, dan data pendukung.
4. Simpan.

Catatan:
- hotel adalah **master data**
- rate hotel harus mengikuti hotel yang sudah ada

### 6.4 Sights / Guide / Airline / Transport
Langkah umum:
1. Tambahkan entitas di master data.
2. Pastikan nama konsisten.
3. Simpan.

---

## 7. SOP Hotel Rates

### 7.1 Konsep

Hotel rate adalah data harga yang menempel ke hotel.

Aturan:
- 1 hotel dapat memiliki banyak rate
- rate tidak boleh berdiri sendiri tanpa hotel
- hotel rate harus mengikuti country dan city yang dipilih

### 7.2 Cara membuat hotel rate
1. Buka **Rate Cards**.
2. Masuk tab **Hotel Rates**.
3. Klik **Create Rate**.
4. Pilih country.
5. Pilih city.
6. Pilih hotel dari dropdown.
7. Isi room type.
8. Isi meal plan jika ada.
9. Isi currency.
10. Isi valid from / valid to.
11. Isi price per room per night.
12. Simpan.

### 7.3 Aturan dropdown hotel
- daftar hotel hanya menampilkan hotel yang cocok dengan country/city
- jika country/city berubah, dropdown hotel ikut berubah
- jika hotel lama tidak lagi cocok, pilihan akan direset

### 7.4 Data lama
- data lama tetap dibaca dengan fallback `hotelName`
- untuk data baru, selalu pilih hotel dari dropdown

---

## 8. SOP Supplier Dashboard

### 8.1 Tujuan
Dashboard supplier dipakai untuk melihat dan menyelesaikan tugas yang masuk.

### 8.2 Alur kerja
1. Login sebagai supplier.
2. Buka **Supplier Dashboard**.
3. Lihat tugas yang aktif.
4. Update data atau status sesuai kebutuhan.
5. Upload dokumen jika diminta.
6. Komunikasikan kendala melalui pesan yang tersedia.

### 8.3 Hotel manager
- mengelola hotel catalog
- mengisi hotel rates
- memastikan relasi hotel dan rate benar

---

## 9. SOP Tour Creation

### 9.1 Buat tour baru
1. Buka **Tours**.
2. Klik **Create Tour**.
3. Isi informasi dasar tour.
4. Isi title, deskripsi, negara, dan metadata lain.
5. Simpan sebagai draft.

### 9.2 Susun itinerary
1. Buka editor itinerary.
2. Tambahkan hari per hari.
3. Tambahkan item:
   - hotel
   - transport
   - sight
   - guide
   - meal
   - flight
   - custom
4. Pastikan setiap item punya cost yang benar.

### 9.3 Validasi
- cek durasi tour
- cek urutan hari
- cek hotel / guide / transport yang dipilih
- cek total biaya dasar

---

## 10. SOP Pricing Engine

### 10.1 Group size bands
- definisikan range pax yang dipakai pricing
- pastikan label dan nilai minimum/maksimum jelas

### 10.2 Pricing rules
- atur markup global atau per tour/country
- tentukan nilai fixed atau percentage
- aktifkan hanya rule yang valid

### 10.3 Quote
Langkah membuat quote:
1. Buka **Pricing Engine**.
2. Masuk tab **Quotes**.
3. Klik **Create Quote**.
4. Pilih tour.
5. Isi pax count dan nights.
6. Isi komponen biaya.
7. Pilih hotel choice jika tersedia.
8. Simpan quote.

### 10.4 Review quote
- cek total group cost
- cek base cost per person
- cek breakdown per komponen
- pastikan quote sesuai scope tour

---

## 11. SOP Departures

### 11.1 Tujuan
Departure menentukan tanggal tour yang bisa dibooking.

### 11.2 Langkah
1. Buka **Departures**.
2. Tambahkan departure baru.
3. Isi tanggal mulai, tanggal selesai, dan kapasitas.
4. Isi harga jika fixed price dipakai.
5. Simpan.

### 11.3 Status
- `open` = bisa dibooking
- `closed` / `sold_out` / `cancelled` = tidak aktif

---

## 12. SOP Approval dan Status

### Supplier rate
1. Supplier mengisi data rate.
2. Data masuk sebagai draft/pending.
3. Admin memeriksa isi dan akurasi.
4. Admin mengubah status ke active/approved jika layak.

### Booking / workflow
- status tugas harus diupdate sesuai progress nyata
- perubahan status harus konsisten dengan pekerjaan lapangan

---

## 13. SOP Quality Control

Sebelum data dipakai final, pastikan:
- nama hotel benar
- relasi hotel rate ke hotel benar
- country dan city sesuai
- validity date tidak bentrok
- harga sudah dicek ulang
- tour itinerary lengkap
- quote sudah direview

---

## 14. Checklist Harian Admin

- cek master data yang baru masuk
- cek hotel rate draft
- cek perubahan tour
- cek quote yang baru dibuat
- cek workflow supplier yang belum selesai
- cek departure yang akan dibuka

---

## 15. Checklist Harian Supplier

- cek rate yang perlu diisi
- cek tugas yang belum selesai
- cek dokumen yang perlu diupload
- cek pesan dari admin / ops

---

## 16. Troubleshooting

### Hotel tidak muncul di dropdown
- pastikan hotel sudah dibuat di master data
- cek country dan city yang dipilih
- cek akses user

### Hotel rate tidak tersambung
- cek apakah `hotel_id` sudah terisi
- cek fallback `hotelName` untuk data lama

### Quote tidak sesuai
- cek tour yang dipilih
- cek hotel rate active
- cek pricing rules
- cek komponen biaya

### Data lama belum rapi
- lakukan edit ulang dan pilih data dari dropdown
- simpan kembali supaya relasi terbentuk

---

## 17. Aturan Operasional Penting

1. Jangan membuat master data duplikat.
2. Jangan menyimpan rate tanpa relasi ke entitas master.
3. Jangan publish tour sebelum itinerary final.
4. Jangan mengaktifkan rate yang belum dicek.
5. Jangan menggunakan nama bebas kalau dropdown master sudah tersedia.

---

## 18. Penutup

Dokumen ini menjadi acuan operasional utama Tourops. Jika ada perubahan alur, update SOP ini terlebih dahulu sebelum mengubah proses harian.
