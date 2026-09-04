# Security Policy 🔒

## Reporting Security Issues

If you discover a security vulnerability, please email **security@universalscanner.com** instead of using the issue tracker.

## Security Status (v2.0.0)

### ✅ Completed
- [x] Input validation for coupon codes
- [x] XSS prevention with proper escaping
- [x] Scan cooldown (2 seconds) to prevent fraud
- [x] Service worker validation
- [x] Accessibility improvements

### 🚧 In Progress
- [ ] Move Firebase config to environment variables
- [ ] Implement Firestore for persistent storage
- [ ] Server-side coupon validation (Cloud Functions)
- [ ] Rate limiting for scans

### 📋 Planned
- [ ] Two-factor authentication
- [ ] Advanced DDoS protection
- [ ] Security audit
- [ ] Penetration testing

## Known Issues

1. **Firebase Credentials in Code** (Medium Risk)
   - Currently visible in `index.html`
   - Status: Will be fixed in v2.1.0
   - Workaround: Use `.gitignore` to prevent accidental commits

2. **Client-Side Validation Only** (Medium Risk)
   - Coupons validated in browser (can be hacked)
   - Status: Will move to Cloud Functions in v2.1.0

3. **localStorage Not Encrypted** (Low Risk)
   - User data stored unencrypted locally
   - Status: Acceptable for PWA (user's device)

## Security Best Practices

### For Users ✅
- Sign in with Google (encrypted)
- Don't share your account
- Use HTTPS (always, on production)
- Check for `🔒` lock icon in browser

### For Developers ✅
- Never commit `.env` files (use `.gitignore`)
- Use environment variables for secrets
- Enable Firebase Security Rules
- Test with Firebase emulator before deploy
- Run regular security audits

## Firebase Security Rules (RECOMMENDED)

Add these rules to Firebase Console → Firestore:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read, write: if request.auth.uid == userId;
      
      match /scans/{scanId} {
        allow read, write: if request.auth.uid == userId;
      }
    }
  }
}
