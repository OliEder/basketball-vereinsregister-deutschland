function applyTheme(theme) {
  const sun = document.getElementById('theme-icon-sun');
  const moon = document.getElementById('theme-icon-moon');
  const btn = document.getElementById('theme-toggle-btn');
  if (theme === 'light') {
    document.documentElement.classList.add('light');
    if (sun) sun.style.display = 'none';
    if (moon) moon.style.display = '';
    if (btn) btn.setAttribute('aria-label', 'Zum Dark-Modus wechseln');
  } else {
    document.documentElement.classList.remove('light');
    if (sun) sun.style.display = '';
    if (moon) moon.style.display = 'none';
    if (btn) btn.setAttribute('aria-label', 'Zum Light-Modus wechseln');
  }
}

function initTheme() {
  const stored = localStorage.getItem('theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const theme = stored || (prefersDark ? 'dark' : 'light');
  applyTheme(theme);
}

function toggleTheme() {
  const current = document.documentElement.classList.contains('light') ? 'light' : 'dark';
  const next = current === 'dark' ? 'light' : 'dark';
  localStorage.setItem('theme', next);
  applyTheme(next);
}
