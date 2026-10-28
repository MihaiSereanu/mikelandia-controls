import { createMobileBootstrap } from "/src/ui/bootstrap-loader.mjs";

const checks = [];
function check(value, description) {
  if (!value) throw new Error(description);
  checks.push(description);
}
try {
  const theme = new URLSearchParams(location.search).get("theme");
  const loader = createMobileBootstrap({ iconUrl: "/assets/mc-512.png" });
  loader.mount({ theme });
  const icon = document.querySelector(".mc-mobile-bootstrap__icon");
  await icon.decode();
  check(icon.naturalWidth === 512 && icon.naturalHeight === 512, "bundled icon loads at full resolution");
  const entry = await (await fetch("/src/entry.mjs")).text();
  check(entry.includes('../assets/mc-512.png'), "production entry uses the bundled icon");
  const bounds = icon.getBoundingClientRect();
  check(bounds.width > 0 && bounds.top >= 0 && bounds.bottom <= innerHeight, "icon is visible within the viewport");
  check(document.querySelector(".mc-mobile-bootstrap").dataset.theme === theme, "requested loading theme is applied");
  check(document.documentElement.scrollWidth <= innerWidth, "loading screen does not overflow horizontally");
  document.querySelector("#results").textContent = JSON.stringify({ status: "passed", width: innerWidth, height: innerHeight, checks });
} catch (error) {
  document.querySelector("#results").textContent = JSON.stringify({ status: "failed", error: error.message, checks });
}
