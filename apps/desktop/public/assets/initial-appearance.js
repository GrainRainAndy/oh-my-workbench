// Apply the saved scheme before the renderer and its styles are loaded.
(() => {
  let appearance = 'light';
  try {
    const saved = localStorage.getItem('workbench.appearance');
    if (saved === 'dark' || saved === 'system') appearance = saved;
  } catch {
    // A fresh session can still render with the default palette.
  }
  document.documentElement.dataset.appearance = appearance;
})();
