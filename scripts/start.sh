#!/bin/bash

path="./apps/$1"
if [ ! -z "$1" ] && [ -d $path ]; then
  echo "Load app $1"

  source $path/.env
  export ROOT_PATH=$path
  export APP_NAME=$1

  turbo start
else
  echo "App '$1' does not exist"
fi
