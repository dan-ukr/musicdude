/** Escape hatch for non-component code (alerts, errors). Components use useT(). */
let globalT: (phrase: string) => string = (s) => s;

export function setGlobalT(t: (phrase: string) => string) {
  globalT = t;
}

export function tGlobal(phrase: string): string {
  return globalT(phrase);
}
