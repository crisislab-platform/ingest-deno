import { Router } from "itty-router";
import auth from "../auth.ts";
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
	.post("/online", auth("sensors:online"), setOnline)
	.post("/randomize", auth("sensors:write"), randomizeSensors)
	.get("/:id", auth("sensors:read"), getSensor)
	.post("/", auth("sensors:write"), createSensor)
	.patch("/:id", auth("sensors:write"), updateSensor)
	.delete("/:id", auth("sensors:write"), deleteSensor);
