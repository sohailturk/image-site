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

        // stage('Push to Docker Registry') {
        //     steps {
        //         script {
        //             // Log in to Docker Hub using credentials stored in Jenkins
        //             // Create the credential in Jenkins with ID: docker-creds
        //             // The Docker Hub user must have push access to the repo, and the token/password
        //             // must have push/write scope (Docker Hub PAT: push_and_pull).
        //             docker.withRegistry("https://${REGISTRY}", 'docker-creds') {
        //                 docker.image(FULL_IMAGE).push()
        //                 docker.image(LATEST_IMAGE).push()
        //             }
        //         }
        //     }
        // }
    
    stage('Push to Docker Registry') {
    steps {
        withCredentials([
            usernamePassword(
                credentialsId: 'docker-creds',
                usernameVariable: 'DOCKERHUB_USER',
                passwordVariable: 'DOCKERHUB_TOKEN'
            )
        ]) {
            sh '''
                set +x

                echo "Logging into Docker Hub..."

                printf '%s' "$DOCKERHUB_TOKEN" | docker login \
                    --username "$DOCKERHUB_USER" \
                    --password-stdin

                echo "Pushing versioned image..."
                docker push "$FULL_IMAGE"

                echo "Pushing latest image..."
                docker push "$LATEST_IMAGE"

                docker logout
            '''
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
