---
name: responsive-testing
description: Test DaliTak layout, navigation, themes, and interactions across viewports.
---

# Responsive Testing Skill

## Purpose
Test DaliTak layout, navigation, themes, and interactions on desktop, tablet, and mobile viewports.

## When to use
- After any layout or component changes
- When verifying theme behavior across viewports
- Before marking a feature as complete

## Procedures

### 1. Verify the app starts
- Backend: `cd server && npm start` (requires MongoDB on localhost:27017)
- Frontend: `cd client && npm run dev` (Vite on port 5173)
- Verify `http://localhost:5173` loads without console errors

### 2. Test desktop, tablet, and mobile viewports
- Mobile: 375px × 667px (iPhone SE)
- Tablet: 768px × 1024px (iPad)
- Desktop: 1024px × 768px and 1440px × 900px
- Check: sidebar collapses on mobile, topbar menu button appears
- Check: no horizontal overflow, no clipped cards, no overlapping text

### 3. Test navigation
- All NavLinks work and highlight active state
- Sidebar opens/closes on mobile (hamburger menu)
- Click outside closes sidebar and notification panel
- Breadcrumbs and back navigation work where applicable

### 4. Test forms, dialogs, and primary interactions
- Login/Register forms validate and submit
- TaskForm creates and edits tasks
- Timer start/stop works in all themes
- Manual time entry logs correctly
- Notification mark-as-read and mark-all-read work

### 5. Test all six themes and persistence
- Light, Dark, Purple, Cyberpunk, Forest, Sunset
- Theme selector opens and closes correctly
- Theme persists after page reload
- No flash of wrong theme on load
- Contrast is readable in all themes (WCAG AA minimum)

### 6. Check keyboard navigation and focus visibility
- Tab order is logical through all interactive elements
- Focus rings visible on all focused elements
- Enter/Space activates buttons and links
- Escape closes modals and dropdowns

### 7. Inspect browser console errors
- Open DevTools Console tab
- Check for JavaScript errors, failed network requests, React warnings
- Verify API calls succeed (200/201/204)
- Verify auth tokens are sent and refreshed

### 8. Fix regressions
- Revert changes that break existing functionality
- Check `git diff` for unintended modifications
- Test after each fix to confirm regression is resolved

### 9. Record actual results
- Document which themes were tested at which viewports
- Note any issues found and their severity
- Record manual steps that automated tests cannot cover

### 10. Document remaining limitations
- Features not yet tested
- Known issues or workarounds
- Browser-specific behavior observed
