// SIWE (EIP-4361) client helper. Talks to the relay backend
// (/api/auth/{nonce,verify,me,signout}) and uses wagmi's wallet client to
// sign the SIWE message. We deliberately avoid the official `siwe` package
// here — the message format is small and we'd rather not ship its
// dependencies (it also bundles a Node-style `Buffer` polyfill that bloats
// the build). The backend uses `siwe` for verification.

import { RELAY_API_BASE } from "./config";

export interface SiweFields {
  domain: string;
  address: string;
  uri: string;
  version: "1";
  chainId: number;
  nonce: string;
  issuedAt: string;
  statement: string;
  expirationTime?: string;
}

export function buildSiweMessage(f: SiweFields): string {
  const header = `${f.domain} wants you to sign in with your Ethereum account:`;
  const lines = [
    header,
    f.address,
    "",
    f.statement,
    "",
    `URI: ${f.uri}`,
    `Version: ${f.version}`,
    `Chain ID: ${f.chainId}`,
    `Nonce: ${f.nonce}`,
    `Issued At: ${f.issuedAt}`,
  ];
  if (f.expirationTime) lines.push(`Expiration Time: ${f.expirationTime}`);
  return lines.join("\n");
}

export async function fetchSiweNonce(): Promise<string> {
  const res = await fetch(`${RELAY_API_BASE}/api/auth/nonce`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error(`nonce ${res.status}`);
  const data = (await res.json()) as { nonce: string };
  return data.nonce;
}

export async function verifySiwe(
  message: string,
  signature: `0x${string}`,
): Promise<{ address: string; chainId: number }> {
  const res = await fetch(`${RELAY_API_BASE}/api/auth/verify`, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message, signature }),
  });
  if (!res.ok) throw new Error(`verify ${res.status}`);
  return (await res.json()) as { address: string; chainId: number };
}

export async function fetchSiweSession(): Promise<{ address: string } | null> {
  const res = await fetch(`${RELAY_API_BASE}/api/auth/me`, {
    credentials: "include",
  });
  if (!res.ok) return null;
  return (await res.json()) as { address: string };
}

export async function siweSignOut(): Promise<void> {
  await fetch(`${RELAY_API_BASE}/api/auth/signout`, {
    method: "POST",
    credentials: "include",
  });
}
