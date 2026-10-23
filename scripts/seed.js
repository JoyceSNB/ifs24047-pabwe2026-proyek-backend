// Mengisi ulang data awal: npm run seed  (menghapus semua data resep lama)
import { createDb } from "../src/db.js";
import { seedDb } from "../src/seed.js";

const db = createDb(process.env.DB_FILE || "./data/resep.db");
db.exec("DELETE FROM steps; DELETE FROM ingredients; DELETE FROM recipes; DELETE FROM categories;");
seedDb(db);
console.log("Seed selesai.");
