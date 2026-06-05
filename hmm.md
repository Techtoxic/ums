EDTTI UMS \Uffffffff Infrastructure & Budget Recommendation
Prepared for: Management budget review System: EDTTI University Management System (UMS) \Uffffffff Node.js/Express + PostgreSQL Current usage: ~2,000 users \Uffffffff Target capacity: 5,000 users Hosting model: Single VPS, app managed by pm2 (cluster mode), reverse-proxied by nginx + free SSL.

Currency note: USD figures are list prices; KES is approximate at ~1 USD \Uffffffff 130 KES (2026). Confirm at purchase.

1. Executive summary (the ask)
To run the UMS in production for up to 5,000 users we need one properly-sized VPS, a PostgreSQL database, transactional email (OTP/password resets), object storage for uploaded files, and the .ac.ke domain + SSL. The recommended lean setup costs roughly:

Monthly (USD)	Monthly (KES, approx)	Yearly (KES, approx)
Recommended (self-hosted DB on the app VPS)	~$20\Uffffffff25	~KES 2,700\Uffffffff3,400	~KES 32,000\Uffffffff41,000
Alternative (managed DB / Neon)	~$40\Uffffffff45	~KES 5,200\Uffffffff5,900	~KES 62,000\Uffffffff71,000
This is intentionally lean: the application is efficient and stateless, so a single mid-range VPS comfortably serves 5,000 users when configured as below.

2. Recommended architecture
                Internet (HTTPS)
                      \Uffffffff
              nginx (TLS, reverse proxy, gzip)        ? free, Let's Encrypt SSL
                      \Uffffffff
        pm2 cluster: Node workers (ecosystem.config.js) ? 2\Uffffffff4 workers across CPU cores
                      \Uffffffff
              PostgreSQL (same VPS)                   ? self-hosted, or managed (Neon)
                      \Uffffffff
   AWS S3 / Cloudflare R2 (file uploads)   Brevo (email: OTP, resets, notices)
App tier: Node/Express is stateless (auth is a JWT in an httpOnly cookie \Uffffffff no in-memory sessions), so it scales horizontally via pm2 cluster workers and reloads with zero downtime.
Data tier: PostgreSQL. The workload is read-heavy with predictable write bursts (unit registration, fee posting, results release).
Files: user uploads stream to object storage (S3/R2), not the VPS disk.
Email: Brevo HTTP API (already integrated) for staff login OTP and password resets.
3. VPS sizing for 5,000 users
Why a single mid VPS is enough: "5,000 users" is the registered population, not concurrent load. Realistic peak concurrency (e.g. an 8 a.m. registration rush) is a few hundred simultaneous requests. Node handles that easily; the main CPU cost is bcrypt password hashing on login (deliberately strong). pm2 cluster spreads that across cores.

Recommended spec: 4 vCPU \Uffffffff 8 GB RAM \Uffffffff 80\Uffffffff160 GB NVMe SSD.

8 GB RAM: comfortably fits Node workers (~150 MB each) and PostgreSQL caching.
4 vCPU: absorbs login/bcrypt bursts and parallel DB queries.
NVMe SSD: fast DB; the DB itself stays small (files live in object storage).
Provider (4 vCPU / 8 GB / NVMe)	~Monthly	Notes
Hetzner Cloud CPX41	~$17 (\UffffffffKES 2,300)	Best price/performance. EU regions. Recommended.
Contabo VPS (4\Uffffffff6 vCPU / 8\Uffffffff12 GB)	~$8\Uffffffff15	Cheapest; performance more variable.
DigitalOcean / Vultr / Linode (4/8)	~$48 (\UffffffffKES 6,200)	Pricier; very polished, good docs/support.
A 2 vCPU / 4 GB box (~$8\Uffffffff10/mo) can run a pilot, but 4 vCPU / 8 GB is the right target for 5,000 users with headroom for registration peaks.

4. Database decision: self-host Postgres vs Neon vs Supabase
Key fact: this app uses PostgreSQL as a plain database via Drizzle/postgres.js. It does not use Supabase Auth, Supabase Storage, or Realtime \Uffffffff it has its own JWT auth, AWS S3 storage, and Brevo email. So Supabase would only ever be "hosted Postgres," and you'd pay for a stack of features you don't use.

Option	~Monthly	Ops burden	Verdict
A. Self-host Postgres on the app VPS	$0 extra	You run backups + tuning	Recommended for lowest cost. Best value & full control.
B. Managed Postgres \Uffffffff Neon (already in use)	~$0 free ? ~$19 (Launch)	Near-zero	Good if you want no DB admin; autoscale + automatic backups + branching.
C. Supabase	$25 Pro/project	Low	Not worth it here \Uffffffff you'd pay for Auth/Storage/Realtime/Edge you don't use. Skip.
Your instinct is correct: Supabase is not worth it for this app. It's priced for teams using its full BaaS stack; as a pure database it's more expensive than the alternatives.

Recommendation:

Best value: self-host Postgres on the same VPS (Option A) \Uffffffff $0 extra, full control. Pair it with the backup plan in \Uffffffff6.
Lowest effort: keep Neon (Option B) \Uffffffff you already use it, ~$19/mo for the paid tier, automatic backups, no server admin. Choose this if no one will own DB operations day-to-day.
When self-hosting in pm2 cluster mode, keep PM2_INSTANCES \UffffffffDB_POOL_MAX + headroom < Postgres max_connections. Defaults (2 workers \Uffffffff20 = 40 connections) sit safely under Postgres' default 100. These are now env-tunable (PM2_INSTANCES, DB_POOL_MAX).

5. Other recurring costs
Item	~Monthly	Notes
Email \Uffffffff Brevo	$0 to start	Free tier \Uffffffff 300 emails/day. Used for staff OTP login + password resets (students log in by phone number, so volume is low). Move to a paid plan (~$9\Uffffffff25) only if email volume grows.
File storage \Uffffffff AWS S3	~$2\Uffffffff5	Student/staff uploads. ~$0.023/GB/mo + requests. Cheaper alternative: Cloudflare R2 (no egress fees) or Backblaze B2.
Domain \Uffffffff edtti.ac.ke	~KES 1,500\Uffffffff3,000 / year	KeNIC registration; already owned.
SSL certificate	$0	Let's Encrypt via certbot (auto-renew).
Off-site backups	~$1\Uffffffff2	Nightly DB dump to S3/R2 (small).
6. Production checklist (must be set before go-live)
Environment variables (see env.example, ecosystem.config.js):

NODE_ENV=production
COOKIE_SECURE=true                       # required on HTTPS
JWT_SECRET=<64+ random chars>            # boot fails if weak/missing
ALLOWED_ORIGINS=https://edtti.ac.ke      # CORS allow-list
DATABASE_URL=<postgres connection string>
DB_POOL_MAX=20                           # per worker; tune to Postgres max_connections
PM2_INSTANCES=2                          # cluster workers (or "max" on bigger boxes)
BREVO_API_KEY=...  BREVO_SENDER_EMAIL=...  BREVO_SENDER_NAME=...
AWS_ACCESS_KEY_ID=...  AWS_SECRET_ACCESS_KEY=...  AWS_S3_BUCKET_NAME=...  AWS_REGION=...
Operational:

Reverse proxy: nginx in front of pm2, keepalive = 75 s (Node is tuned to match).
Deploy / zero-downtime reload: pm2 reload ecosystem.config.js --env production (graceful drain is implemented \Uffffffff see \Uffffffff7).
Backups (if self-hosting DB): nightly pg_dump ? object storage; keep 7\Uffffffff30 days. Test a restore.
Monitoring: pm2 monit + log rotation (pm2 install pm2-logrotate); optional uptime ping on /api/health.
Firewall: expose only 80/443 (and SSH); Postgres bound to localhost when self-hosted.
7. Production-readiness fixes shipped with this budget
These were applied to harden the runtime before launch (branch v2-test):

Graceful shutdown \Uffffffff on SIGTERM/SIGINT the server stops accepting new connections, lets in-flight requests finish, and closes the DB pool before exit. This makes pm2 reload truly zero-downtime; previously a reload could drop active requests and leak DB connections.
ecosystem.config.js \Uffffffff production pm2 config: cluster mode, wait_ready rolling reload, kill_timeout aligned to the graceful drain, memory-restart guard.
Env-tunable DB pool (DB_POOL_MAX, idle/connect timeouts) so a self-hosted Postgres stays within its connection budget under cluster mode.
nginx-safe HTTP timeouts (keep-alive/headers) to avoid sporadic 502s under load.
Quieter production logs \Uffffffff high-volume per-request/static-asset logging is suppressed in production to protect disk and latency.
8. Bottom line
For ~$20\Uffffffff25/month (\Uffffffff KES 2,700\Uffffffff3,400) \Uffffffff one Hetzner-class VPS with self-hosted Postgres, free Let's Encrypt SSL, Brevo's free email tier, and a few dollars of object storage \Uffffffff the UMS will comfortably serve 5,000 users. Choosing managed Postgres (Neon) instead adds ~$19/mo for near-zero database admin. Supabase is not recommended for this application.
