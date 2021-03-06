# Common containit script environment setup
#
# Must set TOP_DIR prior to sourcing this script.

CTR_ADD_PATH="/src/node_modules/.bin"

if [[ $(pwd) =~ ${TOP_DIR}/([^/]+) ]]; then
    PROJECT="${BASH_REMATCH[1]}"
    if [ -n "${PROJECT}" ]; then
        CTR_ADD_PATH="/src/${PROJECT}/node_modules/.bin:${CTR_ADD_PATH}"
    fi
fi

# Ensure the DNS cache is running and use that as the DNS server
DNS_IP=$("${TOP_DIR}/bin/dnsmasq")
if [ $? -ne 0 ]; then
    echo "Error starting DNS cache"
    exit 1
fi
DOCKER_ARGS+=" --dns ${DNS_IP}"

# Use tmpfs for /tmp inside the container
DOCKER_ARGS+=" --tmpfs /tmp:exec"

# Add ability to modify resource limits. Needed for ulimit -n for docker setup.
DOCKER_ARGS+=" --cap-add=SYS_RESOURCE"

# Directory for caches inside the container
# Must agree with yarn cache dir set in config/yarnrc
CTR_CACHE_DIR="/var/cache/adapt"

# NPM setup
DOCKER_ARGS+=" -eNPM_CONFIG_CACHE=${CTR_CACHE_DIR}/npm"
DOCKER_ARGS+=" -eNPM_CONFIG_FETCH_RETRIES=5"
DOCKER_ARGS+=" -eNPM_CONFIG_FETCH_RETRY_FACTOR=2"
DOCKER_ARGS+=" -eNPM_CONFIG_FETCH_RETRY_MINTIMEOUT=50"

# Yarn setup
DOCKER_ARGS+=" -v${TOP_DIR}/config/yarnrc:/root/.yarnrc"
DOCKER_ARGS+=' -eYARN_AUTH_TOKEN="faketoken"'

if [ -n "${CI}" ]; then
    # IN CI, use tmpfs for caches
    DOCKER_ARGS+=" --tmpfs ${CTR_CACHE_DIR}:exec"
else
    # In dev, use the user's cache
    DOCKER_ARGS+=" -v${HOME}/.cache/yarn:${CTR_CACHE_DIR}/yarn"
    DOCKER_ARGS+=" -v${HOME}/.npm:${CTR_CACHE_DIR}/npm"
fi

# Don't print annoying npm upgrade warning
DOCKER_ARGS+=" -eNO_UPDATE_NOTIFIER=1"

DOCKER_ARGS+=" -v/var/run/docker.sock:/var/run/docker.sock"

# Export Docker auth into child containers, either via env or file
if [ -n "${DOCKER_AUTH_CONFIG}" ]; then
    DOCKER_ARGS+=" -eDOCKER_AUTH_CONFIG"
else
    DOCKER_CREDS_DIR="${HOME}/.docker"
    if [ -f "${DOCKER_CREDS_DIR}/config.json" ]; then
        DOCKER_ARGS+=" -v${DOCKER_CREDS_DIR}:/root/.docker"
    fi
fi

CRED_FILE="${HOME}/.adaptAwsCreds"
if [ -f "${CRED_FILE}" ]; then
    DOCKER_ARGS+=" -v${CRED_FILE}:/root/.adaptAwsCreds"
fi

if [ -n "${SSH_AUTH_SOCK}" ]; then
    DOCKER_ARGS+=" -v${SSH_AUTH_SOCK}:/ssh-agent -eSSH_AUTH_SOCK=/ssh-agent"
fi

# Export test SSH key into child containers. If not present in environment,
# read it off disk.
if [ -z "${ADAPT_UNIT_TEST_KEY}" ]; then
    UNIT_TEST_KEY_FILE="${HOME}/.ssh/adapt-unit-tests.priv"
    if [ -f "${UNIT_TEST_KEY_FILE}" ]; then
        export ADAPT_UNIT_TEST_KEY=$(<"${UNIT_TEST_KEY_FILE}")
    fi
fi
DOCKER_ARGS+=" -eADAPT_UNIT_TEST_KEY"

GIT_USER_NAME=${GIT_USER_NAME:-${GITLAB_USER_NAME:-$(git config --get user.name)}}
if [ -n "${GIT_USER_NAME}" ]; then
    export GIT_USER_NAME
    DOCKER_ARGS+=" -eGIT_USER_NAME"
fi
GIT_USER_EMAIL=${GIT_USER_EMAIL:-${GITLAB_USER_EMAIL:-$(git config --get user.email)}}
if [ -n "${GIT_USER_EMAIL}" ]; then
    export GIT_USER_EMAIL
    DOCKER_ARGS+=" -eGIT_USER_EMAIL"
fi

DOCKER_ARGS+=" -eNODE_NO_WARNINGS=1"

# Propagate these from current environment into the docker container env
DOCKER_ARGS+=" -eADAPT_PARALLEL_MAKE -eADAPT_TEST_HEAPDUMP"
DOCKER_ARGS+=" -eADAPT_TEST_K8S -eADAPT_RUN_LONG_TESTS"
DOCKER_ARGS+=" -eADAPT_RELEASE_TYPE -eADAPT_RELEASE_TESTS"
DOCKER_ARGS+=" -eADAPT_NO_FORK -eADAPT_WEB_TOKEN -eADAPT_NPM_TOKEN -eCI_JOB_TOKEN -eCI -eCI_PROJECT_PATH"
DOCKER_ARGS+=" -eAWS_ACCESS_KEY_ID -eAWS_SECRET_ACCESS_KEY -eAWS_DEFAULT_REGION"
