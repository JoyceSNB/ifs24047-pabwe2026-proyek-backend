import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { createApp } from "../src/app.js";
import { createDb } from "../src/db.js";
import { seedIfEmpty, DEMO_USER } from "../src/seed.js";

let db, api, token, me;
const bearer = (t = token) => ({ Authorization: `Bearer ${t}` });

beforeEach(async () => {
  db = createDb(":memory:");
  seedIfEmpty(db);
  api = request(createApp(db, { jwtSecret: "test-secret" }));
  const r = await api.post("/api/auth/register").send({ name: "Joyce", email: "joyce@mail.com", password: "rahasia123" });
  token = r.body.data.token;
  me = r.body.data.user;
});

const valid = (over = {}) => ({
  title: "Telur Dadar",
  description: "Cepat",
  cooking_time: 5,
  servings: 1,
  difficulty: "Mudah",
  category_id: 1,
  ingredients: [{ name: "Telur", quantity: 2, unit: "butir" }, { name: "  " }],
  steps: ["Kocok telur", "Goreng", ""],
  ...over,
});
const PNG = Buffer.from("89504e470d0a1a0a", "hex");
const send = (method, url, data, t = token, file) => {
  let r = api[method](url).set(bearer(t));
  if (data !== undefined) r = r.field("data", typeof data === "string" ? data : JSON.stringify(data));
  if (file) r = r.attach("image", file.buffer, { filename: file.name, contentType: file.type });
  return r;
};
const png = { buffer: PNG, name: "a.png", type: "image/png" };
const createOwn = async (file) => (await send("post", "/api/recipes", valid(), token, file)).body.data;

describe("seed, health, db", () => {
  it("seed tidak diulang bila data sudah ada", () => {
    expect(seedIfEmpty(db)).toBe(false);
  });
  it("health", async () => {
    expect((await api.get("/api/health")).body.data.status).toBe("up");
  });
  it("skema lama dimigrasi, skema baru dibiarkan", () => {
    const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "db-")), "x.db");
    const old = new Database(f);
    old.exec("CREATE TABLE categories(id INTEGER PRIMARY KEY, name TEXT); CREATE TABLE recipes(id INTEGER PRIMARY KEY, title TEXT); CREATE TABLE ingredients(id INTEGER); CREATE TABLE steps(id INTEGER);");
    old.close();
    const migrated = createDb(f);
    expect(migrated.prepare("PRAGMA table_info(recipes)").all().some((c) => c.name === "user_id")).toBe(true);
    migrated.close();
    expect(createDb(f).prepare("SELECT COUNT(*) n FROM recipes").get().n).toBe(0);
  });
});

describe("autentikasi", () => {
  it("register: validasi dan email ganda", async () => {
    const bad = await api.post("/api/auth/register").send({ name: "x", email: "salah", password: "1" });
    expect(bad.status).toBe(400);
    expect(bad.body.errors).toHaveLength(3);
    expect((await api.post("/api/auth/register").send({ name: "Joyce", email: "JOYCE@mail.com", password: "rahasia123" })).status).toBe(409);
    expect((await api.post("/api/auth/register").send({ name: "Ab", email: "a@b.co", password: 123456 })).status).toBe(400);
  });
  it("login benar (termasuk akun demo) dan salah", async () => {
    const ok = await api.post("/api/auth/login").send({ email: "joyce@mail.com", password: "rahasia123" });
    expect(ok.body.data.user).toMatchObject({ name: "Joyce", email: "joyce@mail.com" });
    expect((await api.post("/api/auth/login").send({ email: DEMO_USER.email, password: DEMO_USER.password })).status).toBe(200);
    expect((await api.post("/api/auth/login").send({ email: "x@y.co", password: "abcdef" })).status).toBe(401);
    expect((await api.post("/api/auth/login").send({ email: "joyce@mail.com", password: "salah!" })).status).toBe(401);
    expect((await api.post("/api/auth/login").send({ email: "joyce@mail.com", password: 1 })).status).toBe(401);
  });
  it("me: token valid, tanpa token, dan akun sudah dihapus", async () => {
    expect((await api.get("/api/auth/me").set(bearer())).body.data.user).toEqual(me);
    expect((await api.get("/api/auth/me")).status).toBe(401);
    db.prepare("DELETE FROM users WHERE id = ?").run(me.id);
    expect((await api.get("/api/auth/me").set(bearer())).status).toBe(401);
  });
  it("endpoint tulis wajib login", async () => {
    expect((await api.post("/api/recipes")).status).toBe(401);
    expect((await api.put("/api/recipes/1")).status).toBe(401);
    expect((await api.delete("/api/recipes/1")).status).toBe(401);
    expect((await api.delete("/api/recipes/1").set("Authorization", "Bearer palsu")).status).toBe(401);
  });
});

describe("ubah profil", () => {
  it("mengubah nama tanpa mengganti password", async () => {
    const r = await api.put("/api/auth/me").set(bearer()).send({ name: "Joyce Baru" });
    expect(r.status).toBe(200);
    expect(r.body.data.user).toEqual({ id: me.id, name: "Joyce Baru", email: "joyce@mail.com", avatar_url: null });
    expect((await api.get("/api/auth/me").set(bearer())).body.data.user.name).toBe("Joyce Baru");
    expect((await api.post("/api/auth/login").send({ email: "joyce@mail.com", password: "rahasia123" })).status).toBe(200);
  });
  it("mengganti password: butuh password saat ini yang benar", async () => {
    const bad = await api.put("/api/auth/me").set(bearer()).send({ name: "Joyce", current_password: "salah", new_password: "baru12345" });
    expect(bad.status).toBe(400);
    expect(bad.body.message).toMatch(/saat ini salah/);
    const ok = await api.put("/api/auth/me").set(bearer()).send({ name: "Joyce", current_password: "rahasia123", new_password: "baru12345" });
    expect(ok.status).toBe(200);
    expect((await api.post("/api/auth/login").send({ email: "joyce@mail.com", password: "baru12345" })).status).toBe(200);
    expect((await api.post("/api/auth/login").send({ email: "joyce@mail.com", password: "rahasia123" })).status).toBe(401);
  });
  it("validasi nama dan password baru; password bukan string diabaikan", async () => {
    const r = await api.put("/api/auth/me").set(bearer()).send({ name: "x", current_password: "rahasia123", new_password: "123" });
    expect(r.status).toBe(400);
    expect(r.body.errors).toHaveLength(2);
    expect((await api.put("/api/auth/me").set(bearer()).send({ name: "Joyce", current_password: 1, new_password: 2 })).status).toBe(200);
  });
  it("wajib login dan akun harus masih ada", async () => {
    expect((await api.put("/api/auth/me").send({ name: "Joyce" })).status).toBe(401);
    db.prepare("DELETE FROM users WHERE id = ?").run(me.id);
    expect((await api.put("/api/auth/me").set(bearer()).send({ name: "Joyce" })).status).toBe(401);
  });
});

describe("GET", () => {
  it("kategori, daftar, cari, dan filter", async () => {
    expect((await api.get("/api/categories")).body.data.categories).toHaveLength(6);
    const all = (await api.get("/api/recipes")).body.data.recipes;
    expect(all).toHaveLength(8);
    expect(all[0]).toMatchObject({ author_name: "Chef Demo", image_url: null });
    expect((await api.get("/api/recipes?search=arsik")).body.data.recipes.map((x) => x.title)).toEqual(["Arsik Ikan Mas"]);
    expect((await api.get("/api/recipes?category=2")).body.data.recipes.every((x) => x.category_id === 2)).toBe(true);
  });
  it("detail resep berisi bahan dan langkah", async () => {
    const r = await api.get("/api/recipes/1");
    expect(r.body.data.ingredients.length).toBeGreaterThan(0);
    expect(r.body.data.steps[0].step_number).toBe(1);
  });
  it("404 untuk id tidak ada / tidak valid / endpoint asing", async () => {
    expect((await api.get("/api/recipes/9999")).status).toBe(404);
    expect((await api.get("/api/recipes/abc")).status).toBe(404);
    expect((await api.get("/api/nope")).status).toBe(404);
  });
});

describe("POST + gambar", () => {
  it("membuat resep tanpa gambar, dimiliki pembuatnya", async () => {
    const r = await send("post", "/api/recipes", valid());
    expect(r.status).toBe(201);
    expect(r.body.data).toMatchObject({ user_id: me.id, author_name: "Joyce", image_url: null });
    expect(r.body.data.ingredients).toHaveLength(1);
    expect(r.body.data.steps).toHaveLength(2);
  });
  it("membuat resep dengan gambar lalu gambar bisa diambil", async () => {
    const rec = await createOwn(png);
    expect(rec.image_url).toMatch(new RegExp(`^/api/recipes/${rec.id}/image\\?v=\\d+$`));
    const img = await api.get(`/api/recipes/${rec.id}/image`);
    expect(img.status).toBe(200);
    expect(img.headers["content-type"]).toMatch(/image\/png/);
    expect(img.body.equals(PNG)).toBe(true);
  });
  it("gambar: 404 bila tidak ada", async () => {
    expect((await api.get("/api/recipes/1/image")).status).toBe(404);
    expect((await api.get("/api/recipes/9999/image")).status).toBe(404);
  });
  it("menolak format salah, file kebesaran, dan data rusak", async () => {
    const t = await send("post", "/api/recipes", valid(), token, { buffer: Buffer.from("x"), name: "a.txt", type: "text/plain" });
    expect(t.body.message).toMatch(/JPG/);
    const big = await send("post", "/api/recipes", valid(), token, { buffer: Buffer.alloc(2 * 1024 * 1024 + 10), name: "b.jpg", type: "image/jpeg" });
    expect(big.body.message).toMatch(/2 MB/);
    expect((await send("post", "/api/recipes", "{bad")).body.message).toMatch(/tidak valid/);
    expect((await api.post("/api/recipes").set(bearer())).status).toBe(400);
  });
  it("menolak data tidak valid", async () => {
    const r = await send("post", "/api/recipes", { title: "x".repeat(121), difficulty: "?", category_id: 99 });
    expect(r.status).toBe(400);
    expect(r.body.errors.length).toBeGreaterThanOrEqual(5);
    expect((await send("post", "/api/recipes", valid({ title: " " }))).status).toBe(400);
    expect((await send("post", "/api/recipes", valid({ ingredients: "x", steps: null }))).status).toBe(400);
  });
  it("JSON rusak pada endpoint auth -> 400", async () => {
    const r = await api.post("/api/auth/login").set("Content-Type", "application/json").send("{bad");
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/JSON/);
  });
});

describe("PUT & DELETE (hanya pemilik)", () => {
  it("mengubah resep dan mengganti gambar", async () => {
    const rec = await createOwn(png);
    const jpg = { buffer: Buffer.from("jpg"), name: "b.jpg", type: "image/jpeg" };
    const r = await send("put", `/api/recipes/${rec.id}`, valid({ title: "Baru" }), token, jpg);
    expect(r.status).toBe(200);
    expect(r.body.data.title).toBe("Baru");
    expect((await api.get(`/api/recipes/${rec.id}/image`)).headers["content-type"]).toMatch(/jpeg/);
  });
  it("gambar dipertahankan bila tidak diubah, dihapus bila remove_image", async () => {
    const rec = await createOwn(png);
    const keep = await send("put", `/api/recipes/${rec.id}`, valid());
    expect(keep.body.data.image_url).not.toBeNull();
    const gone = await send("put", `/api/recipes/${rec.id}`, valid({ remove_image: true }));
    expect(gone.body.data.image_url).toBeNull();
  });
  it("PUT: 404, 400, dan 403 untuk bukan pemilik", async () => {
    expect((await send("put", "/api/recipes/9999", valid())).status).toBe(404);
    const rec = await createOwn();
    expect((await send("put", `/api/recipes/${rec.id}`, {})).status).toBe(400);
    expect((await send("put", "/api/recipes/1", valid())).status).toBe(403);
  });
  it("menghapus resep sendiri beserta bahan & langkah", async () => {
    const rec = await createOwn();
    expect((await api.delete(`/api/recipes/${rec.id}`).set(bearer())).status).toBe(200);
    expect((await api.get(`/api/recipes/${rec.id}`)).status).toBe(404);
    expect(db.prepare("SELECT COUNT(*) n FROM ingredients WHERE recipe_id=?").get(rec.id).n).toBe(0);
  });
  it("DELETE: 404 dan 403", async () => {
    expect((await api.delete("/api/recipes/9999").set(bearer())).status).toBe(404);
    expect((await api.delete("/api/recipes/1").set(bearer())).status).toBe(403);
  });
  it("500 untuk galat tak terduga", async () => {
    db.close();
    expect((await api.get("/api/recipes")).status).toBe(500);
  });
});
