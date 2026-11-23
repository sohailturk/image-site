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