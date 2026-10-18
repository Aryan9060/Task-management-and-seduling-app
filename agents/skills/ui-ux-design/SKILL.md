---
name: ui-ux-design
description: Improve the visual design, accessibility, and usability of the DaliTak web application.
---

# UI/UX Design Skill

## Purpose
Improve the visual design, accessibility, and usability of the DaliTak web application while preserving all existing functionality.

## When to use
- Before making any visual changes to components, pages, or stylesheets
- When reviewing color contrast, typography, spacing, or layout
- When adding new UI components or modifying existing ones

## Procedures

### 1. Inspect the current interface
- Read `client/src/index.css` for existing design tokens and component styles
- Read `client/src/components/Layout.jsx` for the app shell structure
- Read each page under `client/src/pages/` to understand current UI patterns
- Check `client/src/components/` for reusable components

### 2. Identify issues
- Check contrast ratios: text on backgrounds should meet WCAG AA (4.5:1 for normal text, 3:1 for large text)
- Verify focus indicators are visible on all interactive elements
- Check spacing consistency (use multiples of 4px/0.25rem)
- Review typography hierarchy (h1-h6, body, small, caption)
- Test keyboard navigation (Tab order, Enter/Space activation)
- Test on mobile (375px), tablet (768px), and desktop (1024px+)

### 3. Prefer reusable components and design tokens
- Use CSS custom properties (--text, --bg, --primary, etc.) instead of hardcoded values
- Reuse existing button variants: btn, btn-primary, btn-ghost, btn-danger, btn-small
- Reuse existing layout patterns: panel, page-content, page-header
- Add new components under `client/src/components/`

### 4. Maintain consistent visual language
- All buttons should share the same padding, border-radius, and focus styles
- All inputs should share the same border, focus-ring, and disabled states
- All cards should use the same shadow and border tokens
- Primary actions use --primary, destructive actions use --danger

### 5. Improve loading, empty, error, and hover states
- Loading: use `.page-loading` or `.empty-state` patterns
- Empty: show illustrative text + primary action button
- Error: use `.alert alert-error` with clear messaging
- Hover: subtle background change, no layout shift

### 6. Ensure accessible controls
- All buttons need meaningful text or aria-label
- All form inputs need associated labels
- Focus rings: `var(--focus-ring)` or `outline: 2px solid var(--primary)`
- Skip links for keyboard users
- ARIA attributes on custom widgets (dialogs, dropdowns, tabs)

### 7. Use animation sparingly
- Respect `prefers-reduced-motion` media query
- Transitions should be 0.25s or less
- No autoplaying animations or carousels
- Subtle hover and focus transitions only

### 8. Do not replace working functionality
- Never change API endpoints or request/response shapes
- Never remove existing routes or page components
- Preserve authentication flows and protected routes
- Keep existing business logic intact

### 9. Compare against design reference
- Review reference PDFs in Desktop folder
- Match color palette, spacing, and component styling from reference
- Maintain DaliTak brand identity (logo, primary color #4f46e5)

### 10. Verify in the running application
- Start dev server: `cd client && npm run dev`
- Navigate to `http://localhost:5173`
- Test all pages, all themes, all viewports
- Check browser console for errors
- Run lint: `npm run lint`
- Run build: `npm run build`
