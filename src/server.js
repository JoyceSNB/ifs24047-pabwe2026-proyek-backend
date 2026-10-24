import { createApp } from "./app.js";
import { createDb } from "./db.js";
import { seedIfEmpty } from "./seed.js";

const port = Number(process.env.APP_PORT || process.env.PORT) || 8000;
const db = createDb(process.env.DB_FILE || "./data/resep.db");
seedIfEmpty(db);

createApp(db, { jwtSecret: process.env.JWT_SECRET || undefined }).listen(port, () =>
  console.log(`API Koleksi Resep berjalan di http://localhost:${port}`)
);