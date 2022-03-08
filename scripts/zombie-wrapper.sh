#!/bin/bash

set -euxo pipefail

# add /cfg as first `looking dir` to allow to overrides commands.
export PATH="{{REMOTE_DIR}}":$PATH

# setup pipe
pipe=/tmp/zombiepipe
trap "rm -f $pipe" EXIT

if [[ ! -p $pipe ]]; then
    mkfifo $pipe
fi

# init empty
child_pid=""

# get the command to exec
CMD=($@)

restart() {
    if [ ! -z "${child_pid}" ]; then
        kill -9 "$child_pid"
    fi

    # check if we have timeout
    if [[ "$1" ]]; then
        sleep "$1"
    fi

    # start the process again
    "${CMD[@]}" &
    child_pid="$!"
}

pause() {
    if [ ! -z "${child_pid}" ]; then
        kill -STOP "$child_pid"
    fi
}

resume() {
    if [ ! -z "${child_pid}" ]; then
        kill -CONT "$child_pid"
    fi
}

# Exec the command and get the child pid
"${CMD[@]}" &
child_pid="$!"

# check if the process is running
if ! ls /proc/308937 > /dev/null 2>&1 ; then
    exit 1
fi;

# keep listening from the pipe
while read line <$pipe
do
    if [[ "$line" == 'quit' ]]; then
        break
    elif [[ "$line" =~ "restart" ]]; then
        # check if we have timeout between restart
        if [[ $line =~ [^0-9]+([0-9]+) ]]; then
            restart "${BASH_REMATCH[1]}"
        else
            restart
        fi;
    elif [[ "$line" == "pause" ]]; then
        pause
    elif [[ "$line" == "resume" ]]; then
        resume
    fi
done

# exit
if [ ! -z "${child_pid}" ]; then
    kill -9 "$child_pid"
fi

exit 0
