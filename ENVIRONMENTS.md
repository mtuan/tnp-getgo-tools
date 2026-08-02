# GetGo environments

GetGo Tools selects its Firebase backend from the environment selector in the app. Each backend has an independent encrypted login session.

Copy `.env.example` to `.env`, then fill in the Firebase Web API key and numeric project number (`messagingSenderId` in the Web app configuration) for each project:

| App environment | Firebase project |
| --- | --- |
| Development | `tnp-getgo-dev` |
| Staging | `tnp-getgo-staging` |
| Production | `tnp-getgo` |

The Google Desktop OAuth client and Facebook App ID are application credentials and remain shared. Enable the corresponding sign-in providers in all three Firebase projects.

After changing `.env`, restart the Electron main process. Vite hot reload does not reload main-process environment variables.

`npm run dist` packages the local `.env` into the desktop application resources so installed builds use the same environment map. Treat distributed desktop credentials as public native-app configuration; never put privileged service-account keys or server secrets in this file.
