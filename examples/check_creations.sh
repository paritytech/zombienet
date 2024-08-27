#!/usr/bin/env bash

KEY_ENCODED=$1
SCRIPT=$(realpath "$0")
SCRIPTPATH=$(dirname "$SCRIPT")

if [[ $SCRIPTPATH == "/tmp" ]]; then
    cd ../data
else
    # native provider use `root dir` to run the script
    cd data
fi

if [ $KEY_ENCODED = "ALL" ];
then
    ## should have all key types (11) thus we just count the number of files in keystore dir
    cd $(find . -name keystore)
    count=$(ls | wc -l)
    if [ $count -eq 11 ]; then
        exit 0
    fi
else
    count=$(find . -name "${KEY_ENCODED}*" |wc -l)
    if [ $count -eq 1 ]; then
        exit 0
    fi
fi

echo "ERRORED"
exit 1
