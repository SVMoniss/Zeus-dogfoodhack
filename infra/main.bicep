// DOGFOOD 2026 — free-tier Azure hosting.
//
//   Backend  : Container Apps (consumption, scale-to-zero; Docker image as-is)
//   Frontend : Static Web Apps (Free SKU; Next.js via GitHub Action)
//   Database : Neon always-free Postgres (external; connection string passed in)
//
// Deploy: az deployment group create -g <rg> --template-file infra/main.bicep
//   --parameters infra/main.bicepparam
// The GitHub workflow (.github/workflows/azure-deploy.yml) does this for you.
targetScope = 'resourceGroup'

@description('Azure region for all resources.')
param location string = resourceGroup().location

@description('Prefix for resource names (lowercase, alphanumeric).')
param baseName string = 'dogfood'

@description('Backend container image, e.g. ghcr.io/<owner>/dogfood-backend:<tag>.')
param backendImage string

@description('Neon (non-pooled) connection string, postgresql://user:pass@host/db?sslmode=require')
@secure()
param databaseUrl string

@description('Backend SECRET_KEY. Generate once (openssl rand -hex 32) and keep stable across deploys.')
@secure()
param secretKey string

var swaName = '${baseName}-web'
var acaEnvName = '${baseName}-env'
var backendName = '${baseName}-api'
var logName = '${baseName}-logs'

// Static Web App first: the backend's FRONTEND_URL (CORS + cookie scope)
// is derived from its default hostname, so Bicep orders this correctly.
resource staticSite 'Microsoft.Web/staticSites@2023-12-01' = {
  name: swaName
  location: location
  sku: {
    name: 'Free'
    tier: 'Free'
  }
  properties: {
    repositoryUrl: 'https://github.com/SVMoniss/Zeus-dogfoodhack'
    branch: 'main'
    buildProperties: {
      appLocation: 'src/frontend'
      apiLocation: ''
      outputLocation: '.next'
    }
  }
}

resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2022-10-01' = {
  name: logName
  location: location
  properties: {
    sku: { name: 'PerGB2018' }
    retentionInDays: 30 // ingestion at demo scale fits the 5 GB/mo free allowance
  }
}

resource acaEnv 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: acaEnvName
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalytics.properties.customerId
        sharedKey: logAnalytics.listKeys().primarySharedKey
      }
    }
  }
}

resource backend 'Microsoft.App/containerApps@2024-03-01' = {
  name: backendName
  location: location
  properties: {
    managedEnvironmentId: acaEnv.id
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        targetPort: 8000
        transport: 'auto'
        allowInsecure: false
      }
      secrets: [
        {
          name: 'database-url'
          value: databaseUrl
        }
        {
          name: 'secret-key'
          value: secretKey
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'backend'
          image: backendImage
          // Same boot sequence as docker compose: seed -> migrate -> serve.
          command: [ 'sh' ]
          args: [
            '-c'
            'uv run python seed.py && uv run alembic upgrade head && uv run uvicorn app.main:app --host 0.0.0.0 --port 8000'
          ]
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          env: [
            {
              name: 'DATABASE_URL'
              secretRef: 'database-url'
            }
            {
              name: 'SECRET_KEY'
              secretRef: 'secret-key'
            }
            {
              name: 'DB_SSL'
              value: 'true'
            }
            {
              name: 'FRONTEND_URL'
              value: 'https://${staticSite.properties.defaultHostname}'
            }
            {
              name: 'COOKIE_SECURE'
              value: 'true'
            }
            {
              name: 'COOKIE_SAMESITE'
              value: 'none'
            }
            {
              name: 'PYTHONPATH'
              value: '/app'
            }
          ]
        }
      ]
      scale: {
        minReplicas: 0 // scale-to-zero keeps usage inside the consumption free grant
        maxReplicas: 1
      }
    }
  }
}

@description('Public backend base URL (NEXT_PUBLIC_API_URL for the SWA build).')
output backendFqdn string = 'https://${backend.properties.configuration.ingress.fqdn}'

@description('Static Web App default hostname.')
output swaHostname string = staticSite.properties.defaultHostname

@description('Deployment token for the Static Web Apps GitHub Action.')
output swaApiToken string = staticSite.listSecrets().properties.apiKey
