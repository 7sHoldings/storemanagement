'use client';
import { createContext, useContext, useEffect } from 'react';

// The app has one look: the light 7s Vape Love theme. This provider stays so
// existing useTheme() callers keep working, but it always reports light.
const ThemeContext = createContext({ theme: 'light', resolvedTheme: 'light', changeTheme: () => {} });

export function ThemeProvider({ children }) {
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', 'light');
    try { localStorage.removeItem('7s-theme'); } catch { /* storage unavailable */ }
  }, []);
  return (
    <ThemeContext.Provider value={{ theme: 'light', resolvedTheme: 'light', changeTheme: () => {} }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
