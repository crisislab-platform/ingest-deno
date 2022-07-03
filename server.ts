import { serve } from "https://deno.land/std/http/mod.ts";
import { sensorHandler, clientHandler } from "./websocketHandler.ts";
import graphPage from "./graphPage.ts";

function reqHandler(request: Request) {
  //   if (req.headers.get("upgrade") != "websocket") {
  //     return new Response(null, { status: 501 });
  //   }
  //   const { socket: ws, response } = Deno.upgradeWebSocket(req);
  //   return response;
  const url = new URL(request.url);
  const pathname = url.pathname;

  switch (pathname) {
    case "/":
      return new Response("", { status: 404 });
    case "/ingest/websocket":
      return sensorHandler(request);
  }

  if (pathname.startsWith("/consume/")) {
    const sensor = parseInt(pathname.split("/").pop()!);

    if (isNaN(sensor))
      return new Response("Invalid sensor id", { status: 400 });

    if (request.headers.get("Upgrade") != "websocket") {
      console.log("Upgrade header is not websocket");
      return new Response(graphPage(sensor), {
        headers: {
          "content-type": "text/html;charset=UTF-8",
        },
      });
    }

    return clientHandler(request);
  }

  return new Response("", { status: 404 });
}

fetch("https://internship-worker.benhong.workers.dev/api/v0/sensors/online", {
  headers: {
    authorization: "bearer eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlcyI6WyJzZW5zb3JzOm9ubGluZSJdLCJlbWFpbCI6ImluZ2VzdEBiZW5ob25nLm1lIiwibmFtZSI6IkxpdmUgRGF0YSBTZXJ2ZXIiLCJpYXQiOjE2NTY0ODc5MTEuNjc0LCJleHAiOjE2NTcwOTI3MTEuNjc0LCJpc3MiOiJodHRwczovL2NyaXNpc2xhYi5vcmcubnoiLCJhdWQiOlsiYWRtaW4iXX0=._kIvhTQTbQ1v7a5bHuecXEajpjMUueoyw1l-PTfBXNY2Ddv4WZhLinM79gFK3xUBpyqzJpd3DaX53WoEd-ZIiw"
  },
  method: "POST",
  body: JSON.stringify({ all: true, timestamp: Date.now(), state: false })
})

serve(reqHandler, { port: 80 });
