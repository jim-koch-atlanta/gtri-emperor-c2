#!/usr/bin/env bash

cd /mnt/c/dev/gtri-emperor-c2

measure () {   # $1 = label
  build/src/c2_server/emperor_c2_server >/tmp/s.log 2>&1 &
  local SPID=$!; sleep 1
  if ! kill -0 $SPID 2>/dev/null; then echo "SERVER DIED:"; cat /tmp/s.log; return 1; fi
  local BASE=$(ls /proc/$SPID/task | wc -l)
  for i in $(seq 1 6); do
    printf -v RID "R-%02d" "$i"
    build/src/robot_sim "$RID" $(((i-1)*300)) 0 $((80+(i%3)*20)) $((10+(i%6))) $((i-1)) localhost:50051 \
      >/tmp/r_$RID.log 2>&1 &
  done
  sleep 3
  local N=$(ls /proc/$SPID/task | wc -l)
  local LIVE=$(build/tools/subscribe_probe localhost:50051 3 2>/dev/null | grep -ioE 'LINK_LIVE|LIVE' | wc -l)
  echo "== $1 ==  baseline(0 robots)=$BASE  6-robots=$N  delta/robot=~$(awk "BEGIN{printf \"%.2f\",($N-$BASE)/6}")  LIVEhits=$LIVE"
  cat /proc/$SPID/task/*/comm | sort | uniq -c | sort -rn | sed 's/^/    /'
  pkill -f build/src/robot_sim 2>/dev/null; kill $SPID 2>/dev/null; wait 2>/dev/null
}

# REACTOR — your current swap
cmake --build build --target emperor_c2_server >/dev/null && measure "REACTOR (callback API)"

# SYNC — revert just main.cpp to committed, rebuild, measure, restore
git checkout master >/dev/null
cmake --build build --target emperor_c2_server >/dev/null && measure "SYNC (thread-per-RPC)"
git checkout spike-reactor >/dev/null
cmake --build build --target emperor_c2_server >/dev/null
echo "restored your reactor main.cpp + rebuilt"