# Merchant CPM ASPI Simulator

Simulator merchant berbasis web untuk menguji transaksi **QRIS CPM (Consumer Presented Mode)**: kamera laptop membaca QR yang ditampilkan aplikasi mobile banking / e-wallet, payload diparsing dan divalidasi, lalu merchant melakukan **Accept / Reject Payment**.

> ⚠️ **Disclaimer.** Aplikasi ini adalah alat simulasi untuk development & integration testing. Aplikasi ini **tidak** compliant ataupun tersertifikasi ASPI. Struktur parser mengikuti spesifikasi publik EMVCo CPM; seluruh aturan khusus ASPI QRIS CPM harus diverifikasi terhadap dokumen resmi ASPI sebelum digunakan sebagai acuan.

Aplikasi berjalan dalam dua mode:

| API Integration | Validation | Execution | Perilaku |
|---|---|---|---|
| **Disabled** (default) | LOCAL | MOCK (dipaksa) | Standalone — **tidak ada HTTP request sama sekali** |
| Enabled | BACKEND | MOCK atau REAL API | Validasi via backend; pembayaran via mock atau backend |
| Enabled, backend down | Error / fallback LOCAL | — | Error, atau fallback lokal jika *Fallback to local validation* aktif |

---

## 1. Quick start

Prasyarat: Node.js ≥ 18 (diuji dengan Node 22), Google Chrome atau Microsoft Edge terbaru.

```bash
npm install
```

```bash
npm run dev
```

Buka http://localhost:5173. Kamera hanya bisa diakses dari **HTTPS** atau **localhost**.

Perintah lain:

```bash
npm test            # Vitest (unit + integration)
npm run build       # type-check + production build ke dist/
npm run preview     # serve hasil build di http://localhost:4173
```

### Alur cepat tanpa smartphone

1. **Developer Tools → Developer Testing Panel → Payload Lab**, klik preset *Basic CPM*.
2. Klik **Validate QR Payload** → hasil validasi lokal tampil.
3. Klik **Accept Payment** → transaksi APPROVED (mock) dan tersimpan di Transaction History.
4. QR sampel yang muncul bisa di-*Download PNG* lalu dibuka di HP untuk menguji kamera.

### Menguji dengan kamera

1. **QR Scanner** → **Start Scanner**, izinkan akses kamera.
2. Tampilkan QR CPM di layar smartphone (naikkan brightness, jarak ±15–25 cm).
3. Saat terdeteksi, bingkai berkedip hijau, payload diparsing & divalidasi otomatis, dan deteksi di-*pause* agar QR yang sama tidak diproses ulang. Klik **Resume** untuk QR berikutnya.
4. Alternatif: **Upload QR Image**.

---

## 2. Tentang struktur QR CPM (penting)

QRIS CPM **berbeda dari QRIS MPM**:

| | MPM (merchant presented) | CPM (consumer presented) |
|---|---|---|
| Encoding | Teks ASCII `ID(2) LEN(2) VALUE` | **Base64** dari biner **BER-TLV** |
| Awal payload | `000201…` | Tag `85` = `"CPV01"` → Base64 diawali `hQVDUFYwMQ` |
| Isi | Data merchant | Kredensial konsumen (AID, PAN/Track 2, cryptogram) |
| CRC | Tag `63` (CRC-16/CCITT-FALSE) | **Tidak ada CRC**; integritas via Application Cryptogram (`9F26`) yang hanya bisa diverifikasi issuer |

Parser (`src/core/cpm`) mengimplementasikan data object EMVCo CPM yang **terverifikasi dari spesifikasi publik EMVCo**:

- Top level: `85` Payload Format Indicator, `61` Application Template, `62` Common Data Template
- Dalam `61`/`62`: `4F` ADF Name (AID), `50` Label, `57` Track 2, `5A` PAN, `5F20` Cardholder Name, `5F2D` Language, `5F50` Issuer URL, `9F08`, `9F19`, `9F24`, `9F25`
- Template transparan `63`/`64`: data EMV seperti `9F26`, `9F27`, `9F10`, `9F36`, `82`, `9F37`, serta `9F02`/`5F2A`/`9F1A`/`9F16`/`9F1C`/`9F15`/`9F4E` jika memang dibawa payload

Karena dalam CPM data merchant/terminal/amount umumnya berasal dari **terminal**, panel QR Information menandai sumber tiap field (`QR` atau `terminal`). Field yang tidak ada ditampilkan `N/A`.

**Yang sengaja dibuat configurable karena belum terverifikasi terhadap dokumen ASPI:**

| Item | Default | Lokasi |
|---|---|---|
| Supported AID | `A0000006022020` (**nilai simulator**) | Settings → Validation |
| Mandatory tag tambahan | kosong | Settings → Validation |
| Tag Transaction Reference | kosong (tidak dipakai) | Settings → Validation |
| Tag expiry (YYMMDDhhmmss) | kosong (tidak dipakai) | Settings → Validation |
| CRC | `OPTIONAL` — hanya untuk tag simulator `DF7F` (non-standar) | Settings → Validation |

Tag ASPI tambahan dapat didaftarkan lewat `registerTag()` di `src/core/cpm/tags.ts` setelah diverifikasi.

**CRC.** Karena EMVCo CPM tidak mendefinisikan CRC, simulator menambahkan tag privat **`DF7F`** (CRC-16/CCITT-FALSE) pada payload sampel agar skenario *Invalid CRC* dapat diuji. Payload asli dari aplikasi bank tidak memiliki tag ini sehingga cek CRC berstatus `SKIPPED`. Payload MPM (tag `63`) tetap divalidasi CRC-nya, lalu ditolak sebagai *Unsupported QR Format*.

**Sample payload** di Developer Panel adalah **data simulasi** (PAN acak Luhn-valid berawalan 9360, cryptogram acak) — bukan payload resmi atau tersertifikasi ASPI.

---

## 3. Validasi

Spec rules (`SpecificationValidator`) **selalu dijalankan** dan tidak dapat dimatikan lewat konfigurasi:
payload tidak kosong · decoding Base64/hex · format EMVCo CPM · struktur BER-TLV · `85 = CPV01` · ada `61` · ada `4F` · ada `5A` atau `57` · panjang field · format data (ans/an/n/cn/track2) · konsistensi PAN/Track 2/last-4 · penempatan tag · unknown tag (WARNING; FAIL bila *Strict Mode*).

Business rules (`BusinessRuleValidator`, dapat dikonfigurasi): status merchant · Merchant ID & Terminal ID (allow-list) · AID yang didukung (prefix match) · mandatory/optional tags · min/max amount · currency · duplicate transaction · QR expiration · Luhn (opsional).

Hasil lokal maupun backend dinormalisasi ke satu format `ValidationResult` (`ValidationResultMapper`): status `VALID/INVALID`, mode `LOCAL/BACKEND`, dan daftar check `PASS/FAIL/WARNING/SKIPPED` dengan detail (expected/actual) yang bisa dibuka per baris.

**Duplicate detection.** QR CPM bersifat sekali pakai. Payload yang sudah memiliki transaksi `APPROVED`/`PROCESSING` ditolak (validasi FAIL, dan Transaction Engine menolak dengan RC `94` sebagai pengaman terakhir).

---

## 4. Transaksi

Validasi QR dan otorisasi pembayaran dipisahkan: QR VALID adalah prasyarat, tetapi hasil pembayaran ditentukan `PaymentProcessor`.

- **Mock Mode** (`MockPaymentProcessor`): response APPROVED / DECLINED / TIMEOUT / SYSTEM ERROR / CONNECTION ERROR; processing delay; transaction timeout; response code/message; success rate. Tidak ada network I/O.
- **Real API Mode** (`BackendPaymentProcessor`): memanggil endpoint role `PAYMENT` dengan request template & response mapping.

Status: `PROCESSING → APPROVED | DECLINED | TIMEOUT | SYSTEM_ERROR | CONNECTION_ERROR | MAPPING_ERROR`, atau `REJECTED` (oleh merchant).
Transaction ID: `TRX` + `yyyyMMddHHmmss` + 6 hex acak.

---

## 5. Backend integration

Semua dapat diubah dari UI tanpa rebuild; konfigurasi aktif dipakai untuk **request berikutnya**.

- **Settings → API Configuration**: multi-environment (Development, SIT, UAT, Production, Custom), base URL (divalidasi), API version, auth (None / Bearer / Basic / API Key / Custom Header), custom headers, timeout, Test Connection (endpoint `HEALTH`), add/edit/duplicate/delete/set active, import/export JSON.
- **Settings → Endpoint Configuration**: endpoint registry (method, path, header, timeout) + custom endpoint. Engine mencari endpoint berdasarkan *role*.
- **Settings → Request/Response Mapping**: body template dengan placeholder dan mapping JSONPath, plus *Test Mapping* untuk mencoba response contoh.

Placeholder: `{{transactionId}} {{merchantId}} {{merchantName}} {{terminalId}} {{amount}} {{amountMinor}} {{currency}} {{currencyNumeric}} {{qrPayload}} {{timestamp}} {{applicationIdentifier}} {{environment}} {{apiVersion}}`. Path juga mendukung `{transactionId}`.

Default mapping:

| JSONPath | Field internal |
|---|---|
| `$.responseCode` | Response Code (sukses jika ∈ *Success Codes*, default `00`) |
| `$.responseMessage` | Response Message |
| `$.data.transactionStatus` | Transaction Status (via *Status Mapping*) |
| `$.data.referenceNumber` | Reference Number |
| `$.errorCode` / `$.errorMessage` | Error mapping |
| `$.data.checks` | (endpoint validasi) daftar `{name,status,description}` |

Kontrak minimal backend validasi (`POST /api/v1/merchant/validate`):

```json
{ "responseCode": "00", "responseMessage": "QR valid", "data": { "validationStatus": "VALID" } }
```

Kontrak minimal backend payment (`POST /api/v1/merchant/payment`):

```json
{ "responseCode": "00", "responseMessage": "Approved", "data": { "transactionStatus": "SUCCESS", "referenceNumber": "000123456789" } }
```

### CORS & development proxy

Browser hanya dapat memanggil backend yang mengizinkan origin simulator lewat header CORS. Jika backend belum mendukung CORS, aktifkan **"Route through development proxy"** pada environment saat menjalankan `npm run dev`: request dikirim ke `/__devproxy/*` dan diteruskan server-side oleh Vite (`devProxy.ts`). Proxy ini **hanya ada di dev server**, tidak ikut ke production build, dan tidak menonaktifkan verifikasi TLS. Tidak ada opsi bypass SSL.

---

## 6. Developer tools

- **Developer Testing Panel**: input/paste raw payload, parse, validate, TLV tree, parsed JSON, parser issues, generator sampel + render QR, konfigurasi mock, log parsing/validasi/transaksi/scanner.
- **Simulation Scenarios** (14 skenario): Successful Payment, Declined, Invalid Payload, Invalid CRC, Unsupported Format, Duplicate, Timeout, Merchant Rejected, Invalid Merchant ID, Invalid Transaction Data, Backend Connection Failure, Backend Validation Rejected, Backend System Error, Backend Response Mapping Failure. Skenario berjalan di sandbox (konfigurasi di-clone, history in-memory). Skenario backend memakai **simulated backend in-browser** sehingga tidak ada HTTP request nyata; panggilannya tetap tercatat di API Logs dengan label `SIM`.
- **API Testing Console**: pilih environment & endpoint, edit method/URL/headers/body, kirim, lihat status/header/body/durasi, copy sebagai cURL/JSON.
- **API Logs**: filter environment, endpoint, HTTP status, success/failure, rentang tanggal; detail request/response (nilai sensitif di-mask).
- **Validation Logs**: log validasi & parsing.

---

## 7. Persistensi & keamanan

- Konfigurasi, history, dan log disimpan di **localStorage** (`cpm-sim:config`, `cpm-sim:transactions`, `cpm-sim:logs`) dan bertahan setelah refresh. Tersedia Reset to Default, Import/Export JSON, dan Clear All Local Data.
- ⚠️ Kredensial (token, password, API key) tersimpan **plain text di browser** — hanya untuk development & integration testing. Untuk production gunakan backend / secret manager. Export JSON secara default **tidak** menyertakan kredensial.
- PAN dan Track 2 selalu di-mask (6 digit awal + 4 digit akhir) di UI dan tree hasil parsing. Header sensitif (`Authorization`, `X-API-Key`, dll., bisa ditambah) dan field body sensitif di-mask pada API log.
- Payload QR CPM berisi nomor rekening konsumen. Matikan *Store full QR payload in history* (Application Settings) bila tidak diperlukan.
- Parsing defensif: batas panjang payload, batas kedalaman template, validasi panjang TLV sebelum membaca value; payload rusak tidak pernah menyebabkan crash.
- Ekspor CSV menetralkan formula injection (`=`, `+`, `-`, `@`).
- Aplikasi tidak mencoba melewati kebijakan keamanan browser (CORS, mixed content, permission kamera).

---

## 8. Arsitektur

```
src/
  core/                         # framework-independent, fully unit-tested
    cpm/        berTlv · tags · CpmPayloadParser · crc16 · encoder · sampleGenerator
    validation/ SpecificationValidator · BusinessRuleValidator · LocalValidationEngine
                BackendValidationAdapter · ValidationOrchestrator · ValidationResultMapper
    transaction/ TransactionEngine · MockPaymentProcessor · BackendPaymentProcessor · templateVars
    api/        DynamicApiClient · FetchTransport · SimulatedBackendTransport · auth
                template · jsonPath · ResponseMapper · urlValidation
    repository/ InMemoryTransactionRepository
    scenarios/  scenario definitions + sandboxed runner
    config/     types + defaults
  store/        Zustand stores (config, transactions, logs, session) + persistence
  services/     simulator.ts — wiring core ↔ stores (builds fresh clients per operation)
  features/     scanner (useQrScanner/ZXing), transaction panels, developer tools
  pages/        routed pages incl. settings/*
  components/   layout + UI kit
```

Modul utama dan interfacenya:

| Modul | Implementasi |
|---|---|
| Camera Scanner | `features/scanner/useQrScanner.ts` (WebRTC + ZXing) |
| CPM QR Parser | `CpmPayloadParser` (`QrParser`) |
| QR Specification Validator | `SpecificationValidator` |
| Local Validation Engine | `LocalValidationEngine` (`QrValidator`) |
| Business Rule Validator | `BusinessRuleValidator` |
| Backend Validation Adapter | `BackendValidationAdapter` (`QrValidator`) |
| Validation Orchestrator | `ValidationOrchestrator` |
| Transaction Engine | `TransactionEngine` |
| Mock Payment Processor | `MockPaymentProcessor` (`PaymentProcessor`) |
| Dynamic API Config Manager | `store/configStore.ts` |
| Dynamic API Client | `DynamicApiClient` (`HttpTransport`) |
| Request/Response Mapping Engine | `template.ts`, `jsonPath.ts`, `ResponseMapper.ts` |
| API Logging Service | `ApiLogSink` → `store/logStore.ts` |
| Transaction History Repository | `TransactionRepository` → `storeTransactionRepository` / `InMemoryTransactionRepository` |

---

## 9. Testing

```bash
npm test
```

96 test mencakup: TLV parsing, nested TLV, long-form length, CRC, invalid length/format, missing mandatory fields, MPM detection; specification & business validation, duplicate, currency, merchant, expiry, strict mode, orchestrator (local/backend/fallback); dynamic base URL, autentikasi, custom headers, request & response mapping, timeout, error handling, URL validation, dev proxy; transaksi sukses/declined/rejected/duplicate/timeout/system error, backend processor; ke-14 simulation scenario; serta integration test UI (termasuk memastikan **tidak ada `fetch`** pada mode standalone).

---

## 10. Deployment

Hasil build adalah aset statis (`dist/`) dan berjalan offline setelah aset dimuat (tidak ada CDN/font eksternal). Routing menggunakan hash (`/#/...`) sehingga tidak perlu rewrite rule.

```bash
npm ci
```

```bash
npm run build
```

Sajikan folder `dist/` dari web server mana pun **melalui HTTPS** (wajib untuk kamera, kecuali `localhost`). Contoh nginx:

```nginx
server {
  listen 443 ssl;
  server_name cpm-simulator.internal.example.com;
  ssl_certificate     /etc/ssl/certs/cpm-simulator.crt;
  ssl_certificate_key /etc/ssl/private/cpm-simulator.key;

  root /var/www/cpm-simulator/dist;
  index index.html;
  add_header Permissions-Policy "camera=(self)";
  location / { try_files $uri /index.html; }
}
```

Untuk uji dari perangkat lain di LAN saat development, jalankan Vite dengan HTTPS (mis. lewat `@vitejs/plugin-basic-ssl` atau reverse proxy TLS) karena kamera diblokir pada `http://<ip-lan>`.

Backend yang dipanggil dari build production harus mengizinkan origin simulator via CORS (dev proxy tidak tersedia di production).

---

## 11. Batasan yang diketahui

- Aturan khusus ASPI QRIS CPM (AID resmi, tag proprietary, mandatory field tambahan, format expiry/reference) belum diverifikasi — gunakan konfigurasi untuk menyesuaikan.
- Application Cryptogram tidak dapat diverifikasi secara lokal (membutuhkan kunci issuer); validasi lokal adalah validasi struktur & aturan bisnis, bukan otorisasi.
- Penyimpanan menggunakan localStorage (kapasitas ±5 MB); jumlah history/log dibatasi (dapat diatur).
