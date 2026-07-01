import { SignInWithApple } from "@capacitor-community/apple-sign-in";

declare const __APPLE_SIGN_IN_CLIENT_ID__: string;

export type AppleAuthPayload = {
  identityToken: string;
  nonce: string;
};

export async function requestAppleIdentity(): Promise<AppleAuthPayload> {
  const nonce = makeNonce();
  const result = await SignInWithApple.authorize({
    clientId: __APPLE_SIGN_IN_CLIENT_ID__,
    redirectURI: `${window.location.origin}/login`,
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
