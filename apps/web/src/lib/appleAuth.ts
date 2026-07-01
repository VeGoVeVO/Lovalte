import { Capacitor } from "@capacitor/core";
import { SignInWithApple } from "@capacitor-community/apple-sign-in";

declare const __APPLE_SIGN_IN_NATIVE_CLIENT_ID__: string;
declare const __APPLE_SIGN_IN_WEB_CLIENT_ID__: string;

export type AppleAuthPayload = {
  identityToken: string;
  nonce: string;
};

export async function requestAppleIdentity(): Promise<AppleAuthPayload> {
  const nonce = makeNonce();
  const native = Capacitor.isNativePlatform();
  const result = await SignInWithApple.authorize({
    clientId: native ? __APPLE_SIGN_IN_NATIVE_CLIENT_ID__ : __APPLE_SIGN_IN_WEB_CLIENT_ID__,
    redirectURI: native ? `${window.location.origin}/login` : "https://lovalte.com/login",
    scopes: "email name",
    nonce,
  });

  return {
    identityToken: result.response.identityToken,
    nonce,
  };
}

function makeNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
