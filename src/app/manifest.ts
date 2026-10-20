import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Smart Meal Planner",
    short_name: "Comidas",
    description: "Plan de comidas, presupuesto y lista de compras",
    start_url: "/shopping",
    display: "standalone",
    background_color: "#fafaf9",
    theme_color: "#059669",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
