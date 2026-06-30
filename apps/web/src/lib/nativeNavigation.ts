import { App as CapacitorApp } from "@capacitor/app";
import { Capacitor, type PluginListenerHandle } from "@capacitor/core";

function normalizeNextPath(path: string | null | undefined): string | null {
  if (!path || !path.startsWith("/")) return null;
  if (path.startsWith("//")) return null;
  return path;
}

export function resolveNextPath(search: string, fallback = "/app"): string {
  const params = new URLSearchParams(search);
  return normalizeNextPath(params.get("next")) ?? fallback;
}

function routeFromIncomingUrl(rawUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }

  const next = normalizeNextPath(url.searchParams.get("next"));
  if (next) return next;

  if (url.protocol === "lovalte:") {
    if (url.host === "app") return normalizeNextPath(`/app${url.pathname}`);
    if (url.host === "login") return "/login";
    return normalizeNextPath(url.pathname);
  }

  return normalizeNextPath(`${url.pathname}${url.search}${url.hash}`);
}

export async function registerNativeUrlHandler(
  navigate: (path: string) => void,
): Promise<PluginListenerHandle | null> {
  if (Capacitor.getPlatform() === "web") return null;

  return CapacitorApp.addListener("appUrlOpen", ({ url }) => {
    const route = routeFromIncomingUrl(url);
    if (route) navigate(route);
  });
}
