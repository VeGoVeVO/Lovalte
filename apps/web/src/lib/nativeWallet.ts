import { Capacitor, registerPlugin } from "@capacitor/core";
import { apiUrl, getSessionToken } from "./api";

interface LovalteWalletPlugin {
  canAddPasses(): Promise<{ value: boolean }>;
  addPass(options: { url: string; token?: string }): Promise<{ presented: boolean }>;
}

const LovalteWallet = registerPlugin<LovalteWalletPlugin>("LovalteWallet");

export async function addAppleWalletPass(path: string): Promise<void> {
  const url = apiUrl(path);
  if (Capacitor.getPlatform() === "ios") {
    await LovalteWallet.addPass({ url, token: getSessionToken() ?? undefined });
    return;
  }

  window.location.assign(url);
}
