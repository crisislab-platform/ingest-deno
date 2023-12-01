import { Router } from "itty-router";
import { authMiddleware } from "../auth.ts";
import listAll from "./listAll.ts";
import getSensor from "./getSensor.ts";
import createSensor from "./createSensor.ts";
import deleteSensor from "./deleteSensor.ts";
import updateSensor from "./updateSensor.ts";
import setOnline from "./updateOnline.ts";
import randomizeSensors from "./randomizeLocation.ts";

export const sensorsRouter = Router({ base: "/api/v2/sensors" });

// with some routes on it (these will be relative to the base)...
sensorsRouter
	.get("/", listAll)
	.post("/online", authMiddleware("sensors:online"), setOnline)
	.post("/randomize", authMiddleware("sensors:write"), randomizeSensors)
	.get("/:id", authMiddleware("sensors:read"), getSensor)
	.post("/", authMiddleware("sensors:write"), createSensor)
	.patch("/:id", authMiddleware("sensors:write"), updateSensor)
	.delete("/:id", authMiddleware("sensors:write"), deleteSensor);
