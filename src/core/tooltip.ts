const tip = document.querySelector<HTMLElement>('[data-tip]')!;

export function showTip(html: string, x: number, y: number) {
  tip.innerHTML = html;
  tip.hidden = false;
  const r = tip.getBoundingClientRect();
  const left = Math.min(window.innerWidth - r.width - 10, Math.max(10, x + 14));
  const top = y + r.height + 24 > window.innerHeight ? y - r.height - 14 : y + 16;
  tip.style.left = `${left}px`;
  tip.style.top = `${top}px`;
}

export function hideTip() {
  tip.hidden = true;
}
