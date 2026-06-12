# GitLab Provider Config for Pi

Pi package untuk menambahkan provider **GitLab Duo CLI** ke Pi CLI, lengkap dengan helper konfigurasi project fallback, profile/account switching, dan dokumentasi setup akun baru.

Repository target:

```txt
https://github.com/Wayan123/GitLab-Provider-Config-for-Pi-.git
```

> Security note: package ini tidak membawa token. Jangan commit `~/.gitlab/storage.json`, `~/.pi/agent/auth.json`, atau file profile yang berisi token.

---

## Fitur

- Provider model Pi:
  ```txt
  gitlab-duo/claude_fable_5
  gitlab-duo/claude_sonnet_4_6
  gitlab-duo/gpt_5
  gitlab-duo/gpt_5_codex
  gitlab-duo/kimi_k2_6_fireworks
  gitlab-duo/minimax_m2_7_fireworks
  gitlab-duo/glm_5_1_fireworks
  ```
- Integrasi `/login` Pi:
  ```txt
  /login
  → Use a subscription
    → GitLab Duo CLI
      → Use existing Duo CLI login/config
      → Login in browser (OAuth link)
      → Create/paste GitLab token

  /login
  → Use an API key
    → GitLab Duo CLI
  ```
- Fallback workspace otomatis untuk project non-GitLab/GitHub/local.
- Profile/account manager untuk ganti akun GitLab.
- Installer helper untuk konfigurasi fallback group/project.

---

## Prasyarat

### 1. Pi CLI sudah terinstall

Cek:

```bash
pi --version
```

### 2. GitLab Duo CLI terinstall

Jika belum:

```bash
npm install -g @gitlab/duo-cli@latest
```

Cek:

```bash
duo --version
```

### 3. Akun GitLab punya Duo access

Di group GitLab akun aktif:

```txt
Group → Settings → GitLab Duo
```

Aktifkan:

```txt
GitLab Duo Core: Enabled
Experiment and beta features: Enabled
```

---

## Install via Pi CLI dari GitHub

Ini cara utama yang direkomendasikan.

```bash
pi install git:github.com/Wayan123/GitLab-Provider-Config-for-Pi-
```

Atau pakai URL HTTPS:

```bash
pi install https://github.com/Wayan123/GitLab-Provider-Config-for-Pi-.git
```

Lalu restart Pi atau di dalam Pi jalankan:

```txt
/reload
```

Cek model:

```bash
pi --list-models gitlab-duo
```

---

## Install via local clone

```bash
git clone https://github.com/Wayan123/GitLab-Provider-Config-for-Pi-.git
cd GitLab-Provider-Config-for-Pi-
pi install .
```

Atau hanya test sekali tanpa install permanen:

```bash
pi -e .
```

---

## Install via npm / npm-compatible GitHub package

Package ini npm-compatible. Jika belum dipublish ke npm registry, install global tools dari GitHub:

```bash
npm install -g github:Wayan123/GitLab-Provider-Config-for-Pi-
```

Setelah itu helper command tersedia:

```bash
pi-gitlab-duo-account --help
pi-gitlab-duo-install --help
```

> Catatan: `npm install -g` hanya memasang helper CLI. Agar extension provider masuk ke Pi, tetap jalankan salah satu:

```bash
pi install git:github.com/Wayan123/GitLab-Provider-Config-for-Pi-
```

atau dari folder clone:

```bash
pi install .
```

Jika nanti package dipublish ke npm registry, install Pi langsung bisa menjadi:

```bash
pi install npm:gitlab-provider-config-for-pi
```

---

## Konfigurasi pertama kali

Misal group/project GitLab kamu:

```txt
future-org-group/future-org-project
```

Jalankan:

```bash
pi-gitlab-duo-install future-org-group/future-org-project
```

Jika tidak install via npm global, pakai path dari clone/package:

```bash
./extensions/gitlab-duo-provider/install.sh future-org-group/future-org-project
```

Config ditulis ke:

```txt
~/.pi/agent/gitlab-duo-provider.json
```

Workspace fallback dibuat di:

```txt
~/.pi/agent/tmp/gitlab-duo-workspace
```

---

## Login / autentikasi

### Opsi A — pakai `/login` Pi

Di Pi:

```txt
/login
```

Pilih:

```txt
Use a subscription
→ GitLab Duo CLI
```

Lalu pilih salah satu:

```txt
Use existing Duo CLI login/config
Login in browser (OAuth link)
Create/paste GitLab token
```

Atau pakai jalur API key standar:

```txt
/login
→ Use an API key
→ GitLab Duo CLI
```

Scope token GitLab yang dibutuhkan:

```txt
api
ai_features
read_repository
```

Opsional jika ingin push ke repository:

```txt
write_repository
```

### Opsi B — pakai account/profile helper

Buat link pembuatan token:

```bash
pi-gitlab-duo-account link
```

Tambahkan akun/profile:

```bash
pi-gitlab-duo-account add wayangpt17 future-org-group/future-org-project
```

Switch profile:

```bash
pi-gitlab-duo-account switch wayangpt17
```

Cek profile aktif:

```bash
pi-gitlab-duo-account current
```

List profile:

```bash
pi-gitlab-duo-account list
```

Tes profile aktif:

```bash
pi-gitlab-duo-account test claude_fable_5
```

Setelah switch akun, jalankan di Pi:

```txt
/reload
```

---

## Tes setelah install

### 1. List model

```bash
pi --list-models gitlab-duo
```

Harus muncul model seperti:

```txt
gitlab-duo  claude_fable_5
gitlab-duo  claude_sonnet_4_6
gitlab-duo  gpt_5
gitlab-duo  gpt_5_codex
```

### 2. Smoke test

```bash
pi -p --no-tools \
  --model gitlab-duo/claude_fable_5 \
  "Jawab hanya satu kata: OK"
```

Target output:

```txt
OK
```

---

## Cara kerja fallback workspace

GitLab Duo CLI biasanya butuh konteks git/GitLab. Provider ini memilih cwd sebagai berikut:

1. Jika current directory adalah repo dengan remote GitLab → pakai repo itu.
2. Jika bukan GitLab repo → pakai fallback workspace dari config.
3. Jika token `/login` berasal dari akun berbeda → provider membuat workspace khusus token:
   ```txt
   ~/.pi/agent/tmp/gitlab-duo-token-workspaces/<hash>
   ```

Ini mencegah error stale remote seperti group lama dipakai oleh akun baru.

---

## Ganti akun GitLab

Contoh tambah akun baru:

```bash
pi-gitlab-duo-account add labtek future-org-group1/future-org-project
pi-gitlab-duo-account switch labtek
```

Lalu reload Pi:

```txt
/reload
```

Jika akun baru error:

```txt
Experimental and beta GitLab Duo features are not turned on for your group.
```

Aktifkan di group default akun baru:

```txt
Group akun baru → Settings → GitLab Duo → Experiment and beta features: Enabled
```

---

## Troubleshooting cepat

### Token valid tapi Duo error beta feature

Cek log username/default namespace. Biasanya akun baru punya group berbeda, misalnya:

```txt
username: labtekags123
duoDefaultNamespacePath: future-org-group1
```

Aktifkan beta features di group tersebut.

### Token invalid

Validasi:

```bash
curl -sS -w "\nHTTP:%{http_code}\n" \
  --header "PRIVATE-TOKEN: TOKEN_KAMU" \
  https://gitlab.com/api/v4/personal_access_tokens/self
```

Harus:

```txt
HTTP:200
```

### Model tidak muncul setelah install

Reload/restart Pi:

```txt
/reload
```

Lalu:

```bash
pi --list-models gitlab-duo
```

### Project bukan repo GitLab

Jalankan installer fallback:

```bash
pi-gitlab-duo-install group/project
```

---

## Dokumentasi lengkap akun baru

Lihat:

```txt
docs/ACCOUNT_SETUP.md
```

Dokumen itu berisi checklist dan langkah detail membuat akun GitLab baru dari nol.

---

## Development

Clone:

```bash
git clone https://github.com/Wayan123/GitLab-Provider-Config-for-Pi-.git
cd GitLab-Provider-Config-for-Pi-
```

Verifikasi:

```bash
npm run verify
```

Install lokal ke Pi:

```bash
npm run pi:install:local
```

Test sekali tanpa install:

```bash
pi -e . -p --no-tools --model gitlab-duo/claude_fable_5 "Jawab hanya satu kata: OK"
```

---

## Struktur package

```txt
.
├── package.json
├── README.md
├── docs/
│   └── ACCOUNT_SETUP.md
├── extensions/
│   └── gitlab-duo-provider/
│       ├── index.ts
│       ├── account.sh
│       └── install.sh
├── bin/
│   ├── pi-gitlab-duo-account
│   └── pi-gitlab-duo-install
└── scripts/
    └── verify.sh
```

---

## Catatan keamanan

- Jangan commit token GitLab.
- Jangan commit `~/.gitlab/storage.json`.
- Jangan commit `~/.pi/agent/auth.json`.
- Jangan commit folder `~/.pi/agent/gitlab-duo-profiles/`.
- Jika token tidak sengaja bocor, revoke token di GitLab dan buat token baru.
