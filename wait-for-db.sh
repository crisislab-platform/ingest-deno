#!/bin/sh
set -e

# Parameters
host="$1"
port="$2"

if [ -z "$host" ] || [ -z "$port" ]; then
  echo "Usage: $0 <host> <port> <command>"
  exit 1
fi

# Wait until the database service is ready
echo "Waiting for $host:$port to become available..."
while ! nc -z "$host" "$port"; do
  echo "Still waiting for $host:$port..."
  sleep 2
done

echo "$host:$port is now available."

# Shift past the host and port arguments and run the command
shift 2
exec "$@"
