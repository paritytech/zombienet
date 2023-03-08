#!/bin/bash
set -uxo pipefail

if [ -f /cfg/coreutils ]; then
    RM="/cfg/coreutils rm"
    MKFIFO="/cfg/coreutils mkfifo"
    MKNOD="/cfg/coreutils mknod"
    LS="/cfg/coreutils ls"
    KILL="/cfg/coreutils kill"
    SLEEP="/cfg/coreutils sleep"
else
    RM="rm"
    MKFIFO="mkfifo"
    MKNOD="mknod"
    LS="ls"
    KILL="kill"
    SLEEP="sleep"
fi


# add /cfg as first `looking dir` to allow to overrides commands.
export PATH="{{REMOTE_DIR}}":$PATH

# setup pipe
pipe=/tmp/zombiepipe
trap "$RM -f $pipe" EXIT

# try mkfifo first and allow to fail
if [[ ! -p $pipe ]]; then
    $MKFIFO $pipe
fi

# set immediately exit on any non 0 exit code
set -e

# if fails try mknod
if [[ ! -p $pipe ]]; then
    $MKNOD $pipe p
fi

# init empty
child_pid=""

# get the command to exec
CMD=($@)

restart() {
    if [ ! -z "${child_pid}" ]; then
        $KILL -9 "$child_pid"
    fi

    # check if we have timeout
    if [[ "$1" ]]; then
        $SLEEP "$1"
    fi

    # start the process again
    "${CMD[@]}" &
    child_pid="$!"
}

pause() {
    if [ ! -z "${child_pid}" ]; then
        $KILL -STOP "$child_pid"
    fi
}

resume() {
    if [ ! -z "${child_pid}" ]; then
        $KILL -CONT "$child_pid"
    fi
}

# Exec the command and get the child pid
"${CMD[@]}" &
child_pid="$!"

# check if the process is running
if ! $LS /proc/$child_pid > /dev/null 2>&1 ; then
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
            restart 0
        fi;
    elif [[ "$line" == "pause" ]]; then
        pause
    elif [[ "$line" == "resume" ]]; then
        resume
    fi
done

# exit
if [ ! -z "${child_pid}" ]; then
    $KILL -9 "$child_pid"
fi

exit 0
