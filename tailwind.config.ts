import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // SPEC §4: monochrome-first. Neutrals = Tailwind zinc.
        // Surface/text semantics mapped through CSS vars so components stay token-based.
        bg: "hsl(var(--bg) / <alpha-value>)",
        surface: "hsl(var(--surface) / <alpha-value>)",
        "surface-elevated": "hsl(var(--surface-elevated) / <alpha-value>)",
        border: "hsl(var(--border) / <alpha-value>)",
        "border-strong": "hsl(var(--border-strong) / <alpha-value>)",
        fg: "hsl(var(--fg) / <alpha-value>)",
        "fg-muted": "hsl(var(--fg-muted) / <alpha-value>)",
        "fg-subtle": "hsl(var(--fg-subtle) / <alpha-value>)",
        "fg-disabled": "hsl(var(--fg-disabled) / <alpha-value>)",

        // Accent (swappable via CSS var — SPEC §4)
        accent: {
          DEFAULT: "hsl(var(--accent) / <alpha-value>)",
          hover: "hsl(var(--accent-hover) / <alpha-value>)",
          subtle: "hsl(var(--accent-subtle) / <alpha-value>)",
          "subtle-fg": "hsl(var(--accent-subtle-fg) / <alpha-value>)",
          fg: "hsl(var(--accent-fg) / <alpha-value>)",
          ring: "hsl(var(--accent-ring) / <alpha-value>)",
        },

        // Status (SPEC §4: emerald / amber / red)
        success: {
          DEFAULT: "hsl(var(--success) / <alpha-value>)",
          subtle: "hsl(var(--success-subtle) / <alpha-value>)",
          "subtle-fg": "hsl(var(--success-subtle-fg) / <alpha-value>)",
        },
        warning: {
          DEFAULT: "hsl(var(--warning) / <alpha-value>)",
          subtle: "hsl(var(--warning-subtle) / <alpha-value>)",
          "subtle-fg": "hsl(var(--warning-subtle-fg) / <alpha-value>)",
        },
        danger: {
          DEFAULT: "hsl(var(--danger) / <alpha-value>)",
          subtle: "hsl(var(--danger-subtle) / <alpha-value>)",
          "subtle-fg": "hsl(var(--danger-subtle-fg) / <alpha-value>)",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      fontSize: {
        // SPEC §4: 11 / 13 / 14 / 16 / 20 / 24. Tight line-heights.
        xs: ["11px", { lineHeight: "1.35", letterSpacing: "0" }],
        sm: ["13px", { lineHeight: "1.35", letterSpacing: "0" }],
        base: ["14px", { lineHeight: "1.5", letterSpacing: "0" }],
        lg: ["16px", { lineHeight: "1.35", letterSpacing: "-0.005em" }],
        xl: ["20px", { lineHeight: "1.2", letterSpacing: "-0.015em" }],
        "2xl": ["24px", { lineHeight: "1.2", letterSpacing: "-0.02em" }],
      },
      borderRadius: {
        // SPEC §4: 6 / 8, rounded-full only for avatars + dots
        md: "6px",
        lg: "8px",
      },
      spacing: {
        // SPEC §4: page gutter 24, section gap 24–32, card padding 16
        gutter: "24px",
        section: "32px",
      },
      ringWidth: {
        DEFAULT: "1px",
      },
      transitionDuration: {
        // SPEC §4: 120–180ms ease-out
        fast: "120ms",
        DEFAULT: "150ms",
        slow: "180ms",
      },
      transitionTimingFunction: {
        DEFAULT: "cubic-bezier(0.4, 0, 0.2, 1)",
      },
      boxShadow: {
        // SPEC §4: shadows on popovers only (light); dark uses ring
        popover: "0 10px 24px -8px rgb(0 0 0 / 0.08), 0 2px 6px -2px rgb(0 0 0 / 0.04)",
      },
    },
  },
  plugins: [],
};

export default config;
