import { createRequire } from "node:module";

/**
 * Membuka database SQLite dengan driver yang sesuai runtime:
 * - Node.js : better-sqlite3
 * - Bun     : bun:sqlite (better-sqlite3 belum didukung Bun), dibungkus agar
 *             API-nya sama dengan yang dipakai app.js/db.js/seed.js.
 * File ini dikecualikan dari coverage karena cabang Bun hanya jalan di Bun.
 */
const isBun = typeof Bun !== "undefined";

/** Bun mengembalikan BLOB sebagai Uint8Array; Express perlu Buffer. */
function toBuffer(row) {
  if (!row) return undefined;
  for (const key of Object.keys(row)) {
    const v = row[key];
    if (v instanceof Uint8Array && !Buffer.isBuffer(v)) row[key] = Buffer.from(v.buffer, v.byteOffset, v.byteLength);
  }
  return row;
}

function wrapBun(raw) {
  return {
    prepare(sql) {
      const stmt = raw.prepare(sql);
      return {
        get: (...args) => toBuffer(stmt.get(...args) ?? undefined),
        all: (...args) => stmt.all(...args).map(toBuffer),
        run: (...args) => stmt.run(...args),
      };
    },
    exec: (sql) => raw.exec(sql),
    transaction: (fn) => raw.transaction(fn),
    close: () => raw.close(),
  };
}

export function openDatabase(file) {
  if (isBun) {
    const { Database } = createRequire(import.meta.url)("bun:sqlite");
    // strict: true agar parameter bernama (@nama) boleh diikat tanpa awalan "@".
    return wrapBun(new Database(file, { strict: true }));
  }
  const Database = createRequire(import.meta.url)("better-sqlite3");
  return new Database(file);
}