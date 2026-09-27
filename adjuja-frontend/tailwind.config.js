/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans: ["Manrope", "system-ui", "sans-serif"],
        display: ["Manrope", "system-ui", "sans-serif"],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        /* Landing tokens  use these in landing components */
        l: {
          bg:             "var(--l-bg)",
          "bg-alt":       "var(--l-bg-alt)",
          surface:        "var(--l-surface)",
          "surface-2":    "var(--l-surface-2)",
          "surface-3":    "var(--l-surface-3)",
          "blue-soft":    "var(--l-blue-soft)",
          pos:            "var(--l-pos)",
          hold:           "var(--l-hold)",
          neg:            "var(--l-neg)",
          card:           "var(--l-card)",
          "card-border":  "var(--l-card-border)",
          "mk-bg":        "var(--l-mk-bg)",
          "mk-surf":      "var(--l-mk-surf)",
          "mk-border":    "var(--l-mk-border)",
          border:         "var(--l-border)",
          "border-strong":"var(--l-border-strong)",
          "border-focus": "var(--l-border-focus)",
          text:           "var(--l-text)",
          "text-muted":   "var(--l-text-muted)",
          "text-dim":     "var(--l-text-dim)",
          sub:            "var(--l-sub)",
          dim:            "var(--l-dim)",
          blue:           "var(--l-blue)",
          indigo:         "var(--l-indigo)",
          teal:           "var(--l-teal)",
          "input-bg":     "var(--l-input-bg)",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 1px)",
        sm: "calc(var(--radius) - 2px)",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "slide-in": {
          from: { opacity: "0", transform: "translateX(-8px)" },
          to: { opacity: "1", transform: "translateX(0)" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.4s ease-out",
        "slide-in": "slide-in 0.3s ease-out",
      },
    },
  },
  plugins: [],
};
