const KEY = 'cartao-intro-visto';
const TOTAL = 4300; // ms desde o início do carregamento até o portão abrir

/**
 * Introdução: o portão da fábrica se abre sobre o cartão.
 * Um script no <head> decide antes do primeiro quadro se ela toca
 * (classe `intro-on` em <html>), então ela aparece imediatamente, sem
 * esperar este módulo. Aqui só tratamos o fim: tempo, pular, limpeza.
 */
export function playIntro(): Promise<void> {
  const html = document.documentElement;
  const el = document.querySelector<HTMLElement>('[data-intro]');
  if (!el || !html.classList.contains('intro-on')) {
    el?.remove();
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { sessionStorage.setItem(KEY, '1'); } catch { /* sandbox sem storage */ }
      el.classList.add('intro--out');
      html.classList.add('intro-done'); // libera a rolagem enquanto o portão abre
      resolve();
      window.setTimeout(() => {
        el.remove();
        html.classList.remove('intro-on', 'intro-done');
      }, 950);
      window.removeEventListener('keydown', onKey);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') finish(); };
    // As animações CSS começaram no primeiro quadro: desconta o tempo já passado.
    const timer = window.setTimeout(finish, Math.max(300, TOTAL - performance.now()));
    el.addEventListener('click', finish);
    window.addEventListener('keydown', onKey);
  });
}

/** Voltar pelo histórico (bfcache) não deve reabrir a introdução. */
window.addEventListener('pageshow', (e) => {
  if (e.persisted) {
    document.documentElement.classList.remove('intro-on');
    document.querySelector('[data-intro]')?.remove();
  }
});
