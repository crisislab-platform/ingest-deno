# Ingest Server

This server handles all our data from sensors. It listens to udp packets from the sensor network. It also runs a web server that allows a web client (in `./live-data-graphs`) to connect via websocket to have all of the udp data from a sensor forwarded to it in a format that it can understand. It also saves all of the udp data to a PostgreSQL (+ TimeScale) database. It also hosts an API (/api/v2/\*) for managing sensor metadata, user accounts, etc.

A web client for viewing live data is available at `/consume/$sensorID`. E.g. `https://crisislab-data.massey.ac.nz/consume/6`.

The compressed Web Socket for live sensor data is hosted at `/consume/$sensorID/live`, and a plaintext version can also be requested: `/consume/$sensorID/live?plain`. E.g. `(new WebSocket('wss://crisislab-data.massey.ac.nz/consume/6/live?plain')).onmessage=console.log`.

## Network overview

See this doc: https://docs.google.com/document/d/1PnOvAFujeliayv_FOyj-ooBgS3bKITYmaEFsyHCt90c/edit#heading=h.6xyuzekua218

## Usage

> [!IMPORTANT]
> AFTER STARTING THE SERVER, YOU MUST CHANGE THE DEFAULT ACCOUNT.
> See details below

There are several ways to run the server
- Docker Compose
- Docker server setup + Manual database setup
- Manual server setup + Manual database setup (Used by CRISiSLab's cannonical instance)

They each have instructions below. However, you must first create a `.env` file, using `.env.example` as a template, and populate it with database credentials.
   
   Don't touch the ports if you're using Docker! Remap those in the docker command, and leave the ones in the env template.

Once that is done, go to the relevant section below. Head back here once your're done to configure the web uis.

Once your server is up and running, you can point our hosted web UIs at your server, or you can host them yourself:
- h[ttps://admin.crisislab.org.nz/](https://admin.crisislab.org.nz/manage/sensors) is used for managing user accounts, sensors, and the data generated from those sensors. This is where you add new sensors to your network.
   It's code is at https://github.com/crisislab-platform/admin/.
   You can point the admin site at your server using the button that looks like a triangle with a cog on it in the bottom left.
- https://shakemap.crisislab.org.nz/ is designed as a UI to provide your sensor hosts with. It displays all the sensors on the network, and embeds the live graphing view.   
   It's code is at https://github.com/crisislab-platform/map/.
   You can point the shakemap site at your server using the button that looks like a triangle with a cog on it in the bottom left.

### Default account

This is the default account that is created. It has permission to modify user accounts.

> [!IMPORTANT]
> You must use this account to create a new admin account, and then log into that and delete the defualt one before exposing the server to the internet.

Username: `delete-asap@example.com`
Password: `password123`

### Docker compose

Build the container:

```
docker build -t ingest-deno .
```

Run the server & database, in daemon mode:

```
docker-compose up -d
```

Your server should now be running. Look at the Usage section for information about web UIs.

You do not need to complete the following sections if you used the Docker Compose system.

### Database setup

> This isn't needed if you're using Docker Compose. It is needed if you're just using Docker for the server, or running everything manually.

1. Install and setup [PostgreSQL](https://www.postgresql.org/download/) and [TimescaleDB](https://docs.timescale.com/self-hosted/latest/install/).
2. Create a database called `sensor_data`.

   The server will automatically create any tables it needs. If you want compression, you will need to [enable compression](https://docs.timescale.com/use-timescale/latest/compression/compression-policy/#enabling-compression) yourself on the tables after the server has created them.

> When logged in as a superuser, you should now be able to log into the database with:
> ```bash
> psql sensor_data -U postgres -h localhost
> ```

Now you can move on to running the server, either with Docker, or manually with either CLI commands (SystemCTL confiuration is included in the manual section).

### With Docker

> Make sure you have set up the database using the steps above first.

Make sure you've set up `.env` correctly. By default it's setup to be used with docker compose, so you probably need to set `DATABASE_HOST` to `localhost`

Update the command below to remap ports as you desire.

```bash
docker run --env-file .env -p 8080:8080 -p 2098:2098/udp ingest-deno
```

Your server should now be running. Look at the Usage section for information about web UIs.

If it says `Unable to find image 'ingest-deno:latest' locally`, then you need to build the image:

```bash
docker build -t ingest-deno .
```

### Manually / CLI Commands

> Make sure you have set up the database using the instructions further up first.

To run the server, first install Deno:

```bash
curl -fsSL https://deno.land/x/install/install.sh | sh
```

> Deno v1.44.4 has been tested, no grantees for other versions

Compile the graphing website:
(this requires NodeJS 20+)

```bash
cd live-data-graphs
npm install
npm run build
```

To start the server, run this command:

```bash
deno run --allow-ffi --allow-net --allow-read --allow-env --allow-run --allow-sys --unstable-cron --unstable-net src/server.ts
```

Your server should now be running. Look at the Usage section for information about web UIs.

#### As a service

You can optionally run the server as a SystemCTL service. Follow the steps above for manual setup, then skip the server run command and come down here.

Make sure to edit the service file `ingest-deno.service` to point to the correct directory. Then run:

```bash
git clone https://github.com/rs-Web-Interface-CRISiSLab/ingest-deno.git
sudo cp ingest-deno.service /etc/systemd/system/ingest-deno.service
sudo systemctl daemon-reload
sudo systemctl enable ingest-deno.service
sudo systemctl start ingest-deno.service
```

Your server should now be running. Look at the Usage section for information about web UIs.


Useful commands:

```bash
sudo systemctl stop ingest-deno
sudo systemctl start ingest-deno
sudo systemctl restart ingest-deno
sudo systemctl status ingest-deno
```


## Troubleshooting

### Deno was not found

Make sure you have Deno installed and that it is in your PATH. If you're running as root, such as in a service, it will not be in your PATH by default. You can either add it to your PATH or use the absolute path.

### Sensor status is wrong

Make sure you're running only one instance of the server.

The only other thing that should cause this is a sensor with a unreliable network connection, that can send packets often enough to convince the server it's online, but not often enough to show up reliabley as packets.

### The server is not receiving data

This shouldn't be a problem if you're using the correct ports. The firewall is already configured to allow ZeroTier traffic through, but just in case this is the problem, check if you can ping a sensor from the VM.

Also make sure all sensors are running Zerotier.


### Error creating user token SyntaxError: Invalid key usage

Make sure your JWKs in `.env` look like this:

Private:
```json
{"use":"sig", "kty": "EC",  "kid": "...",  "crv": "P-256",  "x": "...",  "y": "...",  "d": "..."}
```

Public:
```json
{"use":"sig", "kty": "EC",  "kid": "...",  "crv": "P-256",  "x": "...",  "y": "..."}
```