pipeline {
    agent any

    environment {
        CI = 'true'
    }

    stages {
        stage('Check Skip CI') {
            steps {
                script {
                    // Fetch the latest commit message
                    def commitMessage = sh(returnStdout: true, script: 'git log -1 --pretty=%B').trim()
                    
                    // Check for standard skip CI flags
                    if (commitMessage.contains('[skip ci]') || 
                        commitMessage.contains('[ci skip]') || 
                        commitMessage.contains('[no ci]') || 
                        commitMessage.contains('[skip actions]') || 
                        commitMessage.contains('[actions skip]')) {
                        
                        currentBuild.result = 'NOT_BUILT'
                        error('Skipping build due to [skip ci] in commit message')
                    }
                }
            }
        }

        stage('Setup') {
            steps {
                // Ensure Node.js and npm are available
                // Note: Jenkins often uses the NodeJS plugin to inject these into the PATH.
                sh 'node --version'
                sh 'npm --version'
            }
        }

        stage('Install Dependencies') {
            steps {
                // Jenkins does not have an out-of-the-box caching step like GitHub Actions.
                // Dependency caching requires additional plugins (e.g., Job Cacher) or custom scripting.
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
            echo 'Pipeline failed. Please check the logs.'
        }
    }
}
