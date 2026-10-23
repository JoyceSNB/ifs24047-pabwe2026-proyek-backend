import { hashPassword } from "./auth.js";

/** Akun contoh agar bisa langsung login saat pertama kali dicoba. */
export const DEMO_USER = { name: "Chef Demo", email: "demo@resep.id", password: "demo1234" };

const CATEGORIES = ["Makanan Utama", "Lauk", "Sup & Sayur", "Sambal & Pelengkap", "Camilan & Kue", "Minuman"];

// [judul, deskripsi, menit, porsi, kesulitan, kategori, [bahan: nama|jumlah|satuan], [langkah]]
const RECIPES = [
  ["Arsik Ikan Mas", "Ikan mas bumbu kuning khas Batak dengan andaliman dan asam cikala yang segar-pedas.", 60, 4, "Sedang", "Lauk",
    ["Ikan mas|1|ekor", "Andaliman|2|sdm", "Kunyit|3|cm", "Jahe|3|cm", "Lengkuas|3|cm", "Cabai merah|8|buah", "Bawang merah|8|siung", "Asam cikala|1|buah"],
    ["Haluskan semua bumbu kecuali andaliman.", "Lumuri ikan dengan jeruk nipis, diamkan 10 menit.", "Susun ikan dalam panci, tuang bumbu dan air secukupnya.", "Masak api kecil 40 menit hingga bumbu meresap dan kuah menyusut."]],
  ["Mie Gomak", "Mi tebal ala Batak dengan kuah santan kental, bumbu rempah, dan taburan bawang goreng.", 35, 3, "Mudah", "Makanan Utama",
    ["Mi lidi tebal|300|gram", "Santan kental|300|ml", "Bawang putih|4|siung", "Kemiri|3|butir", "Andaliman|1|sdt", "Daun bawang|2|batang"],
    ["Rebus mi hingga setengah matang, tiriskan.", "Tumis bumbu halus sampai harum.", "Masukkan santan, aduk hingga mendidih perlahan.", "Campurkan mi, masak sampai kuah menyusut, taburi daun bawang."]],
  ["Rendang Daging Sapi", "Daging sapi dimasak lama dengan santan dan rempah sampai kering dan hitam mengilap.", 240, 6, "Sulit", "Lauk",
    ["Daging sapi|1|kg", "Santan|1500|ml", "Cabai merah|15|buah", "Lengkuas|5|cm", "Serai|3|batang", "Daun jeruk|6|lembar", "Bawang merah|10|siung"],
    ["Haluskan cabai, bawang, dan lengkuas.", "Masak bumbu halus bersama santan dan serai hingga mendidih.", "Masukkan daging, masak api kecil sambil sesekali diaduk.", "Lanjutkan 3-4 jam sampai santan mengering dan daging empuk."]],
  ["Nasi Goreng Kampung", "Nasi goreng sederhana dengan ikan asin dan cabai rawit, cocok untuk sarapan.", 15, 2, "Mudah", "Makanan Utama",
    ["Nasi putih dingin|3|piring", "Ikan asin|2|potong", "Bawang putih|3|siung", "Cabai rawit|5|buah", "Kecap manis|2|sdm", "Telur|2|butir"],
    ["Goreng ikan asin lalu suwir kasar.", "Tumis bawang putih dan cabai hingga harum.", "Masukkan nasi, kecap, dan ikan asin, aduk api besar.", "Sajikan dengan telur mata sapi."]],
  ["Sayur Asem", "Sayur segar berkuah asam manis dengan jagung, kacang panjang, dan labu siam.", 30, 4, "Mudah", "Sup & Sayur",
    ["Jagung manis|2|buah", "Kacang panjang|100|gram", "Labu siam|1|buah", "Asam jawa|2|sdm", "Bawang merah|4|siung", "Gula merah|1|sdm"],
    ["Didihkan 1,5 liter air bersama bumbu halus dan asam jawa.", "Masukkan jagung dan labu siam, masak 10 menit.", "Tambahkan kacang panjang dan gula merah.", "Koreksi rasa, angkat saat sayur masih renyah."]],
  ["Sambal Andaliman", "Sambal khas Tapanuli yang meninggalkan sensasi getir-kesemutan di lidah.", 15, 6, "Mudah", "Sambal & Pelengkap",
    ["Andaliman|3|sdm", "Cabai rawit|10|buah", "Bawang merah|5|siung", "Jeruk nipis|1|buah", "Garam|1|sdt"],
    ["Sangrai ringan andaliman dan cabai.", "Ulek kasar bersama bawang merah dan garam.", "Peras jeruk nipis, aduk rata."]],
  ["Dadar Gulung Pandan", "Kulit crepe hijau pandan berisi unti kelapa manis.", 45, 8, "Sedang", "Camilan & Kue",
    ["Tepung terigu|150|gram", "Air daun pandan|250|ml", "Telur|1|butir", "Kelapa parut|200|gram", "Gula merah|100|gram"],
    ["Kocok tepung, air pandan, dan telur hingga halus.", "Masak adonan tipis-tipis di teflon, sisihkan.", "Masak kelapa dengan gula merah hingga kering.", "Isi kulit dengan unti, gulung rapat."]],
  ["Wedang Jahe Serai", "Minuman hangat penghilang dingin dengan jahe bakar dan serai.", 15, 2, "Mudah", "Minuman",
    ["Jahe|6|cm", "Serai|1|batang", "Gula merah|2|sdm", "Air|500|ml"],
    ["Bakar jahe sebentar lalu memarkan.", "Rebus jahe, serai, dan gula merah 10 menit.", "Saring dan sajikan hangat."]],
];

/** Mengisi data awal ke database (kategori, resep, dan akun demo). */
export function seedDb(db) {
  db.prepare("INSERT OR IGNORE INTO users (name, email, password_hash) VALUES (?, ?, ?)").run(
    DEMO_USER.name,
    DEMO_USER.email,
    hashPassword(DEMO_USER.password)
  );
  const demoId = db.prepare("SELECT id FROM users WHERE email = ?").get(DEMO_USER.email).id;

  const insCat = db.prepare("INSERT INTO categories (name) VALUES (?)");
  const catId = {};
  for (const name of CATEGORIES) catId[name] = Number(insCat.run(name).lastInsertRowid);

  const insRecipe = db.prepare(
    "INSERT INTO recipes (title, description, cooking_time, servings, difficulty, category_id, user_id) VALUES (?, ?, ?, ?, ?, ?, ?)"
  );
  const insIng = db.prepare("INSERT INTO ingredients (recipe_id, name, quantity, unit) VALUES (?, ?, ?, ?)");
  const insStep = db.prepare("INSERT INTO steps (recipe_id, step_number, instruction) VALUES (?, ?, ?)");

  db.transaction(() => {
    for (const [title, desc, time, servings, diff, cat, ings, steps] of RECIPES) {
      const id = Number(insRecipe.run(title, desc, time, servings, diff, catId[cat], demoId).lastInsertRowid);
      ings.forEach((i) => insIng.run(id, ...i.split("|")));
      steps.forEach((s, idx) => insStep.run(id, idx + 1, s));
    }
  })();
}

/** Seed hanya jika tabel kategori masih kosong. Mengembalikan true bila seed dijalankan. */
export function seedIfEmpty(db) {
  if (db.prepare("SELECT COUNT(*) AS n FROM categories").get().n > 0) return false;
  seedDb(db);
  return true;
}
