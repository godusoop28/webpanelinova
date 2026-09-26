/**
 * Reglas anti-SSRF para leer enlaces que manda un cliente. Puro (sin red):
 * lib/services/link-fetch.service.ts las aplica antes de cada petición y
 * en cada redirección.
 */

/** true si la IP (v4 o v6) es privada, local, reservada o de metadatos de nube. */
export function isPrivateAddress(address: string): boolean {
  const ip = address.trim().toLowerCase().replace(/^\[|\]$/g, "");

  const v4Mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(ip);
  if (v4Mapped) return isPrivateAddress(v4Mapped[1]);

  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true; // link-local / metadatos
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a === 192 && b === 0) return true;
    if (a === 198 && (b === 18 || b === 19)) return true;
    if (a >= 224) return true; // multicast / reservado
    return false;
  }

  if (ip === "::" || ip === "::1") return true;
  if (ip.startsWith("fe80") || ip.startsWith("fc") || ip.startsWith("fd")) return true;
  if (ip.startsWith("ff")) return true;
  if (ip.includes(":")) return false;
  // Ni IPv4 ni IPv6 reconocible: no es seguro.
  return true;
}

/** Dominio permitido explícitamente (coincidencia exacta o subdominio). */
export function isAllowedHost(hostname: string, allowedDomains: string[]): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  return allowedDomains.some((domain) => {
    const d = domain.toLowerCase().trim();
    return d.length > 0 && (host === d || host.endsWith(`.${d}`));
  });
}

export function checkFetchableUrl(rawUrl: string, allowedDomains: string[]): { ok: true; url: URL } | { ok: false; reason: string } {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false, reason: "invalid_url" };
  }
  if (url.protocol !== "https:") return { ok: false, reason: "only_https" };
  if (url.username || url.password) return { ok: false, reason: "credentials_in_url" };
  if (url.port && url.port !== "443") return { ok: false, reason: "port_not_allowed" };
  if (!isAllowedHost(url.hostname, allowedDomains)) return { ok: false, reason: "domain_not_supported" };
  return { ok: true, url };
}
