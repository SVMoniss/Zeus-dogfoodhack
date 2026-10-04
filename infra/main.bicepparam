// Fill in per environment. Secrets stay in GitHub Actions secrets and are
// passed as --parameters overrides (see .github/workflows/azure-deploy.yml).
using './main.bicep'

param baseName = 'dogfood'
// First deploy: the workflow builds + pushes the image BEFORE running Bicep,
// so pass the real tag, e.g.:
//   --parameters backendImage=ghcr.io/<owner>/dogfood-backend:<sha>
param backendImage = 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'
param databaseUrl = ''
param secretKey = ''
