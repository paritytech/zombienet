#!/bin/bash
path=`pwd`
some=${path##*/}
cd keystore

if [ $some = "alice" ];
then
    ## alice has all key types (11) thus we just count the number of files in keystore dir
    count=$(ls | wc -l)
    if [ $count = 11 ]; then
        exit 0
    fi
elif [ $some = "bob" ];
then
    result=`ls $(echo -n aura | hexdump -v -e '/1 "%02X"')*`
    count=$(echo -e "$result" | wc -l)
    if [ $count = 1 ]; then
        exit 0
    fi
elif [ $some = "collator01" ];
then
    result=`ls $(echo -n gran | hexdump -v -e '/1 "%02X"')*`
    count=$(echo -e "$result" | wc -l)
    exit 0
fi

echo "ERRORED"
exit 1
