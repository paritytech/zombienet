#!/bin/bash

# Based on https://gitlab.parity.io/parity/simnet/-/blob/master/scripts/ci/run-test-environment-manager-v2.sh

set -eou pipefail


function usage {
  cat << EOF
DEPENDENCY 1: gcloud
https://cloud.google.com/sdk/docs/install

DEPENDENCY 2: kubectl
gcloud components install kubectl


Usage: ${SCRIPT_NAME} OPTION

OPTION
 -t, --test          OPTIONAL Test file to run
                     If omitted "all" test in the tests directory will be used.
  -h, --help         OPTIONAL Print this help message
  -o, --output-dir   OPTIONAL
                     Path to dir where to save contens of --github-remote-dir
                     Defaults to ${SCRIPT_PATH}
                     specified, it will be ifered from there.

EXAMPLES
Run tests
${SCRIPT_NAME} -g https://github.com/paritytech/polkadot/tree/master/zombienet_tests

EOF
}

function main {
  # Main entry point for the script
  set_defaults_for_globals
  parse_args "$@"
  create_isolated_dir
  copy_to_isolated
  run_test
  log INFO "Exit status is ${EXIT_STATUS}"
  exit "${EXIT_STATUS}"
}

function create_isolated_dir {
  TS=$(date +%s)
  ISOLATED=${OUTPUT_DIR}/${TS}
  mkdir -p ${ISOLATED}
  OUTPUT_DIR="${ISOLATED}"
}

function set_defaults_for_globals {
  # DEFAULT VALUES for variables used for testing different projects
  SCRIPT_NAME="$0"
  SCRIPT_PATH=$(dirname "$0")               # relative
  SCRIPT_PATH=$(cd "${SCRIPT_PATH}" && pwd) # absolutized and normalized

  export GOOGLE_CREDENTIALS="/etc/zombie-net/sa-zombie.json"

  cd "${SCRIPT_PATH}"

  EXIT_STATUS=0
  GH_REMOTE_DIR=""
  TEST_TO_RUN=""


  LAUNCH_ARGUMENTS=""
  USE_LOCAL_TESTS=false
  OUTPUT_DIR="${SCRIPT_PATH}"
}

function parse_args {
  function needs_arg {
    if [ -z "${OPTARG}" ]; then
      log DIE "No arg for --${OPT} option"
    fi
  }

  function check_args {
    if [[ -n "${GH_REMOTE_DIR}" &&
          ! "${GH_REMOTE_DIR}" =~ https:\/\/github.com\/ ]] ; then
      log DIE "Not a github URL"
    fi
  }

  # shellcheck disable=SC2214
  while getopts i:t:g:h:uo:-: OPT; do
    # support long options: https://stackoverflow.com/a/28466267/519360
    if [ "$OPT" = "-" ]; then   # long option: reformulate OPT and OPTARG
      OPT="${OPTARG%%=*}"       # extract long option name
      OPTARG="${OPTARG#$OPT}"   # extract long option argument (may be empty)
      OPTARG="${OPTARG#=}"      # if long option argument, remove assigning `=`
    fi
    case "$OPT" in
      t | test)                 needs_arg ; TEST_TO_RUN="${OPTARG}"  ;;
      g | github-remote-dir)    needs_arg ; GH_REMOTE_DIR="${OPTARG}"          ;;
      h | help )                usage     ; exit 0                             ;;
      o | output-dir)           needs_arg ; OUTPUT_DIR="${OPTARG}"             ;;
      ??* )                     log DIE "Illegal option --${OPT}" ;;
      ? )                       exit 2 ;;
    esac
  done
  shift $((OPTIND-1)) # remove parsed options and args from $@ list
  check_args
}

function copy_to_isolated {
  cd "${SCRIPT_PATH}"
  echo $(pwd)
  echo $(ls)
  echo $(ls ../..)
  cp -r ../../tests/* "${OUTPUT_DIR}"
}
function run_test {
  # RUN_IN_CONTAINER is env var that is set in the dockerfile
  if  [[ -v RUN_IN_CONTAINER  ]]; then
    gcloud auth activate-service-account --key-file "${GOOGLE_CREDENTIALS}"
    gcloud container clusters get-credentials parity-zombienet --zone europe-west3-b --project parity-zombienet
  fi
  cd "${OUTPUT_DIR}"
  set -x
  set +e
  if [[ ! -z $TEST_TO_RUN ]]; then
    TEST_FOUND=0
    for i in $(find ${OUTPUT_DIR} -name "${TEST_TO_RUN}"| head -1); do
      TEST_FOUND=1
      zombie test $i
      EXIT_STATUS=$?
    done;
    if [[ $TEST_FOUND -lt 1 ]]; then
      EXIT_STATUS=1
    fi;
  else
    for i in $(find ${OUTPUT_DIR} -name *.zndsl | sort); do
      echo "running test: ${i}"
      zombie test $i
      TEST_EXIT_STATUS=$?
      EXIT_STATUS=$((EXIT_STATUS+TEST_EXIT_STATUS))
    done;
  fi

  set +x
  set -e
}

function log {
  local lvl msg fmt
  lvl=$1 msg=$2
  fmt='+%Y-%m-%d %H:%M:%S'
  lg_date=$(date "${fmt}")
  if [[ "${lvl}" = "DIE" ]] ; then
    lvl="ERROR"
   echo -e "\n${lg_date} - ${lvl} - ${msg}"
   exit 1
  else
    echo -e "\n${lg_date} - ${lvl} - ${msg}"
  fi
}

main "$@"
