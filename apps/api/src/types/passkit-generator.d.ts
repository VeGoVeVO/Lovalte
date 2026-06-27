/**
 * Minimal type declaration for passkit-generator v3.5.7.
 * These stubs allow the code to compile before `npm install` is run.
 * The real types ship with the package.
 */
declare module "passkit-generator" {
  interface PKPassCerts {
    signerCert?: Buffer;
    signerKey?: Buffer;
    wwdr?: Buffer;
    signerKeyPassphrase?: string;
  }

  export class PKPass {
    props: Record<string, unknown>;
    constructor(buffers: Record<string, Buffer>, certificates: PKPassCerts);
    getAsBuffer(): Promise<Buffer>;
  }
}
