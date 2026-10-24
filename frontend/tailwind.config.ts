import type { Config } from "tailwindcss";

/**
 * Tailwind maps semantic names onto the CSS variables in `app/globals.css`.
 * No raw colour is declared here, so a light theme only needs to override the
 * variables — never a component class.
 */
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        canvas: "rgb(var(--app-bg) / <alpha-value>)",
        sidebar: "rgb(var(--sidebar-bg) / <alpha-value>)",
        surface: {
          DEFAULT: "rgb(var(--surface) / <alpha-value>)",
          raised: "rgb(var(--surface-raised) / <alpha-value>)",
          active: "rgb(var(--surface-active) / <alpha-value>)",
          inset: "rgb(var(--surface-inset) / <alpha-value>)",
        },
        ink: {
          DEFAULT: "rgb(var(--text-primary) / <alpha-value>)",
          muted: "rgb(var(--text-secondary) / <alpha-value>)",
          subtle: "rgb(var(--text-muted) / <alpha-value>)",
        },
        line: {
          DEFAULT: "rgb(var(--border) / <alpha-value>)",
          subtle: "rgb(var(--border-subtle) / <alpha-value>)",
          strong: "rgb(var(--border-strong) / <alpha-value>)",
          control: "rgb(var(--border-control) / <alpha-value>)",
        },
        accent: {
          DEFAULT: "rgb(var(--accent) / <alpha-value>)",
          hover: "rgb(var(--accent-hover) / <alpha-value>)",
          subtle: "rgb(var(--accent-subtle) / <alpha-value>)",
          fg: "rgb(var(--accent-fg) / <alpha-value>)",
          ring: "rgb(var(--focus-ring) / <alpha-value>)",
          // Numeric tints retained for the few places that need a deeper wash.
          50: "#12251e",
          100: "#18392d",
          200: "#1f4d3b",
          300: "#2a6b52",
          400: "#35a97b",
          500: "#3ecf8e",
          600: "#3ecf8e",
          700: "#3ecf8e",
          800: "#55d99d",
          900: "#6fe6af",
        },
        success: {
          DEFAULT: "rgb(var(--success) / <alpha-value>)",
          subtle: "rgb(var(--success-subtle) / <alpha-value>)",
          fg: "rgb(var(--success-fg) / <alpha-value>)",
        },
        warning: {
          DEFAULT: "rgb(var(--warning) / <alpha-value>)",
          subtle: "rgb(var(--warning-subtle) / <alpha-value>)",
          fg: "rgb(var(--warning-fg) / <alpha-value>)",
        },
        danger: {
          DEFAULT: "rgb(var(--danger) / <alpha-value>)",
          subtle: "rgb(var(--danger-subtle) / <alpha-value>)",
          fg: "rgb(var(--danger-fg) / <alpha-value>)",
        },
        info: {
          DEFAULT: "rgb(var(--info) / <alpha-value>)",
          subtle: "rgb(var(--info-subtle) / <alpha-value>)",
          fg: "rgb(var(--info-fg) / <alpha-value>)",
        },
        // Informational series colour used by charts; aliases the info scale.
        ocean: {
          50: "#202f45",
          100: "#24374f",
          200: "#2c4462",
          300: "#3b5b80",
          400: "#5a85b8",
          500: "#78a9fa",
          600: "#78a9fa",
          700: "#93bcff",
          800: "#a9ccff",
          900: "#c4ddff",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)"],
        mono: ["var(--font-mono)"],
      },
      fontSize: {
        // Compact product scale from style.md §3.
        "2xs": ["0.6875rem", { lineHeight: "1rem" }], // 11px — table headers, metadata
        xs: ["0.75rem", { lineHeight: "1rem" }], // 12px
        sm: ["0.8125rem", { lineHeight: "1.25rem" }], // 13px — body and controls
        base: ["0.875rem", { lineHeight: "1.375rem" }], // 14px — body
        lg: ["0.9375rem", { lineHeight: "1.25rem" }], // 15px — section titles
        xl: ["1rem", { lineHeight: "1.375rem" }], // 16px
        "2xl": ["1.25rem", { lineHeight: "1.5rem" }], // 20px
        "3xl": ["1.375rem", { lineHeight: "1.75rem" }], // 22px — page title
        "4xl": ["1.75rem", { lineHeight: "2rem" }], // 28px — measurement maximum
      },
      borderRadius: {
        DEFAULT: "var(--radius)",
        sm: "var(--radius-sm)",
        md: "var(--radius)",
        lg: "var(--radius-lg)",
      },
      boxShadow: {
        // Dark surfaces: structure comes from borders, not elevation.
        card: "0 1px 0 rgb(255 255 255 / 0.02)",
        raised: "0 16px 40px -16px rgb(0 0 0 / 0.75)",
        overlay: "0 24px 64px -24px rgb(0 0 0 / 0.85)",
      },
      transitionDuration: {
        DEFAULT: "var(--duration)",
        fast: "var(--duration-fast)",
        slow: "var(--duration-slow)",
      },
      transitionTimingFunction: {
        DEFAULT: "var(--ease)",
      },
      spacing: {
        sidebar: "232px",
        "sidebar-rail": "64px",
        topbar: "56px",
      },
      maxWidth: {
        shell: "1600px",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
      },
      animation: {
        "fade-in": "fade-in var(--duration) var(--ease)",
      },
    },
  },
  plugins: [],
};

export default config;
