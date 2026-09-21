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

HTTP yok; Caddy/Nginx bağlamana gerek yok. Konteyner arka planda WhatsApp oturumunu açık tutar.

```bash
git clone https://github.com/ahmetselimboz/Wp_to_Tgram.git /opt/Wp_to_Tgram
cd /opt/Wp_to_Tgram
cp .env.example .env
nano .env   # TELEGRAM_BOT_TOKEN ve TELEGRAM_CHAT_ID
```

### 4. Docker ile başlat

```bash
docker compose -f docker-compose.yml up -d --build
docker compose -f docker-compose.yml logs -f
```

### 5. WhatsApp QR kodunu tara

İlk çalıştırmada QR kodu iki yolla gelir:

- **Telegram:** Bot sana QR kodunu fotoğraf olarak gönderir
- **VPS:** `docker cp wp-to-tgram:/data/qr.png ./qr.png` ile indirip tarayabilirsin

WhatsApp → **Bağlı Cihazlar** → **Cihaz Bağla** → QR'ı tara.

Bağlantı kurulunca Telegram'a `✅ WhatsApp bağlantısı kuruldu.` mesajı gelir. Oturum `wp-to-tgram-data` volume'unda (`/data/auth`) saklanır; konteyner yeniden başlasa bile QR tekrar gerekmez.

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
docker compose -f docker-compose.yml logs -f

# Yeniden başlat
docker compose -f docker-compose.yml restart

# Durdur
docker compose -f docker-compose.yml down

# Oturumu sıfırla (yeniden QR gerekir)
docker compose -f docker-compose.yml down
docker volume rm wp-to-tgram-data
docker compose -f docker-compose.yml up -d --build
```

## CI/CD (GitHub Actions)

`main`'e her push'ta kod kontrolü ve Docker build çalışır. VPS deploy **kapalıdır**; açmak için aynı SSH secret'larını `newsReminder` ile paylaşabilirsin (port `2222` + passphrase).

### 1. GitHub secret / variable

Repo → **Settings** → **Secrets and variables** → **Actions**

**Variables**

| Ad | Değer |
|---|---|
| `ENABLE_SSH_DEPLOY` | `true` |

**Secrets**

| Secret | Açıklama |
|---|---|
| `DEPLOY_HOST` | VPS IP / hostname |
| `DEPLOY_USER` | SSH kullanıcısı (`root`, `selim`, …) |
| `DEPLOY_SSH_KEY` | Private SSH anahtarı |
| `DEPLOY_SSH_PASSPHRASE` | Anahtar şifresi |
| `DEPLOY_PATH` | Sunucudaki dizin, örn. `/opt/Wp_to_Tgram` |
| `TELEGRAM_BOT_TOKEN` | Her deploy'da sunucudaki `.env`'e yazılır |
| `TELEGRAM_CHAT_ID` | Token ile birlikte |

Diğer `.env` satırlarına dokunulmaz. WhatsApp oturumu `wp-to-tgram-data` volume'unda kalır.

### 2. İlk ayağa kalkış

`ENABLE_SSH_DEPLOY=true` ile `main`'e push yeter. Token'ları GitHub'a koymadıysan deploy sonrası:

```bash
cd /opt/Wp_to_Tgram   # DEPLOY_PATH
nano .env
docker compose -f docker-compose.yml up -d --force-recreate --no-build
docker compose -f docker-compose.yml logs -f
```

Elle yayın: Actions → **CI/CD** → **Run workflow**.

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
