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

  // The brain behind the notes: hundreds of neurons drawn on a canvas under the map. Signals race
  // along its links and cascade, a wave of activity rolls through now and then, and the pointer
  // wakes the neurons near it. The SVG copy stays as the still image if anything here fails.
  function liveBrain(svg) {
    const group = svg.querySelector(".brain");
    if (!group || !window.HTMLCanvasElement) return;
    const TINTS = { violet: [163, 155, 255], sky: [125, 189, 240], fuchsia: [228, 154, 243], amber: [255, 192, 107], teal: [111, 208, 178] };
    const neurons = [...group.querySelectorAll(".bn")].map((el, i) => {
      const x = +el.getAttribute("cx");
      const y = +el.getAttribute("cy");
      const tint = (el.getAttribute("class").match(/b-(\w+)/) || [, "violet"])[1];
      return { hx: x, hy: y, x, y, r: +el.getAttribute("r"), tint, rgb: TINTS[tint] || TINTS.violet, act: 0, links: [], w: 0.35 + ((i * 7) % 11) / 30, phase: i * 2.39 };
    });
    const links = group.dataset.edges.split(";").map((pair) => {
      const [a, b] = pair.split(",").map(Number);
      const link = { a: neurons[a], b: neurons[b] };
      link.a.links.push(link.b);
      link.b.links.push(link.a);
      return link;
    });
    if (neurons.length < 10) return;

    const canvas = document.createElement("canvas");
    canvas.className = "brain-canvas";
    canvas.setAttribute("aria-hidden", "true");
    const frame = svg.parentElement;
    frame.insertBefore(canvas, svg);
    const ctx = canvas.getContext("2d");
    if (!ctx) return canvas.remove();

    // One soft glow per tint, drawn once and stamped for every neuron.
    const sprites = {};
    for (const [name, [r, g, b]] of Object.entries(TINTS)) {
      const sprite = document.createElement("canvas");
      sprite.width = sprite.height = 64;
      const c = sprite.getContext("2d");
      const grad = c.createRadialGradient(32, 32, 0, 32, 32, 32);
      grad.addColorStop(0, `rgba(${r},${g},${b},0.9)`);
      grad.addColorStop(0.25, `rgba(${r},${g},${b},0.35)`);
      grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
      c.fillStyle = grad;
      c.fillRect(0, 0, 64, 64);
      sprites[name] = sprite;
    }

    // Canvas pixels match the map's box; viewBox units map through the SVG's own transform.
    let view = { s: 1, ox: 0, oy: 0, dpr: 1 };
    function measure() {
      const box = svg.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(box.width * dpr);
      canvas.height = Math.round(box.height * dpr);
      canvas.setAttribute("width", canvas.width);
      canvas.setAttribute("height", canvas.height);
      // The map is the window's last child, so the canvas pins to the bottom and its height follows its width.
      const s = Math.min(box.width / 1200, box.height / 600);
      view = { s: s * dpr, ox: ((box.width - 1200 * s) / 2) * dpr, oy: ((box.height - 600 * s) / 2) * dpr, dpr };
    }
    measure();
    new ResizeObserver(measure).observe(svg);

    const pointer = { x: 0, y: 0, active: false };
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

    const signals = [];
    const MAX_SIGNALS = 70;
    const fire = (from, to, now, depth, speed = 1) => {
      if (signals.length < MAX_SIGNALS) signals.push({ from, to, t0: now, dur: (260 + Math.random() * 420) / speed, depth });
    };
    let nextSpark = 0;
    let nextWave = performance.now() + 2200;

    let visible = true;
    let running = false;
    const start = () => {
      if (running || !visible || document.hidden) return;
      running = true;
      requestAnimationFrame(step);
    };
    new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      start();
    }).observe(svg);
    document.addEventListener("visibilitychange", start);

    let last = performance.now();
    function step(now) {
      const dt = Math.min((now - last) / 16.7, 3);
      last = now;
      const t = now / 1000;
      const { s, ox, oy } = view;
      const breathe = 1 + Math.sin(t * 0.55) * 0.006;
      const px = (x) => ox + (600 + (x - 600) * breathe) * s;
      const py = (y) => oy + (300 + (y - 300) * breathe) * s;

      for (const n of neurons) {
        n.x = n.hx + Math.sin(t * n.w + n.phase) * 2.6;
        n.y = n.hy + Math.cos(t * n.w * 0.83 + n.phase * 1.3) * 2.6;
        if (pointer.active) {
          const d = Math.hypot(n.x - pointer.x, n.y - pointer.y);
          if (d < 95) n.act = Math.max(n.act, (1 - d / 95) * 0.75);
        }
        n.act *= Math.pow(0.955, dt);
      }

      // Sparks: a neuron fires on its own every so often; near the pointer, much more often.
      if (now > nextSpark) {
        nextSpark = now + 70 + Math.random() * 90;
        let from = neurons[Math.floor(Math.random() * neurons.length)];
        if (pointer.active && Math.random() < 0.5) {
          const near = neurons.filter((n) => Math.abs(n.x - pointer.x) < 80 && Math.abs(n.y - pointer.y) < 80);
          if (near.length) from = near[Math.floor(Math.random() * near.length)];
        }
        const to = from.links[Math.floor(Math.random() * from.links.length)];
        if (to) fire(from, to, now, 0);
      }
      // A wave: one neuron fires every link at once, and the burst rolls outward through the brain.
      if (now > nextWave) {
        nextWave = now + 5200 + Math.random() * 3800;
        const from = neurons[Math.floor(Math.random() * neurons.length)];
        from.act = 1;
        for (const to of from.links) fire(from, to, now, -3, 1.4);
      }

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.globalCompositeOperation = "lighter";

      // Links: one faint pass for all, then the awake ones lit in their colour.
      ctx.lineWidth = Math.max(0.6, 0.9 * s);
      ctx.strokeStyle = "rgba(150, 140, 255, 0.12)";
      ctx.beginPath();
      for (const { a, b } of links) {
        ctx.moveTo(px(a.x), py(a.y));
        ctx.lineTo(px(b.x), py(b.y));
      }
      ctx.stroke();
      for (const { a, b } of links) {
        const act = Math.min(a.act, b.act);
        if (act < 0.08) continue;
        const [r, g, bl] = a.rgb;
        ctx.strokeStyle = `rgba(${r},${g},${bl},${(act * 0.55).toFixed(3)})`;
        ctx.beginPath();
        ctx.moveTo(px(a.x), py(a.y));
        ctx.lineTo(px(b.x), py(b.y));
        ctx.stroke();
      }

      // Neurons: a glow that swells when active, and a small bright core.
      for (const n of neurons) {
        const x = px(n.x);
        const y = py(n.y);
        const glow = (n.r * 5 + n.act * 26) * s;
        ctx.globalAlpha = 0.45 + n.act * 0.55;
        ctx.drawImage(sprites[n.tint], x - glow, y - glow, glow * 2, glow * 2);
        ctx.globalAlpha = 0.7 + n.act * 0.3;
        const [r, g, b] = n.rgb;
        ctx.fillStyle = n.act > 0.6 ? "#fff6e0" : `rgb(${r},${g},${b})`;
        ctx.beginPath();
        ctx.arc(x, y, Math.max(0.8, n.r * s * (1 + n.act * 0.6)), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // Signals: a hot core with a coloured tail. Arriving lights the neuron and often carries on.
      for (let k = signals.length - 1; k >= 0; k--) {
        const sig = signals[k];
        const p = (now - sig.t0) / sig.dur;
        if (p >= 1) {
          sig.to.act = Math.min(1, sig.to.act + 0.85);
          const onward = sig.to.links.filter((n) => n !== sig.from);
          const odds = sig.depth < 0 ? 0.95 : 0.62;
          if (sig.depth < 6 && onward.length && Math.random() < odds) {
            fire(sig.to, onward[Math.floor(Math.random() * onward.length)], now, sig.depth + 1, sig.depth < 0 ? 1.4 : 1);
            if (sig.depth < 0 && onward.length > 1 && Math.random() < 0.5) fire(sig.to, onward[Math.floor(Math.random() * onward.length)], now, sig.depth + 1, 1.4);
          }
          signals.splice(k, 1);
          continue;
        }
        const e = p * p * (3 - 2 * p);
        const fx = px(sig.from.x);
        const fy = py(sig.from.y);
        const x = fx + (px(sig.to.x) - fx) * e;
        const y = fy + (py(sig.to.y) - fy) * e;
        const back = Math.max(e - 0.35, 0);
        const [r, g, b] = sig.from.rgb;
        const tail = ctx.createLinearGradient(fx + (px(sig.to.x) - fx) * back, fy + (py(sig.to.y) - fy) * back, x, y);
        tail.addColorStop(0, `rgba(${r},${g},${b},0)`);
        tail.addColorStop(1, `rgba(${r},${g},${b},0.85)`);
        ctx.strokeStyle = tail;
        ctx.lineWidth = Math.max(1.2, 2 * s);
        ctx.beginPath();
        ctx.moveTo(fx + (px(sig.to.x) - fx) * back, fy + (py(sig.to.y) - fy) * back);
        ctx.lineTo(x, y);
        ctx.stroke();
        const halo = 9 * s;
        ctx.drawImage(sprites[sig.from.tint], x - halo * 1.6, y - halo * 1.6, halo * 3.2, halo * 3.2);
        ctx.fillStyle = "#fff6e0";
        ctx.beginPath();
        ctx.arc(x, y, Math.max(1, 1.8 * s), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = "source-over";

      if (visible && !document.hidden) requestAnimationFrame(step);
      else running = false;
    }
    svg.classList.add("live");
    canvas.classList.add("on");
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
      liveBrain(map);
    } catch {
      // The brain stays as the still SVG copy.
      map.classList.remove("live");
    }
    try {
      liveMap(map);
    } catch {
      // The map keeps its static glowing look.
    }
  }
})();
