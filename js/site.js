import { supabase } from "./supabase.js";

// โหลดข้อมูลร้านจาก Supabase แล้วใส่ลงองค์ประกอบที่มี data-c (ใช้ textContent เท่านั้น)
export async function applyContent() {
  const { data, error } = await supabase.from("site_content").select("key, value");
  if (error) return console.error(error);
  const c = Object.fromEntries(data.map((r) => [r.key, r.value]));

  document.querySelectorAll("[data-c]").forEach((e) => {
    const v = c[e.dataset.c];
    if (v) e.textContent = v;
  });
  if (c.phone) document.querySelectorAll("[data-tel]").forEach((a) => (a.href = "tel:" + c.phone.replace(/[^\d+]/g, "")));

  const lat = parseFloat(c.map_lat), lng = parseFloat(c.map_lng);
  const hasPos = Number.isFinite(lat) && Number.isFinite(lng);
  document.querySelectorAll("[data-maps]").forEach((a) => {
    if (/^https:\/\//.test(c.maps_url || "")) a.href = c.maps_url;
    else if (hasPos) a.href = `https://www.google.com/maps?q=${lat},${lng}`;
  });
  const map = document.getElementById("map");
  if (map && hasPos) {
    map.src = `https://www.google.com/maps?q=${lat},${lng}&z=16&output=embed`;
    map.classList.remove("hidden");
  }
}
