"use client";

import { useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import Lenis from "lenis";
import { createPerfumeScene, type PerfumeScene } from "@/lib/perfumeScene";

gsap.registerPlugin(useGSAP, ScrollTrigger);

// Mobile browsers fire resizes when the URL bar shows/hides mid-scroll;
// refreshing ScrollTrigger on those causes visible jumps.
ScrollTrigger.config({ ignoreMobileResize: true });

const NOTES = [
  { num: "01", tier: "Top", detail: "Bergamot · Pink Pepper" },
  { num: "02", tier: "Heart", detail: "Oud · Rose · Saffron" },
  { num: "03", tier: "Base", detail: "Amber · Vanilla · Musk" },
];

/** One span per character, for staggered char reveals. */
function Chars({ text }: { text: string }) {
  return (
    <>
      {text.split("").map((c, i) => (
        <span key={i} className="ch">
          {c}
        </span>
      ))}
    </>
  );
}

export default function PerfumeExperience() {
  const root = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const preloader = useRef<HTMLDivElement>(null);
  const preCounter = useRef<HTMLSpanElement>(null);
  const beatCounter = useRef<HTMLSpanElement>(null);
  const cta = useRef<HTMLAnchorElement>(null);
  const cursorDot = useRef<HTMLDivElement>(null);
  const cursorRing = useRef<HTMLDivElement>(null);

  useGSAP(
    (_context, contextSafe) => {
      const rootEl = root.current;
      const canvasEl = canvas.current;
      if (!rootEl || !canvasEl || !contextSafe) return;

      const reduced = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      const finePointer = window.matchMedia("(pointer: fine)").matches;
      const isMobileNow = window.matchMedia("(max-width: 768px)").matches;

      // ---------- Three.js scene + preloader progress ----------
      let shownProgress = 0;
      const scene: PerfumeScene = createPerfumeScene(canvasEl, {
        quality: isMobileNow ? "low" : "high",
        onProgress: (p) => {
          const pct = Math.round(p * 100);
          if (pct > shownProgress && preCounter.current) {
            shownProgress = pct;
            preCounter.current.textContent = String(pct).padStart(2, "0");
          }
        },
      });
      // Ignore height-only resizes on touch devices (URL bar show/hide) so
      // the canvas doesn't re-allocate its render targets mid-scroll.
      const coarse = window.matchMedia("(pointer: coarse)").matches;
      let lastW = window.innerWidth;
      let lastH = window.innerHeight;
      const resize = () => {
        const w = window.innerWidth;
        const h = window.innerHeight;
        if (coarse && w === lastW && Math.abs(h - lastH) < 160) return;
        lastW = w;
        lastH = h;
        scene.resize(w, h);
      };
      scene.resize(lastW, lastH);
      window.addEventListener("resize", resize);

      // ---------- Lenis, unified with the GSAP ticker ----------
      const lenis = new Lenis({ lerp: 0.1 });
      lenis.on("scroll", ScrollTrigger.update);
      lenis.stop(); // locked until the entrance completes

      const tick = (time: number, deltaTime: number) => {
        lenis.raf(time * 1000);
        scene.render(deltaTime / 1000);
      };
      gsap.ticker.add(tick);
      gsap.ticker.lagSmoothing(0);

      const { pivot, camera, typePlane, lights } = scene;

      // Portrait frustums are narrow — a smaller bottle keeps the whole
      // heart silhouette in frame and keeps text off the bright glass.
      const bottleScale = isMobileNow ? 0.62 : 1;

      // Entrance start state: bottle waits below the frame.
      if (!reduced) {
        pivot.position.y = -2.6;
        pivot.scale.setScalar(0.92 * bottleScale);
      } else {
        pivot.scale.setScalar(bottleScale);
      }

      const removeFns: Array<() => void> = [];

      // ---------- Pointer: parallax + custom cursor + magnetic CTA ----------
      if (finePointer && !reduced) {
        const onMove = contextSafe((e: PointerEvent) => {
          const nx = (e.clientX / window.innerWidth) * 2 - 1;
          const ny = (e.clientY / window.innerHeight) * 2 - 1;
          scene.setPointer(nx, -ny);
        });
        window.addEventListener("pointermove", onMove);
        removeFns.push(() => window.removeEventListener("pointermove", onMove));

        const dot = cursorDot.current;
        const ring = cursorRing.current;
        if (dot && ring) {
          rootEl.classList.add("cursor-on");
          const dotX = gsap.quickTo(dot, "x", { duration: 0.08, ease: "power2.out" });
          const dotY = gsap.quickTo(dot, "y", { duration: 0.08, ease: "power2.out" });
          const ringX = gsap.quickTo(ring, "x", { duration: 0.45, ease: "power3.out" });
          const ringY = gsap.quickTo(ring, "y", { duration: 0.45, ease: "power3.out" });
          const onCursor = contextSafe((e: PointerEvent) => {
            dot.style.opacity = "1";
            ring.style.opacity = "1";
            dotX(e.clientX);
            dotY(e.clientY);
            ringX(e.clientX);
            ringY(e.clientY);
          });
          const onOver = contextSafe((e: PointerEvent) => {
            if ((e.target as Element).closest?.("[data-cursor]"))
              ring.classList.add("is-hover");
          });
          const onOut = contextSafe((e: PointerEvent) => {
            if ((e.target as Element).closest?.("[data-cursor]"))
              ring.classList.remove("is-hover");
          });
          window.addEventListener("pointermove", onCursor);
          window.addEventListener("pointerover", onOver);
          window.addEventListener("pointerout", onOut);
          removeFns.push(() => {
            window.removeEventListener("pointermove", onCursor);
            window.removeEventListener("pointerover", onOver);
            window.removeEventListener("pointerout", onOut);
            rootEl.classList.remove("cursor-on");
          });
        }

        const btn = cta.current;
        if (btn) {
          const strength = 0.35;
          const onBtnMove = contextSafe((e: PointerEvent) => {
            const r = btn.getBoundingClientRect();
            gsap.to(btn, {
              x: (e.clientX - (r.left + r.width / 2)) * strength,
              y: (e.clientY - (r.top + r.height / 2)) * strength,
              duration: 0.4,
              ease: "power3.out",
            });
          });
          const onBtnLeave = contextSafe(() => {
            gsap.to(btn, { x: 0, y: 0, duration: 0.9, ease: "elastic.out(1, 0.4)" });
          });
          btn.addEventListener("pointermove", onBtnMove);
          btn.addEventListener("pointerleave", onBtnLeave);
          removeFns.push(() => {
            btn.removeEventListener("pointermove", onBtnMove);
            btn.removeEventListener("pointerleave", onBtnLeave);
          });
        }
      }

      // ---------- Choreography ----------
      const initChoreography = contextSafe(() => {
        // --- Entrance ---
        const finishEntrance = () => {
          lenis.start();
          ScrollTrigger.refresh();
        };

        if (reduced) {
          gsap.set(preloader.current, { display: "none" });
          gsap.set(".chrome", { opacity: 1, y: 0 });
          typePlane.material.opacity = 0.15;
          finishEntrance();
        } else {
          // Hidden start states, set only now — if JS never runs, the CSS
          // resting states keep the hero readable (no stacked text, ever).
          gsap.set(".hero-giant .ch", { yPercent: 114 });
          gsap.set(".tagline-inner", { yPercent: 114 });
          gsap.set(".chrome", { opacity: 0, y: 12 });

          const proxy = { v: shownProgress };
          gsap
            .timeline({ onComplete: finishEntrance })
            .to(proxy, {
              v: 100,
              duration: 0.6,
              ease: "power1.inOut",
              onUpdate: () => {
                if (preCounter.current)
                  preCounter.current.textContent = String(
                    Math.round(proxy.v),
                  ).padStart(2, "0");
              },
            })
            .to(".pre-inner", { opacity: 0, y: -24, duration: 0.5, ease: "power3.in" }, "+=0.15")
            .to(preloader.current, {
              clipPath: "inset(0% 0% 100% 0%)",
              duration: 1.0,
              ease: "expo.inOut",
            })
            .set(preloader.current, { display: "none" })
            .to(pivot.position, { y: 0, duration: 1.8, ease: "expo.out" }, "-=0.55")
            .to(
              pivot.scale,
              { x: bottleScale, y: bottleScale, z: bottleScale, duration: 1.8, ease: "expo.out" },
              "<",
            )
            // Whisper only — the DOM giant type owns the hero beat.
            .to(typePlane.material, { opacity: 0.15, duration: 1.6, ease: "power2.inOut" }, "<0.35")
            .to(
              ".hero-giant .ch",
              { yPercent: 0, duration: 1.1, ease: "expo.out", stagger: 0.045 },
              "<0.15",
            )
            .to(".tagline-inner", { yPercent: 0, duration: 1.0, ease: "expo.out" }, "<0.4")
            .to(".chrome", { opacity: 1, y: 0, duration: 0.8, ease: "power3.out", stagger: 0.08 }, "<0.3");
        }

        // --- Scroll-progress hairline ---
        gsap.to(".progress-hairline", {
          scaleX: 1,
          ease: "none",
          scrollTrigger: {
            trigger: rootEl,
            start: "top top",
            end: "bottom bottom",
            scrub: true,
          },
        });

        // --- Section counter (01–04) + right-side markers ---
        const beatEls = gsap.utils.toArray<HTMLElement>(".beat");
        const markers = gsap.utils.toArray<HTMLElement>(".beat-marker");
        const setActive = (idx: number) => {
          if (beatCounter.current)
            beatCounter.current.textContent = String(idx + 1).padStart(2, "0");
          markers.forEach((m, j) => m.classList.toggle("is-active", j === idx));
        };
        setActive(0);
        beatEls.forEach((el, i) => {
          ScrollTrigger.create({
            trigger: el,
            start: "top center",
            onEnter: () => setActive(i),
            onLeaveBack: () => setActive(Math.max(i - 1, 0)),
          });
        });
        markers.forEach((m, i) => {
          const onClick = contextSafe(() => {
            const target = beatEls[i];
            if (target) lenis.scrollTo(target, { duration: 1.6 });
          });
          m.addEventListener("click", onClick);
          removeFns.push(() => m.removeEventListener("click", onClick));
        });

        // --- Master scrubbed timeline ---
        const mm = gsap.matchMedia(root);
        mm.add(
          {
            isDesktop: "(min-width: 769px)",
            isMobile: "(max-width: 768px)",
            mmReduced: "(prefers-reduced-motion: reduce)",
          },
          (ctx) => {
            const { isDesktop, mmReduced } = ctx.conditions as {
              isDesktop: boolean;
              isMobile: boolean;
              mmReduced: boolean;
            };

            const shiftX = isDesktop ? 1.3 : 0;
            const closeX = isDesktop ? -0.85 : 0;
            const tilt = mmReduced ? 0 : isDesktop ? 0.2 : 0.1;
            const yLift = mmReduced ? 0 : 48;
            const HOLD = 0.7;

            // GSAP takes over visibility from the CSS-hidden defaults.
            gsap.set([".name-overlay", ".notes-overlay", ".cta-overlay"], {
              autoAlpha: 0,
            });
            gsap.set(".dn-line", { yPercent: 114 });
            gsap.set(".note-line", { opacity: 0, y: yLift });

            const tl = gsap.timeline({
              defaults: { ease: "power3.inOut", duration: 1 },
              scrollTrigger: {
                trigger: rootEl,
                start: "top top",
                end: "bottom bottom",
                scrub: mmReduced ? 0.4 : 1,
              },
            });

            // Beat 0 — hero holds
            tl.addLabel("t1", 0.5);

            // Beat 1 — hero exits FULLY, then the massive name enters.
            // Type-layer rule: only ONE giant type layer per beat — the
            // in-scene plane all but disappears while DOM display type shows.
            tl.to(".hero-overlay", { autoAlpha: 0, y: -yLift, duration: 0.4 }, "t1")
              .to(pivot.position, { x: shiftX }, "t1")
              .to(pivot.rotation, { z: tilt }, "t1")
              .to(typePlane.position, { x: -1.4 }, "t1")
              .to(typePlane.material, { opacity: 0.05, duration: 0.5 }, "t1")
              .to(".name-overlay", { autoAlpha: 1, duration: 0.3 }, "t1+=0.6")
              .to(
                ".dn-line",
                { yPercent: 0, duration: 0.9, ease: "power3.out", stagger: 0.12 },
                "t1+=0.65",
              )
              .to(".name-sub-inner", { yPercent: 0, duration: 0.7, ease: "power3.out" }, "t1+=0.9");

            tl.to({}, { duration: HOLD });

            // Beat 2 — name exits, camera dollies close, key light blooms up.
            tl.addLabel("t2")
              .to(".name-overlay", { autoAlpha: 0, y: -yLift, duration: 0.4 }, "t2")
              .to(pivot.position, { x: closeX, y: -0.2 }, "t2")
              .to(pivot.rotation, { z: 0 }, "t2")
              // Close, but the whole heart silhouette stays in frame.
              .to(camera.position, { z: 4.6 }, "t2")
              .to(lights.key, { intensity: 2.8, duration: 0.8 }, "t2")
              .to(typePlane.position, { x: 1.1 }, "t2")
              // THE refraction moment — no DOM giant type competes here.
              .to(typePlane.material, { opacity: 0.5, duration: 0.8 }, "t2")
              .to(".notes-overlay", { autoAlpha: 1, duration: 0.3 }, "t2+=0.6")
              .to(
                ".note-line",
                { opacity: 1, y: 0, stagger: mmReduced ? 0 : 0.14, ease: "power3.out" },
                "t2+=0.65",
              );

            tl.to({}, { duration: HOLD });

            // Beat 3 — notes exit, full 360°, rim halo, NOIR blazes behind.
            tl.addLabel("t3")
              .to(".notes-overlay", { autoAlpha: 0, y: -yLift, duration: 0.4 }, "t3")
              .to(pivot.position, { x: 0, y: 0 }, "t3")
              .to(camera.position, { z: 5.2 }, "t3")
              .to(pivot.rotation, { y: `+=${Math.PI * 2}`, duration: 1.4 }, "t3")
              .to(lights.key, { intensity: 2.0, duration: 0.8 }, "t3")
              .to(lights.rim, { intensity: 9, duration: 1 }, "t3")
              .to(typePlane.position, { x: 0 }, "t3")
              // Whisper again — the CTA name owns this beat.
              .to(typePlane.material, { opacity: 0.15, duration: 0.8 }, "t3+=0.3")
              .to(".cta-overlay", { autoAlpha: 1, duration: 0.4 }, "t3+=0.6");

            tl.to({}, { duration: HOLD });
          },
        );
      });

      // Small floor delay so cached loads still get a beat of preloader.
      const minDelay = new Promise((r) => setTimeout(r, 500));
      Promise.all([scene.ready, minDelay])
        .then(() => initChoreography())
        .catch((err) => {
          console.error("Failed to load perfume experience:", err);
          // Fail open: never trap the user behind the preloader.
          if (preloader.current) preloader.current.style.display = "none";
          lenis.start();
        });

      // Manual (non-GSAP) cleanup — useGSAP reverts tweens/triggers/matchMedia.
      return () => {
        removeFns.forEach((fn) => fn());
        gsap.ticker.remove(tick);
        window.removeEventListener("resize", resize);
        lenis.destroy();
        scene.dispose();
      };
    },
    { scope: root },
  );

  return (
    <div ref={root} className="experience">
      <canvas ref={canvas} className="scene-canvas" aria-hidden="true" />
      <div className="vignette" aria-hidden="true" />

      {/* ---------- Beat overlays ---------- */}
      <div className="overlay-layer">
        <div className="hero-overlay">
          <p className="hero-tagline">
            <span className="mask">
              <span className="tagline-inner">An Ode to Midnight</span>
            </span>
          </p>
          <h1 className="hero-giant" aria-label="Maison Noir">
            <span className="mask">
              <span className="giant-line stroked">
                <Chars text="MAISON" />
              </span>
            </span>
            <span className="mask">
              <span className="giant-line solid">
                <Chars text="NOIR" />
              </span>
            </span>
          </h1>
          <span className="scroll-cue chrome" aria-hidden="true">
            Scroll
          </span>
        </div>

        <div className="name-overlay">
          <h2 className="display-name">
            <span className="mask">
              <span className="dn-line">Élixir</span>
            </span>
            <span className="mask">
              <span className="dn-line dn-indent">Noir</span>
            </span>
          </h2>
          <p className="name-sub">
            <span className="mask">
              <span className="name-sub-inner">
                Eau de Parfum — Maison Noir
              </span>
            </span>
          </p>
        </div>

        <div className="notes-overlay">
          <p className="eyebrow">Composition</p>
          <ul className="notes-list">
            {NOTES.map((n) => (
              <li key={n.tier} className="note-line">
                <span className="note-num">{n.num}</span>
                <div className="note-body">
                  <span className="note-tier">{n.tier}</span>
                  <span className="note-detail">{n.detail}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="cta-overlay">
          <h2 className="cta-name">Élixir Noir</h2>
          <p className="cta-sub">Eau de Parfum</p>
          <a ref={cta} className="cta-button" data-cursor href="#">
            Discover the Scent
          </a>
        </div>
      </div>

      {/* ---------- Fixed chrome ---------- */}
      <header className="site-header chrome">
        <span className="wordmark" data-cursor>
          Maison Noir
        </span>
        <span className="header-label">Paris — Eau de Parfum</span>
      </header>
      <div className="section-counter chrome">
        <span ref={beatCounter}>01</span>
        <span className="counter-total">&nbsp;/ 04</span>
      </div>
      <nav className="beat-markers chrome" aria-label="Sections">
        {["Hero", "Élixir Noir", "Composition", "Discover"].map((label) => (
          <button
            key={label}
            type="button"
            className="beat-marker"
            data-cursor
            aria-label={`Go to ${label}`}
          />
        ))}
      </nav>
      <div className="progress-hairline" aria-hidden="true" />
      <div className="grain" aria-hidden="true" />

      {/* ---------- Preloader ---------- */}
      <div ref={preloader} className="preloader">
        <div className="pre-inner">
          <span className="pre-mark">Maison Noir</span>
          <span ref={preCounter} className="pre-counter">
            00
          </span>
        </div>
      </div>

      {/* ---------- Custom cursor ---------- */}
      <div ref={cursorDot} className="cursor-dot" aria-hidden="true" />
      <div ref={cursorRing} className="cursor-ring" aria-hidden="true" />

      {/* ---------- Scroll spacers ---------- */}
      <section className="beat" aria-label="Hero" />
      <section className="beat" aria-label="Product name" />
      <section className="beat" aria-label="Fragrance notes" />
      <section className="beat" aria-label="Shop now" />
    </div>
  );
}
