import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  avatar_data BLOB,
  avatar_type TEXT,
  avatar_updated INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS recipes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  image_data BLOB,
  image_type TEXT,
  image_updated INTEGER NOT NULL DEFAULT 0,
  cooking_time INTEGER NOT NULL,
  servings INTEGER NOT NULL,
  difficulty TEXT NOT NULL CHECK (difficulty IN ('Mudah','Sedang','Sulit')),
  category_id INTEGER NOT NULL REFERENCES categories(id),
  user_id INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS ingredients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  quantity TEXT NOT NULL DEFAULT '',
  unit TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS steps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  step_number INTEGER NOT NULL,
  instruction TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_recipes_category ON recipes(category_id);
`;

/** Membuka database SQLite (file atau ":memory:") dan menyiapkan skema tabel. */
export function createDb(file = ":memory:") {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  // Skema versi lama (tanpa user_id) dibuang; data awal akan di-seed ulang.
  const cols = db.prepare("PRAGMA table_info(recipes)").all();
  if (cols.length > 0 && !cols.some((c) => c.name === "user_id")) {
    db.exec("DROP TABLE steps; DROP TABLE ingredients; DROP TABLE recipes; DROP TABLE categories;");
  }
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  // Tabel users dari versi sebelumnya: tambahkan kolom foto profil tanpa menghapus akun.
  if (!db.prepare("PRAGMA table_info(users)").all().some((c) => c.name === "avatar_data")) {
    db.exec("ALTER TABLE users ADD COLUMN avatar_data BLOB; ALTER TABLE users ADD COLUMN avatar_type TEXT; ALTER TABLE users ADD COLUMN avatar_updated INTEGER NOT NULL DEFAULT 0;");
  }
  return db;
}