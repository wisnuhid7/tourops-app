# Tailwind di TourOps = v3.4.19 (BUKAN v4)

`artifacts/tourops` pakai Tailwind **v3.4.19**: `src/index.css` memakai `@tailwind base;` + ada `tailwind.config.ts`.

## Jebakan: sintaks v4 diam-diam jadi no-op
Kelas dengan varian v4-only **di-drop tanpa error apa pun** (typecheck & build tetap sukses). Yang pernah kejadian:
- `active:not-disabled:scale-[0.96]` → 0 CSS. Varian `not-*` baru ada di **v4**; v3 tidak mengenalinya.
- `@import "tailwindcss"` (bukan `@tailwind base`) → gaya v4, jangan dipakai di sini.

Perbaikan untuk kasus di atas: `active:scale-[0.96]` (tombol disabled sudah `disabled:pointer-events-none` di `components/ui/button.tsx`, jadi `:active` tak akan menyala pada tombol disabled).

Varian v3 yang AMAN: `disabled:`, `enabled:`, `active:`, `hover:`, `focus-visible:`, `data-[state=open]:`, `dark:`.

## Verifikasi wajib untuk perubahan kelas utility
Build hanya `artifacts/tourops` (build dari root GAGAL karena paket `mockup-sandbox`):
```
cd artifacts/tourops && pnpm run build
grep -o "<nama-kelas-yang-diduga>" dist/public/assets/*.css
```
Kalau kelasnya tidak muncul di CSS → tidak berefek, walau typecheck hijau.

## Catatan shadcn `cn()` (tailwind-merge)
Komponen `ui/**` sudah punya `shadow-sm`/`shadow-lg` bawaan. Memberi shadow lewat `className` **menang** karena tailwind-merge membuang kelas konflik — verifikasi: `npx tsx -e 'import {twMerge} from "tailwind-merge"; ...'`. Jadi kekhawatiran urutan rule di CSS tidak berlaku untuk kasus ini.
