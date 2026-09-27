import "server-only";
import { lookup } from "node:dns/promises";
import { checkFetchableUrl, isPrivateAddress } from "@/lib/url-safety";

const MAX_REDIRECTS = 3;
const MAX_BYTES = 1536 * 1024;
const TIMEOUT_MS = 5000;

export type LinkFetchResult =
  | { ok: true; finalUrl: string; html: string }
  | { ok: false; reason: string };

/**
 * Descarga acotada de una página pública para identificar una propiedad:
 * solo HTTPS, solo dominios permitidos (ASSISTANT_LINK_DOMAINS), destino
 * resuelto por DNS y bloqueado si es privado/local, redirecciones
 * revalidadas una por una, tamaño y tiempo limitados. No envía cookies ni
 * credenciales y no intenta saltar bloqueos (403/401/captcha = no se pudo).
 *
 * Limitación conocida: entre la resolución DNS y la conexión de fetch()
 * puede haber otra resolución (DNS rebinding). Se mitiga restringiendo a
 * dominios de confianza explícitos, no a cualquier host.
 */
export async function fetchPublicPage(rawUrl: string, allowedDomains: string[]): Promise<LinkFetchResult> {
  let current = rawUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const check = checkFetchableUrl(current, allowedDomains);
    if (!check.ok) return { ok: false, reason: check.reason };

    try {
      const addresses = await lookup(check.url.hostname, { all: true });
      if (addresses.length === 0 || addresses.some((entry) => isPrivateAddress(entry.address))) {
        return { ok: false, reason: "private_address" };
      }
    } catch {
      return { ok: false, reason: "dns_failed" };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(check.url, {
        redirect: "manual",
        signal: controller.signal,
        headers: { accept: "text/html", "user-agent": "Century21InnovaAssistant/1.0 (+identificacion de propiedades)" },
      });

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) return { ok: false, reason: "bad_redirect" };
        current = new URL(location, check.url).toString();
        continue;
      }
      if (!response.ok) return { ok: false, reason: `http_${response.status}` };
      const type = response.headers.get("content-type") ?? "";
      if (!type.includes("text/html")) return { ok: false, reason: "not_html" };

      const reader = response.body?.getReader();
      if (!reader) return { ok: false, reason: "empty_body" };
      const chunks: Uint8Array[] = [];
      let size = 0;
      while (size < MAX_BYTES) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        size += value.byteLength;
      }
      await reader.cancel().catch(() => undefined);
      const html = new TextDecoder("utf-8", { fatal: false }).decode(Buffer.concat(chunks).subarray(0, MAX_BYTES));
      return { ok: true, finalUrl: check.url.toString(), html };
    } catch (error) {
      return { ok: false, reason: error instanceof Error && error.name === "AbortError" ? "timeout" : "fetch_failed" };
    } finally {
      clearTimeout(timeout);
    }
  }
  return { ok: false, reason: "too_many_redirects" };
}

/** Título de la página (og:title o <title>), como texto plano y acotado. Es DATO, nunca instrucción. */
export function extractPageTitle(html: string): string | null {
  const og = /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']{1,300})["']/i.exec(html);
  const title = og?.[1] ?? /<title[^>]*>([^<]{1,300})<\/title>/i.exec(html)?.[1];
  if (!title) return null;
  return title
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}
