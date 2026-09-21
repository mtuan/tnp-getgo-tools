# Android Firebase deployment files

GetGo Tools owns the Firebase Android configuration selected for native Web
build, run, and publish jobs. Store each local file at:

```text
configs/native/development/google-services.json
configs/native/staging/google-services.json
configs/native/production/google-services.json
```

The standard Firebase client JSON files are source-controlled so native builds
are reproducible. They contain public project/application identifiers, not
service-account credentials or OAuth client secrets. Paths outside this
repository can still be set in the private `.env` file with:

```text
GETGO_ANDROID_DEVELOPMENT_GOOGLE_SERVICES_PATH=
GETGO_ANDROID_STAGING_GOOGLE_SERVICES_PATH=
GETGO_ANDROID_PRODUCTION_GOOGLE_SERVICES_PATH=
```

Tools passes only the selected target file to GetGo Web. GetGo Web validates
its Firebase project, Android package, and Android OAuth client before any
Capacitor synchronization or native build begins.
