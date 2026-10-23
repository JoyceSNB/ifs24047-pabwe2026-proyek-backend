# ifs24047-pabwe2026-proyek-backend — API Koleksi Resep Masakan

Express.js + SQLite (`better-sqlite3`). Menyediakan data resep sendiri (seed otomatis saat pertama dijalankan), autentikasi JWT, dan penyimpanan gambar resep di database.
Frontend ada di repo terpisah: `ifs24047-pabwe2026-proyek-frontend`.

## Menjalankan
```bash
git clone <URL-REPO-BACKEND>
cd ifs24047-pabwe2026-proyek-backend
npm install
cp .env.example .env
npm run dev              # http://localhost:8000
npm run test:coverage
```
Perlu Node.js 20+. Akun contoh dari seed: **demo@resep.id / demo1234** (pemilik 8 resep awal).

## Variabel lingkungan
| Variabel | Fungsi | Contoh |
| --- | --- | --- |
| `PORT` | Port API | `8000` |
| `DB_FILE` | Lokasi file SQLite | `./data/resep.db` |
| `CORS_ORIGIN` | Origin frontend yang diizinkan | `*` |
| `JWT_SECRET` | Kunci penanda tangan token (wajib diganti di server) | teks acak panjang |

## Skema database
`users(id, name, email, password_hash)` · `categories(id, name)` · `recipes(id, title, description, image_data, image_type, image_updated, cooking_time, servings, difficulty, category_id, user_id)` · `ingredients(id, recipe_id, name, quantity, unit)` · `steps(id, recipe_id, step_number, instruction)`

## Endpoint
Format respons: `{ "success": true|false, "message": "...", "data": ... }`. Endpoint bertanda 🔒 butuh header `Authorization: Bearer <token>`.

| Method | Path | Keterangan |
| --- | --- | --- |
| POST | `/api/auth/register` | Daftar `{name, email, password}` → `{token, user}` |
| POST | `/api/auth/login` | Masuk `{email, password}` → `{token, user}` |
| GET | `/api/auth/me` 🔒 | Profil pengguna dari token |
| PUT | `/api/auth/me` 🔒 | Ubah profil `{name, current_password?, new_password?}` (ganti password butuh password saat ini) |
| GET | `/api/categories` | Daftar kategori + jumlah resep |
| GET | `/api/recipes?search=&category=` | Daftar resep (cari judul, filter id kategori) |
| GET | `/api/recipes/:id` | Detail resep + bahan + langkah |
| GET | `/api/recipes/:id/image` | Gambar resep (404 bila tidak ada) |
| POST | `/api/recipes` 🔒 | Tambah resep (multipart) |
| PUT | `/api/recipes/:id` 🔒 | Ubah resep, hanya pemilik (multipart) |
| DELETE | `/api/recipes/:id` 🔒 | Hapus resep, hanya pemilik |

POST/PUT dikirim sebagai `multipart/form-data`: field `data` berisi JSON, dan field `image` (opsional, JPG/PNG/WebP maks 2 MB):
```json
{
  "title": "Telur Dadar", "description": "Cepat dan enak", "remove_image": false,
  "cooking_time": 5, "servings": 1, "difficulty": "Mudah", "category_id": 1,
  "ingredients": [{ "name": "Telur", "quantity": "2", "unit": "butir" }],
  "steps": ["Kocok telur", "Goreng hingga matang"]
}
```
`difficulty`: `Mudah` | `Sedang` | `Sulit`. Pada PUT, `remove_image: true` menghapus gambar lama; tanpa file baru gambar lama dipertahankan.
