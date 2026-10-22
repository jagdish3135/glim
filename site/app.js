// Theme toggle, remembered across visits
const root = document.documentElement;
const themeBtn = document.getElementById("theme");
function syncThemeButton() {
  const dark = root.dataset.theme === "dark";
  themeBtn.setAttribute("aria-label", dark ? "Switch to light theme" : "Switch to dark theme");
  document.querySelector('meta[name="theme-color"]').content = dark ? "#15130f" : "#f6f1e7";
}
themeBtn.addEventListener("click", () => {
  root.dataset.theme = root.dataset.theme === "dark" ? "light" : "dark";
  try { localStorage.setItem("glim-theme", root.dataset.theme); } catch {}
  syncThemeButton();
});
syncThemeButton();

// Copy buttons
document.querySelectorAll(".copy").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const source = btn.dataset.copyFrom ? document.getElementById(btn.dataset.copyFrom) : btn.parentElement.querySelector("code");
    const value = btn.dataset.copy ?? source?.textContent ?? "";
    let ok = true;
    try {
      await navigator.clipboard.writeText(value);
      btn.textContent = "Copied";
    } catch {
      // Clipboard blocked: select the text so the user can copy it by hand
      ok = false;
      btn.textContent = "Press Ctrl+C";
      if (source) getSelection().selectAllChildren(source);
    }
    btn.classList.add("done");
    setTimeout(() => { btn.textContent = "Copy"; btn.classList.remove("done"); }, ok ? 1600 : 3000);
  });
});

// Tabs with arrow-key support
document.querySelectorAll("[data-tabs]").forEach((box) => {
  const tabs = [...box.querySelectorAll('[role="tab"]')];
  const select = (tab) => {
    tabs.forEach((t) => {
      const on = t === tab;
      t.setAttribute("aria-selected", on);
      t.tabIndex = on ? 0 : -1;
      document.getElementById(t.getAttribute("aria-controls")).hidden = !on;
    });
    tab.focus();
  };
  tabs.forEach((t, i) => {
    t.addEventListener("click", () => select(t));
    t.addEventListener("keydown", (e) => {
      if (e.key === "ArrowRight") select(tabs[(i + 1) % tabs.length]);
      if (e.key === "ArrowLeft") select(tabs[(i - 1 + tabs.length) % tabs.length]);
    });
  });
});

// Chat demo: reveal lines one by one, then loop. Static for reduced motion.
const chat = document.getElementById("chat");
if (chat && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
  const items = [...chat.children];
  const delayFor = (li) => (li.classList.contains("tools") ? 700 : li.classList.contains("user") ? 1100 : 1500);
  let timer;
  const play = () => {
    chat.classList.add("playing");
    items.forEach((li) => li.classList.remove("on"));
    let t = 400;
    items.forEach((li) => {
      timer = setTimeout(() => li.classList.add("on"), t);
      t += delayFor(li);
    });
    timer = setTimeout(play, t + 3500);
  };
  const io = new IntersectionObserver(([entry]) => {
    clearTimeout(timer);
    if (entry.isIntersecting) play();
  });
  io.observe(chat);
}
