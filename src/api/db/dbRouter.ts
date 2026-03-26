import { Router } from "itty-router";
import { databaseSize, databaseSizeHistory, totalDiskSize } from "./database-size.ts";
import { dataBulkExport } from "./dataBulkExport.ts";
import { authMiddleware } from "../auth.ts";
import { getCurrentRetentionPolicy, setRetentionPolicy } from "./data-deletion.ts";

export const dbRouter = Router({ base: "/api/v2/db" });

dbRouter
	.get("/database-size", authMiddleware("sensor-data:db-size"), databaseSize)
	.get("/database-max-size", authMiddleware("sensor-data:db-size"), totalDiskSize)
	.get(
		"/database-size-history",
		authMiddleware("sensor-data:db-size"),
		databaseSizeHistory
	)
	.get(
		"/data-bulk-export",
		authMiddleware("sensor-data:bulk-export"),
		dataBulkExport
	)
	.patch(
		"/retention-policy",
		authMiddleware("sensor-data:bulk-delete"),
		setRetentionPolicy
	)
	.get(
		"/retention-policy",
		authMiddleware(),
		getCurrentRetentionPolicy
	)
	.get(
		"/data-bulk-export",
		authMiddleware("sensor-data:bulk-export"),
		dataBulkExport
	);
