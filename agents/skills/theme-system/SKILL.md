---
name: theme-system
description: Implement and validate DaliTak's six-theme design system.
---

# Theme System Skill

## Purpose
Implement Light, Dark, Purple, Cyberpunk, Forest, and Sunset themes with semantic CSS variables, localStorage persistence, and accessibility validation.

## When to use
- When adding or modifying theme colors, tokens, or the theme selector
- When verifying theme switching, persistence, or contrast
- Before and after any CSS variable changes

## Procedures

### 1. Inspect existing theme implementation
- Read `client/src/index.css` — all theme tokens live here in `[data-theme='...']` blocks
- Read `client/src/context/ThemeContext.jsx` — theme state management
- Read `client/src/components/ThemeSelector.jsx` — theme picker UI
- Read `client/src/main.jsx` — ThemeProvider placement

### 2. Establish semantic CSS variables
Each theme must define these tokens:
- `--bg`, `--surface`, `--surface-elev`, `--border`, `--border-hover`
- `--text`, `--text-soft`, `--muted`, `--muted-bg`
- `--primary`, `--primary-hover`, `--primary-soft`, `--primary-text`
- `--danger`, `--danger-soft`, `--danger-text`
- `--success`, `--success-soft`, `--success-text`
- `--warning`, `--warning-soft`, `--warning-text`
- `--info`, `--info-soft`, `--info-text`
- `--sidebar`, `--sidebar-border`, `--sidebar-hover`, `--sidebar-active`, `--sidebar-active-text`
- `--header`, `--header-border`, `--overlay-bg`

### 3. Implement all six themes
1. **Light** — clean white surfaces, blue/indigo accents (#4f46e5)
2. **Dark** — deep navy surfaces (#0f172a), indigo accents (#6366f1)
3. **Purple** — violet gradients (#8b5cf6), light purple backgrounds
4. **Cyberpunk** — near-black (#050507), neon cyan (#00fff5) and magenta (#bc13fe)
5. **Forest** — deep green (#2e7d32), natural neutral tones
6. **Sunset** — orange (#ea580c), coral and pink tones

### 4. Use one theme mechanism
- CSS custom properties on `[data-theme='theme-name']`
- Single `ThemeContext` provider wrapping the app
- No duplicating full stylesheets per theme
- No external theme libraries

### 5. Add accessible theme selector
- Located in Layout header and sidebar footer
- Keyboard navigable (Enter/Space to select)
- ARIA labels: `aria-label="Select theme"`, `aria-haspopup="true"`
- Shows current theme with icon + label
- Checkmark on active theme

### 6. Save and restore with localStorage
- Key: `daliTak-theme`
- Read on app mount, apply before first paint
- Write on every theme change
- Default to 'light' if no saved preference

### 7. Prevent flash-of-wrong-theme
- Theme applied via `data-theme` on `document.documentElement`
- ThemeProvider reads localStorage synchronously in useState initializer
- CSS variables available immediately on first render

### 8. Verify nested components
- Check buttons, inputs, cards, panels, modals, dropdowns
- Check notification panel, timer widgets, charts
- Check empty states, error alerts, loading spinners

### 9. Check contrast and focus visibility
- Text contrast ≥ 4.5:1 (normal), ≥ 3:1 (large) on all backgrounds
- Focus ring visible on all interactive elements in every theme
- `--focus-ring` token used consistently

### 10. Test persistence and responsive behavior
- Switch theme, reload page, theme should persist
- Test all themes at 375px, 768px, 1024px, 1440px
- Check no horizontal overflow or clipped content
- Run build: `npm run build`
- Run lint: `npm run lint`
