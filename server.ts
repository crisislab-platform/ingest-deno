import { serve } from "https://deno.land/std/http/mod.ts";
import { serveFile } from 'https://deno.land/std/http/file_server.ts';
import { sensorHandler, clientHandler } from "./connectionHandler.ts";

async function reqHandler(request: Request) {
  const url = new URL(request.url);
  const pathname = url.pathname;

  // if (pathname == "/ingest/websocket") {
  //   return sensorHandler(request);
  // }

  if (pathname.startsWith("/consume/")) {
    const sensor = parseInt(pathname.split("/").pop()!);

    if (isNaN(sensor))
      return new Response("Invalid sensor id", { status: 400 });

    if (request.headers.get("Upgrade") != "websocket") {
      console.log("Upgrade header is not websocket");
      return await serveFile(request, "./live-data-graphs/dist/index.html");
    }

    return clientHandler(request);
  }

  return await serveFile(request, "./live-data-graphs/dist" + pathname);
}

fetch("https://internship-worker.benhong.workers.dev/api/v0/sensors/online", {
  headers: {
    authorization: "bearer eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlcyI6WyJzZW5zb3JzOm9ubGluZSJdLCJlbWFpbCI6ImluZ2VzdEBiZW5ob25nLm1lIiwibmFtZSI6IkxpdmUgRGF0YSBTZXJ2ZXIiLCJpYXQiOjE2NTczNDEzMjEuODY1LCJleHAiOjE2ODg4NzczMjEuODY1LCJpc3MiOiJodHRwczovL2NyaXNpc2xhYi5vcmcubnoiLCJhdWQiOlsiYWRtaW4iXX0=.9jaINkWZNNT3iMvq-XmsNVv4ARiEFkzZA8lD_2Uw2F6dXZ-EbwK1FVzDlG8AZLlozmOXtc6YX3O52u8Tm6oEiw"
  },
  method: "POST",
  body: JSON.stringify({ all: true, timestamp: Date.now(), state: false })
}).then((res) => { console.log(res.status); res.text().then(a => console.log(a)) }).catch((err) => { console.log(err); });

(async () => {
  const socket = await Deno.listenDatagram({
    port: 2098,
    transport: "udp",
    hostname: "0.0.0.0"
  });

  for await (const [data, addr] of socket)
    sensorHandler(addr, data);
})()

serve(reqHandler, { port: 8080 });
