# GitHub Actions deploy

Pushes to `main` run [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml), which redeploys `callsomeone-web` from the repository root. The root Docker build uses the committed npm lockfile, and the Next.js app serves the API under `/api`.

The service deploys to Cloud Run in `ear-thabhelo` / `us-central1`.

## One-time setup

Run from the repo root:

```bash
chmod +x infra/scripts/setup-github-deploy.sh
./infra/scripts/setup-github-deploy.sh ear-thabhelo Thabhelo/ear
```

Then add GitHub secrets (the script prints the exact values):

| Secret | Purpose |
| ------ | ------- |
| `GCP_SERVICE_ACCOUNT` | Deployer service account email |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | Workload Identity Federation provider resource name |

Using the GitHub CLI:

```bash
gh secret set GCP_SERVICE_ACCOUNT -R Thabhelo/ear -b "github-actions-deploy@ear-thabhelo.iam.gserviceaccount.com"
gh secret set GCP_WORKLOAD_IDENTITY_PROVIDER -R Thabhelo/ear -b "projects/963565155466/locations/global/workloadIdentityPools/github/providers/github"
```

No long-lived JSON keys are stored in GitHub. Authentication uses OIDC + Workload Identity Federation.

## What gets deployed

**Web** uses `apps/web/.cloudrun.env.yaml` for build-time `NEXT_PUBLIC_*` Firebase config and runtime server settings (GCP project, storage bucket), plus Secret Manager for Stripe + LiveKit secrets.

## Manual deploy (same as CI)

```bash
gcloud run deploy callsomeone-web --project=ear-thabhelo --region=us-central1 --source=. ...
```

See [cloud-run.md](./cloud-run.md) for Secret Manager details.
