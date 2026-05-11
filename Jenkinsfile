pipeline {
    agent any
    tools {
        nodejs 'nodejs'
    }

    environment {
        CI = 'true'
    }

    stages {
        stage('Check Skip CI') {
            steps {
                script {
                    def commitMessage = sh(
                        returnStdout: true,
                        script: 'git log -1 --pretty=%B'
                    ).trim()

                    if (
                        commitMessage.contains('[skip ci]') ||
                        commitMessage.contains('[ci skip]') ||
                        commitMessage.contains('[no ci]') ||
                        commitMessage.contains('[skip actions]') ||
                        commitMessage.contains('[actions skip]')
                    ) {
                        currentBuild.result = 'NOT_BUILT'
                        error('Skipping build due to skip ci flag')
                    }
                }
            }
        }

        stage('Setup') {
            steps {
                sh 'node --version'
                sh 'npm --version'
            }
        }

        stage('Install Dependencies') {
            steps {
                sh 'npm ci'
            }
        }

        stage('Run ESLint') {
            steps {
                sh 'npx eslint . --ext .ts'
            }
        }

        stage('Build') {
            steps {
                sh 'npm run build'
            }
        }

        stage('Run Tests and Check Coverage') {
            steps {
                sh 'npm run test:coverage'
            }
        }
    }

    post {
        success {
            echo 'Pipeline successfully completed!'
        }

        failure {
            echo 'Pipeline failed. Please check logs.'
        }
    }
}
