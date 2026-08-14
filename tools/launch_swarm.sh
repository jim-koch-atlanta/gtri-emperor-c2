#!/usr/bin/env bash

set -e

NUM_ROBOTS="${1:-2}"

if ! [[ "$NUM_ROBOTS" =~ ^[1-9][0-9]*$ ]]; then
    echo "Usage: $0 <number-of-robots>"
    exit 1
fi

cmake -S . -B build
cmake --build build

SERVER=build/src/c2_server/emperor_c2_server
ROBOT=build/src/robot_sim
PROBE=build/tools/subscribe_probe

ROBOT_PIDS=()

cleanup() {
    echo "=== cleanup ==="

    if ((${#ROBOT_PIDS[@]})); then
        kill "${ROBOT_PIDS[@]}" 2>/dev/null || true
    fi

    if [[ -n "${SPID:-}" ]]; then
        kill "$SPID" 2>/dev/null || true
    fi

    echo "swarm stopped"
}

trap cleanup EXIT

"$SERVER" >/tmp/smoke_server.log 2>&1 &
SPID=$!

sleep 1

if ! kill -0 "$SPID" 2>/dev/null; then
    echo "SERVER DIED:"
    cat /tmp/smoke_server.log
    exit 1
fi

echo "server up (pid $SPID), bound 0.0.0.0:50051"

for ((i = 1; i <= NUM_ROBOTS; i++)); do
    printf -v ROBOT_ID "R-%02d" "$i"

    # Give each robot slightly different starting parameters.
    X=$(( (i - 1) * 300 ))
    Y=0
    RADIUS=$(( 80 + (i % 3) * 20 ))
    SPEED=$(( 10 + (i % 6) ))
    PHASE=$(( i - 1 ))

    "$ROBOT" \
        "$ROBOT_ID" \
        "$X" \
        "$Y" \
        "$RADIUS" \
        "$SPEED" \
        "$PHASE" \
        localhost:50051 \
        >"/tmp/smoke_${ROBOT_ID}.log" 2>&1 &

    ROBOT_PIDS+=("$!")
done

echo "$NUM_ROBOTS robots launched"
sleep 2

echo "=== health check — 5 SwarmState frames @5Hz ==="
timeout 6 "$PROBE" localhost:50051 5 || true   # || true so set -e survives a nonzero probe

echo
echo "swarm live on 0.0.0.0:50051 — Ctrl-C to stop"
wait                                            # block until a signal -> trap cleanup runs