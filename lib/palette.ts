/**
 * Design-system palettes. CSS tokens live in globals.css under matching
 * `[data-theme]` blocks; these are the 3D-scene halves of the same themes.
 *
 * Switch the whole site (DOM + WebGL) by changing THEME below.
 */
export type ThemeName = "midnight" | "oxblood";

export interface ScenePalette {
  bgCenter: string;
  bgEdge: string;
  glassTint: number;
  attenuation: number;
  typeColor: string;
  keyLight: number;
  fillLight: number;
  rimLight: number;
  particleTint: number;
  /** "r,g,b" for the particle sprite glow gradient. */
  particleGlow: string;
  themeColor: string;
}

export const THEME: ThemeName = "midnight";

export const SCENE_PALETTES: Record<ThemeName, ScenePalette> = {
  // Cool Tom Ford noir — blue-black depths, platinum ice, steel fill.
  midnight: {
    bgCenter: "#04060c",
    bgEdge: "#0a1226",
    glassTint: 0xb4bcc6, // silver with a whisper of warmth
    attenuation: 0x0a1a30,
    typeColor: "#b8c4d4",
    keyLight: 0xffeeda, // warm gold key — feminine glints on the platinum
    fillLight: 0x7a6390, // plum-violet fill — flatters rose glass (blue greys it)
    rimLight: 0xa8c8f0,
    particleTint: 0xcfe0f2,
    particleGlow: "215,232,255",
    themeColor: "#04060c",
  },
  // Wine-black depths, rose-gold metal, copper rim.
  oxblood: {
    bgCenter: "#0a0405",
    bgEdge: "#2a0a12",
    glassTint: 0xc26a62,
    attenuation: 0x4a0e18,
    typeColor: "#d4948a",
    keyLight: 0xffd9cf,
    fillLight: 0x7a5570,
    rimLight: 0xd4886a,
    particleTint: 0xf2c4b4,
    particleGlow: "255,214,200",
    themeColor: "#0a0405",
  },
};

export const SCENE_PALETTE = SCENE_PALETTES[THEME];
