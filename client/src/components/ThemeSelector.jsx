import { useCallback } from 'react';
import { useTheme } from '../context/ThemeContext.jsx';

const THEME_LABELS = {
  light: 'Light',
  dark: 'Dark',
  purple: 'Purple',
  cyberpunk: 'Cyberpunk',
  forest: 'Forest',
  sunset: 'Sunset',
};

const THEME_ICONS = {
  light: '☀️',
  dark: '🌙',
  purple: '🟣',
  cyberpunk: '⚡',
  forest: '🌲',
  sunset: '🌅',
};

export default function ThemeSelector() {
  const { theme, setTheme, themes } = useTheme();

  const handleSelect = useCallback(
    (nextTheme) => {
      setTheme(nextTheme);
    },
    [setTheme]
  );

  return (
    <div className="theme-selector" role="listbox" aria-label="Select theme">
      <button
        type="button"
        className="theme-trigger btn btn-ghost btn-small"
        aria-haspopup="true"
        aria-expanded="false"
        onClick={(e) => {
          e.stopPropagation();
          const panel = e.currentTarget.nextElementSibling;
          panel?.classList.toggle('open');
        }}
      >
        <span className="theme-icon">{THEME_ICONS[theme]}</span>
        <span className="theme-label">{THEME_LABELS[theme]}</span>
      </button>
      <div className="theme-panel">
        {themes.map((t) => (
          <button
            key={t}
            type="button"
            className={`theme-option ${
              t === theme ? 'theme-option-active' : ''
            }`}
            aria-selected={t === theme}
            onClick={() => {
              handleSelect(t);
              document
                .querySelector('.theme-panel')
                ?.classList.remove('open');
            }}
          >
            <span className="theme-option-icon">{THEME_ICONS[t]}</span>
            <span className="theme-option-label">{THEME_LABELS[t]}</span>
            {t === theme && <span className="theme-option-check">✓</span>}
          </button>
        ))}
      </div>
    </div>
  );
}