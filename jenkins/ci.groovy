node('devops-aws') {
    stage('Checkout Changes') {
        def changeBranch = "change-${GERRIT_CHANGE_NUMBER}-${GERRIT_PATCHSET_NUMBER}"
        def scmVars = checkout scm
        git url: scmVars.GIT_URL, branch: 'main'
        sh "git fetch origin ${GERRIT_REFSPEC}:${changeBranch}"
        sh "git checkout ${changeBranch}"
    }
    stage('Install Dependencies') {
        echo 'running npm install...'
        sh 'npm install'
    }
    stage('Lint Source Code') {
        echo 'running linter...'
        sh 'npm run lint-check'
    }
    stage('Run Tests') {
        echo 'running test...'
        sh 'npm test'
    }
    stage('Verify Build Process') {
        echo 'verifying build...'
        sh 'npm run build'
    }
}
