# Ingest Server

Throughout my time at Crisislab, I’ve been working on some form of moving data. First, the competition Socket.io proxy, then the Cloudflare Workers serverless API (this was great; it might be worth exploring again using Cloudflare PubSub), then fixing up the old Java-based middle tier to work with the serverless API, migrating the old serverless API to a cloud instance due to unexpected costs, then to a Massey VM, then because of problems with the firewall, back to the cloud. Due to our login expiring for the middle tier and IT taking a while to fix it, I spent a couple of hours reimplementing the middle tier in a hundred or so lines, with the web API built in now and chucked it on the cloud. But since it was on my personal account using up my free tier resources, I moved it yet again to a Massey VM and spent ages going back and forth with IT to get the firewall sorted. 🫠

## Tools used

- Deno
- WebSockets
- UDP
- Typescript

## Description

The ingest server bridges UDP data streams with WebSockets that browser clients can consume. To receive data, browser clients can subscribe to a WebSocket endpoint with the format /consume/{sensor}. When then a UDP packet arrives, the server looks up the sender's IP addresses in the sensors list from the main API and then forwards the data to all clients subscribed to that sensor. The server also updates the sensor's last seen timestamp and status using the main API.

## Usage

To run the server, first install Deno:

```bash
curl -fsSL https://deno.land/x/install/install.sh | sh
```

> Deno 1.31.1 has been tested, no grantees for other versions

Modify the .env file to have the correct API token and the desired ports.
Then run:

```bash
deno run --unstable --allow-net --allow-write=sensor-data.db --allow-read --allow-env --watch src/server.ts
```

You can optionally run it as a service. Make sure to edit the service file to point to the correct directory. Then run:

```bash
sudo cp ingest-deno.service /etc/systemd/system/ingest-deno.service
sudo systemctl daemon-reload
sudo systemctl enable ingest-deno.service
sudo systemctl start ingest-deno.service
```

If you want to host the viewer as well, you need to build it:

```bash
cd live-data-graphs
npm install
npm run build
```

You may need to install Node.js and npm first.

### Running on Massey VM

The `ingest` user has been setup for running the ingest server. Ask Ben or Zade for the password.
It's been given sudo privileges for just `service ingest-deno *` commands as well.

For instance:

```bash
sudo service ingest-deno status
sudo service ingest-deno restart
sudo service ingest-deno start
sudo service ingest-deno stop
```

## Troubleshooting

### Deno was not found

Make sure you have Deno installed and that it is in your PATH. If you're running as root, such as in a service, it will not be in your PATH by default. You can either add it to your PATH or use the absolute path.

### Sensor status is wrong

Make sure you're running only one instance of the server. To temporarily fix the problem, just restart the server.

### The server is not receiving data

This shouldn't be a problem if you're using the correct ports. The firewall is already configured to allow ZeroTier traffic through, but just in case this is the problem, check if you can ping a sensor from the VM.

### The sensors are online, but I can't receive data

This could be an issue with WebSockets being blocked by the Massey reverse proxy. A telltale sign is that the Chrome Devtools network tab shows WebSocket connection is closed immediately after opening, and that it works fine from the browser on the VM. Work with Mike from IT to get this sorted.

### The server is not updating the sensor status

Make sure you're using the correct API token, and that it's not expired. The API endpoint is also configurable in the .env file.

## Network overview diagram

![Network overview diagram](CRISiSLab_SHAKENET_systems_overview.excalidraw.png)
