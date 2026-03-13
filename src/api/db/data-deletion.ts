import { getDB } from "../../utils.ts";
import { error, IRequest, json } from "itty-router";

const retentionPolicies: Record<string,{sqlInterval:string,name:string}> = {
    "retain": { sqlInterval: "", name: "Keep data forever" },
    "del-1w": { sqlInterval: "1 week", name: "Delete after 1 week" },
    "del-1m": { sqlInterval: "1 month", name: "Delete after 1 month" },
    "del-3m": { sqlInterval: "3 months", name: "Delete after 3 months" },
    "del-6m": { sqlInterval: "6 months", name: "Delete after 6 months" },
    "del-1yr": { sqlInterval: "1 year", name: "Delete after 1 year" },
    "del-2yr": { sqlInterval: "2 years", name: "Delete after 2 years" },
    "del-3yr": { sqlInterval: "3 years", name: "Delete after 3 years" },
    "del-5yr": { sqlInterval: "5 years", name: "Delete after 5 years" },
    "del-10yr": { sqlInterval: "10 years", name: "Delete after 10 years" },
}

export async function setRetentionPolicy(request: IRequest) {
    const sql = await getDB();
    const { policy } = await request.json();

    if (!policy || typeof policy !== "string" || !(policy in retentionPolicies)) {
        return error(400, "Choose a valid policy: " + Object.keys(retentionPolicies).join(", "))
    }

    if (policy === "retain") {
        await sql`SELECT remove_retention_policy('sensor_data_4');`
    } else {
        const interval = retentionPolicies[policy].sqlInterval;
        await sql`SELECT add_retention_policy('sensor_data_4', INTERVAL ${interval});`

    }

    const name = retentionPolicies[policy].name;

    return new Response(name, { status: 200 })
}
