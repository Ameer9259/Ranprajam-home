import { supabase } from "./supabase.js";

const $ = (id) => document.getElementById(id);
const msg = (t, type = "") => { $("message").textContent = t; $("message").className = "message " + type; };
const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" });
const showPhone = (p) => "0" + p.slice(2);
const fullName = (m) => [m.first_name, m.last_name].filter(Boolean).join(" ") || "—";
function el(tag, props = {}, ...kids) { const e = document.createElement(tag); Object.assign(e, props); e.append(...kids); return e; }
const cell = (t) => el("td", { textContent: String(t) });

let tiers = [], members = [], menuItems = [], editing = null;

function showLogin() { $("login").classList.remove("hidden"); $("panel").classList.add("hidden"); }

async function enter() {
  const { data: ok, error } = await supabase.rpc("is_admin");
  if (error || !ok) {
    await supabase.auth.signOut();
    showLogin();
    return msg("บัญชีนี้ไม่มีสิทธิ์แอดมิน", "error");
  }
  $("login").classList.add("hidden");
  $("panel").classList.remove("hidden");
  msg("");
  $("r-date").value = today();
  $("list-date").value = today();
  const { data: main } = await supabase.rpc("is_main_admin");
  $("main-admin-card").classList.toggle("hidden", !main);
  buildSiteForm();
  await loadTiers();
  await Promise.all([loadDay(), loadSettings(), loadMembers(), loadMenu(), loadSite()]);
}

$("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  msg("กำลังเข้าสู่ระบบ...");
  const { error } = await supabase.auth.signInWithPassword({ email: $("email").value.trim(), password: $("password").value });
  if (error) {
    console.error(error);
    const m = (error.message || "").toLowerCase();
    if (m.includes("invalid login")) return msg("อีเมลหรือรหัสผ่านไม่ถูกต้อง (หรือบัญชีนี้ไม่ได้สร้างแบบอีเมล+รหัสผ่าน)", "error");
    if (m.includes("not confirmed")) return msg("อีเมลนี้ยังไม่ได้ยืนยัน: ใน Supabase ไปที่ Authentication > Users เลือกผู้ใช้แล้วกด Confirm", "error");
    if (m.includes("fetch") || m.includes("network")) return msg("เชื่อมต่อ Supabase ไม่ได้ ตรวจ URL และ key ในไฟล์ js/config.js", "error");
    return msg("เข้าสู่ระบบไม่สำเร็จ: " + error.message, "error");
  }
  $("password").value = "";
  await enter();
});
$("logout-btn").addEventListener("click", async () => { await supabase.auth.signOut(); showLogin(); msg("ออกจากระบบแล้ว", "ok"); });
$("tabs").addEventListener("click", (e) => {
  const id = e.target.dataset.tab;
  if (!id) return;
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("on", t.id === id));
  document.querySelectorAll("#tabs button").forEach((b) => b.classList.toggle("on", b.dataset.tab === id));
});

/* ---------- ใบเสร็จ ---------- */
$("receipt-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const { data, error } = await supabase.rpc("add_receipt", {
    p_phone: $("r-phone").value, p_receipt_no: $("r-no").value.trim(),
    p_amount: Number($("r-amount").value), p_bill_date: $("r-date").value,
  });
  if (error) {
    const m = error.message || "";
    if (error.code === "23505" || m.includes("duplicate")) return msg("เลขที่ใบเสร็จนี้ถูกบันทึกแล้ว หรือบันทึกซ้ำพร้อมกัน", "error");
    if (m.includes("invalid_phone")) return msg("เบอร์โทรไม่ถูกต้อง", "error");
    if (m.includes("unauthorized")) return msg("ไม่มีสิทธิ์บันทึก", "error");
    console.error(error);
    return msg("บันทึกไม่สำเร็จ ตรวจข้อมูลแล้วลองใหม่", "error");
  }
  msg(data.points_earned > 0 ? `บันทึกแล้ว ลูกค้าได้ ${data.points_earned} คะแนน`
    : "บันทึกแล้ว ไม่ได้คะแนน (ยอดไม่ถึงขั้นต่ำ หรือวันนั้นได้คะแนนไปแล้ว)", "ok");
  ["r-phone", "r-no", "r-amount"].forEach((i) => ($(i).value = ""));
  $("r-phone").focus();
  if ($("list-date").value === $("r-date").value) loadDay();
  loadMembers();
});

async function loadDay() {
  const { data, error } = await supabase.from("receipts")
    .select("receipt_no, amount, points, customers(phone, first_name, last_name)")
    .eq("bill_date", $("list-date").value).order("id");
  if (error) { console.error(error); return msg("โหลดรายการไม่สำเร็จ", "error"); }
  const body = $("day-body");
  body.replaceChildren();
  let sum = 0, pts = 0;
  for (const r of data) {
    sum += Number(r.amount); pts += r.points;
    const c = r.customers;
    body.append(el("tr", {}, cell(c ? showPhone(c.phone) : "-"), cell(c ? fullName(c) : "-"),
      cell(r.receipt_no), cell(Number(r.amount).toLocaleString("th-TH")), cell(r.points)));
  }
  $("day-summary").textContent = `${data.length} ใบ · ยอดรวม ${sum.toLocaleString("th-TH")} บาท · แจกคะแนน ${pts}`;
}
$("list-date").addEventListener("change", loadDay);

/* ---------- สมาชิก ---------- */
const tierOf = (p) => { let c = null; for (const t of tiers) if (p >= t.min_points) c = t; return c ? c.name : "-"; };

async function loadMembers() {
  const { data, error } = await supabase.rpc("admin_members");
  if (error) { console.error(error); return msg("โหลดสมาชิกไม่สำเร็จ (ตรวจว่ารัน 006 แล้ว)", "error"); }
  members = data;
  renderMembers();
}
function renderMembers() {
  const q = $("m-search").value.trim().toLowerCase();
  const d = q.replace(/\D/g, "");
  const dp = d.startsWith("0") ? "66" + d.slice(1) : d;
  const rows = members.filter((m) => !q || fullName(m).toLowerCase().includes(q) || (d && m.phone.includes(dp)));
  $("m-count").textContent = `(${rows.length}/${members.length} คน)`;
  const body = $("m-body");
  body.replaceChildren();
  for (const m of rows) {
    const btn = el("button", { type: "button", className: "btn btn-outline btn-small", textContent: "แก้ชื่อ" });
    btn.addEventListener("click", async () => {
      const first = prompt("ชื่อ", m.first_name || ""); if (first === null) return;
      const last = prompt("นามสกุล", m.last_name || ""); if (last === null) return;
      const { error } = await supabase.rpc("admin_update_member", { p_id: m.id, p_first: first, p_last: last });
      if (error) return msg("แก้ไขไม่สำเร็จ", "error");
      msg("แก้ไขแล้ว", "ok"); loadMembers();
    });
    body.append(el("tr", {}, cell(fullName(m)), cell(showPhone(m.phone)), cell(m.total_points), cell(tierOf(m.total_points)),
      cell(m.visits), cell(m.last_date || "-"), el("td", {}, btn)));
  }
}
$("m-search").addEventListener("input", renderMembers);

/* ---------- เมนู ---------- */
const imgUrl = (p) => supabase.storage.from("menu-images").getPublicUrl(p).data.publicUrl;

async function resize(file) {
  const bmp = await createImageBitmap(file);
  const s = Math.min(1, 900 / Math.max(bmp.width, bmp.height));
  const c = el("canvas", { width: Math.round(bmp.width * s), height: Math.round(bmp.height * s) });
  c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise((r) => c.toBlob(r, "image/jpeg", 0.82));
}

async function loadMenu() {
  const { data, error } = await supabase.from("menu_items").select("*").order("sort").order("id");
  if (error) { console.error(error); return msg("โหลดเมนูไม่สำเร็จ (ตรวจว่ารัน 006 แล้ว)", "error"); }
  menuItems = data;
  $("cat-list").replaceChildren(...[...new Set(data.map((i) => i.category))].map((c) => el("option", { value: c })));
  const ul = $("menu-admin");
  ul.replaceChildren();
  for (const it of data) {
    const edit = el("button", { type: "button", className: "btn btn-outline btn-small", textContent: "แก้ไข" });
    const del = el("button", { type: "button", className: "btn btn-outline btn-small", textContent: "ลบ" });
    edit.addEventListener("click", () => startEdit(it));
    del.addEventListener("click", () => removeItem(it));
    ul.append(el("li", { className: "item" },
      it.image_path ? el("img", { className: "thumb", src: imgUrl(it.image_path), alt: "" }) : el("span", { className: "thumb" }),
      el("span", { className: "grow", textContent: `${it.name} · ${it.category} · ${Number(it.price).toLocaleString("th-TH")} บาท${it.available ? "" : " (ซ่อน)"}` }),
      el("span", { className: "actions" }, edit, del)));
  }
}

function startEdit(it) {
  editing = it;
  $("mi-cat").value = it.category; $("mi-name").value = it.name; $("mi-desc").value = it.description;
  $("mi-price").value = it.price; $("mi-sort").value = it.sort; $("mi-avail").checked = it.available; $("mi-img").value = "";
  $("menu-form-title").textContent = "แก้ไขเมนู"; $("mi-submit").textContent = "บันทึกการแก้ไข";
  $("mi-cancel").classList.remove("hidden");
  $("menu-form").scrollIntoView({ behavior: "smooth" });
}
function resetMenuForm() {
  editing = null;
  $("menu-form").reset();
  $("mi-cat").value = "เบอร์เกอร์";
  $("menu-form-title").textContent = "เพิ่มเมนู"; $("mi-submit").textContent = "เพิ่มเมนู";
  $("mi-cancel").classList.add("hidden");
}
$("mi-cancel").addEventListener("click", resetMenuForm);

$("menu-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  msg("กำลังบันทึก...");
  const row = {
    category: $("mi-cat").value.trim(), name: $("mi-name").value.trim(), description: $("mi-desc").value.trim(),
    price: Number($("mi-price").value), sort: parseInt($("mi-sort").value || "0", 10), available: $("mi-avail").checked,
  };
  const file = $("mi-img").files[0];
  let oldPath = null;
  if (file) {
    try {
      const path = `${crypto.randomUUID()}.jpg`;
      const { error: upErr } = await supabase.storage.from("menu-images").upload(path, await resize(file), { contentType: "image/jpeg" });
      if (upErr) throw upErr;
      oldPath = editing?.image_path || null;
      row.image_path = path;
    } catch (err) { console.error(err); return msg("อัปโหลดรูปไม่สำเร็จ ลองรูปอื่นหรือลองใหม่", "error"); }
  }
  const q = editing ? supabase.from("menu_items").update(row).eq("id", editing.id) : supabase.from("menu_items").insert(row);
  const { error } = await q;
  if (error) { console.error(error); return msg("บันทึกเมนูไม่สำเร็จ", "error"); }
  if (oldPath) await supabase.storage.from("menu-images").remove([oldPath]);
  msg("บันทึกเมนูแล้ว", "ok");
  resetMenuForm(); loadMenu();
});

async function removeItem(it) {
  if (!confirm(`ลบเมนู ${it.name}?`)) return;
  const { error } = await supabase.from("menu_items").delete().eq("id", it.id);
  if (error) return msg("ลบไม่สำเร็จ", "error");
  if (it.image_path) await supabase.storage.from("menu-images").remove([it.image_path]);
  msg("ลบแล้ว", "ok"); loadMenu();
}

/* ---------- ข้อมูลร้าน ---------- */
const FIELDS = [
  ["shop_name", "ชื่อร้าน"], ["tagline", "คำโปรย"], ["promo_title", "หัวข้อโปรโมชั่น"],
  ["promo_text", "รายละเอียดโปรโมชั่น", "area"], ["address", "ที่อยู่ร้าน", "area"], ["hours", "เวลาเปิด-ปิด"],
  ["phone", "เบอร์โทรร้าน"], ["line_id", "LINE ID"],
  ["map_lat", "ละติจูด เช่น 7.0086"], ["map_lng", "ลองจิจูด เช่น 100.4747"],
  ["maps_url", "ลิงก์ Google Maps (ไม่บังคับ ต้องขึ้นต้น https://)"], ["about_story", "เรื่องราวของร้าน (หน้าเกี่ยวกับร้าน)", "area"],
];
function buildSiteForm() {
  const f = $("site-form");
  if (f.children.length) return;
  for (const [key, label, kind] of FIELDS) {
    const input = el(kind === "area" ? "textarea" : "input", { id: "f-" + key });
    f.append(el("div", {}, el("label", { htmlFor: "f-" + key, textContent: label }), input));
  }
  f.append(el("button", { className: "btn", type: "submit", textContent: "บันทึกข้อมูลร้าน" }));
}
async function loadSite() {
  const { data, error } = await supabase.from("site_content").select("key, value");
  if (error) { console.error(error); return msg("โหลดข้อมูลร้านไม่สำเร็จ (ตรวจว่ารัน 006 แล้ว)", "error"); }
  for (const r of data) { const i = $("f-" + r.key); if (i) i.value = r.value; }
}
$("site-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const v = Object.fromEntries(FIELDS.map(([k]) => [k, $("f-" + k).value.trim()]));
  const lat = v.map_lat === "" ? null : Number(v.map_lat), lng = v.map_lng === "" ? null : Number(v.map_lng);
  if ((lat !== null && !(lat >= -90 && lat <= 90)) || (lng !== null && !(lng >= -180 && lng <= 180)) || ((lat === null) !== (lng === null)))
    return msg("พิกัดไม่ถูกต้อง ต้องกรอกทั้งละติจูดและลองจิจูดเป็นตัวเลข", "error");
  if (v.maps_url && !/^https:\/\//.test(v.maps_url)) return msg("ลิงก์ Google Maps ต้องขึ้นต้นด้วย https://", "error");
  const { error } = await supabase.from("site_content").upsert(Object.entries(v).map(([key, value]) => ({ key, value })));
  if (error) { console.error(error); return msg("บันทึกไม่สำเร็จ", "error"); }
  msg("บันทึกข้อมูลร้านแล้ว", "ok");
});

/* ---------- ตั้งค่า / บัตร / แอดมิน ---------- */
async function loadSettings() {
  const { data, error } = await supabase.from("settings").select("key, value");
  if (error) return console.error(error);
  const s = Object.fromEntries(data.map((r) => [r.key, r.value]));
  $("s-min").value = s.min_amount ?? ""; $("s-pts").value = s.points_per_bill ?? "";
}
$("settings-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const { error } = await supabase.from("settings").upsert([
    { key: "min_amount", value: String(Number($("s-min").value)) },
    { key: "points_per_bill", value: String(parseInt($("s-pts").value, 10)) },
  ]);
  if (error) { console.error(error); return msg("บันทึกการตั้งค่าไม่สำเร็จ", "error"); }
  msg("บันทึกการตั้งค่าแล้ว มีผลกับใบเสร็จที่บันทึกต่อจากนี้", "ok");
});

async function loadTiers() {
  const { data, error } = await supabase.from("card_tiers").select("id, name, min_points").order("min_points");
  if (error) return console.error(error);
  tiers = data;
  const ul = $("tier-admin");
  ul.replaceChildren();
  for (const t of data) {
    const del = el("button", { type: "button", className: "btn btn-outline btn-small", textContent: "ลบ" });
    del.addEventListener("click", async () => {
      if (!confirm(`ลบบัตร ${t.name}?`)) return;
      const { error: err } = await supabase.from("card_tiers").delete().eq("id", t.id);
      if (err) return msg("ลบไม่สำเร็จ", "error");
      await loadTiers(); renderMembers();
    });
    ul.append(el("li", {}, el("span", { textContent: `${t.name} · ${t.min_points} คะแนน` }), del));
  }
}
$("tier-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const { error } = await supabase.from("card_tiers").insert({ name: $("t-name").value.trim(), min_points: parseInt($("t-min").value, 10) });
  if (error) return msg(error.code === "23505" ? "มีบัตรที่ใช้คะแนนขั้นต่ำนี้แล้ว" : "เพิ่มบัตรไม่สำเร็จ", "error");
  $("t-name").value = ""; $("t-min").value = "";
  msg("เพิ่มประเภทบัตรแล้ว", "ok");
  await loadTiers(); renderMembers();
});

$("admin-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const { error } = await supabase.rpc("add_admin_by_email", { p_email: $("a-email").value });
  if (error) return msg(error.message.includes("user_not_found") ? "ไม่พบผู้ใช้อีเมลนี้ สร้างใน Authentication ก่อน" : "เพิ่มแอดมินไม่สำเร็จ", "error");
  $("a-email").value = "";
  msg("เพิ่มแอดมินแล้ว", "ok");
});

(async () => {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) await enter(); else showLogin();
})();
