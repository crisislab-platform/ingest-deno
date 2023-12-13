import { Base64 } from "js-base64";

const str2ab = (str: string): ArrayBuffer => {
	const buf = new ArrayBuffer(str.length);
	const bufView = new Uint8Array(buf);
	for (let i = 0, strLen = str.length; i < strLen; i++) {
		bufView[i] = str.charCodeAt(i);
	}
	return buf;
};

// const getDERfromPEM = (pem) => {
//   const pemB64 = pem
//     .trim()
//     .split('\n')
//     .slice(1, -1) // Remove the --- BEGIN / END PRIVATE KEY ---
//     .join('')

//   return str2ab(atob(pemB64))
// }

const b64encodeJSON = (obj: any): string => btoa(JSON.stringify(obj));

const getEncodedMessage = (header: any, payload: any): string => {
	const encodedHeader = b64encodeJSON(header);
	const encodedPayload = b64encodeJSON(payload);
	const encodedMessage = `${encodedHeader}.${encodedPayload}`;
	return encodedMessage;
};

const algorithms = {
	RS256: {
		name: "RSASSA-PKCS1-v1_5",
		hash: { name: "SHA-256" },
	},
	ES256: {
		name: "ECDSA",
		namedCurve: "P-256",
		hash: { name: "SHA-256" },
	},
};

const getHeader = (
	alg: "RS256" | "ES256",
	headerAdditions: Record<string, unknown>
): Record<string, unknown> => ({
	...headerAdditions,
	alg,
	typ: "JWT",
});

/**
 * This function creates a JWT token with the given payload and algorithm.
 * It uses the env variable PRIVATE_JWK as the private key to sign the token.
 * @param {Object} options
 * @param {Object} options.payload - The payload of the token
 * @param {string} options.alg - The algorithm to use
 * @param {Object} options.headerAdditions - Any additional headers to add to the token
 * @returns {string} The JWT token
 */
export async function getToken({
	payload,
	alg = "ES256",
	headerAdditions = {},
}: {
	payload: unknown;
	alg?: keyof typeof algorithms;
	headerAdditions?: Record<string, unknown>;
}): Promise<string> {
	// Import the private key into a crypto key
	const privateKey = await crypto.subtle.importKey(
		"jwk",
		JSON.parse(Deno.env.get("PRIVATE_JWK")!),
		{
			name: "ECDSA",
			namedCurve: "P-256",
		},
		true,
		["sign"]
	);

	// Get the algorithm from the alg parameter
	const algorithm = algorithms[alg];

	// Get the header and payload encoded as a string
	const header = getHeader(alg, headerAdditions);
	const encodedMessage = getEncodedMessage(header, payload);

	// Convert the encoded message string to an ArrayBuffer
	const encodedMessageArrBuf = str2ab(encodedMessage);

	// Sign the message
	const signatureArrBuf = await crypto.subtle.sign(
		algorithm,
		privateKey,
		encodedMessageArrBuf
	);

	// Convert the ArrayBuffer to a Uint8Array
	const signatureUint8Array = new Uint8Array(signatureArrBuf);

	// Encode the Uint8Array to Base64
	const encodedSignature = Base64.fromUint8Array(signatureUint8Array, true);

	// Join the encoded message and encoded signature with a period
	const token = `${encodedMessage}.${encodedSignature}`;
	return token;
}

export interface JWTClaims {
	iss: string;
	sub: string;
	aud: string;
	exp: number;
	iat: number;
	jti: string;
	[key: string]: any;
}

export async function verifyToken(token: string): Promise<JWTClaims> {
	if (!token) throw new Error("No token provided");

	const [rawHeader, rawPayload, rawSignature] = token.trim().split(".");

	// ID of the key that was used to sign the JWT
	// const { kid } = JSON.parse(atob(rawHeader))
	const key = await crypto.subtle.importKey(
		"jwk",
		JSON.parse(Deno.env.get("PUBLIC_JWK")!),
		{
			name: "ECDSA",
			namedCurve: "P-256",
		},
		true,
		["verify"]
	);

	const signatureBytes = atob(
		rawSignature.replace(/_/g, "/").replace(/-/g, "+")
	);
	const signature = new Uint8Array(
		Array.from(signatureBytes).map((c) => c.charCodeAt(0))
	);

	const content = new TextEncoder().encode([rawHeader, rawPayload].join("."));

	const payload = JSON.parse(atob(rawPayload));

	if (
		(await crypto.subtle.verify(
			{ name: "ECDSA", hash: "SHA-256" },
			key,
			signature,
			content
		)) &&
		payload.iss === "https://crisislab.org.nz" &&
		payload.exp > Date.now() / 1000
	)
		return payload;
	else {
		throw new Error("Invalid token");
	}
}
