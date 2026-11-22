// Landing page enhancement for www. The page is complete without this file.
// 1. The hero map becomes a live spring field: notes drift, part around the pointer, links follow.
// 2. The relay section plays its "save in one app, find in another" story once, when scrolled to.
// 3. The connector address gets a copy button, and the phone menu closes once a link is chosen.
(() => {
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  function liveMap(svg) {
    const nodes = [...svg.querySelectorAll("[data-i]")].map((el) => {
      const x = +el.getAttribute("cx");
      const y = +el.getAttribute("cy");
      return { el, hx: x, hy: y, x, y, vx: 0, vy: 0, phase: Math.random() * Math.PI * 2, i: +el.dataset.i };
    });
    const byIndex = new Map(nodes.map((n) => [n.i, n]));
    const ring = svg.querySelector(".ring");
    const labels = [...svg.querySelectorAll("[data-for]")].map((el) => ({
      el, n: byIndex.get(+el.dataset.for), dx: +el.getAttribute("x") - byIndex.get(+el.dataset.for).hx, dy: +el.getAttribute("y") - byIndex.get(+el.dataset.for).hy,
    }));
    const edges = [...svg.querySelectorAll("[data-a]")].map((el) => ({ el, a: byIndex.get(+el.dataset.a), b: byIndex.get(+el.dataset.b) }));
    const pointer = { x: 0, y: 0, active: false };

    svg.closest(".hero").addEventListener("pointermove", (event) => {
      const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(svg.getScreenCTM().inverse());
      pointer.x = point.x;
      pointer.y = point.y;
      pointer.active = true;
    });
    svg.closest(".hero").addEventListener("pointerleave", () => (pointer.active = false));

    const RADIUS = 130;
    let last = performance.now();
    let visible = true;
    let running = false;
    const start = () => {
      if (running || !visible || document.hidden) return;
      running = true;
      last = performance.now();
      requestAnimationFrame(step);
    };
    new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      start();
    }).observe(svg);
    document.addEventListener("visibilitychange", start);

    function step(now) {
      const dt = Math.min((now - last) / 16.7, 3);
      last = now;
      const t = now / 1000;
      for (const n of nodes) {
        // Spring home, with a slow drift so the map breathes.
        const homeX = n.hx + Math.sin(t * 0.5 + n.phase) * 4;
        const homeY = n.hy + Math.cos(t * 0.4 + n.phase) * 4;
        let fx = (homeX - n.x) * 0.02;
        let fy = (homeY - n.y) * 0.02;
        if (pointer.active) {
          const dx = n.x - pointer.x;
          const dy = n.y - pointer.y;
          const dist = Math.hypot(dx, dy) || 1;
          if (dist < RADIUS) {
            const push = ((RADIUS - dist) / RADIUS) ** 2 * 2.2;
            fx += (dx / dist) * push;
            fy += (dy / dist) * push;
          }
        }
        n.vx = (n.vx + fx * dt) * 0.86;
        n.vy = (n.vy + fy * dt) * 0.86;
        n.x += n.vx * dt;
        n.y += n.vy * dt;
        n.el.setAttribute("cx", n.x.toFixed(1));
        n.el.setAttribute("cy", n.y.toFixed(1));
      }
      for (const { el, a, b } of edges) el.setAttribute("d", `M${a.x.toFixed(1)} ${a.y.toFixed(1)}L${b.x.toFixed(1)} ${b.y.toFixed(1)}`);
      for (const { el, n, dx, dy } of labels) {
        el.setAttribute("x", (n.x + dx).toFixed(1));
        el.setAttribute("y", (n.y + dy).toFixed(1));
      }
      if (ring) {
        const sun = byIndex.get(+ring.dataset.ring);
        ring.setAttribute("cx", sun.x.toFixed(1));
        ring.setAttribute("cy", sun.y.toFixed(1));
      }
      if (visible && !document.hidden) requestAnimationFrame(step);
      else running = false;
    }
    start();
  }

  function playOnArrival(element) {
    new IntersectionObserver(
      ([entry], observer) => {
        if (!entry.isIntersecting) return;
        element.classList.add("in");
        observer.disconnect();
      },
      { threshold: 0.35 },
    ).observe(element);
  }

  // The relay is hidden only once its reveal is wired up, so a failure anywhere leaves it visible.
  const relay = document.querySelector(".relay");
  if (relay && !reduced && "IntersectionObserver" in window) {
    document.documentElement.classList.add("js");
    playOnArrival(relay);
  }
  // Only offered where the clipboard works, so the button never appears and then fails.
  function copyButton(row) {
    const address = row.querySelector(".address");
    if (!address || !navigator.clipboard) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "button primary small copy";
    button.textContent = "Copy";
    button.setAttribute("aria-label", "Copy the connector address");
    button.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(address.textContent.trim());
        button.textContent = "Copied";
      } catch {
        button.textContent = "Select and copy";
      }
      setTimeout(() => (button.textContent = "Copy"), 2000);
    });
    row.append(button);
  }
  document.querySelectorAll(".address-row").forEach(copyButton);

  const menu = document.querySelector(".menu");
  if (menu) menu.addEventListener("click", (event) => event.target.closest("a") && menu.removeAttribute("open"));

  const map = document.querySelector(".hero .map");
  if (map && !reduced) {
    try {
      liveMap(map);
    } catch {
      // The map keeps its CSS-only look.
    }
  }
})();
