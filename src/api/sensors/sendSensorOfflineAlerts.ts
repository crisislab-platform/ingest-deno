import { formatDistance, formatRelative } from "date-fns";
import enNZ from "date-fns/locale/en-NZ/index.js";
import { getSensors } from "../apiUtils.ts";

const globalRecipients: Record<string, string> = {
	"zviggers@massey.ac.nz": "Zade Massey",
	"r.prasanna@massey.ac.nz": "Raj",
	"c.chandrakumar2@massey.ac.nz": "Chanthujan",
};
const TwentyFourHoursMilliseconds = 24 * 60 * 60 * 1000;

export async function sendSensorOfflineAlerts() {
	const sensors = await getSensors();

	const recipientEmailAlertMap: Record<
		string,
		{ msg: string; sensorID: number }[]
	> = {};

	const timeFormatter = new Intl.DateTimeFormat("en-NZ", {
		dateStyle: "full",
		timeStyle: "long",
		timeZone: "Pacific/Auckland",
	});

	console.info("Generating offline alert summary emails...");

	for (const sensor of Object.values(sensors)) {
		if (sensor.online) continue;

		if (typeof sensor?.timestamp !== "number") continue;

		const lastPacketReceived = new Date(sensor.timestamp);

		if (Date.now() - lastPacketReceived.getTime() < TwentyFourHoursMilliseconds)
			continue;

		const message = `Sensor #${
			sensor.id
		} has not sent any data to the ingest server since ${formatRelative(
			lastPacketReceived,
			new Date(),
			{ locale: enNZ }
		)} which was ${formatDistance(lastPacketReceived, new Date(), {
			locale: enNZ,
			addSuffix: true,
		})}.`;

		const alert = {
			msg: message,
			sensorID: sensor.id,
		};

		const peopleToEmail = [...Object.keys(globalRecipients)];
		if (sensor.contact_email) {
			peopleToEmail.push(sensor.contact_email);
		}

		for (const email of peopleToEmail) {
			if (!recipientEmailAlertMap[email]) recipientEmailAlertMap[email] = [];

			recipientEmailAlertMap[email].push(alert);
		}
	}

	for (const [email, alerts] of Object.entries(recipientEmailAlertMap)) {
		const emailPayload = {
			personalizations: [
				{
					to: [{ email, name: globalRecipients[email] || "Sensor Host" }],
					dkim_domain: Deno.env.get("DKIM_DOMAIN"),
					dkim_selector: Deno.env.get("DKIM_SELECTOR"),
					dkim_private_key: Deno.env.get("DKIM_PRIVATE_KEY"),
				},
			],
			from: {
				email: SENDER_EMAIL,
				name: SENDER_NAME,
			},
			subject: `Sensor status update (${alerts
				.map(({ sensorID }) => `#${sensorID}`)
				.join(", ")})`,
			content: [
				{
					type: "text/plain",
					value: `Hello ${email}!
This is your CRISiSLab sensor status update digest email.

Here are the alerts relevant to you:
${alerts.map(({ msg }) => `	- ${msg}`).join("\n")}


This notification email was sent at ${timeFormatter.format(Date.now())}.

If you aren't ${email}, please contact CRISiSLab technical staff.

If you have any questions or comments, just reply to this email and Zade will get back to you.`,
				},
			],
		};
		try {
			const res = await fetch("https://api.mailchannels.net/tx/v1/send", {
				method: "POST",
				body: JSON.stringify(emailPayload),
				headers: {
					"content-type": "application/json",
				},
			});
			const m = await res.text();
			if (res.ok) {
				console.info(`Sent offline alert summary email to ${email}`);
			} else {
				console.warn("Failed to send offline alert summary email:", email);
				console.log(m, res);
			}

			EMAILS_SENT.writeDataPoint({
				doubles: [alerts.length],
				indexes: [email],
			});
		} catch (err) {
			console.warn("Failed to send email: ", err);
		}
	}
}
