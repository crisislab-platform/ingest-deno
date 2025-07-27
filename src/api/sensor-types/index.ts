import { Router } from "itty-router";
import { authMiddleware } from "../auth.ts";
import listAll from "./listAll.ts";
import getSensorType from "./getSensorType.ts";
import upsertSensorType from "./upsertSensorType.ts";
import deleteSensorType from "./deleteSensorType.ts";

export const sensorTypesRouter = Router({ base: "/api/v2/sensor-types" });

sensorTypesRouter
	.get("/", authMiddleware("sensors:read"), listAll)
	.get("/:name", authMiddleware("sensors:read"), getSensorType)
	.put("/:name", authMiddleware("sensors:write"), upsertSensorType)
	.delete("/:name", authMiddleware("sensors:write"), deleteSensorType);