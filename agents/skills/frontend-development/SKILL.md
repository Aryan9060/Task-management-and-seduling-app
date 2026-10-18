---
name: frontend-development
description: Safely implement and maintain frontend features in the existing DaliTak project.
---

# Frontend Development Skill

## Purpose
Safely implement and maintain frontend features in DaliTak while preserving all existing business logic, routes, APIs, and authentication.

## When to use
- Before creating or modifying any React component, page, or hook
- When adding new API client calls or changing existing ones
- Before running build, lint, or test commands

## Procedures

### 1. Detect framework and package manager
- Framework: React 19 with Vite (`client/package.json`)
- Router: React Router DOM 7 (`react-router-dom`)
- HTTP client: Axios (`client/src/api/client.js`)
- Styling: CSS custom properties (`client/src/index.css`)
- Linter: oxlint (`client/package.json` devDependencies)
- Package manager: npm (package-lock.json present)

### 2. Inspect relevant components before changes
- Read the full component file before editing
- Check props, state, effects, and event handlers
- Read parent components that use this component
- Read related test files if they exist

### 3. Reuse existing utilities and dependencies
- API calls: use `api` from `client/src/api/client.js` (has auth + refresh interceptors)
- Date formatting: use functions from `client/src/utils/datetime.js`
- Auth: use `useAuth()` from `client/src/context/AuthContext.jsx`
- Timer: use `useTimer()` from `client/src/context/TimerContext.jsx`
- Theme: use `useTheme()` from `client/src/context/ThemeContext.jsx`
- CSS tokens: use `var(--text)`, `var(--primary)`, etc. from index.css

### 4. Follow established naming conventions
- Components: PascalCase, `.jsx` extension (`TaskItem.jsx`, `Layout.jsx`)
- Hooks: camelCase with `use` prefix (`useAuth`, `useTimer`, `useTheme`)
- Context: PascalCase with Provider suffix (`AuthProvider`, `ThemeProvider`)
- CSS classes: kebab-case (`.btn-primary`, `.page-content`, `.sidebar-nav-link`)
- Files: kebab-case for utils (`datetime.js`, `calendar.js`)

### 5. Keep UI logic separate from styling
- Component logic in `.jsx` files
- Styling in `client/src/index.css` using CSS classes
- No inline styles except for dynamic values
- Use CSS custom properties for theming, not hardcoded colors

### 6. Preserve routes, APIs, authentication, and state
- Never modify `client/src/App.jsx` route paths without updating all references
- Never change API endpoint URLs or method types
- Never remove `requireAuth` middleware or ProtectedRoute
- Preserve `AuthProvider`, `TimerProvider`, `ThemeProvider` wrapping
- Keep `withCredentials: true` on Axios instance for cookie-based auth

### 7. Avoid unnecessary dependencies and broad rewrites
- Do not add npm packages unless absolutely necessary
- Do not introduce Tailwind, Styled Components, or other CSS frameworks
- Do not rewrite entire pages when targeted edits suffice
- Use existing React 19 features (no class components unless necessary)

### 8. Inspect Git diffs before finishing
- `git diff` to review all changes
- `git status --short` to see modified/untracked files
- Ensure no unrelated files were modified
- Ensure no secrets or environment variables were committed

### 9. Run available lint, build, and test scripts
- Lint: `cd client && npx oxlint`
- Build: `cd client && npx vite build`
- Dev: `cd client && npm run dev` (requires server on port 5000)
- Preview: `cd client && npm run preview`

### 10. Report failures honestly
- Never claim a test passed unless it actually ran successfully
- Report build errors, lint warnings, and runtime issues
- Document any manual steps needed
- Ask before destructive operations or global installations
