/*
 * Awesome Cars - CI/CD pipeline
 *
 * Test -> Build image -> Push to Docker Hub -> SSH to EC2 -> Pull -> Run (with health check + rollback)
 *
 * Jenkins prerequisites (see DEPLOYMENT.md for the full walkthrough):
 *   Credentials:
 *     - docker-creds   : Username with password (Docker Hub username + access token, push/pull scope)
 *     - ec2-ssh-key    : SSH Username with private key (username = ec2-user / ubuntu, private key = EC2 .pem)
 *   Agent:
 *     - docker CLI + daemon (jenkins user in the "docker" group)
 *     - node + npm 20+ (for the test stage)
 *     - ssh client (openssh-client) and curl
 */

pipeline {
    agent any

    options {
        buildDiscarder(logRotator(numToKeepStr: '30', artifactNumToKeepStr: '10'))
        disableConcurrentBuilds()
        timeout(time: 30, unit: 'MINUTES')
    }

    parameters {
        string(
            name: 'IMAGE_TAG',
            defaultValue: '',
            description: 'Optional explicit image tag. Leave empty to auto-generate <package-version>-<build-number>-<git-sha>.'
        )
        booleanParam(
            name: 'PUSH_LATEST',
            defaultValue: true,
            description: 'Also tag and push :latest (only done from the default branch).'
        )
        booleanParam(
            name: 'SKIP_DEPLOY',
            defaultValue: false,
            description: 'Build and push only, do not touch EC2.'
        )
        booleanParam(
            name: 'FORCE_DEPLOY',
            defaultValue: false,
            description: 'Allow deployment from a non-default branch.'
        )
        string(
            name: 'DEPLOY_HOST',
            defaultValue: '50.16.123.15',
            description: 'EC2 public DNS name or IP. The SSH username comes from the ec2-ssh-key credential.'
        )
        string(
            name: 'HOST_PORT',
            defaultValue: '3000',
            description: 'Port published on the EC2 host (mapped to container port 3000).'
        )
        booleanParam(
            name: 'PRIVATE_REPO',
            defaultValue: true,
            description: 'Run docker login on EC2 before pulling (enable if the Docker Hub repo is private).'
        )
    }

    environment {
        DOCKER_REGISTRY     = 'docker.io'
        DOCKER_LOGIN_SERVER = 'https://index.docker.io/v1/'
        IMAGE_REPO          = 'bluells/my-app'
        DOCKER_CREDS_ID     = 'docker-creds'
        SSH_CREDS_ID        = 'ec2-ssh-key'
        CONTAINER_NAME      = 'my-app'
        SSH_PORT            = '22'
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm

                script {
                    // Keep the last line of defence against deploying a broken build.
                    env.GIT_SHA = sh(
                        script: 'git rev-parse HEAD',
                        returnStdout: true
                    ).trim()
                    env.GIT_SHORT_SHA = env.GIT_SHA.take(8)
                }
            }
        }

        stage('Install Dependencies') {
            steps {
                sh 'npm ci --no-audit --no-fund'
            }
        }

        stage('Test') {
            steps {
                sh 'npm test'
            }
        }

        stage('Version') {
            steps {
                script {
                    def pkgVersion = sh(
                        script: 'node -p "require(\'./package.json\').version"',
                        returnStdout: true
                    ).trim()

                    def gitTag = sh(
                        script: 'git describe --tags --exact-match 2>/dev/null || true',
                        returnStdout: true
                    ).trim()

                    def branch = (env.BRANCH_NAME ?: env.GIT_BRANCH ?: 'main').replaceFirst(/^origin\//, '')
                    def isDefaultBranch = (branch == 'main' || branch == 'master')

                    // Safe defaults: a Jenkinsfile's new parameters only exist from the second build on.
                    env.PUSH_LATEST   = (params.PUSH_LATEST   == null ? true  : params.PUSH_LATEST).toString()
                    env.SKIP_DEPLOY   = (params.SKIP_DEPLOY   == null ? false : params.SKIP_DEPLOY).toString()
                    env.FORCE_DEPLOY  = (params.FORCE_DEPLOY  == null ? false : params.FORCE_DEPLOY).toString()
                    env.PRIVATE_REPO  = (params.PRIVATE_REPO  == null ? true  : params.PRIVATE_REPO).toString()
                    env.DEPLOY_HOST   = (params.DEPLOY_HOST   ?: '50.16.123.15')
                    env.HOST_PORT     = (params.HOST_PORT     ?: '3000')

                    env.APP_VERSION   = pkgVersion
                    env.VERSION_TAG   = params.IMAGE_TAG?.trim() ? params.IMAGE_TAG.trim() : (gitTag ?: "${pkgVersion}-${env.BUILD_NUMBER}-${env.GIT_SHORT_SHA}")
                    env.TAG_LATEST    = (env.PUSH_LATEST == 'true' && isDefaultBranch) ? 'true' : 'false'
                    env.SHOULD_DEPLOY = (env.SKIP_DEPLOY != 'true' && (env.FORCE_DEPLOY == 'true' || isDefaultBranch)) ? 'true' : 'false'

                    env.IMAGE        = "${env.DOCKER_REGISTRY}/${env.IMAGE_REPO}:${env.VERSION_TAG}"
                    env.IMAGE_SHA    = "${env.DOCKER_REGISTRY}/${env.IMAGE_REPO}:sha-${env.GIT_SHORT_SHA}"
                    env.LATEST_IMAGE = "${env.DOCKER_REGISTRY}/${env.IMAGE_REPO}:latest"

                    echo """Image versioning
                        |  branch        : ${branch}
                        |  app version   : ${env.APP_VERSION}
                        |  commit        : ${env.GIT_SHA}
                        |  versioned tag : ${env.IMAGE}
                        |  commit tag    : ${env.IMAGE_SHA}
                        |  latest tag    : ${env.TAG_LATEST == 'true' ? env.LATEST_IMAGE : '(skipped)'}
                        |  deploy        : ${env.SHOULD_DEPLOY == 'true' ? "yes -> ${env.DEPLOY_HOST}:${env.HOST_PORT}" : 'no'}
                        |""".stripMargin()
                }
            }
        }

        stage('Build Docker Image') {
            steps {
                sh """
                    set -eu
                    docker build \\
                        --pull \\
                        --build-arg APP_VERSION=${env.APP_VERSION} \\
                        --build-arg GIT_SHA=${env.GIT_SHA} \\
                        --label org.opencontainers.image.created=\$(date -u +%Y-%m-%dT%H:%M:%SZ) \\
                        --label org.opencontainers.image.version=${env.APP_VERSION} \\
                        --label org.opencontainers.image.revision=${env.GIT_SHA} \\
                        -t ${env.IMAGE} \\
                        -t ${env.IMAGE_SHA} \\
                        .
                """
            }
        }

        stage('Push to Docker Hub') {
            steps {
                withCredentials([usernamePassword(
                    credentialsId: env.DOCKER_CREDS_ID,
                    usernameVariable: 'DOCKERHUB_USER',
                    passwordVariable: 'DOCKERHUB_TOKEN'
                )]) {
                    sh '''
                        set -eu
                        set +x
                        printf '%s' "$DOCKERHUB_TOKEN" | docker login "$DOCKER_LOGIN_SERVER" \
                            --username "$DOCKERHUB_USER" --password-stdin

                        if [ "$TAG_LATEST" = "true" ]; then
                            docker tag "$IMAGE" "$LATEST_IMAGE"
                        fi

                        echo "Pushing $IMAGE"
                        docker push "$IMAGE"

                        echo "Pushing $IMAGE_SHA"
                        docker push "$IMAGE_SHA"

                        if [ "$TAG_LATEST" = "true" ]; then
                            echo "Pushing $LATEST_IMAGE"
                            docker push "$LATEST_IMAGE"
                        else
                            echo "Skipping :latest (not the default branch or disabled)."
                        fi
                    '''
                }
            }
        }

        stage('Deploy to EC2') {
            when {
                expression { env.SHOULD_DEPLOY == 'true' }
            }
            steps {
                withCredentials([
                    sshUserPrivateKey(
                        credentialsId: env.SSH_CREDS_ID,
                        keyFileVariable: 'SSH_KEY_FILE',
                        usernameVariable: 'SSH_USER'
                    ),
                    usernamePassword(
                        credentialsId: env.DOCKER_CREDS_ID,
                        usernameVariable: 'DOCKERHUB_USER',
                        passwordVariable: 'DOCKERHUB_TOKEN'
                    )
                ]) {
                    sh '''
                        set -eu

                        if ! command -v ssh >/dev/null 2>&1; then
                            echo "ERROR: ssh client not found in the Jenkins agent/container."
                            echo "Install it in the Jenkins image, e.g.: apt-get update && apt-get install -y openssh-client"
                            exit 1
                        fi

                        chmod 600 "$SSH_KEY_FILE"
                        mkdir -p "$HOME/.ssh"

                        SSH_OPTS="-i $SSH_KEY_FILE -p $SSH_PORT -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=20 -o BatchMode=yes -o ServerAliveInterval=30"
                        TARGET="$SSH_USER@$DEPLOY_HOST"

                        echo "Verifying SSH access to $TARGET ..."
                        ssh $SSH_OPTS "$TARGET" 'echo "connected to $(hostname)"; docker --version'

                        if [ "$PRIVATE_REPO" = "true" ]; then
                            echo "Logging in to Docker Hub on the remote host ..."
                            printf '%s\n' "$DOCKERHUB_TOKEN" | \
                                ssh $SSH_OPTS "$TARGET" "docker login '$DOCKER_LOGIN_SERVER' --username '$DOCKERHUB_USER' --password-stdin"
                        fi

                        echo "Deploying $IMAGE ..."
                        ssh $SSH_OPTS "$TARGET" 'bash -s' -- "$IMAGE" "$CONTAINER_NAME" "$HOST_PORT" < scripts/remote-deploy.sh
                    '''
                }
            }
        }

        stage('Smoke Test') {
            when {
                expression { env.SHOULD_DEPLOY == 'true' }
            }
            steps {
                catchError(buildResult: 'SUCCESS', stageResult: 'UNSTABLE') {
                    sh '''
                        set -eu
                        if ! command -v curl >/dev/null 2>&1; then
                            echo "curl not available on the agent, skipping public smoke test."
                            exit 0
                        fi

                        URL="http://$DEPLOY_HOST:$HOST_PORT/health"
                        echo "GET $URL"
                        for i in $(seq 1 12); do
                            if curl -fsS --max-time 5 "$URL"; then
                                echo
                                echo "Public smoke test passed."
                                exit 0
                            fi
                            sleep 5
                        done
                        echo "Public smoke test failed - the app may only be reachable from inside the VPC/security group."
                        exit 1
                    '''
                }
            }
        }
    }

    post {
        success {
            script {
                if (env.SHOULD_DEPLOY == 'true') {
                    echo "Deployed ${env.IMAGE} to ${env.DEPLOY_HOST}:${env.HOST_PORT} (container: ${env.CONTAINER_NAME})"
                } else {
                    echo "Built and pushed ${env.IMAGE} (deploy skipped)"
                }
            }
        }
        failure {
            echo "Pipeline failed at an earlier stage. Image ${env.IMAGE ?: 'n/a'} was not deployed (or was rolled back)."
        }
        always {
            sh 'docker logout "$DOCKER_LOGIN_SERVER" >/dev/null 2>&1 || true'
            sh 'docker image prune -f >/dev/null 2>&1 || true'
        }
    }
}
