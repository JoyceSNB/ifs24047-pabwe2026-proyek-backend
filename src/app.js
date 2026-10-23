import express from "express";
import cors from "cors";
import multer from "multer";
import { hashPassword, verifyPassword, signToken, requireAuth } from "./auth.js";

export const DIFFICULTIES = ["Mudah", "Sedang", "Sulit"];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

const ok = (res, message, data, status = 200) => res.status(status).json({ success: true, message, data });
const fail = (res, status, message, errors) => res.status(status).json({ success: false, message, ...(errors ? { errors } : {}) });

const isPosInt = (v) => Number.isInteger(v) && v > 0;
const str = (v) => (typeof v === "string" ? v.trim() : "");

/** Validasi body resep. Mengembalikan { errors, value }. */
export function validateRecipe(db, body = {}) {
  const errors = [];
  const title = str(body.title);
  if (!title) errors.push("Judul wajib diisi");
  else if (title.length > 120) errors.push("Judul maksimal 120 karakter");

  const cooking_time = Number(body.cooking_time);
  if (!isPosInt(cooking_time)) errors.push("Waktu memasak harus bilangan bulat positif (menit)");
  const servings = Number(body.servings);
  if (!isPosInt(servings)) errors.push("Porsi harus bilangan bulat positif");
  if (!DIFFICULTIES.includes(body.difficulty)) errors.push(`Tingkat kesulitan harus salah satu dari: ${DIFFICULTIES.join(", ")}`);

  const category_id = Number(body.category_id);
  if (!isPosInt(category_id) || !db.prepare("SELECT 1 FROM categories WHERE id = ?").get(category_id)) {
    errors.push("Kategori tidak valid");
  }

  const ingredients = (Array.isArray(body.ingredients) ? body.ingredients : [])
    .map((i) => ({ name: str(i?.name), quantity: String(i?.quantity ?? "").trim(), unit: str(i?.unit) }))
    .filter((i) => i.name);
  if (ingredients.length === 0) errors.push("Minimal satu bahan wajib diisi");

  const steps = (Array.isArray(body.steps) ? body.steps : []).map(str).filter(Boolean);
  if (steps.length === 0) errors.push("Minimal satu langkah wajib diisi");

  return {
    errors,
    value: {
      title,
      description: str(body.description),
      remove_image: body.remove_image === true,
      cooking_time,
      servings,
      difficulty: body.difficulty,
      category_id,
      ingredients,
      steps,
    },
  };
}

/** Bentuk data pengguna yang aman dikirim ke klien (tanpa hash password / data biner). */
const toUser = (u) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  avatar_url: u.avatar_updated ? `/api/users/${u.id}/avatar?v=${u.avatar_updated}` : null,
});

export function createApp(db, { jwtSecret = process.env.JWT_SECRET || "dev-secret-ganti-di-produksi" } = {}) {
  const app = express();
  app.use(cors({ origin: process.env.CORS_ORIGIN || "*" }));
  app.use(express.json());
  const auth = requireAuth(jwtSecret);

  // Gambar resep disimpan langsung di SQLite (kolom BLOB), maksimal 2 MB.
  const uploader = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 2 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => (IMAGE_TYPES.includes(file.mimetype) ? cb(null, true) : cb(new Error("Format gambar harus JPG, PNG, atau WEBP"))),
  }).single("image");

  /** Membaca file "image" dari multipart; galat upload dijawab 400. */
  const runUpload = (req, res, next) =>
    uploader(req, res, (err) =>
      err ? fail(res, 400, err.code === "LIMIT_FILE_SIZE" ? "Ukuran gambar maksimal 2 MB" : err.message) : next()
    );

  /** Membaca multipart resep: field "data" (JSON) dan file "image" (opsional). */
  const parseForm = (req, res, next) =>
    runUpload(req, res, () => {
      try {
        req.recipeData = JSON.parse(req.body.data);
      } catch {
        return fail(res, 400, "Data resep tidak valid");
      }
      next();
    });

  const parseId = (req) => {
    const id = Number(req.params.id);
    return Number.isInteger(id) && id > 0 ? id : null;
  };

  // ---------- Autentikasi ----------
  app.post("/api/auth/register", (req, res) => {
    const name = str(req.body.name);
    const email = str(req.body.email).toLowerCase();
    const password = typeof req.body.password === "string" ? req.body.password : "";
    const errors = [];
    if (name.length < 2) errors.push("Nama minimal 2 karakter");
    if (!EMAIL.test(email)) errors.push("Email tidak valid");
    if (password.length < 6) errors.push("Password minimal 6 karakter");
    if (errors.length) return fail(res, 400, errors.join("; "), errors);
    if (db.prepare("SELECT 1 FROM users WHERE email = ?").get(email)) return fail(res, 409, "Email sudah terdaftar");
    const id = Number(db.prepare("INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)").run(name, email, hashPassword(password)).lastInsertRowid);
    const user = toUser({ id, name, email, avatar_updated: 0 });
    ok(res, "Registrasi berhasil", { token: signToken(user, jwtSecret), user }, 201);
  });

  app.post("/api/auth/login", (req, res) => {
    const email = str(req.body.email).toLowerCase();
    const password = typeof req.body.password === "string" ? req.body.password : "";
    const u = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
    if (!u || !verifyPassword(password, u.password_hash)) return fail(res, 401, "Email atau password salah");
    const user = toUser(u);
    ok(res, "Login berhasil", { token: signToken(user, jwtSecret), user });
  });

  app.get("/api/auth/me", auth, (req, res) => {
    const u = db.prepare("SELECT id, name, email, avatar_updated FROM users WHERE id = ?").get(req.user.sub);
    if (!u) return fail(res, 401, "Akun tidak ditemukan");
    ok(res, "Profil", { user: toUser(u) });
  });

  app.put("/api/auth/me", auth, (req, res) => {
    const u = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.sub);
    if (!u) return fail(res, 401, "Akun tidak ditemukan");
    const name = str(req.body.name);
    const current = typeof req.body.current_password === "string" ? req.body.current_password : "";
    const next = typeof req.body.new_password === "string" ? req.body.new_password : "";
    const errors = [];
    if (name.length < 2) errors.push("Nama minimal 2 karakter");
    if (next) {
      if (next.length < 6) errors.push("Password baru minimal 6 karakter");
      else if (!verifyPassword(current, u.password_hash)) errors.push("Password saat ini salah");
    }
    if (errors.length) return fail(res, 400, errors.join("; "), errors);
    db.prepare("UPDATE users SET name = ?, password_hash = ? WHERE id = ?").run(name, next ? hashPassword(next) : u.password_hash, u.id);
    ok(res, "Profil berhasil diperbarui", { user: toUser({ ...u, name }) });
  });

  // ---------- Foto profil (disimpan di SQLite, maksimal 2 MB) ----------
  const findUser = (id) => db.prepare("SELECT * FROM users WHERE id = ?").get(id);

  app.put("/api/auth/avatar", auth, runUpload, (req, res) => {
    const u = findUser(req.user.sub);
    if (!u) return fail(res, 401, "Akun tidak ditemukan");
    if (!req.file) return fail(res, 400, "File gambar wajib diunggah");
    const version = Date.now();
    db.prepare("UPDATE users SET avatar_data = ?, avatar_type = ?, avatar_updated = ? WHERE id = ?").run(req.file.buffer, req.file.mimetype, version, u.id);
    ok(res, "Foto profil berhasil diperbarui", { user: toUser({ ...u, avatar_updated: version }) });
  });

  app.delete("/api/auth/avatar", auth, (req, res) => {
    const u = findUser(req.user.sub);
    if (!u) return fail(res, 401, "Akun tidak ditemukan");
    db.prepare("UPDATE users SET avatar_data = NULL, avatar_type = NULL, avatar_updated = 0 WHERE id = ?").run(u.id);
    ok(res, "Foto profil dihapus", { user: toUser({ ...u, avatar_updated: 0 }) });
  });

  app.get("/api/users/:id/avatar", (req, res) => {
    const row = db.prepare("SELECT avatar_data, avatar_type FROM users WHERE id = ?").get(parseId(req));
    if (!row || !row.avatar_data) return fail(res, 404, "Foto tidak ditemukan");
    res.type(row.avatar_type).set("Cache-Control", "public, max-age=86400").send(row.avatar_data);
  });

  // ---------- Resep ----------
  const COLS = `r.id, r.title, r.description, r.cooking_time, r.servings, r.difficulty, r.category_id, r.user_id,
    c.name AS category_name, u.name AS author_name,
    CASE WHEN r.image_data IS NOT NULL THEN '/api/recipes/' || r.id || '/image?v=' || r.image_updated END AS image_url`;

  const listSql = `
    SELECT ${COLS}
    FROM recipes r JOIN categories c ON c.id = r.category_id LEFT JOIN users u ON u.id = r.user_id
    WHERE (@search = '' OR r.title LIKE '%' || @search || '%')
      AND (@category = 0 OR r.category_id = @category)
    ORDER BY r.id DESC`;

  function findRecipe(id) {
    const recipe = db
      .prepare(
        `SELECT ${COLS} FROM recipes r JOIN categories c ON c.id = r.category_id
         LEFT JOIN users u ON u.id = r.user_id WHERE r.id = ?`
      )
      .get(id);
    if (!recipe) return null;
    recipe.ingredients = db.prepare("SELECT id, name, quantity, unit FROM ingredients WHERE recipe_id = ? ORDER BY id").all(id);
    recipe.steps = db.prepare("SELECT id, step_number, instruction FROM steps WHERE recipe_id = ? ORDER BY step_number").all(id);
    return recipe;
  }

  const writeChildren = (id, v) => {
    const insIng = db.prepare("INSERT INTO ingredients (recipe_id, name, quantity, unit) VALUES (?, ?, ?, ?)");
    const insStep = db.prepare("INSERT INTO steps (recipe_id, step_number, instruction) VALUES (?, ?, ?)");
    v.ingredients.forEach((i) => insIng.run(id, i.name, i.quantity, i.unit));
    v.steps.forEach((s, idx) => insStep.run(id, idx + 1, s));
  };

  const fields = (v) => ({
    title: v.title,
    description: v.description,
    cooking_time: v.cooking_time,
    servings: v.servings,
    difficulty: v.difficulty,
    category_id: v.category_id,
  });

  const setImage = db.prepare("UPDATE recipes SET image_data = ?, image_type = ?, image_updated = ? WHERE id = ?");

  const create = db.transaction((v, userId, file) => {
    const { lastInsertRowid } = db
      .prepare(
        `INSERT INTO recipes (title, description, cooking_time, servings, difficulty, category_id, user_id)
         VALUES (@title, @description, @cooking_time, @servings, @difficulty, @category_id, @user_id)`
      )
      .run({ ...fields(v), user_id: userId });
    if (file) setImage.run(file.buffer, file.mimetype, Date.now(), lastInsertRowid);
    writeChildren(lastInsertRowid, v);
    return Number(lastInsertRowid);
  });

  const update = db.transaction((id, v, file) => {
    db.prepare(
      `UPDATE recipes SET title=@title, description=@description, cooking_time=@cooking_time,
       servings=@servings, difficulty=@difficulty, category_id=@category_id WHERE id=@id`
    ).run({ id, ...fields(v) });
    if (file) setImage.run(file.buffer, file.mimetype, Date.now(), id);
    else if (v.remove_image) setImage.run(null, null, 0, id);
    db.prepare("DELETE FROM ingredients WHERE recipe_id = ?").run(id);
    db.prepare("DELETE FROM steps WHERE recipe_id = ?").run(id);
    writeChildren(id, v);
  });

  app.get("/api/health", (_req, res) => ok(res, "OK", { status: "up" }));

  app.get("/api/categories", (_req, res) => {
    const rows = db
      .prepare(
        `SELECT c.id, c.name, COUNT(r.id) AS recipe_count FROM categories c
         LEFT JOIN recipes r ON r.category_id = c.id GROUP BY c.id ORDER BY c.id`
      )
      .all();
    ok(res, "Daftar kategori", { categories: rows });
  });

  app.get("/api/recipes", (req, res) => {
    const search = str(req.query.search);
    const category = Number(req.query.category) || 0;
    ok(res, "Daftar resep", { recipes: db.prepare(listSql).all({ search, category }) });
  });

  app.get("/api/recipes/:id", (req, res) => {
    const id = parseId(req);
    const recipe = id && findRecipe(id);
    if (!recipe) return fail(res, 404, "Resep tidak ditemukan");
    ok(res, "Detail resep", recipe);
  });

  app.get("/api/recipes/:id/image", (req, res) => {
    const row = db.prepare("SELECT image_data, image_type FROM recipes WHERE id = ?").get(parseId(req));
    if (!row || !row.image_data) return fail(res, 404, "Gambar tidak ditemukan");
    res.type(row.image_type).set("Cache-Control", "public, max-age=86400").send(row.image_data);
  });

  app.post("/api/recipes", auth, parseForm, (req, res) => {
    const { errors, value } = validateRecipe(db, req.recipeData);
    if (errors.length) return fail(res, 400, errors.join("; "), errors);
    ok(res, "Resep berhasil ditambahkan", findRecipe(create(value, req.user.sub, req.file)), 201);
  });

  app.put("/api/recipes/:id", auth, parseForm, (req, res) => {
    const id = parseId(req);
    const existing = id && findRecipe(id);
    if (!existing) return fail(res, 404, "Resep tidak ditemukan");
    if (existing.user_id !== req.user.sub) return fail(res, 403, "Anda bukan pemilik resep ini");
    const { errors, value } = validateRecipe(db, req.recipeData);
    if (errors.length) return fail(res, 400, errors.join("; "), errors);
    update(id, value, req.file);
    ok(res, "Resep berhasil diubah", findRecipe(id));
  });

  app.delete("/api/recipes/:id", auth, (req, res) => {
    const id = parseId(req);
    const existing = id && findRecipe(id);
    if (!existing) return fail(res, 404, "Resep tidak ditemukan");
    if (existing.user_id !== req.user.sub) return fail(res, 403, "Anda bukan pemilik resep ini");
    db.prepare("DELETE FROM recipes WHERE id = ?").run(id);
    ok(res, "Resep berhasil dihapus", null);
  });

  app.use((_req, res) => fail(res, 404, "Endpoint tidak ditemukan"));

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err.type === "entity.parse.failed") return fail(res, 400, "Body JSON tidak valid");
    return fail(res, 500, "Terjadi kesalahan pada server");
  });

  return app;
}