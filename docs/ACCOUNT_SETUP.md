# Panduan Lengkap Konfigurasi GitLab Duo untuk Pi CLI

Dokumen ini menjelaskan cara menyiapkan akun GitLab baru agar bisa dipakai sebagai provider model `gitlab-duo/*` di Pi CLI.

> Jangan simpan token asli di dokumen ini. Token hanya boleh dipaste ke prompt `/login` atau script lokal.

---

## 1. Konsep singkat

Pi memakai extension lokal:

```txt
~/.pi/agent/extensions/gitlab-duo-provider/index.ts
```

Extension ini memanggil GitLab Duo CLI:

```txt
duo
```

Agar Duo CLI berjalan, akun GitLab harus punya:

1. Token valid.
2. Akses GitLab Duo.
3. Experimental/beta Duo features aktif di group default akun tersebut.
4. Workspace git yang cocok atau fallback workspace lokal.

---

## 2. File penting

```txt
~/.pi/agent/extensions/gitlab-duo-provider/index.ts
~/.pi/agent/extensions/gitlab-duo-provider/install.sh
~/.pi/agent/extensions/gitlab-duo-provider/account.sh
~/.pi/agent/gitlab-duo-provider.json
~/.pi/agent/gitlab-duo-profiles/
~/.gitlab/storage.json
~/.pi/agent/auth.json
```

Token/account profile tersimpan lokal di:

```txt
~/.pi/agent/gitlab-duo-profiles/*.json
~/.gitlab/storage.json
~/.pi/agent/auth.json
```

Permission yang diharapkan:

```txt
0600 untuk file token
0700 untuk folder profile
```

---

## 3. Membuat akun GitLab baru

### 3.1 Buat akun GitLab

Buat/login akun baru di:

```txt
https://gitlab.com
```

Pastikan email sudah diverifikasi.

### 3.2 Buat group baru

Contoh nama group:

```txt
future-org-group1
```

Buat dari:

```txt
GitLab → Groups → New group
```

Pastikan user kamu adalah **Owner** group.

### 3.3 Buat project kosong di group

Contoh:

```txt
future-org-group1/future-org-project
```

Buat dari:

```txt
Group → New project → Blank project
```

Project boleh kosong, yang penting path-nya ada.

---

## 4. Aktifkan GitLab Duo di group

Masuk ke group, bukan project:

```txt
Group: future-org-group1
→ Settings
→ GitLab Duo
```

Aktifkan:

```txt
GitLab Duo Core: Enabled
Experiment and beta features: Enabled
```

Jika menu tidak muncul:

1. Pastikan kamu berada di halaman **Group**, bukan Project.
2. Pastikan role kamu **Owner**.
3. Coba URL langsung:

```txt
https://gitlab.com/groups/future-org-group1/-/settings/gitlab_duo
```

---

## 5. Membuat token GitLab

### Opsi A — via Pi `/login`

Di Pi:

```txt
/login
```

Pilih salah satu:

```txt
Use a subscription
→ GitLab Duo CLI
→ Create/paste GitLab token
```

atau:

```txt
Use an API key
→ GitLab Duo CLI
```

Scope token yang harus dicentang:

```txt
api
ai_features
read_repository
```

Opsional jika ingin push ke repo:

```txt
write_repository
```

### Opsi B — via helper script

Tampilkan link pembuatan token:

```bash
~/.pi/agent/extensions/gitlab-duo-provider/account.sh link
```

Buka URL yang dicetak, buat token, lalu simpan sebagai profile:

```bash
~/.pi/agent/extensions/gitlab-duo-provider/account.sh add akun-baru future-org-group1/future-org-project
```

Saat diminta, paste token. Input tidak akan terlihat.

---

## 6. Mengaktifkan profile akun

Jika pakai helper script:

```bash
~/.pi/agent/extensions/gitlab-duo-provider/account.sh switch akun-baru
```

Cek profile aktif:

```bash
~/.pi/agent/extensions/gitlab-duo-provider/account.sh current
```

List semua profile:

```bash
~/.pi/agent/extensions/gitlab-duo-provider/account.sh list
```

Setelah switch, di Pi jalankan:

```txt
/reload
```

atau restart Pi.

---

## 7. Konfigurasi fallback project/workspace

Untuk mengubah fallback project default:

```bash
~/.pi/agent/extensions/gitlab-duo-provider/install.sh future-org-group1/future-org-project
```

Config akan tersimpan di:

```txt
~/.pi/agent/gitlab-duo-provider.json
```

Contoh isi:

```json
{
  "baseUrl": "https://gitlab.com",
  "defaultProjectPath": "future-org-group1/future-org-project",
  "defaultWorkspace": "/home/wayan/.pi/agent/tmp/gitlab-duo-workspaces/akun-baru",
  "preferProjectGitLabRemote": true,
  "fallbackToDefaultWorkspace": true,
  "logLevel": "debug",
  "activeProfile": "akun-baru"
}
```

Perilaku provider:

1. Jika folder kerja sekarang adalah repo GitLab → pakai repo itu.
2. Jika folder kerja bukan repo GitLab → pakai fallback workspace.
3. Jika login pakai token akun berbeda → provider membuat token workspace khusus tanpa remote stale.

---

## 8. Tes Duo CLI langsung

Tes akun aktif:

```bash
~/.pi/agent/extensions/gitlab-duo-provider/account.sh test claude_fable_5
```

Atau manual:

```bash
duo \
  --cwd ~/.pi/agent/tmp/gitlab-duo-workspaces/akun-baru \
  --model claude_fable_5 \
  run --goal "Jawab hanya satu kata: OK"
```

Target output:

```txt
OK
```

---

## 9. Tes dari Pi CLI

List model:

```bash
pi --list-models gitlab-duo
```

Smoke test:

```bash
pi -p --no-tools \
  --model gitlab-duo/claude_fable_5 \
  "Jawab hanya satu kata: OK"
```

Target output:

```txt
OK
```

Di TUI Pi, pilih model:

```txt
gitlab-duo/claude_fable_5
```

---

## 10. Ganti akun

Misal ada dua profile:

```txt
wayangpt17
akun-baru
```

Switch ke akun baru:

```bash
~/.pi/agent/extensions/gitlab-duo-provider/account.sh switch akun-baru
```

Switch balik:

```bash
~/.pi/agent/extensions/gitlab-duo-provider/account.sh switch wayangpt17
```

Lalu di Pi:

```txt
/reload
```

---

## 11. Troubleshooting

### 11.1 Token kosong

Gejala:

```txt
TOKEN_LEN=0
```

Solusi:

```bash
echo "TOKEN_LEN=${#GITLAB_TOKEN}"
```

Jika kosong, jangan pakai `--api-key "$GITLAB_TOKEN"`. Gunakan `/login` atau `account.sh switch`.

---

### 11.2 Token invalid

Gejala:

```txt
Token is invalid or expired. Reason: invalid_token
```

Validasi token:

```bash
curl -sS -w "\nHTTP:%{http_code}\n" \
  --header "PRIVATE-TOKEN: TOKEN_KAMU" \
  https://gitlab.com/api/v4/personal_access_tokens/self
```

Harus:

```txt
HTTP:200
```

Jika `401`, buat token ulang.

---

### 11.3 Group Not Found / 404

Gejala:

```txt
404 Group Not Found
Failed to verify access to experimental and beta GitLab Duo features for group "future-org-group"
```

Penyebab:

- Token milik akun lain.
- Config masih menunjuk ke group lama.
- Akun baru tidak punya akses ke group lama.

Solusi:

```bash
~/.pi/agent/extensions/gitlab-duo-provider/account.sh switch akun-yang-benar
```

atau ubah fallback project:

```bash
~/.pi/agent/extensions/gitlab-duo-provider/install.sh group-baru/project-baru
```

---

### 11.4 Beta features belum aktif

Gejala:

```txt
Experimental and beta GitLab Duo features are not turned on for your group.
```

Solusi:

```txt
Group → Settings → GitLab Duo → Experiment and beta features: Enabled
```

Pastikan group yang disebut di log adalah group akun aktif, misalnya:

```txt
future-org-group1
```

bukan group lama.

---

### 11.5 Repo bukan GitLab

Gejala:

```txt
Could not find GitLab remote info
fatal: not a git repository
```

Solusi sudah otomatis: provider fallback ke workspace default. Jika masih error:

```bash
~/.pi/agent/extensions/gitlab-duo-provider/install.sh group/project
```

---

### 11.6 Debug log panjang keluar ke chat

Provider sudah dipatch agar error mengambil bagian relevan dari akhir log. Jika masih terjadi, reload:

```txt
/reload
```

atau restart Pi.

---

## 12. Model GitLab Duo yang tersedia

Contoh model:

```txt
gitlab-duo/claude_fable_5
gitlab-duo/claude_sonnet_4_6
gitlab-duo/gpt_5
gitlab-duo/gpt_5_codex
gitlab-duo/kimi_k2_6_fireworks
gitlab-duo/minimax_m2_7_fireworks
gitlab-duo/glm_5_1_fireworks
```

Cek lengkap:

```bash
pi --list-models gitlab-duo
```

---

## 13. Checklist akun baru

Gunakan checklist ini setiap membuat akun baru:

```txt
[ ] Email GitLab akun baru sudah verified
[ ] Group baru dibuat
[ ] User adalah Owner group
[ ] Project kosong dibuat di group
[ ] GitLab Duo Core enabled
[ ] Experiment and beta features enabled
[ ] Token dibuat dengan api + ai_features + read_repository
[ ] Profile ditambah via account.sh add
[ ] Profile diaktifkan via account.sh switch
[ ] Pi di-/reload atau restart
[ ] duo/account.sh test menghasilkan OK
[ ] pi smoke test menghasilkan OK
```

---

## 14. Command ringkas

```bash
# Link token
~/.pi/agent/extensions/gitlab-duo-provider/account.sh link

# Tambah akun
~/.pi/agent/extensions/gitlab-duo-provider/account.sh add akun-baru future-org-group1/future-org-project

# Aktifkan akun
~/.pi/agent/extensions/gitlab-duo-provider/account.sh switch akun-baru

# Cek aktif
~/.pi/agent/extensions/gitlab-duo-provider/account.sh current

# Tes Duo
~/.pi/agent/extensions/gitlab-duo-provider/account.sh test claude_fable_5

# Tes Pi
pi -p --no-tools --model gitlab-duo/claude_fable_5 "Jawab hanya satu kata: OK"
```
