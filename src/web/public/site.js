// Landing page enhancement for www. The page is complete without this file.
// 1. The hero map becomes a living network: notes drift, signals travel the links and cascade, and the
//    pointer lights up a neighbourhood.
// 2. The relay section plays its "save in one app, find in another" story once, when scrolled to.
// 3. The connector address gets a copy button, and the phone menu closes once a link is chosen.
(() => {
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const SVGNS = "http://www.w3.org/2000/svg";
  const TINT = { violet: "#a39bff", fuchsia: "#e49af3", amber: "#ffc06b", sky: "#7dbdf0", teal: "#6fd0b2" };
  const svgEl = (tag, attrs) => {
    const el = document.createElementNS(SVGNS, tag);
    for (const k in attrs) el.setAttribute(k, attrs[k]);
    return el;
  };

  function liveMap(svg) {
    const nodes = [...svg.querySelectorAll("[data-i]")].map((el) => {
      const x = +el.getAttribute("cx");
      const y = +el.getAttribute("cy");
      const i = +el.dataset.i;
      const tint = (el.getAttribute("class").match(/t-(\w+)/) || [, "fuchsia"])[1];
      // Each note drifts on its own slow sine: 8 to 14 seconds a lap, phase from its index.
      return { el, hx: x, hy: y, x, y, vx: 0, vy: 0, i, tint, glow: 1, want: 1, w: (Math.PI * 2) / (8 + ((i * 5) % 7)), phase: i * 1.9, links: [] };
    });
    const byIndex = new Map(nodes.map((n) => [n.i, n]));
    const halos = new Map([...svg.querySelectorAll("[data-h]")].map((el) => [+el.dataset.h, { el, r: +el.getAttribute("r") }]));
    const ring = svg.querySelector(".ring");
    const labels = [...svg.querySelectorAll("[data-for]")].map((el) => {
      const n = byIndex.get(+el.dataset.for);
      return { el, n, dx: +el.getAttribute("x") - n.hx, dy: +el.getAttribute("y") - n.hy };
    });
    const edges = [...svg.querySelectorAll("[data-a]")].map((el) => {
      const a = byIndex.get(+el.dataset.a);
      const b = byIndex.get(+el.dataset.b);
      const edge = { el, a, b };
      a.links.push({ edge, to: b });
      b.links.push({ edge, to: a });
      return edge;
    });

    // Signals: small hot cores with a tinted halo and a fading tail, only along real links.
    const MAX_SIGNALS = 9;
    const signals = [];
    const flashes = [];
    const layer = svgEl("g", { "pointer-events": "none" });
    svg.insertBefore(layer, ring);
    const fire = (from, link, now, depth) => {
      if (signals.length >= MAX_SIGNALS) return;
      const s = {
        from, to: link.to, depth, t0: now, dur: 600 + Math.random() * 800, color: TINT[from.tint] || TINT.fuchsia,
        tail: svgEl("line", { class: "signal-tail", stroke: TINT[from.tint] || TINT.fuchsia, "stroke-opacity": 0.55 }),
        halo: svgEl("circle", { class: "signal-halo", r: 24, fill: `url(#halo-${from.tint})` }),
        core: svgEl("circle", { class: "signal-core", r: 4 }),
      };
      layer.append(s.tail, s.halo, s.core);
      signals.push(s);
    };
    const flash = (node, now, color) => {
      const el = svgEl("circle", { class: "flash", stroke: color });
      layer.append(el);
      flashes.push({ el, node, t0: now });
    };
    let nextSpawn = 0;

    const pointer = { x: 0, y: 0, active: false };
    let hovered = null;
    const hero = svg.closest(".hero");
    hero.addEventListener("pointermove", (event) => {
      const ctm = svg.getScreenCTM();
      if (!ctm) return;
      const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(ctm.inverse());
      pointer.x = point.x;
      pointer.y = point.y;
      pointer.active = true;
    });
    hero.addEventListener("pointerleave", () => (pointer.active = false));

    // Lights up the neighbourhood of the note under the pointer: its links, and the notes at their far ends.
    function hover(node) {
      if (node === hovered) return;
      hovered = node;
      for (const e of edges) e.el.classList.toggle("hot", !!node && (e.a === node || e.b === node));
      for (const n of nodes) {
        n.want = node && (n === node || node.links.some((l) => l.to === n)) ? 1.7 : 1;
        n.el.classList.toggle("lit", n === node);
      }
    }

    const RADIUS = 110;
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

    const f1 = (v) => v.toFixed(1);
    function step(now) {
      const dt = Math.min((now - last) / 16.7, 3);
      last = now;
      const t = now / 1000;
      let nearest = null;
      let nearestDist = 46;
      for (const n of nodes) {
        const homeX = n.hx + Math.sin(t * n.w + n.phase) * 6;
        const homeY = n.hy + Math.cos(t * n.w * 0.8 + n.phase * 1.7) * 6;
        let fx = (homeX - n.x) * 0.02;
        let fy = (homeY - n.y) * 0.02;
        if (pointer.active) {
          const dx = n.x - pointer.x;
          const dy = n.y - pointer.y;
          const dist = Math.hypot(dx, dy) || 1;
          if (dist < nearestDist) (nearest = n), (nearestDist = dist);
          if (dist < RADIUS) {
            const push = ((RADIUS - dist) / RADIUS) ** 2 * 1.6;
            fx += (dx / dist) * push;
            fy += (dy / dist) * push;
          }
        }
        n.vx = (n.vx + fx * dt) * 0.86;
        n.vy = (n.vy + fy * dt) * 0.86;
        n.x += n.vx * dt;
        n.y += n.vy * dt;
        n.glow += (n.want - n.glow) * Math.min(0.12 * dt, 1);
        n.el.setAttribute("cx", f1(n.x));
        n.el.setAttribute("cy", f1(n.y));
        const h = halos.get(n.i);
        if (h) {
          h.el.setAttribute("cx", f1(n.x));
          h.el.setAttribute("cy", f1(n.y));
          h.el.setAttribute("r", f1(h.r * n.glow * (1 + Math.sin(t * 1.3 + n.i) * 0.06)));
        }
      }
      hover(pointer.active ? nearest : null);
      for (const { el, a, b } of edges) el.setAttribute("d", `M${f1(a.x)} ${f1(a.y)}L${f1(b.x)} ${f1(b.y)}`);
      for (const { el, n, dx, dy } of labels) {
        el.setAttribute("x", f1(n.x + dx));
        el.setAttribute("y", f1(n.y + dy));
      }
      if (ring) {
        const sun = byIndex.get(+ring.dataset.ring);
        ring.setAttribute("cx", f1(sun.x));
        ring.setAttribute("cy", f1(sun.y));
      }

      // A signal now and then. One that arrives flashes its note and may carry on, so signals cascade.
      if (now > nextSpawn) {
        nextSpawn = now + 450 + Math.random() * 700;
        const from = nodes[Math.floor(Math.random() * nodes.length)];
        const link = from.links[Math.floor(Math.random() * from.links.length)];
        if (link) fire(from, link, now, 0);
      }
      for (let k = signals.length - 1; k >= 0; k--) {
        const s = signals[k];
        const p = (now - s.t0) / s.dur;
        if (p >= 1) {
          flash(s.to, now, s.color);
          const onward = s.to.links.filter((l) => l.to !== s.from);
          if (s.depth < 4 && onward.length && Math.random() < 0.7) fire(s.to, onward[Math.floor(Math.random() * onward.length)], now, s.depth + 1);
          s.tail.remove();
          s.halo.remove();
          s.core.remove();
          signals.splice(k, 1);
          continue;
        }
        const e = p * p * (3 - 2 * p);
        const x = s.from.x + (s.to.x - s.from.x) * e;
        const y = s.from.y + (s.to.y - s.from.y) * e;
        const back = Math.max(e - 0.12, 0);
        s.tail.setAttribute("x1", f1(s.from.x + (s.to.x - s.from.x) * back));
        s.tail.setAttribute("y1", f1(s.from.y + (s.to.y - s.from.y) * back));
        s.tail.setAttribute("x2", f1(x));
        s.tail.setAttribute("y2", f1(y));
        s.halo.setAttribute("cx", f1(x));
        s.halo.setAttribute("cy", f1(y));
        s.core.setAttribute("cx", f1(x));
        s.core.setAttribute("cy", f1(y));
      }
      for (let k = flashes.length - 1; k >= 0; k--) {
        const f = flashes[k];
        const p = (now - f.t0) / 520;
        if (p >= 1) {
          f.el.remove();
          flashes.splice(k, 1);
          continue;
        }
        f.el.setAttribute("cx", f1(f.node.x));
        f.el.setAttribute("cy", f1(f.node.y));
        f.el.setAttribute("r", f1(6 + p * 26));
        f.el.setAttribute("stroke-opacity", f1((1 - p) * 0.9));
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
      // The map keeps its static glowing look.
    }
  }
})();
