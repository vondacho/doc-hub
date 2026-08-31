# iac — AWS Docker host for doc-hub

Terraform for a single EC2 instance that runs the whole of doc-hub as containers
behind Caddy, published as:

- https://doc-portal.obya.ch — the catalogue
- https://doc-registry.obya.ch — the Strapi CMS behind it
- https://doc-sm.obya.ch — the story mapping board
- https://doc-em.obya.ch — the example mapping board
- https://doc-es.obya.ch — the event storming board

The images are the ones `.github/workflows/build-images.yml` already pushes to
GHCR — nothing is built here. This stack is the *host*; `host/` is what runs on
it; `deploy.sh` is what puts the two together.

The `helm/` charts are a separate, local path (Rancher Desktop, `*.localhost`)
and are unaffected by any of this. The env vars are the same ones on both
paths — `host/docker-compose.yml` sets the ConfigMap keys from
`helm/<component>/templates/configmap.yaml` — so a value learned in one place
means the same thing in the other.

This is the same stack as `ba-hub/iac` and `dev-hub/iac`, with two differences
that follow from doc-hub having a database: the host holds state, and the deploy
job carries secrets.

## Shape

```
        DigitalOcean DNS (obya.ch)   ← records added by hand, outside Terraform
    doc-portal  doc-registry  doc-sm  doc-em  doc-es
            └───────┴──── Elastic IP ────┴───────┘
                        │
                   EC2 t3.small ── security group: 80 + 443 only, no inbound admin port
                        │
                    Caddy :80 :443          TLS, Let's Encrypt, HTTP→HTTPS
                     ├── doc-portal    :4321   ─┐
                     ├── doc-registry  :1337   ─┤  none published to the host
                     ├── doc-sm        :4322   ─┤
                     ├── doc-em        :4323   ─┤
                     └── doc-es        :4324   ─┘
                                │
                          doc-registry-db :5432   compose network only
                                │
                          volume registry_db      the only state in doc-hub

    GitHub Actions ──OIDC──► sts:AssumeRoleWithWebIdentity ──► ssm:SendCommand ──┘
```

Only Caddy is bound to the host, so no application can be reached over plain
HTTP and PostgreSQL cannot be reached at all. Administration and deployment both
arrive through the SSM agent's *outbound* connection, so there is no inbound
admin surface.

`doc-portal` reads the catalogue from the CMS on every request over the compose
network (`REGISTRY_API_URL=http://doc-registry:1337`), while the link a visitor
follows to open the admin UI is the public one (`REGISTRY_URL`). The two are
kept apart on purpose — collapsing them breaks whichever caller you were not
thinking about.

## How CI reaches AWS

The deploy job holds no AWS credential. It presents a token signed by GitHub,
STS validates it against the role's trust policy, and returns credentials that
expire when the job ends.

```
role      doc-hub-deploy                      (iac/oidc.tf)
trusts    token.actions.githubusercontent.com
only if   aud         = sts.amazonaws.com
    and   repository  = vondacho/doc-hub
    and   ref         = refs/heads/main
    and   environment = production
may do    ssm:SendCommand  → AWS-RunShellScript, on instances tagged Project=doc-hub
          plus the read calls needed to find the host and collect the output
```

The three claim conditions are the load-bearing ones, and all must hold: a
workflow in another repository, on a branch, or outside the `production`
environment gets nothing. The `Project=doc-hub` tag condition also keeps this
role off the ba-hub and dev-hub hosts if they share the account.

They are separate conditions rather than one `sub` string on purpose. GitHub
mints `sub` in two shapes and the choice is not ours to make:

```
classic    repo:vondacho/doc-hub:environment:production
immutable  repo:vondacho@3777501/doc-hub@1329127385:environment:production
```

Matching `sub` exactly would mean pinning IDs that differ per fork and per
account, and would break again the day a repository flips form, so the policy
only requires `sub` to look like this repository (STS insists it be constrained
somehow) and does the real work with `repository`, `ref`, and `environment`,
which STS has validated natively for GitHub since January 2026.

Symptom when any of them disagrees with the token: `Could not assume role with
OIDC: Not authorized to perform sts:AssumeRoleWithWebIdentity`. To see what
GitHub actually mints:

```sh
gh api /repos/vondacho/doc-hub/actions/oidc/customization/sub
```

The role cannot start, stop, or reconfigure the instance, and cannot touch any
instance that is not tagged as part of this project.

## Where the secrets live

| Secret | Lives in | Why not elsewhere |
|---|---|---|
| AWS credentials | `~/.aws/` (or an SSO session) on your machine only | Used solely to *provision*. CI gets short-lived credentials from OIDC instead. |
| CI's AWS credentials | nowhere — minted per job, expire with it | That is the whole point of OIDC. |
| SSH private key | nowhere — the host has no key pair by default | Replaced by SSM Session Manager, authenticated by your AWS identity. |
| Let's Encrypt account key | the `caddy_data` volume on the host | Generated there, never leaves. |
| Strapi's six secrets + the PostgreSQL password | GitHub repository secrets → `/opt/doc-hub/secrets.env` on the host | See below. |
| GHCR pull credential | none — the packages are public | See step 1 under *Before the first apply*. |
| DigitalOcean API token | none — the records are created by hand | Terraform never talks to DigitalOcean. |

Two things must stay out of git, and `.gitignore` already covers both:
`terraform.tfvars` and `terraform.tfstate`. `.terraform.lock.hcl` is the
exception — commit it, so every apply resolves the same provider build. Nothing
in this repository holds an application secret either: `secrets.env` is written
on the host and never read back.

### The application secrets

Strapi refuses to boot without all six, and PostgreSQL will not initialise
without its password. On a cluster the charts generate them on first install and
read them back on upgrade; here they are repository secrets, rendered by
`deploy.sh` into `/opt/doc-hub/secrets.env` (0640) on every rollout, and loaded
by `host/docker-compose.yml` through `env_file`.

Generate them once and leave them alone — rotating is not free. `ENCRYPTION_KEY`
makes already-stored encrypted fields unreadable; `APP_KEYS` or
`ADMIN_JWT_SECRET` signs every administrator out.

```sh
gh secret set POSTGRES_PASSWORD    -b "$(openssl rand -hex 32)"
gh secret set APP_KEYS             -b "$(for i in 1 2 3 4; do openssl rand -base64 32 | tr -d '\n'; [ $i -lt 4 ] && printf ,; done)"
gh secret set API_TOKEN_SALT       -b "$(openssl rand -base64 32)"
gh secret set ADMIN_JWT_SECRET     -b "$(openssl rand -base64 32)"
gh secret set TRANSFER_TOKEN_SALT  -b "$(openssl rand -base64 32)"
gh secret set JWT_SECRET           -b "$(openssl rand -base64 32)"
gh secret set ENCRYPTION_KEY       -b "$(openssl rand -base64 32)"
```

Keep each one to a single line with no quotes: `secrets.env` is `KEY=value`,
parsed literally.

`deploy.sh` takes all seven or none. All seven and it rewrites the file; none —
a deploy from your laptop — and it leaves the file exactly as it is. A partial
set is refused, because half-rotated credentials are worse than either end
state.

**Know where they end up.** The rendered file travels inside the SSM
SendCommand payload, so the values are visible to anyone in the account who can
read the command history (`ssm:GetCommandInvocation`, for 30 days) or the
CloudTrail record of the call. That is acceptable for a single-operator account
and it is the cost of keeping the deploy to one script with no extra
infrastructure. The upgrade, if the account ever grows more principals, is to
put them in Parameter Store as SecureStrings and have the *host* fetch them —
the payload then carries nothing.

## Connecting to AWS yourself

Terraform authenticates through the standard AWS credential chain. Nothing here
holds an AWS credential, and none is written into the state file — the provider
block sets only a region and an optional profile name.

1. **IAM Identity Center (SSO)** — short-lived, nothing long-lived on disk:

   ```sh
   aws configure sso --profile doc-hub    # once
   aws sso login --profile doc-hub        # per session, expires on its own
   ```

   then set `aws_profile = "doc-hub"` in `terraform.tfvars`, or export
   `AWS_PROFILE=doc-hub`.

2. **An IAM user's access keys in `~/.aws/credentials`** — `aws configure
   --profile doc-hub`. Give the user only what this stack touches (EC2, VPC
   read, IAM to create the two roles and the OIDC provider, SSM read for the AMI
   parameter), and rotate the keys periodically.

3. **Environment variables** — fine for a one-off, but they leak into shell
   history and process listings.

Verify before applying: `aws sts get-caller-identity --profile doc-hub`.

## Before the first apply

1. **Make the six GHCR packages public.** In *Packages → package settings*, set
   `doc-hub/doc-portal`, `doc-registry`, `doc-registry-db`, `doc-sm`, `doc-em`
   and `doc-es` to public. The host then pulls anonymously and there is no
   registry credential to provision or rotate. None of the images contains a
   secret — `doc-registry-db` deliberately carries no password.
2. **Know where `obya.ch` DNS lives.** It is served by DigitalOcean
   (`ns[1-3].digitalocean.com`), not Route 53, so Terraform does not touch it.
   You add five A records by hand after the apply — the `dns_records` output
   prints them.
3. **Check for an existing GitHub OIDC provider.** An AWS account may hold only
   one per issuer URL:

   ```sh
   aws iam list-open-id-connect-providers
   ```

   If one already exists — which it will if ba-hub or dev-hub was applied into
   the same account — set `create_github_oidc_provider = false`.

## Apply

```sh
cp terraform.tfvars.example terraform.tfvars   # then edit
aws sts get-caller-identity                    # confirm you are the right principal
terraform init
terraform plan
terraform apply
```

Expect: 1 security group + 3 rules, 1 instance, 1 EIP + association, 2 IAM roles
+ policies, 1 instance profile, and the OIDC provider unless you set
`create_github_oidc_provider = false`.

Then create the DNS records at DigitalOcean — `terraform output dns_records`
prints them ready to copy:

```
A  doc-em        <elastic ip>  TTL 300
A  doc-es        <elastic ip>  TTL 300
A  doc-portal    <elastic ip>  TTL 300
A  doc-registry  <elastic ip>  TTL 300
A  doc-sm        <elastic ip>  TTL 300
```

Because the address is an Elastic IP, this is a one-time step: it survives an
instance rebuild. Confirm with `dig +short doc-portal.obya.ch` before expecting
certificates — Caddy issues five of them on its first start, and an ACME
HTTP-01 challenge against a name that does not resolve fails and retries with a
backoff.

Finally, in the repository settings:

| What | Where | Value |
|---|---|---|
| `AWS_DEPLOY_ROLE_ARN` | Actions → Variables | `terraform output -raw deploy_role_arn` |
| `AWS_REGION` | Actions → Variables | your `aws_region` (optional; defaults to `eu-central-1`) |
| the seven application secrets | Actions → Secrets | see *The application secrets* above |
| a `production` environment | Environments | must exist — creating it is what makes GitHub put the `environment` claim in the token the trust policy requires |

The first push to `main` after that runs the `deploy` job. Its first run is the
slow one: Strapi migrates the full schema against an empty database and seeds
the sixteen placeholder products before it answers `/_health`, which is why
`doc-registry`'s `start_period` is 180s against a 600s command timeout.

### Applying onto a host that already exists

Attaching the instance profile is an in-place update, but two things do not
follow automatically:

- **The SSM agent may not notice the new role.** Check with
  `aws ssm describe-instance-information`; if the instance has not appeared
  after a few minutes, `aws ec2 reboot-instances --instance-ids "$(terraform
  output -raw instance_id)"`.
- **`user_data` does not re-run.** By design
  (`user_data_replace_on_change = false`). Anything it newly does — the
  swapfile, `secrets.env` — applies to the *next* instance, not this one.

## Day-to-day

Changing what runs on the host — an image tag, an env var, a new site in the
Caddyfile — is an edit to `host/` and a push to `main`. The instance is not
touched: `user_data` only installs Docker, swap and `/opt/doc-hub`.

Deploy by hand, with any identity holding the same permissions — the CI job runs
this exact script, and without the secrets in your environment it leaves
`secrets.env` alone:

```sh
./deploy.sh
```

Open a shell on the host without a key or an open port:

```sh
aws ssm start-session --target "$(terraform output -raw instance_id)"
sudo -i
cd /opt/doc-hub
docker compose ps
docker compose logs -f doc-registry
```

This needs the Session Manager plugin installed locally
(`brew install --cask session-manager-plugin`).

A reboot brings the stack back on its own: `user-data.sh` installs a
`doc-hub.service` unit that replays `docker compose up -d`.

### Memory

Six containers on a 2 GiB t3.small is tight. Strapi alone is budgeted 1 GiB in
`helm/doc-registry/values.yaml` and peaks higher during its boot migration, so
`user-data.sh` adds a 2 GiB swapfile with `vm.swappiness=10`. Swap is a floor,
not a fix — a host that leans on it is slow.

```sh
free -h                       # on the host
docker stats --no-stream
```

If the registry is regularly paging, or a container is OOM-killed
(`docker inspect --format '{{.State.OOMKilled}}' <id>`), move to `t3.medium`:
set `instance_type` and apply, then stop and start the instance. The Elastic IP
and every Docker volume survive it; a *replace* would not.

### The database

`registry_db` is the only state in doc-hub, and it lives on the instance's root
volume. Nothing backs it up. Before anything that replaces the instance — and
periodically, if the registry holds content worth keeping:

```sh
aws ssm start-session --target "$(terraform output -raw instance_id)"
sudo -i
cd /opt/doc-hub
docker compose exec -T doc-registry-db pg_dump -U strapi strapi | gzip > /tmp/strapi-$(date +%F).sql.gz
```

and copy it off the host. Restoring is the same in reverse, into a running
database, with `doc-registry` stopped so it cannot migrate underneath the
restore.

`terraform apply -replace=aws_instance.host` — for a newer Ubuntu AMI, say —
starts from an empty volume. The Elastic IP, the DNS records and the deploy role
survive it; the registry's content does not.

### Break-glass

If the SSM agent ever wedges, the host becomes unreachable — that is the
trade-off for having no open admin port. Recover by setting `ssh_key_name` and
`ssh_allowed_cidrs` to your own address and applying; both default to nothing,
so this is a deliberate, visible change in the plan. `ssh_key_name` only takes
effect on a fresh instance, so an existing host needs a replace — and a replace
loses the database, so dump it first.

## Cost

Roughly USD 20/month in `eu-central-1`: t3.small on-demand (~15), 30 GiB gp3
(~3), plus egress. `t3.medium` adds about 15. No Route 53 charge — DNS stays at
DigitalOcean. SSM, the OIDC provider, and IAM roles are free. The Elastic IP is
free while associated with a running instance and billed hourly when it is not.

## Teardown

```sh
terraform destroy
```

**Dump the database first** — the volume goes with the instance.

Removes the instance, EIP, security group, both IAM roles, and — if this stack
created it — the OIDC provider, which will break *any other* repository relying
on it, ba-hub and dev-hub included. Check `create_github_oidc_provider` first.
The DNS records and the GHCR packages are untouched; delete the five A records
at DigitalOcean by hand.
