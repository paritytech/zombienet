#!/usr/bin/env bash

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
  -t, --test         OPTIONAL Test file to run
                     If omitted "all" test in the tests directory will be used.
  -l, --local-dir    Directory where the test/config files lives, can be absolute or
                     relatives to ${SCRIPT_PATH}
  -c, --concurrency  OPTIONAL concurrency for spawn nodes
  -h, --help         OPTIONAL Print this help message
  -o, --output-dir   OPTIONAL
                     Path to dir where to save contents of --local-dir
                     Defaults to ${SCRIPT_PATH}
                     specified, it will be ifered from there.

EXAMPLES
Run tests
${SCRIPT_NAME} -l https://github.com/paritytech/polkadot/tree/master/zombienet_tests

EOF
}

function main {
  # Main entry point for the script
  set_defaults_for_globals
  parse_args "$@"
  create_isolated_dir
  copy_to_isolated
  set_instance_env
  if [[ $KUBECONFIG == "" ]]; then
    k8s_auth
  fi
  run_test
  rm_isolated_dir
  log INFO "Exit status is ${EXIT_STATUS}"
  exit "${EXIT_STATUS}"
}

function create_isolated_dir {
  TS=$(date +%s)
  ISOLATED=${OUTPUT_DIR}/${TS}
  mkdir -p ${ISOLATED}
  OUTPUT_DIR="${ISOLATED}"
}

function copy_to_isolated {
  cd "${SCRIPT_PATH}"
  echo $(pwd)
  cp -r "${LOCAL_DIR}"/* "${OUTPUT_DIR}"
}

function rm_isolated_dir {
  echo "Removing ${OUTPUT_DIR}"
  rm -rf "${OUTPUT_DIR}"
}

function set_defaults_for_globals {
  # DEFAULT VALUES for variables used for testing different projects
  SCRIPT_NAME="$0"
  SCRIPT_PATH=$(dirname "$0")               # relative
  SCRIPT_PATH=$(cd "${SCRIPT_PATH}" && pwd) # absolutized and normalized

  export GOOGLE_CREDENTIALS="/etc/zombie-net/sa-zombie.json"

  ZOMBIE_LOCAL=${ZOMBIE_LOCAL:-""}
  KUBECONFIG=${KUBECONFIG:-""}

  if [[ ${ZOMBIE_LOCAL} == "1" ]]; then
    ZOMBIE_COMMAND="npm run zombie"
  else
    ZOMBIE_COMMAND=zombie
  fi

  cd "${SCRIPT_PATH}"

  EXIT_STATUS=0
  LOCAL_DIR=""
  TEST_TO_RUN=""
  CONCURRENCY=2

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
    if [[ ! -n "${LOCAL_DIR}" ]] ; then
      log DIE "Not LOCAL_DIR Set"
    fi
  }

  # shellcheck disable=SC2214
  while getopts i:t:l:h:uo:-: OPT; do
    # support long options: https://stackoverflow.com/a/28466267/519360
    if [ "$OPT" = "-" ]; then   # long option: reformulate OPT and OPTARG
      OPT="${OPTARG%%=*}"       # extract long option name
      OPTARG="${OPTARG#$OPT}"   # extract long option argument (may be empty)
      OPTARG="${OPTARG#=}"      # if long option argument, remove assigning `=`
    fi
    case "$OPT" in
      t | test)                 needs_arg ; TEST_TO_RUN="${OPTARG}"  ;;
      c | concurrency)          needs_arg ; CONCURRENCY="${OPTARG}"  ;;
      l | local-dir)            needs_arg ; LOCAL_DIR="${OPTARG}"          ;;
      h | help )                usage     ; exit 0                             ;;
      o | output-dir)           needs_arg ; OUTPUT_DIR="${OPTARG}"             ;;
      ??* )                     log DIE "Illegal option --${OPT}" ;;
      ? )                       exit 2 ;;
    esac
  done
  shift $((OPTIND-1)) # remove parsed options and args from $@ list
  check_args
}

function set_instance_env {
  if [[ ${CI_PIPELINE_ID:=""} && ${CI_PROJECT_ID:=""} ]]; then
    echo project_id: $CI_PROJECT_ID
    echo pipeline_id: $CI_PIPELINE_ID
    echo job_name: $CI_JOB_NAME

    if [[ "${FORCED_INFRA_INSTANCE:=""}" != "" ]];then
	    echo "setting env X_INFRA_INSTANCE to $FORCED_INFRA_INSTANCE"
      export X_INFRA_INSTANCE=$FORCED_INFRA_INSTANCE
    else
      # export default
      export X_INFRA_INSTANCE=ondemand

      STATUS=$(curl -s -o response.txt -w "%{http_code}" -H "Accept: application/json" "https://gitlab.parity.io/api/v4/projects/${CI_PROJECT_ID}/pipelines/${CI_PIPELINE_ID}/jobs?include_retried=true")
      if [ $STATUS == "200" ]; then
        JOBS_CANCELED_BY_US=$(cat response.txt |jq -c ".[] | select((.name | contains(\"${CI_JOB_NAME}\")) and .status == \"canceled\" and (.duration >= 0))" | wc -l)
        if [[ $JOBS_CANCELED_BY_US -eq 0 ]]; then
          export X_INFRA_INSTANCE=spot
          # only mod 2 for PoC (uncomment for rollback)
          # R=$(( $CI_PIPELINE_ID % 2));
          # if [[ $R -eq 0 ]];then
          #   export X_INFRA_INSTANCE=spot
          # fi;
        fi;
      fi;
    fi;
  fi;
}

function k8s_auth {
  # RUN_IN_CONTAINER is env var that is set in the dockerfile
  if  [[ -v RUN_IN_CONTAINER  ]]; then
    if [[ -v GHA_CLUSTER_SERVER_ADDR ]]; then
      kubectl config set-cluster parity-zombienet --server="${GHA_CLUSTER_SERVER_ADDR}" --certificate-authority=/var/run/secrets/kubernetes.io/serviceaccount/ca.crt
      kubectl config set-credentials pod-token --token="$(cat /var/run/secrets/kubernetes.io/serviceaccount/token)"
      kubectl config set-context pod-context --cluster=parity-zombienet --user=pod-token
      kubectl config use-context pod-context
    else
      gcloud auth activate-service-account --key-file "${GOOGLE_CREDENTIALS}"
      gcloud container clusters get-credentials parity-zombienet --zone europe-west3-b --project parity-zombienet
    fi;
  fi
}

function run_test {
  cd "${OUTPUT_DIR}"
  set -x
  set +e
  if [[ ! -z $CONCURRENCY ]]; then
    C=2
  else
    C=$CONCURRENCY
  fi;
  if [[ ! -z $TEST_TO_RUN ]]; then
    TEST_FOUND=0
    for i in $(find ${OUTPUT_DIR} -name "${TEST_TO_RUN}"| head -1); do
      TEST_FOUND=1
      # copy files if env variable ZOMBIE_LOCAL is set
      if [[ ! -z $ZOMBIE_LOCAL ]]; then
        cp -r ../../../javascript/* .
      fi;
      ${ZOMBIE_COMMAND} -c $CONCURRENCY test $i
      EXIT_STATUS=$?
    done;
    if [[ $TEST_FOUND -lt 1 ]]; then
      EXIT_STATUS=1
    fi;
  else
    for i in $(find ${OUTPUT_DIR} -name *.zndsl | sort); do
      echo "running test: ${i}"
      ${ZOMBIE_COMMAND} -c $CONCURRENCY test $i
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

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  log INFO "Running main"
  main "$@"
else
  log WARN "Script is being sourcing"
fi

