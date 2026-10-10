import type { MetadataRoute } from "next";

// Web app manifest (served at /manifest.webmanifest): lets phones "install"
// MedPass to the home screen; it opens straight on the offline scanner.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MedPass",
    short_name: "MedPass",
    start_url: "/scan",
    scope: "/",
    display: "standalone",
    background_color: "#F1F5F2",
    theme_color: "#123B33",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
