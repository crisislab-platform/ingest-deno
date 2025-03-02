import { Router } from "itty-router/Router";
import createMarker from "./create-marker.ts";
import listMarkers from "./list-markers.ts";
import removeMarker from "./remove-marker.ts";
import { authMiddleware } from "../auth.ts";

export const chartsRouter = Router({ base: "/api/v2/charts" });

chartsRouter
	.get("/markers", authMiddleware("charts:markers"), listMarkers)
	.post("/markers", authMiddleware("charts:markers"), createMarker)
	.delete("/markers/:id", authMiddleware("charts:markers"), removeMarker);
