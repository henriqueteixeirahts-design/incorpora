/**
 * Validação e formatação de documentos e contatos brasileiros. Sem
 * dependência de biblioteca externa — os algoritmos de CPF/CNPJ são curtos
 * e estáveis (não mudam), não compensa trazer um pacote pra isso.
 */

export function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

/** Sequências que passam no algoritmo de dígito verificador mas são inválidas na prática (ex.: 111.111.111-11). */
function isAllSameDigit(digits: string): boolean {
  return /^(\d)\1+$/.test(digits);
}

export function isValidCpf(value: string): boolean {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11 || isAllSameDigit(cpf)) return false;

  const digits = cpf.split("").map(Number);
  const calcCheckDigit = (length: number) => {
    let sum = 0;
    for (let i = 0; i < length; i++) sum += digits[i] * (length + 1 - i);
    const remainder = (sum * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };

  return calcCheckDigit(9) === digits[9] && calcCheckDigit(10) === digits[10];
}

export function isValidCnpj(value: string): boolean {
  const cnpj = onlyDigits(value);
  if (cnpj.length !== 14 || isAllSameDigit(cnpj)) return false;

  const digits = cnpj.split("").map(Number);
  const calcCheckDigit = (length: number) => {
    const weights = length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let sum = 0;
    for (let i = 0; i < length; i++) sum += digits[i] * weights[i];
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };

  return calcCheckDigit(12) === digits[12] && calcCheckDigit(13) === digits[13];
}

export function formatCpf(value: string): string {
  const digits = onlyDigits(value).slice(0, 11);
  return digits
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

export function formatCnpj(value: string): string {
  const digits = onlyDigits(value).slice(0, 14);
  return digits
    .replace(/(\d{2})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1/$2")
    .replace(/(\d{4})(\d{1,2})$/, "$1-$2");
}

export function formatDocument(value: string, type: "INDIVIDUAL" | "COMPANY"): string {
  return type === "COMPANY" ? formatCnpj(value) : formatCpf(value);
}

export function isValidDocument(value: string, type: "INDIVIDUAL" | "COMPANY"): boolean {
  return type === "COMPANY" ? isValidCnpj(value) : isValidCpf(value);
}

export function formatPhone(value: string): string {
  const digits = onlyDigits(value).slice(0, 11);
  if (digits.length <= 10) {
    return digits.replace(/(\d{2})(\d{4})(\d{0,4})/, (_, ddd, part1, part2) =>
      part2 ? `(${ddd}) ${part1}-${part2}` : ddd ? `(${ddd}) ${part1}` : ddd,
    );
  }
  return digits.replace(/(\d{2})(\d{5})(\d{0,4})/, (_, ddd, part1, part2) =>
    part2 ? `(${ddd}) ${part1}-${part2}` : `(${ddd}) ${part1}`,
  );
}

export function isValidBrazilianPhone(value: string): boolean {
  const digits = onlyDigits(value);
  if (digits.length !== 10 && digits.length !== 11) return false;
  const ddd = Number(digits.slice(0, 2));
  return ddd >= 11 && ddd <= 99;
}

export function formatCep(value: string): string {
  const digits = onlyDigits(value).slice(0, 8);
  return digits.replace(/(\d{5})(\d{1,3})/, "$1-$2");
}

export function isValidEmail(value: string): boolean {
  // Checagem simples de formato — a validação "de verdade" é receber o e-mail e confirmar.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}
