#!/bin/bash

# The first argument sent to the script must be the path of the chain spec
chain_spec_path=$1
# Assume that the name 
old_name="Rococo Local Testnet"
# Set the new name for the network
new_name="Tentset Lacol Ococor"

input=$(cat $chain_spec_path)

# Replace the name field in the JSON file
echo "$input" | sed "s/\"name\": \"$old_name\"/\"name\": \"$new_name\"/"
