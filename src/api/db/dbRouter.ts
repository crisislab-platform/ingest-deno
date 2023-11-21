import { Router } from "itty-router";
import { databaseSize } from "./database-size.ts";
import { dataBulkExport } from "./dataBulkExport.ts";
import { authMiddleware } from "../apiUtils.ts";

export const dbRouter = Router({ base: "/api/v2/db" });

dbRouter
	.get("/database-size", authMiddleware(["sensor-data:db-size"]), databaseSize)
	.get(
		"/data-bulk-export",
		authMiddleware(["sensor-data:bulk-export"]),
		dataBulkExport
	);
