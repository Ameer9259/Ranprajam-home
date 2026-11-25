import { supabase } from "./supabase.js";

const $ = (id) => document.getElementById(id);
const KEY = "rb_phone";
const STEPS = ["step-phone", "step-register", "step-dashboard"];

const setActive = (k) => document.querySelectorAll(".nav a[data-nav]").forEach((a) => a.classList.toggle("active", a.dataset.nav === k));
const showStep = (id) => STEPS.forEach((s) => $(s).classList.toggle("hidden", s !== id));
function msg(text, type = "") {
  $("message").textContent = text;
  $("message").className = "message " + type;
}
const store = {
  get() { try { return localStorage.getItem(KEY); } catch { return null; } },
  set(v) { try { localStorage.setItem(KEY, v); } catch {} },
  clear() { try { localStorage.removeItem(KEY); } catch {} },
};

function normalize(input) {
  let d = input.replace(/\D/g, "");
  if (d.startsWith("66")) d = d.slice(2);
  else if (d.startsWith("0")) d = d.slice(1);
  return /^[689]\d{8}$/.test(d) ? "0" + d : null;
}

function errText(error) {
  const m = error.message || "";
  if (m.includes("too_many_requests")) return "ทำรายการถี่เกินไป รอสักครู่แล้วลองใหม่";
  if (m.includes("invalid_phone")) return "เบอร์โทรไม่ถูกต้อง";
  if (m.includes("invalid_name")) return "กรอกชื่อและนามสกุลให้ครบ";
  console.error(error);
  return "เกิดข้อผิดพลาด ลองใหม่อีกครั้ง";
}

async function lookup(phone, doneMsg = "", doneType = "") {
  msg("กำลังโหลด...");
  const { data, error } = await supabase.rpc("lookup_points", { p_phone: phone });
  if (error) { showStep("step-phone"); return msg(errText(error), "error"); }
  store.set(phone);
  const masked = phone.slice(0, 3) + "-xxx-" + phone.slice(-4);
  $("who").textContent = data.first_name ? `คุณ${data.first_name} · ${masked}` : `บัตรของเบอร์ ${masked}`;
  renderTier(data.tiers, data.total);
  renderHistory(data.history);
  msg(doneMsg, doneType);
  history.replaceState(null, "", "#check");
  setActive("check");
  showStep("step-dashboard");
}

$("phone-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const phone = normalize($("phone").value);
  if (!phone) return msg("เบอร์โทรไม่ถูกต้อง ตรวจสอบแล้วกรอกใหม่", "error");
  lookup(phone);
});

$("register-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const phone = normalize($("rg-phone").value);
  if (!phone) return msg("เบอร์โทรไม่ถูกต้อง ตรวจสอบแล้วกรอกใหม่", "error");
  msg("กำลังสมัคร...");
  const { data, error } = await supabase.rpc("register_member", {
    p_first: $("rg-first").value, p_last: $("rg-last").value, p_phone: phone,
  });
  if (error) return msg(errText(error), "error");
  await lookup(phone, data.status === "exists" ? "เบอร์นี้เป็นสมาชิกอยู่แล้ว" : "สมัครสมาชิกสำเร็จ", "ok");
});

$("to-register").addEventListener("click", () => { location.hash = "#register"; });
$("to-lookup").addEventListener("click", () => { location.hash = "#check"; });
$("logout-btn").addEventListener("click", () => {
  store.clear();
  $("phone").value = "";
  msg("");
  showStep("step-phone");
});

function renderTier(tiers, total) {
  let current = null, next = null;
  for (const t of tiers) {
    if (total >= t.min_points) current = t;
    else { next = t; break; }
  }
  $("tier-name").textContent = current ? `บัตร ${current.name}` : "ยังไม่มีบัตร";
  $("total-points").textContent = total.toLocaleString("th-TH");
  if (next) {
    const base = current ? current.min_points : 0;
    const pct = ((total - base) / (next.min_points - base)) * 100;
    $("progress-bar").style.width = `${Math.min(100, Math.max(0, pct))}%`;
    $("next-info").textContent = `อีก ${next.min_points - total} คะแนน รับบัตร ${next.name}`;
  } else {
    $("progress-bar").style.width = "100%";
    $("next-info").textContent = tiers.length ? "คุณอยู่ระดับสูงสุดแล้ว" : "";
  }
  const list = $("tier-list");
  list.replaceChildren();
  for (const t of tiers) {
    const li = document.createElement("li");
    li.textContent = `${t.name} ${t.min_points}`;
    if (total >= t.min_points) li.className = "done";
    list.append(li);
  }
}

function renderHistory(history) {
  const list = $("receipt-list");
  list.replaceChildren();
  $("empty-text").classList.toggle("hidden", history.length > 0);
  for (const r of history) {
    const li = document.createElement("li");
    const left = document.createElement("span");
    left.textContent = r.bill_date;
    const right = document.createElement("span");
    right.className = r.points > 0 ? "earned" : "muted";
    right.textContent = r.points > 0 ? `+${r.points} คะแนน` : "ไม่ได้คะแนน";
    li.append(left, right);
    list.append(li);
  }
}

// เลือกหน้าตาม URL: customer.html#register = สมัครสมาชิก, ที่เหลือ = เช็คคะแนน
function route() {
  const reg = location.hash === "#register";
  setActive(reg ? "register" : "check");
  msg("");
  if (reg) return showStep("step-register");
  const saved = store.get();
  if (saved && normalize(saved)) lookup(saved);
  else showStep("step-phone");
}
window.addEventListener("hashchange", route);
route();
