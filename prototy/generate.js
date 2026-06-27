// Lovalte loyalty-card prototype — builds a SIGNED .pkpass you can add to Apple Wallet.
//
//   1) Put your Apple certs in ./certs   (see README.md, steps 1-4)
//   2) Edit pass.json: passTypeIdentifier + teamIdentifier  (README step 5)
//   3) npm install && npm run generate   ->   lovalte.pkpass
//
const fs = require("fs");
const path = require("path");
const { solidPng } = require("./lib/png");

const ROOT = __dirname;
const CERT_DIR = path.join(ROOT, "certs");

// --- Validate inputs at the boundary: fail loud, never half-sign. ---
const needed = ["wwdr.pem", "signerCert.pem", "signerKey.pem"];
const missing = needed.filter((f) => !fs.existsSync(path.join(CERT_DIR, f)));
if (missing.length) {
  console.error("\nMissing cert file(s) in ./certs:  " + missing.join(", "));
  console.error("Create them by following README.md steps 1-4, then re-run.\n");
  process.exit(1);
}

const passJson = JSON.parse(fs.readFileSync(path.join(ROOT, "pass.json"), "utf8"));
if (
  passJson.passTypeIdentifier.includes("REPLACE") ||
  passJson.teamIdentifier.includes("REPLACE")
) {
  console.error("\nEdit pass.json first: set passTypeIdentifier + teamIdentifier to match your");
  console.error("certificate (README step 5). They MUST match or Wallet rejects the pass.\n");
  process.exit(1);
}

// Loaded after validation so a missing cert gives the friendly message above,
// not a module-not-found stack.
const { PKPass } = require("passkit-generator");

// --- Placeholder images (solid colors) so the prototype ships no binaries. ---
const icon = solidPng(87, 87, [44, 28, 14]);
const logo = solidPng(480, 150, [255, 245, 230]);
const strip = solidPng(1125, 432, [60, 40, 20]);

const pass = new PKPass(
  {
    "pass.json": Buffer.from(JSON.stringify(passJson)),
    "icon.png": icon,
    "icon@2x.png": icon,
    "icon@3x.png": icon,
    "logo.png": logo,
    "logo@2x.png": logo,
    "logo@3x.png": logo,
    "strip.png": strip,
    "strip@2x.png": strip,
    "strip@3x.png": strip,
  },
  {
    wwdr: fs.readFileSync(path.join(CERT_DIR, "wwdr.pem")),
    signerCert: fs.readFileSync(path.join(CERT_DIR, "signerCert.pem")),
    signerKey: fs.readFileSync(path.join(CERT_DIR, "signerKey.pem")),
    signerKeyPassphrase: process.env.PASS_KEY_PASSPHRASE, // undefined if key has no passphrase
  }
);

const out = path.join(ROOT, "lovalte.pkpass");
fs.writeFileSync(out, pass.getAsBuffer());
console.log("\nOK — wrote " + out);
console.log("Get it onto your iPhone (README step 7) and tap to add it to Wallet.\n");
