#!/usr/bin/env bash

POD=$1
PORT=$2 # 9615 for prometheus
DELAY=$3
TAKE=$(/cfg/curl  -w "%{time_connect}"  -so /dev/null  http://$POD:$PORT/ |awk -F "." '{print $1}')
if [[ $TAKE -ge $DELAY ]]; then
    exit 0;
fi

# Take less that the expected delay
exit 1
