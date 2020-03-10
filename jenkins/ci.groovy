node('devops-aws') {
    stage('Clean up') {
        sh 'rm -rf *'
    }
    stage('Checkout Changes') {
        def changeBranch = "change-${GERRIT_CHANGE_NUMBER}-${GERRIT_PATCHSET_NUMBER}"
        def scmVars = checkout scm
        git url: scmVars.GIT_URL
        sh "git fetch origin ${GERRIT_REFSPEC}:${changeBranch}"
        sh "git checkout ${changeBranch}"
    }
    stage('Install NPM Dependency') {
        echo 'NPM install..'
        sh 'npm install'
    }
    stage('Check NPM Dependency Vulnerability') {
        echo 'running npm audit..'
        sh 'npm audit'
    }
    stage('Analyze Source Code') {
        echo 'running linter..'
        sh 'npm run lint-check'
    }
    stage('Test') {
        echo 'running test..'
        sh 'npm test'
    }
}