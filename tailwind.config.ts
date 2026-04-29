import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "#E63946", // Tomato Red
          foreground: "#FFFFFF",
          hover: "#D62828",
        },
        secondary: {
          DEFAULT: "#1D3557", // Navy Blue
          foreground: "#F1FAEE",
        },
        accent: {
          DEFAULT: "#A8DADC", // Soft Cyan
          foreground: "#1D3557",
        },
        sidebar: {
          background: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
        success: {
          DEFAULT: "#2A9D8F", // Emerald/Teal
          foreground: "#FFFFFF",
        },
        warning: {
          DEFAULT: "#F4A261", // Sandy Orange
          foreground: "#FFFFFF",
        },
        highlight: {
          DEFAULT: "#E9C46A", // Golden/Yellow
          foreground: "#1D3557",
        },
        destructive: {
          DEFAULT: "#BC4749",
          foreground: "#FFFFFF",
        },
        muted: {
          DEFAULT: "#F8F9FA",
          foreground: "#6C757D",
        },
        card: {
          DEFAULT: "#FFFFFF",
          foreground: "#1D3557",
        },
      },
      boxShadow: {
        'premium': '0 10px 30px -10px rgba(29, 53, 87, 0.1)',
        'card': '0 4px 20px -2px rgba(29, 53, 87, 0.05)',
        'button': '0 4px 14px 0 rgba(230, 57, 70, 0.39)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Lexend', 'Inter', 'sans-serif'],
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: {
            height: "0",
          },
          to: {
            height: "var(--radix-accordion-content-height)",
          },
        },
        "accordion-up": {
          from: {
            height: "var(--radix-accordion-content-height)",
          },
          to: {
            height: "0",
          },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
