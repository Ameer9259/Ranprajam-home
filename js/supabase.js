import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import * as cfg from "./config.js";

const clean = (v) => String(v ?? "").trim().replace(/^["']|["']$/g, "");
let url = clean(cfg.SUPABASE_URL).replace(/\/(rest|auth)\/v1.*$/, "").replace(/\/+$/, "");
const key = clean(cfg.SUPABASE_ANON_KEY ?? cfg.SUPABASE_KEY ?? cfg.SUPABASE_PUBLISHABLE_KEY);

if (!/^https:\/\/.+/.test(url) || url.includes("YOUR-PROJECT")) {
  throw new Error("ตั้งค่า js/config.js ไม่ถูกต้อง: SUPABASE_URL ต้องเป็น Project URL ขึ้นต้น https:// (ตอนนี้: " + (url || "ว่าง") + ")");
}
if (!key || key.includes("YOUR-KEY")) {
  throw new Error("ตั้งค่า js/config.js ไม่ถูกต้อง: ยังไม่ได้ใส่ SUPABASE_ANON_KEY (Publishable key)");
}
if (key.startsWith("sb_secret_")) {
  throw new Error("ห้ามใช้ Secret key ในเว็บ: ใส่ Publishable key (sb_publishable_...) แทน และควรเปลี่ยน Secret key ใน Supabase ทันที");
}

export const supabase = createClient(url, key);
