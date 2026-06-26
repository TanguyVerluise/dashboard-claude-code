import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Plusieurs lockfiles existent au-dessus du projet : on fixe la racine ici.
  turbopack: { root: __dirname },
};

export default nextConfig;
