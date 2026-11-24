# CI/CD Setup Guide — Awesome Cars

Pipeline: **Test → Build image → Push to Docker Hub → SSH to EC2 → Pull → Run**

```
GitHub ──► Jenkins ──► Docker Hub ──► EC2 (docker pull + docker run)
             │                          ▲
             └──────────── SSH ─────────┘  (deploy + health check + rollback)
```

## 1. What the pipeline does

| Stage | What happens |
|---|---|
| Checkout | Clones the repo, resolves the full commit SHA |
| Install Dependencies | `npm ci` |
| Test | `npm test` (Node's built-in test runner, 4 smoke tests incl. `/health`) |
| Version | Computes a unique, traceable image tag (see below) |
| Build Docker Image | `docker build` with OCI labels / build args |
| Push to Docker Hub | Logs in with the `docker-creds` credential and pushes all tags |
| Deploy to EC2 | SSH → `scripts/remote-deploy.sh`: pull, replace container, wait for `/health`, roll back on failure |
| Smoke Test | Optional public `GET /health` from the Jenkins agent (marks build UNSTABLE, never fails the deploy) |

### Image versioning scheme

Every build gets **three tags**:

```
docker.io/bluells/my-app:1.0.0-42-a1b2c3d4   # package version + build number + commit  (deployed)
docker.io/bluells/my-app:sha-a1b2c3d4        # immutable commit tag
docker.io/bluells/my-app:latest              # default branch only
```

* If the commit is exactly on a Git tag (e.g. `v1.2.0`), that tag is used instead.
* You can force a tag with the `IMAGE_TAG` build parameter (e.g. `1.1.0`).
* EC2 always runs the **versioned** tag, never `latest`, so rollbacks are deterministic.

## 2. What you need to provide

| Item | Where it goes |
|---|---|
| Docker Hub username + **access token** (Read/Write scope) | Jenkins credential `docker-creds` (already configured) |
| EC2 public IP `50.16.123.15` | `DEPLOY_HOST` parameter (already set) |
| EC2 SSH username `ec2-user` | Username of the `ec2-ssh-key` credential |
| EC2 private key `C:\Users\sohai\.ssh\docker-1.pem` | Jenkins credential `ec2-ssh-key` |
| Your internet IP / CIDR | EC2 security group, port 22 |

> Do **not** commit the key or token. Everything secret lives in Jenkins credentials.
> The Docker Hub repo `bluells/my-app` is **private**, so `PRIVATE_REPO` defaults to `true` and the
> pipeline runs `docker login` on EC2 (via SSH stdin) before every pull. No secret is written to the
> build log or the server command line.

## 3. Create the Jenkins credentials

**Manage Jenkins → Credentials → System → Global credentials → Add Credentials**

### 3.1 Docker Hub token (`docker-creds`)

1. Docker Hub → **Account Settings → Personal access tokens → Generate new token**
   Permissions: **Read & Write** (needed to push).
2. In Jenkins: **Kind** = *Username with password*
   * Username: your Docker Hub username (`bluells`)
   * Password: the token
   * **ID: `docker-creds`** ← must match exactly
   * Description: `Docker Hub - bluells`

> If the repository `bluells/my-app` is **public**, EC2 can pull without login. If it is **private**, tick the `PRIVATE_REPO` parameter when running the job (the pipeline then runs `docker login` on EC2 before pulling).

> Because the repository `bluells/my-app` is **private**, `PRIVATE_REPO` is `true` by default; the
> pipeline logs in on EC2 before pulling. The token is piped over SSH stdin, never passed as a
> command-line argument.

### 3.2 EC2 SSH key (`ec2-ssh-key`)

1. Jenkins: **Kind** = *SSH Username with private key*
   * ID: **`ec2-ssh-key`**
   * Username: **`ec2-user`**
   * Private key: **Enter directly** → paste the contents of
     `C:\Users\sohai\.ssh\docker-1.pem` (the key you use for `ssh -i ~/.ssh/docker-1.pem ec2-user@50.16.123.15`)
2. The key file must be unencrypted (AWS `.pem` files are).

## 4. Jenkins agent requirements

Your Jenkins runs as a container in Docker Desktop. Check it has the `ssh` client:

```bash
docker exec -u root -it <jenkins-container> sh -c "ssh -V && node -v && docker --version"
```

If `ssh` is missing (Jenkins images usually do not ship it), install it:

```bash
docker exec -u root -it <jenkins-container> sh -c "apt-get update && apt-get install -y openssh-client"
```

> Installing packages inside a container is lost when the container is recreated. For a permanent fix,
> build a small image `FROM jenkins/jenkins:lts` with `RUN apt-get update && apt-get install -y openssh-client`
> and use that in your compose file.

The agent needs:

```bash
docker --version        # mounted Docker socket (already working for you)
node --version          # present in your container
ssh -V                  # must be installed, see above
curl --version          # for the optional public smoke test
```

If you prefer running tests inside a container instead of on the agent, replace the test step with:

```groovy
sh 'docker run --rm -v "$PWD":/app -w /app node:26-alpine sh -c "npm ci && npm test"'
```

## 5. Create the Jenkins job

1. **New Item → Pipeline** (or *Multibranch Pipeline* if you want automatic builds per branch — recommended).
2. **Pipeline → Definition: Pipeline script from SCM**
   * SCM: Git → `https://github.com/sohailturk/image-site.git`
   * Branch: `*/main`
   * Script Path: `Jenkinsfile`
3. Save. On the first run, Jenkins will show the build parameters defined in the Jenkinsfile.
4. `DEPLOY_HOST` is already set to `50.16.123.15`. If your instance gets a new public IP, override it per run
   or edit the parameter default.

Deployment only runs from `main`/`master`. To deploy from another branch, tick **FORCE_DEPLOY**.

## 6. EC2 host — what to check

Your instance already runs Docker and the container below, so the only work is confirming SSH + ports:

```bash
# on the EC2 host
docker ps
# CONTAINER ID   IMAGE                   ...   PORTS                     NAMES
# 86d42df6da47   bluells/my-app:latest   ...   0.0.0.0:3000->3000/tcp    my-app
```

The pipeline is configured with `CONTAINER_NAME = 'my-app'`, so the **first run adopts and replaces that
existing container** (same name, same `-p 3000:3000` mapping). There is a short 2–5 s gap while the old
container is removed and the new one starts.

No extra software is needed on EC2: the deploy script is streamed over SSH and only needs `docker`
(already present) plus `curl` or `wget` for the health check (Amazon Linux has `curl`).

### Security group rules

| Port | Source | Purpose |
|---|---|---|
| 22 | **your home/office public IP** (where Docker Desktop runs) | SSH deploy from Jenkins |
| 3000 | `0.0.0.0/0` (already open, since you browse it) | App access |

> Port 22 is already reachable from your machine (`ssh -i ~/.ssh/docker-1.pem ec2-user@50.16.123.15` works),
> and Jenkins runs on that same machine, so no security-group change should be required. If your ISP gives
> you a dynamic IP, review this rule when your IP changes.

### What the deploy script does on the server

`scripts/remote-deploy.sh` (streamed over SSH, nothing to install on EC2):

1. Verifies Docker is installed and the user can reach the daemon.
2. Saves the currently running image for rollback (`~/.awesome-cars-deploy/previous-image`).
3. `docker pull <versioned-image>`.
4. Stops and removes the old `my-app` container, starts the new one with
   `--restart unless-stopped -p 3000:3000`.
5. Polls `http://127.0.0.1:3000/health` for ~60 s.
6. On failure: prints container logs, restarts the previous image (on the very first run that is
   `bluells/my-app:latest`), and exits non-zero so Jenkins fails the build.

Useful commands on the server afterwards:

```bash
docker ps
docker logs -f my-app
docker inspect -f '{{.Config.Image}}' my-app
curl localhost:3000/health
```

## 7. Deploying / rolling back manually

```bash
# deploy a specific build tag on the server
ssh -i ~/.ssh/docker-1.pem ec2-user@50.16.123.15
docker pull bluells/my-app:1.0.0-42-a1b2c3d4
docker rm -f my-app
docker run -d --name my-app --restart unless-stopped -p 3000:3000 \
  bluells/my-app:1.0.0-42-a1b2c3d4
```

Or simply re-run the Jenkins job with `IMAGE_TAG=1.0.0-42-a1b2c3d4` (build and push will be skipped fast
thanks to Docker layer caching, and the same tag is redeployed).

## 8. Troubleshooting

| Symptom | Fix |
|---|---|
| `ssh: command not found` in the deploy stage | Install the SSH client in the Jenkins container (see section 4) |
| `denied: requested access to the resource is denied` | Private repo: make sure `PRIVATE_REPO` is ticked and the token has *Read & Write* |
| `Pull access denied` on EC2 | The remote `docker login` did not run — `PRIVATE_REPO` must be `true` |
| `Host key verification failed` | First connection uses `accept-new`; ensure the key/host match and port 22 is open to your IP |
| `Permission denied (publickey)` | The `ec2-ssh-key` credential must use username `ec2-user` and the `docker-1.pem` key |
| `ERROR: failed to start the new container (port 3000 already in use)` | The old `my-app` container is still holding the port: `sudo ss -ltnp \| grep 3000` |
| Health check fails | `docker logs my-app` — the container reached the server but the app did not start |
| Deploy stage skipped | You are not on `main`/`master`, or `SKIP_DEPLOY` is ticked |

## 9. Files involved

```
Jenkinsfile                 # the pipeline
Dockerfile                  # production image + HEALTHCHECK + OCI labels
scripts/remote-deploy.sh    # runs on EC2 over SSH (pull, run, health check, rollback)
index.js                    # app + /health endpoint
test/app.test.js            # smoke tests used by the Test stage
.dockerignore               # keeps tests/scripts/git metadata out of the image
```
