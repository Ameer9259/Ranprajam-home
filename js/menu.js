import { supabase } from "./supabase.js";

const root = document.getElementById("menu-root");
const { data, error } = await supabase.from("menu_items").select("*")
  .eq("available", true).order("sort").order("id");

if (error) {
  console.error(error);
  root.textContent = "โหลดเมนูไม่สำเร็จ ลองใหม่อีกครั้ง";
} else if (!data.length) {
  root.textContent = "ยังไม่มีเมนู";
} else {
  root.replaceChildren();
  const groups = new Map();
  for (const it of data) {
    if (!groups.has(it.category)) groups.set(it.category, []);
    groups.get(it.category).push(it);
  }
  for (const [cat, items] of groups) {
    const card = document.createElement("section");
    card.className = "card";
    const h = document.createElement("h2");
    h.textContent = cat;
    const ul = document.createElement("ul");
    ul.className = "menu-list";
    for (const it of items) {
      const li = document.createElement("li");
      if (it.image_path) {
        const img = document.createElement("img");
        img.src = supabase.storage.from("menu-images").getPublicUrl(it.image_path).data.publicUrl;
        img.alt = it.name;
        img.loading = "lazy";
        li.append(img);
      }
      const info = document.createElement("div");
      info.className = "info";
      info.append(it.name);
      if (it.description) {
        const s = document.createElement("small");
        s.textContent = it.description;
        info.append(s);
      }
      const price = document.createElement("span");
      price.className = "price";
      price.textContent = `${Number(it.price).toLocaleString("th-TH")} บาท`;
      li.append(info, price);
      ul.append(li);
    }
    card.append(h, ul);
    root.append(card);
  }
}
