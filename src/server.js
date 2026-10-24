import fs from "node:fs";
import { createApp } from "./app.js";
import { createDb } from "./db.js";
import { seedIfEmpty } from "./seed.js";

// Beberapa hosting menjalankan "bun start" tanpa meneruskan isi .env ke process.env.
// Muat .env sendiri (hanya untuk variabel yang belum ada) agar PORT/JWT_SECRET terbaca.
try {
  for (const line of fs.readFileSync(".env", "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {
  // tidak ada file .env: pakai nilai bawaan
}

const port = Number(process.env.APP_PORT || process.env.PORT) || 8000;
const db = createDb(process.env.DB_FILE || "./data/resep.db");
seedIfEmpty(db);

createApp(db, { jwtSecret: process.env.JWT_SECRET || undefined }).listen(port, () => {
  console.log(`[${new Date().toISOString()}] API Koleksi Resep berjalan di http://localhost:${port} (pid ${process.pid})`);
  // SEMENTARA untuk diagnosis: tanda hidup tiap 20 detik agar terlihat berapa lama proses bertahan.
  setInterval(() => console.log(`[${new Date().toISOString()}] masih hidup`), 20000);
});