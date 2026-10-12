#!/usr/bin/env bash
# Cara pakai:  ./start.sh          (jalan di port 3000)
#              PORT=8080 ./start.sh
set -e
cd "$(dirname "$0")"
PORT="${PORT:-3000}"

# hentikan instance lama yang masih memakai port ini
if command -v lsof >/dev/null 2>&1; then
  OLD=$(lsof -ti tcp:"$PORT" || true)
  [ -n "$OLD" ] && kill $OLD 2>/dev/null || true
fi

# instal dependensi kalau belum ada
[ -d node_modules ] || npm install --no-audit --no-fund

PORT="$PORT" nohup node server.js > server.log 2>&1 &
echo $! > server.pid
sleep 1.5
echo "CariBahasa jalan di http://localhost:$PORT  (PID $(cat server.pid))"
echo "Log: $(pwd)/server.log   |   Stop: kill \$(cat server.pid)"
