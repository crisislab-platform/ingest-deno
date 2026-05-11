const subtle = globalThis.crypto?.subtle;

if (!subtle) {
  throw new Error("WebCrypto crypto.subtle is not available in this runtime");
}

const textEncoder = new TextEncoder();

function base64url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);

  const base64 =
    typeof btoa === "function"
      ? btoa(binary)
      : Buffer.from(bytes).toString("base64");

  return base64
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

async function jwkThumbprint(publicJwk) {
  // RFC 7638 canonical member order for EC public JWKs:
  // crv, kty, x, y
  const canonical = JSON.stringify({
    crv: publicJwk.crv,
    kty: publicJwk.kty,
    x: publicJwk.x,
    y: publicJwk.y,
  });

  const digest = await subtle.digest(
    "SHA-256",
    textEncoder.encode(canonical),
  );

  return base64url(new Uint8Array(digest));
}

function publicShape(jwk, kid) {
  return {
    use: "sig",
    kty: "EC",
    kid,
    crv: jwk.crv,
    x: jwk.x,
    y: jwk.y,

    // Optional. Add this only if your app expects it:
    // alg: "ES256",
  };
}

function privateShape(jwk, kid) {
  return {
    use: "sig",
    kty: "EC",
    kid,
    crv: jwk.crv,
    x: jwk.x,
    y: jwk.y,
    d: jwk.d,

    // Optional. Add this only if your app expects it:
    // alg: "ES256",
  };
}

const { publicKey, privateKey } = await subtle.generateKey(
  {
    name: "ECDSA",
    namedCurve: "P-256",
  },
  true, // must be true so the private key can be exported
  ["sign", "verify"],
);

const rawPublicJwk = await subtle.exportKey("jwk", publicKey);
const rawPrivateJwk = await subtle.exportKey("jwk", privateKey);

const kid = await jwkThumbprint(rawPublicJwk);

const publicJwk = publicShape(rawPublicJwk, kid);
const privateJwk = privateShape(rawPrivateJwk, kid);

console.log("Private:");
console.log(JSON.stringify(privateJwk));

console.log("\nPublic:");
console.log(JSON.stringify(publicJwk));

console.log("\n.env:");
console.log(`PRIVATE_JWK='${JSON.stringify(privateJwk)}'`);
console.log(`PUBLIC_JWK='${JSON.stringify(publicJwk)}'`);