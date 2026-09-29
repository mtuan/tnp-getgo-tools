# Android Firebase deployment files

GetGo Web now owns the complete native target configuration at:

```text
tnp-getgo-web/configs/native/<target>/config.json
tnp-getgo-web/configs/native/<target>/GoogleService-Info.plist
tnp-getgo-web/configs/native/<target>/google-services.json
```

Tools validates the selected target directory before starting a job. GetGo Web
then reads that same directory, validates its Firebase project, bundle/package
identity, OAuth clients, and Facebook App ID, and stages only those selected
files before Capacitor synchronization. The old Tools-local Android file is no
longer a build input.
