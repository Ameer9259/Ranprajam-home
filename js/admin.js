import { supabase } from "./supabase.js";

const $ = (id) => document.getElementById(id);

function msg(text, type = "") {
  $("message").textContent = text;
  $("message").className = "message " + type;
}

function today() {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" }); // YYYY-MM-DD
}

function showLogin() {
  $("login").classList.remove("hidden");
  $("panel").classList.add("hidden");
}

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

  await Promise.all([loadDay(), loadSettings(), loadTiers()]);
}

$("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  msg("กำลังเข้าสู่ระบบ...");
  const { error } = await supabase.auth.signInWithPassword({
    email: $("email").value.trim(),
    password: $("password").value,
  });
  if (error) return msg("อีเมลหรือรหัสผ่านไม่ถูกต้อง", "error");
  $("password").value = "";
  await enter();
});

$("logout-btn").addEventListener("click", async () => {
  await supabase.auth.signOut();
  showLogin();
  msg("ออกจากระบบแล้ว", "ok");
});

// บันทึกใบเสร็จ
$("receipt-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const { data, error } = await supabase.rpc("add_receipt", {
    p_phone: $("r-phone").value,
    p_receipt_no: $("r-no").value.trim(),
    p_amount: Number($("r-amount").value),
    p_bill_date: $("r-date").value,
  });
  if (error) {
    const m = error.message || "";
    if (error.code === "23505" || m.includes("duplicate")) return msg("เลขที่ใบเสร็จนี้ถูกบันทึกแล้ว หรือบันทึกซ้ำพร้อมกัน", "error");
    if (m.includes("invalid_phone")) return msg("เบอร์โทรไม่ถูกต้อง", "error");
    if (m.includes("unauthorized")) return msg("ไม่มีสิทธิ์บันทึก", "error");
    console.error(error);
    return msg("บันทึกไม่สำเร็จ ตรวจข้อมูลแล้วลองใหม่", "error");
  }
  msg(data.points_earned > 0
    ? `บันทึกแล้ว ลูกค้าได้ ${data.points_earned} คะแนน`
    : "บันทึกแล้ว ไม่ได้คะแนน (ยอดไม่ถึงขั้นต่ำ หรือวันนั้นได้คะแนนไปแล้ว)", "ok");
  $("r-phone").value = "";
  $("r-no").value = "";
  $("r-amount").value = "";
  $("r-phone").focus();
  if ($("list-date").value === $("r-date").value) await loadDay();
});

// รายการของวัน (ไว้เทียบกับกระดาษ)
async function loadDay() {
  const { data, error } = await supabase
    .from("receipts")
    .select("receipt_no, amount, points, customers(phone)")
    .eq("bill_date", $("list-date").value)
    .order("id", { ascending: true });
  if (error) { console.error(error); return msg("โหลดรายการไม่สำเร็จ", "error"); }

  const body = $("day-body");
  body.replaceChildren();
  let sum = 0, pts = 0;
  for (const r of data) {
    sum += Number(r.amount); pts += r.points;
    const tr = document.createElement("tr");
    const phone = r.customers ? "0" + r.customers.phone.slice(2) : "-";
    for (const v of [phone, r.receipt_no, Number(r.amount).toLocaleString("th-TH"), r.points]) {
      const td = document.createElement("td");
      td.textContent = v;
      tr.append(td);
    }
    body.append(tr);
  }
  $("day-summary").textContent = `${data.length} ใบ · ยอดรวม ${sum.toLocaleString("th-TH")} บาท · แจกคะแนน ${pts}`;
}
$("list-date").addEventListener("change", loadDay);

// ตั้งค่าคะแนน
async function loadSettings() {
  const { data, error } = await supabase.from("settings").select("key, value");
  if (error) return console.error(error);
  const s = Object.fromEntries(data.map((r) => [r.key, r.value]));
  $("s-min").value = s.min_amount ?? "";
  $("s-pts").value = s.points_per_bill ?? "";
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

// ประเภทบัตร
async function loadTiers() {
  const { data, error } = await supabase.from("card_tiers").select("id, name, min_points").order("min_points");
  if (error) return console.error(error);
  const ul = $("tier-admin");
  ul.replaceChildren();
  for (const t of data) {
    const li = document.createElement("li");
    const label = document.createElement("span");
    label.textContent = `${t.name} · ${t.min_points} คะแนน`;
    const del = document.createElement("button");
    del.type = "button";
    del.className = "btn btn-outline btn-small";
    del.textContent = "ลบ";
    del.addEventListener("click", async () => {
      if (!confirm(`ลบบัตร ${t.name}?`)) return;
      const { error: err } = await supabase.from("card_tiers").delete().eq("id", t.id);
      if (err) return msg("ลบไม่สำเร็จ", "error");
      loadTiers();
    });
    li.append(label, del);
    ul.append(li);
  }
}

$("tier-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const { error } = await supabase.from("card_tiers").insert({
    name: $("t-name").value.trim(),
    min_points: parseInt($("t-min").value, 10),
  });
  if (error) return msg(error.code === "23505" ? "มีบัตรที่ใช้คะแนนขั้นต่ำนี้แล้ว" : "เพิ่มบัตรไม่สำเร็จ", "error");
  $("t-name").value = ""; $("t-min").value = "";
  msg("เพิ่มประเภทบัตรแล้ว", "ok");
  loadTiers();
});

// เพิ่มแอดมิน (แอดมินหลักเท่านั้น)
$("admin-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const { error } = await supabase.rpc("add_admin_by_email", { p_email: $("a-email").value });
  if (error) {
    return msg(error.message.includes("user_not_found")
      ? "ไม่พบผู้ใช้อีเมลนี้ สร้างใน Authentication ก่อน"
      : "เพิ่มแอดมินไม่สำเร็จ", "error");
  }
  $("a-email").value = "";
  msg("เพิ่มแอดมินแล้ว", "ok");
});

(async () => {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) await enter();
  else showLogin();
})();
