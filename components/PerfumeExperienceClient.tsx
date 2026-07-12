"use client";

import dynamic from "next/dynamic";
import { preload } from "react-dom";

// `ssr: false` is only permitted inside a Client Component in Next.js 16,
// so this thin wrapper exists to legally load the Three.js experience
// client-side only (Three.js needs `window`).
const PerfumeExperience = dynamic(() => import("./PerfumeExperience"), {
  ssr: false,
  loading: () => <div className="scene-loading" aria-hidden="true" />,
});

export default function PerfumeExperienceClient() {
  // Kick off the model download at hydration, before the dynamic chunk and
  // scene init — the preloader finishes noticeably sooner on cold loads.
  preload("/models/perfume.glb", { as: "fetch", crossOrigin: "anonymous" });
  return <PerfumeExperience />;
}
