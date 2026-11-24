// Reveal car cards on scroll
const observerOptions = { threshold: 0.1 };

const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      entry.target.style.opacity = '1';
      entry.target.style.transform = 'translateY(0)';
    }
  });
}, observerOptions);

document.querySelectorAll('.car-card').forEach((card) => {
  card.style.opacity = '0';
  card.style.transform = 'translateY(20px)';
  card.style.transition = 'all 0.6s ease-out';
  observer.observe(card);
});

// Fallback: replace any image that fails to load with a local placeholder
const PLACEHOLDER = '/img/car-placeholder.svg';

document.querySelectorAll('img').forEach((img) => {
  img.addEventListener('error', () => {
    if (img.src.endsWith(PLACEHOLDER)) return;
    img.src = PLACEHOLDER;
    img.alt = img.alt || 'Image unavailable';
  });
});

// ===== Dark / Light Mode =====
const THEME_KEY = 'awesome-cars-theme';
const html = document.documentElement;
const themeToggle = document.getElementById('theme-toggle');
const themeIcon = themeToggle?.querySelector('.theme-icon');
const themeColorMeta = document.querySelector('meta[name="theme-color"]');

const LIGHT = 'light';
const DARK = 'dark';

function getSystemTheme() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? DARK : LIGHT;
}

function applyTheme(theme) {
  html.setAttribute('data-theme', theme);
  if (themeIcon) themeIcon.textContent = theme === DARK ? '☀️' : '🌙';
  if (themeColorMeta) {
    themeColorMeta.setAttribute('content', theme === DARK ? '#0f172a' : '#ffffff');
  }
  localStorage.setItem(THEME_KEY, theme);
}

function loadTheme() {
  const stored = localStorage.getItem(THEME_KEY);
  const theme = stored || getSystemTheme();
  applyTheme(theme);
}

if (themeToggle) {
  themeToggle.addEventListener('click', () => {
    const current = html.getAttribute('data-theme') || LIGHT;
    applyTheme(current === LIGHT ? DARK : LIGHT);
  });
}

loadTheme();