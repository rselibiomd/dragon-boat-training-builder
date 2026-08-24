(() => {
  const official = '/dragon-boat-training-builder/kdbc-logo-official.svg';
  const apply = () => {
    document.querySelectorAll('img').forEach((img) => {
      const src = img.getAttribute('src') || '';
      if (src.includes('kdbc-logo.jpeg') || src.includes('app-icon.svg')) {
        img.setAttribute('src', official);
        img.style.objectFit = 'contain';
        img.style.background = '#fff';
      }
    });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply, { once: true });
  else apply();
  new MutationObserver(apply).observe(document.documentElement, { childList: true, subtree: true });
})();
