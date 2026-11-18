import type { StyleId } from "./types";

export interface StyleDef {
  id: StyleId;
  name: string;
  tagline: string;
  promptHint: string;
  gradient: [string, string];
}

export const STYLES: StyleDef[] = [
  { id: "realistic", name: "Realistic 3D", tagline: "True-to-life proportions and materials", promptHint: "photorealistic skin and fabric, natural proportions", gradient: ["#3b3f52", "#9aa3b8"] },
  { id: "stylised", name: "Stylised animation", tagline: "Original feature-film inspired look", promptHint: "original stylised animated film aesthetic, soft shading, expressive eyes", gradient: ["#6d28d9", "#f472b6"] },
  { id: "cartoon", name: "Cartoon 3D", tagline: "Bold shapes, bright colours", promptHint: "cartoon, bold simple shapes, saturated colours", gradient: ["#f59e0b", "#ef4444"] },
  { id: "anime", name: "Anime-inspired", tagline: "Clean lines, large eyes", promptHint: "anime-inspired 3D, cel-like shading, large expressive eyes", gradient: ["#ec4899", "#8b5cf6"] },
  { id: "low_poly", name: "Low-poly", tagline: "Faceted, geometric minimalism", promptHint: "low-poly faceted geometric", gradient: ["#10b981", "#0ea5e9"] },
  { id: "game_ready", name: "Game-ready", tagline: "Optimised for real-time engines", promptHint: "game-ready real-time character, clean topology, PBR", gradient: ["#2563eb", "#22d3ee"] },
  { id: "miniature", name: "Cute miniature", tagline: "Big head, tiny body", promptHint: "chibi miniature proportions, big head, cute", gradient: ["#f472b6", "#fbbf24"] },
  { id: "fantasy", name: "Fantasy", tagline: "Capes, elven ears, magic", promptHint: "fantasy hero outfit, cape, elven features", gradient: ["#7c3aed", "#14b8a6"] },
];
