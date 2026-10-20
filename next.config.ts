import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Las migraciones se leen en tiempo de ejecucion: hay que incluirlas en el despliegue serverless.
  outputFileTracingIncludes: {
    "/*": ["./drizzle/**/*"],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
