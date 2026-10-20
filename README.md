# Universal Scanner

Universal Scanner is a mobile-first Progressive Web App for scanning QR codes and barcodes, creating QR codes, saving useful results, and earning in-app rewards.

## Included features

- Camera and image-gallery QR/barcode scanning
- Smart scan detection for websites, Wi-Fi codes, phone numbers, email, UPI links, product barcodes, and text
- Safe-link warning before opening a suspicious URL
- Scan result actions: open, copy, share, call, email, payment preview, and product search
- QR creator for text, websites, Wi-Fi, contacts, email, and phone numbers
- Local scan history with search, filters, favorites, and delete controls
- Coins, daily missions, streaks, levels, achievements, and a local rewards-store preview
- Install/update controls and offline-friendly PWA cache
- Guest mode: data is stored only on the current device until Firebase sign-in is enabled

## Requirements

- Node.js 20 or newer
- A modern browser with camera access

Camera access works on `localhost` while developing. A deployed version must use HTTPS.

## Run the project

```bash
npm install
npm run dev
```

Open the local address printed in the terminal, normally `http://localhost:5173`.

## Create a production build

```bash
npm run build
npm run preview
```

The production website is created in the `dist` folder. Do not upload `node_modules` or `dist` to GitHub.

## Project files

```text
QRcodeScanner/
├── index.html              Main app page
├── src/
│   ├── main.js             Scanner, QR creation, history, missions, rewards, and PWA logic
│   └── styles.css          Full responsive interface design
├── service-worker.js       Offline cache and update behaviour
├── manifest.json           Installable-app configuration
├── icon-*.png              App icons
├── package.json            Required packages and commands
├── package-lock.json       Locked dependency versions
├── firebase.json           Firebase Hosting configuration
├── config.js               Firebase configuration reference for a future sign-in release
├── SECURITY.md             Security notes
└── .gitignore              Files excluded from GitHub
```

## Upload to GitHub

Create a new empty repository on GitHub, then run these commands in this folder:

```bash
git add .
git commit -m "Build Universal Scanner PWA"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPOSITORY.git
git push -u origin main
```

Replace `YOUR-USERNAME` and `YOUR-REPOSITORY` with your GitHub details.

## Notes for the next release

- Google sign-in is intentionally paused while the app is in Guest mode.
- Firebase cloud sync and secure reward validation need Firebase Authentication and Firestore rules before being enabled.
- Product scans open a search page. A paid or free product-data API can be connected later for real product details.
