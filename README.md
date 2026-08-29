# Wp-to-Tgram

WhatsApp mesajlarını Telegram botuna ileten köprü servisi. Eski telefonlarda WhatsApp bildirimi gelmese bile, Telegram üzerinden anlık haberdar olmanızı sağlar.

## Nasıl çalışır?

```
WhatsApp (Bulut) → Baileys (Node.js) → Telegram Bot API → Telegram (telefonunuz)
```

- Kişisel WhatsApp hesabınız WhatsApp Web protokolü üzerinden bağlanır
- Gelen her mesaj (birebir + grup) Telegram botunuz aracılığıyla size iletilir
- Metin mesajları tam içerikle gelir; medya mesajları asistan tarzında özetlenir

**Örnek bildirimler:**

```
👤 Ahmet

💬 Merhaba, yarın görüşelim mi?
```

```
👥 Aile Grubu
👤 Fatma

📷 bir fotoğraf gönderdi.
```

## Gereksinimler

- VPS (Linux)
- Docker & Docker Compose
- Telegram bot token ([@BotFather](https://t.me/BotFather))
- Telegram chat ID ([@userinfobot](https://t.me/userinfobot))

## Kurulum

### 1. Telegram botunu oluştur

1. Telegram'da [@BotFather](https://t.me/BotFather)'a `/newbot` yaz
2. Bot adını ve kullanıcı adını belirle
3. Verilen **token**'ı kaydet

### 2. Chat ID'ni öğren

1. Oluşturduğun bota Telegram'dan `/start` yaz
2. [@userinfobot](https://t.me/userinfobot)'a `/start` yaz → **Id** numaranı kaydet

### 3. Projeyi VPS'e yükle

```bash
git clone https://github.com/KULLANICI/Wp_to_Tgram.git
cd Wp_to_Tgram
cp .env.example .env
nano .env   # token ve chat ID'yi gir
```

### 4. Docker ile başlat

```bash
docker compose up -d --build
```

### 5. WhatsApp QR kodunu tara

İlk çalıştırmada QR kodu iki yolla gelir:

- **Telegram:** Bot sana QR kodunu fotoğraf olarak gönderir
- **VPS:** `docker cp wp-to-tgram:/data/qr.png ./qr.png` ile indirip tarayabilirsin

WhatsApp → **Bağlı Cihazlar** → **Cihaz Bağla** → QR'ı tara.

Bağlantı kurulunca Telegram'a `✅ WhatsApp bağlantısı kuruldu.` mesajı gelir. Oturum `data/auth` volume'unda saklanır; konteyner yeniden başlasa bile QR tekrar gerekmez.

## Ortam değişkenleri

| Değişken | Zorunlu | Açıklama |
|----------|---------|----------|
| `TELEGRAM_BOT_TOKEN` | Evet | BotFather token |
| `TELEGRAM_CHAT_ID` | Evet | Telegram kullanıcı ID |
| `AUTH_DIR` | Hayır | Oturum dizini (varsayılan: `/data/auth`) |
| `DATA_DIR` | Hayır | QR ve veri dizini (varsayılan: `/data`) |
| `LOG_LEVEL` | Hayır | `info`, `debug`, vb. |
| `NOTIFY_DELAY_MS` | Hayır | Sohbetteyken bildirim: okursan Telegram'a gitmez (varsayılan: `15000`) |

## Yararlı komutlar

```bash
# Logları izle
docker compose logs -f

# Yeniden başlat
docker compose restart

# Durdur
docker compose down

# Oturumu sıfırla (yeniden QR gerekir)
docker compose down
docker volume rm wp_to_tgram_wp_data   # volume adı projeye göre değişebilir
docker compose up -d --build
```

Volume adını görmek için: `docker volume ls | grep wp`

## CI/CD (GitHub Actions)

`main`'e her push'ta GitHub Actions kodu kontrol eder, Docker imajını derler ve VPS'e yayınlar. Pull request'lerde yalnızca kontrol çalışır; sunucuya dokunulmaz.

### 1. GitHub secret'larını ekle

Repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**

| Secret | Zorunlu | Açıklama |
|---|---|---|
| `VPS_HOST` | Evet (deploy için) | VPS IP veya hostname |
| `VPS_USER` | Evet | SSH kullanıcısı (`root`, `ubuntu`, …) |
| `VPS_SSH_KEY` | Evet | Deploy için **private** SSH anahtarı |
| `VPS_PORT` | Hayır | SSH portu (varsayılan: `22`) |
| `VPS_APP_DIR` | Hayır | Uygulama dizini (varsayılan: `~/Wp_to_Tgram`) |
| `TELEGRAM_BOT_TOKEN` | Hayır | Varsa her deploy'da VPS'teki `.env` güncellenir |
| `TELEGRAM_CHAT_ID` | Hayır | Token ile birlikte |

`VPS_HOST` yoksa CI yine çalışır, deploy atlanır.

### 2. VPS'te deploy anahtarını tanıt

Yerelde (bu anahtarı yalnızca GitHub Actions kullanır):

```bash
ssh-keygen -t ed25519 -C "github-actions-wp-to-tgram" -f ./wp-to-tgram-deploy -N ""
```

Public key'i VPS'e ekle:

```bash
ssh KULLANICI@VPS 'mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys' < ./wp-to-tgram-deploy.pub
```

`wp-to-tgram-deploy` dosyasının **tüm içeriğini** `VPS_SSH_KEY` secret'ına yapıştır. Private key'i git'e ekleme.

VPS'te Docker ve Git kurulu olmalı. İlk WhatsApp QR taraması yine senin tarafında; oturum Docker volume'unda kalır, sonraki deploy'lar QR istemez.

### 3. Elle yayınla

Actions → **CI/CD** → **Run workflow**

## Desteklenen mesaj türleri

| Tür | Telegram'da görünüm |
|-----|---------------------|
| Metin | Tam mesaj içeriği |
| Fotoğraf | "📷 bir fotoğraf gönderdi." (+ varsa altyazı) |
| Video | "🎥 bir video gönderdi." |
| Ses / sesli mesaj | "🎤 bir ses mesajı gönderdi." |
| Dosya | "📎 bir dosya gönderdi." |
| Çıkartma | "😊 bir çıkartma gönderdi." |
| Konum | "📍 konum paylaştı." |
| Kişi kartı | "👤 bir kişi paylaştı." |
| Tepki | "👍 bir mesaja tepki verdi." |

Grup mesajlarında grup adı ve gönderen adı birlikte gösterilir.

## Laravel neden değil?

Laravel bir web framework'üdür; HTTP istek/yanıt modeline göre tasarlanmıştır. WhatsApp Web köprüsü ise **sürekli açık WebSocket bağlantısı** gerektirir. Node.js ekosisteminde bu iş için olgun kütüphaneler (Baileys) vardır; PHP/Laravel ile aynı işi yapmak ya mümkün değildir ya da arkada yine Node.js çalıştırmayı gerektirir.

## Uyarılar

- Bu proje resmi WhatsApp API'si **kullanmaz**; kişisel kullanım içindir
- WhatsApp kullanım şartlarına aykırı olabilir; düşük ama sıfır olmayan hesap riski vardır
- Mesajlar VPS'inizden geçer — güvenilir bir sunucu kullanın
- `.env` dosyasını ve bot token'ınızı paylaşmayın

## Lisans

MIT
