function applyTheme(theme) {
  // DSS: data-theme="light|dark" auf <html>
  document.documentElement.setAttribute('data-theme', theme);
  // Update button icons if DOM is ready
  const sun = document.getElementById('theme-icon-sun');
  const moon = document.getElementById('theme-icon-moon');
  const btn = document.getElementById('theme-toggle-btn');
  if (sun) sun.style.display = theme === 'light' ? 'none' : '';
  if (moon) moon.style.display = theme === 'light' ? '' : 'none';
  if (btn) btn.setAttribute('aria-label', theme === 'light' ? 'Zum Dark-Modus wechseln' : 'Zum Light-Modus wechseln');
}

function initTheme() {
  let stored = null;
  try { stored = localStorage.getItem('theme'); } catch (e) { /* Speicher blockiert */ }
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const theme = stored || (prefersDark ? 'dark' : 'light');
  applyTheme(theme);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() { applyTheme(theme); });
  }
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  const next = current === 'dark' ? 'light' : 'dark';
  try { localStorage.setItem('theme', next); } catch (e) { /* Speicher blockiert */ }
  applyTheme(next);
}
