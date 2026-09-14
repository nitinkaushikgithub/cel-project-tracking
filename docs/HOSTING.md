# Hosting this beyond localhost — internal-only

For running this somewhere other than your own machine, while keeping it
off the public internet, matching CLAUDE.md hard constraint #2 ("Internal
network only. Never reachable from the internet").

**The approach**: a real Linux VM (free — Oracle Cloud's Always Free tier,
or any spare hardware you already have) running `docker compose up`
exactly as built, reached over [Tailscale](https://tailscale.com) (free
for personal use) instead of a public IP. Tailscale is a private
WireGuard-based mesh network — once the VM and your devices are on the
same "tailnet," you reach the app by its Tailscale hostname, and **you
never open port 80 to the public internet at all**. This is closer to
CLAUDE.md's actual deployment model (§8.2: "a Linux server with Docker
installed" on CEL's own network) than any public PaaS would be.

I can't do the account/hardware steps below for you — they need your own
Oracle account, SSH keys, and physical access/console. I can help debug
any step, and I'll do the actual repo/app parts once you're at step 4.

## 1. Get a VM

**Option A — Oracle Cloud "Always Free" (no cost, ever, not a trial):**

1. Sign up at [oracle.com/cloud/free](https://www.oracle.com/cloud/free/)
   (needs a card for identity verification; Always Free resources are
   never billed).
2. Create a Compute instance:
   - Shape: **VM.Standard.A1.Flex** (Ampere ARM) — as of mid-2026 the
     Always Free allowance is 2 OCPU / 12 GB RAM (Oracle quietly reduced
     this from 4/24 in June 2026 — still plenty for this app), *or* one of
     the two free **VM.Standard.E2.1.Micro** (AMD, smaller, x86) instances
     if you'd rather not deal with ARM.
   - Image: Ubuntu (22.04 or 24.04 LTS) — simplest for the Docker steps
     below.
   - Upload/generate an SSH key pair during creation — you'll need it to
     connect.
3. Note the instance's public IP (you'll only use it for initial SSH
   setup — never for the app itself).

**Option B — hardware you already have** (an old PC, a Raspberry Pi 4/5, a
home server): install any recent Linux (Ubuntu Server is the easiest),
make sure it's reachable via SSH, and skip straight to step 2.

## 2. Install Docker

SSH into the VM, then:
```
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
```
Log out and back in for the group change to apply. Confirm with
`docker compose version` (Compose v2 ships with Docker's official install
script — no separate install needed).

## 3. Install Tailscale (this is what keeps it off the public internet)

On the VM:
```
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
```
This prints a login URL — open it in a browser (any device) and sign in
(Tailscale's free personal plan covers up to 3 users / 100 devices, more
than enough here). The VM now has a stable Tailscale hostname like
`cel-vm.your-tailnet.ts.net`.

Also install Tailscale on whatever device you'll browse from (phone,
laptop) and sign into the same account —
[tailscale.com/download](https://tailscale.com/download).

**On Oracle specifically**: leave the cloud firewall (Security List /
Network Security Group) closed to everything except SSH (22) for your own
access — you do **not** need to open 80/443 publicly; Tailscale traffic
doesn't need an inbound rule for the ports it uses internally, since it
tunnels over its own encrypted connection. If port 80 was opened for
testing, close it once Tailscale is confirmed working.

## 4. Deploy the app

Same as `RUNBOOK.md`, on the VM instead of your own machine:
```
git clone https://github.com/nitinkaushikgithub/cel-project-tracking.git
cd cel-project-tracking
cp .env.example .env
# edit .env: POSTGRES_PASSWORD, AUTH_SECRET (openssl rand -base64 32) —
# see RUNBOOK.md step 3 for the full list including optional SMTP settings
docker compose up -d
```

## 5. Access it

From any device on your tailnet:

**http://cel-vm.your-tailnet.ts.net** (use the actual hostname Tailscale
gave the VM in step 3 — check with `tailscale status` on the VM, or the
[Tailscale admin console](https://login.tailscale.com/admin/machines)).

Log in with the seeded admin credentials (`RUNBOOK.md` step 5), then
change the password immediately as usual.

## Notes

- **TLS**: Caddy still serves plain HTTP here (CLAUDE.md §9.10 is
  genuinely unresolved — see `Caddyfile`'s comment). That matters less in
  this specific setup than it would on the open internet: Tailscale
  encrypts everything between your device and the VM at the network layer
  (WireGuard) regardless of what Caddy does on top. It's still worth
  resolving properly before this becomes CEL's real internal deployment —
  just not an urgent gap for personal/internal use over Tailscale today.
- **Restarting after a reboot**: `docker compose up -d` again (add
  `restart: unless-stopped` is already set on every service in
  `docker-compose.yml`, so containers come back automatically after the
  *Docker daemon* restarts — but if the whole VM reboots, run
  `sudo tailscale up` again if it didn't reconnect on its own, and confirm
  `docker ps` shows all three containers).
- **Backups**: still Phase 2, not built — the only durable data is the
  `postgres_data` Docker volume on this VM. Nothing automated backs it up
  yet.
