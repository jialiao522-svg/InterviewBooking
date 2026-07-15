import type { Config } from "tailwindcss";

const config: Config = {
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#FF385C",
          hover: "#E31C5F",
        },
      },
      borderRadius: {
        card: "12px",
      },
      boxShadow: {
        card: "0 6px 16px rgba(0, 0, 0, 0.12)",
      },
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "PingFang TC",
          "Microsoft JhengHei",
          "sans-serif",
        ],
      },
    },
  },
};

export default config;
