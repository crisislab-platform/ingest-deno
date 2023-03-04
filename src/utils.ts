import "https://deno.land/std@0.178.0/dotenv/load.ts";

// Helper function to fetch from the API
export function fetchAPI(path: string, options: RequestInit = {}) {
  return fetch(Deno.env.get("API_ENDPOINT") + path, {
    ...options,
    headers: {
      ...options.headers,
      authorization: `Bearer ${Deno.env.get("API_TOKEN")}`,
    },
  });
}
