import { isIP } from 'node:net';

export type TrustProxySetting = false | string[];

const FORBIDDEN_VALUES = new Set([
  'false',
  'true',
  '0.0.0.0/0',
  '::/0',
  'uniquelocal',
  'linklocal',
]);

function isPrivateAddressOrCidr(value: string): boolean {
  const [address, prefix, ...extra] = value.split('/');
  const version = isIP(address);

  if (extra.length > 0 || version === 0) return false;
  if (prefix !== undefined) {
    if (!/^\d+$/.test(prefix)) return false;
    const numericPrefix = Number(prefix);
    if (numericPrefix < 0 || numericPrefix > (version === 4 ? 32 : 128)) return false;
  }

  if (version === 4) {
    const [first, second] = address.split('.').map(Number);
    return (
      first === 10 ||
      first === 127 ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168)
    );
  }

  const normalized = address.toLowerCase();
  return (
    normalized === '::1' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd')
  );
}

export function resolveTrustProxy(
  nodeEnv = process.env.NODE_ENV,
  rawValue = process.env.TRUST_PROXY,
): TrustProxySetting {
  if (!rawValue?.trim()) {
    if (nodeEnv === 'production') {
      throw new Error('TRUST_PROXY is required in production');
    }

    return false;
  }

  const trustedAddresses = rawValue
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  if (
    trustedAddresses.length === 0 ||
    trustedAddresses.some(
      (value) =>
        FORBIDDEN_VALUES.has(value.toLowerCase()) ||
        /^\d+$/.test(value) ||
        !isPrivateAddressOrCidr(value),
    )
  ) {
    throw new Error('TRUST_PROXY must contain only explicit private proxy addresses or CIDRs');
  }

  return trustedAddresses;
}
