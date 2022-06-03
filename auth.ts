function getCookie(cookieString: string, name: string) {
  const value = "; " + cookieString;
  const parts = value.split("; " + name + "=");
  try {
    if (parts.length == 2) {
      const vlu = parts.pop()!.split(";").shift()!;
      const decode_vlu = decodeURIComponent(vlu);
      const replace_vlu = decode_vlu.replace(/[+]/g, " ");
      return replace_vlu;
    } else return "";
  } catch (_e) {
    return "";
  }
}

let signingKey: CryptoKey;

async function getSigningKey() {
  if (signingKey) return signingKey;

  signingKey = await crypto.subtle.importKey(
    "jwk",
    {
      kty: "EC",
      use: "sig",
      crv: "P-256",
      x: "fU-zXhdtUa516B5FCZKssC8-RG_IYCRM6E-ZsnNRzhA",
      y: "-CBmt9x-hq8XpVusbvgdWTcXhF4krHRshgjfuFA_WcY",
      alg: "ES256",
    },
    {
      name: "ECDSA",
      namedCurve: "P-256",
    },
    false,
    ["verify"]
  );

  return signingKey;
}

export default async function authenticate(request: Request) {
  const token = (
    request.headers.get("Authorization") || request.headers.get("authorization")
  )?.substring(6);

  if (!token) return null;

  const [rawHeader, rawPayload, rawSignature] = token.trim().split(".");

  // console.log(rawHeader)

  // ID of the key that was used to sign the JWT
  // const { kid } = JSON.parse(atob(rawHeader))
  const key = await getSigningKey();

  const signature = atob(rawSignature.replace(/_/g, "/").replace(/-/g, "+"));
  const signatureBuf = new Uint8Array(
    Array.from(signature).map((c) => c.charCodeAt(0))
  );

  const content = new TextEncoder().encode([rawHeader, rawPayload].join("."));

  const payload = JSON.parse(atob(rawPayload));

  console.log(payload);

  if (
    !(await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      signatureBuf,
      content
    ))
  ) {
    console.log("Invalid signature");
  } else if (payload.iss !== "https://crisislab.org.nz") {
    console.log("Invalid issuer");
  } else if (!payload.aud.includes("shake_ingest")) {
    console.log("Invalid audience");
  } else if (!(payload.exp > Date.now() / 1000)) {
    console.log("Expired");
  }

  if (
    !(
      (await crypto.subtle.verify(
        { name: "ECDSA", hash: "SHA-256" },
        key,
        signatureBuf,
        content
      )) &&
      payload.iss === "https://crisislab.org.nz" &&
      payload.aud.includes("shake_ingest") &&
      payload.exp > Date.now() / 1000
    )
  ) {
    console.log(
      "death",
      await crypto.subtle.verify(
        { name: "ECDSA", hash: "SHA-256" },
        key,
        signatureBuf,
        content
      ),
      payload.iss === "shake_ingest",
      payload.aud.includes("shake_ingest"),
      payload.exp > Date.now() / 1000
    );
    return null;
  }
  return payload;
}
