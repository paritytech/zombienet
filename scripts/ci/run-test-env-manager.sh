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
 -c, --concurrency   concurrency for spawn nodes
                     If omitted "all" test in the directory will be used.
  -g, --github-remote-dir
                     OPTIONAL URL to a directory hosted on github, e.g.:
                     https://github.com/paritytech/polkadot/tree/master/simnet_tests
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
  download_from_remote
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
    if [[ -n "${GH_REMOTE_DIR}" &&
          ! "${GH_REMOTE_DIR}" =~ https:\/\/github.com\/ ]] ; then
      log DIE "Not a github URL"
    fi
  }

  # shellcheck disable=SC2214
  while getopts i:t:g:c:h:uo:-: OPT; do
    # support long options: https://stackoverflow.com/a/28466267/519360
    if [ "$OPT" = "-" ]; then   # long option: reformulate OPT and OPTARG
      OPT="${OPTARG%%=*}"       # extract long option name
      OPTARG="${OPTARG#$OPT}"   # extract long option argument (may be empty)
      OPTARG="${OPTARG#=}"      # if long option argument, remove assigning `=`
    fi
    case "$OPT" in
      t | test)                 needs_arg ; TEST_TO_RUN="${OPTARG}"  ;;
      c | concurrency)          needs_arg ; CONCURRENCY="${OPTARG}"  ;;
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

function download_from_remote {
  log INFO "Downloading tests info from ${GH_REMOTE_DIR}"
  # https://github.com/paritytech/polkadot/tree/master/simnet_tests
  local org repo branch gh_dir

  org="$(   parse_url "${GH_REMOTE_DIR}" "org"    )"
  repo="$(  parse_url "${GH_REMOTE_DIR}" "repo"   )"
  branch="$(parse_url "${GH_REMOTE_DIR}" "branch" )"
  gh_dir="$(parse_url "${GH_REMOTE_DIR}" "gh_dir" )"
  log INFO "Found github api org:${org} repo:${repo} branch:${branch} gh_dir:${gh_dir}"

  function gh_download_content {
    # recursively download content of github dir
    local url dir
    url=$1 dir=$2
    mkdir -p "${OUTPUT_DIR}/${dir}"

    while read -r _path _type _download_url _url ; do
      if [[ "${_type}" == "file" ]] ; then
        echo curl "${_download_url}" --output "${OUTPUT_DIR}/${_path}"
        curl "${_download_url}" --output "${OUTPUT_DIR}/${_path}" --silent
      elif [[ "${_type}" == "symlink" ]] ; then
        echo curl "${_download_url}" --output "${OUTPUT_DIR}/${_path}"
        curl "${_download_url}" --output "${OUTPUT_DIR}/${_path}" --silent

        # replace _path with what you find in file download_url after removing
        # the dots and slashes
        # ../node/malus/integrationtests
        local new_path
        new_path=$(cat "${OUTPUT_DIR}/${_path}")
        new_path=$(sed -E 's|(\.+\/)||g'  <<< "${new_path}")

        # update _url : replace _path with new_path
        # "url": "https://api.github.com/repos/paritytech/polkadot/contents/simnet_tests/malus?ref=bernhard-malus-fx",

        local new_url
        new_url=$(sed -E  "s|${_path}|${new_path}|g"  <<< "${_url}")

        ln_src="$(cat "${OUTPUT_DIR}/${_path}")"
        ln_dst="${OUTPUT_DIR}/${_path}"

        log INFO "New download_url=${new_url}  and new_path=${new_path}"
        gh_download_content "${new_url}" "${new_path}"

        # create the simlink also
        rm "${ln_dst}"
        cd "$(dirname "${ln_dst}")"
        pwd
        ln -s  "${ln_src}" "${ln_dst}"
        cd -

      elif [[ "${_type}" == "dir" ]] ; then
        gh_download_content "${_url}" "${_path}"
      fi
    done< <(jq '.[] | "\(.path) \(.type) \(.download_url) \(.url)"' --raw-output < <(curl --silent "${url}"))
  }

  local url
  url="https://api.github.com/repos/${org}/${repo}/contents/${gh_dir}?ref=${branch}"
  gh_download_content "${url}" "${gh_dir}"
  log INFO "Finished downloading remote dir"
}

function parse_url {
  local gh_remote_dir gh_api_var output
  gh_remote_dir=$1 gh_api_var=$2
  output=""
  local url_regex="(https:\/\/github.com\/)([A-Za-z0-9_-]*)\/([A-Za-z0-9_-]*)\/tree\/([A-Za-z0-9_-]*)\/([A-Za-z0-9_\/-]+)"

  case "${gh_api_var}" in
    org )
      output="$(sed -E 's|'$url_regex'|\2|g' \
          <<< "${gh_remote_dir}")"
              ;;
    repo )
      output="$(sed -E 's|'$url_regex'|\3|g' \
          <<< "${gh_remote_dir}")"
              ;;
    branch )
      output="$(sed -E 's|'$url_regex'|\4|g' \
          <<< "${gh_remote_dir}")"
              ;;
    gh_dir )
      output="$(sed -E 's|'$url_regex'|\5|g' \
          <<< "${gh_remote_dir}")"
              ;;
    ??* )
      log DIE "Can't handle case when githib api var is ${gh_api_var}"
  esac

  if [[ -z "${output}"  ]] ; then
    log DIE "Could not find the required github api variable in github remote dir ${gh_remote_dir}"
  else
    echo "${output}"
  fi
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
  if [[ ! -z $CONCURRENCY ]]; then
    C=2
  else
    C=$CONCURRENCY
  fi;
  if [[ ! -z $TEST_TO_RUN ]]; then
    TEST_FOUND=0
    for i in $(find ${OUTPUT_DIR} -name "${TEST_TO_RUN}"| head -1); do
      TEST_FOUND=1
      zombie -c $CONCURRENCY test $i
      EXIT_STATUS=$?
    done;
    if [[ $TEST_FOUND -lt 1 ]]; then
      EXIT_STATUS=1
    fi;
  else
    for i in $(find ${OUTPUT_DIR} -name *.zndsl | sort); do
      echo "running test: ${i}"
      zombie -c $CONCURRENCY test $i
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
