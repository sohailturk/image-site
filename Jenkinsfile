pipeline {
    agent any

    environment {
        // Docker registry and image details
        REGISTRY = 'docker.io'
        REPO = 'bluells/my-app'
        // Incremental tag using Jenkins BUILD_NUMBER (auto-increments every build)
        TAG = "${env.BUILD_NUMBER}"
        FULL_IMAGE = "${REGISTRY}/${REPO}:${TAG}"
        LATEST_IMAGE = "${REGISTRY}/${REPO}:latest"
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Build Docker Image') {
            steps {
                script {
                    docker.build(FULL_IMAGE, ".")
                    docker.build(LATEST_IMAGE, ".")
                }
            }
        }

        stage('Push to Docker Registry') {
            steps {
                script {
                    // Log in to Docker Hub using credentials stored in Jenkins
                    // Create the credential in Jenkins: docker-hub-cred (username + password/token)
                    docker.withRegistry("https://${REGISTRY}", 'docker-creds') {
                        docker.image(FULL_IMAGE).push()
                        docker.image(LATEST_IMAGE).push()
                    }
                }
            }
        }
    }

    post {
        success {
            echo "Successfully pushed ${FULL_IMAGE} and ${LATEST_IMAGE}"
        }
        failure {
            echo "Build or push failed"
        }
    }
}
