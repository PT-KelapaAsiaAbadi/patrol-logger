import { defineConfig } from "vite";
import preact from "@preact/preset-vite";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

// `npm run build` -> hosted build: multi-file + service worker + manifest (installable, works offline)
export default defineConfig({
	plugins: [
		preact(),
		tailwindcss(),
		VitePWA({
			// New versions download in the background and wait; src/lib/updates.ts switches them in
			// on a screen where a reload loses nothing. No Play Store review either way.
			registerType: "prompt",
			includeAssets: ["icon-192.png", "icon-512.png"],
			manifest: {
				name: "Patroli",
				short_name: "Patroli",
				lang: "id",
				start_url: ".",
				display: "standalone",
				orientation: "portrait",
				background_color: "#1f2a37",
				theme_color: "#1f2a37",
				icons: [
					{
						src: "icon-192.png",
						sizes: "192x192",
						type: "image/png",
					},
					{
						src: "icon-512.png",
						sizes: "512x512",
						type: "image/png",
						purpose: "any maskable",
					},
				],
			},
			workbox: { globPatterns: ["**/*.{js,css,html,png}"] }, // app shell cached, so it opens with no signal
		}),
	],
});
