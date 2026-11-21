#!/bin/sh
# Runs the milestone 0 measurements against the deployed spike Worker.
# Usage: sh spike/run.sh https://getsecondbrain-spike.<subdomain>.workers.dev
base="$1"
[ -z "$base" ] && { echo "usage: sh spike/run.sh <spike worker url>"; exit 1; }
call() { printf '%-34s ' "$1"; curl -s -o /tmp/spike.out -w '%{http_code} ' "$base$1"; head -c 300 /tmp/spike.out; echo; }
echo "== CPU in the Worker (free plan limit is 10 ms; expect failures as work grows)"
for n in 1000000 10000000 50000000 200000000 1000000000; do call "/cpu?where=worker&iters=$n"; done
echo "== CPU in the Durable Object (does it get more than the Worker?)"
for n in 1000000 10000000 50000000 200000000 1000000000 5000000000; do call "/cpu?where=object&iters=$n"; done
echo "== Trigram tokenizer"; call "/trigram"
echo "== Rows written per note save"; call "/rows"
echo "== Layout blob in one row"
for kb in 400 1024 1900 2100 4096; do call "/blob?kb=$kb"; done
