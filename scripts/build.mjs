import { build } from "esbuild";

await build({ entryPoints: ["src/card.js"], bundle: true, format: "iife", target: "es2022", outfile: "dist/ha-room-light-card.js", minify: true });
await build({ entryPoints: ["preview/demo.js"], bundle: true, format: "iife", target: "es2022", outfile: "preview/demo.bundle.js", minify: true });
