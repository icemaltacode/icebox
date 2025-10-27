import crypto from 'node:crypto';

const uppercase = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const lowercase = 'abcdefghijkmnopqrstuvwxyz';
const numbers = '23456789';
const symbols = '!@#$%^&*';
const allChars = `${uppercase}${lowercase}${numbers}${symbols}`;

const pick = (source: string) => source[crypto.randomInt(0, source.length)];

export const generateTemporaryPassword = (length = 16): string => {
  const requiredChars = [
    pick(uppercase),
    pick(lowercase),
    pick(numbers),
    pick(symbols)
  ];

  const remainingLength = Math.max(length - requiredChars.length, 0);
  const remaining = Array.from({ length: remainingLength }, () => pick(allChars));

  const passwordChars = [...requiredChars, ...remaining];

  for (let i = passwordChars.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(0, i + 1);
    [passwordChars[i], passwordChars[j]] = [passwordChars[j], passwordChars[i]];
  }

  return passwordChars.join('');
};
