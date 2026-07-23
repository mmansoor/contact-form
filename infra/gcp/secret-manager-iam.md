# Secret Manager setup for v2 routing config

One-time setup to enable the config-driven v2 contact API in Cloud Run.

## 1. Create the secret

```bash
export CLOUDSDK_PYTHON=/opt/homebrew/bin/python3.14

# Create an empty secret (latest version added in the next step)
gcloud secrets create contact-form-routing-config \
  --project=contact-form-495912 \
  --replication-policy=automatic
```

## 2. Upload the routing config JSON

```bash
gcloud secrets versions add contact-form-routing-config \
  --project=contact-form-495912 \
  --data-file=config/contact-form-routing-config.json
```

Use your **production** config file (not the sample). The sample at
`config/contact-form-routing-config.sample.json` is a template only.

## 3. Grant the runtime service account access

```bash
gcloud secrets add-iam-policy-binding contact-form-routing-config \
  --project=contact-form-495912 \
  --member=serviceAccount:contact-form-deploy@contact-form-495912.iam.gserviceaccount.com \
  --role=roles/secretmanager.secretAccessor
```

## 4. Set Cloud Run environment variables

Set these as non-secret env vars on the Cloud Run service (or via the deploy
workflow's `vars`):

```
CONTACT_FORM_CONFIG_SOURCE=secret-manager
CONTACT_FORM_CONFIG_SECRET_NAME=contact-form-routing-config
CONTACT_FORM_CONFIG_PROJECT_ID=contact-form-495912
```

## 5. Deploy / bounce

Deploy a new revision. The server loads the secret at startup. If the config
is invalid the revision will fail health checks and Cloud Run rolls back to the
previous revision.

## Updating config

1. Edit the local config JSON.
2. Add a new version: `gcloud secrets versions add ...` (step 2).
3. Bounce the service so the new revision picks up `:latest`.

There is no hot-reload. The config is read once per cold start.
