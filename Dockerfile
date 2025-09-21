# Stage 1: Build the Vite app using pnpm
FROM node:alpine AS frontend

WORKDIR /app/live-data-graphs

# Install pnpm
RUN npm install -g pnpm

# Copy package.json and pnpm lockfile, then install dependencies
COPY ./live-data-graphs/pnpm-lock.yaml ./live-data-graphs/package*.json ./
RUN pnpm install --dangerously-allow-all-builds

# Copy the rest of the frontend source code and build it
COPY ./live-data-graphs ./
RUN pnpm run build

# Stage 2: Setup Deno environment
FROM denoland/deno:alpine

WORKDIR /app

# Copy Deno config and source files
COPY ./deno.json ./
COPY ./src ./
# For docker compose
COPY ./wait-for-db.sh ./

# Copy the built Vite app from the frontend stage to the correct location
COPY --from=frontend /app/live-data-graphs/dist ./live-data-graphs/dist

# Cache Deno dependencies 
RUN deno cache server.ts 

CMD [  "run",  "--allow-ffi", "--allow-net", "--allow-read", "--allow-env", "--allow-run", "--allow-sys", "--unstable-cron", "--unstable-net", "server.ts"]

# Expose the HTTP and UDP ports
EXPOSE 8080
EXPOSE 2098/udp
