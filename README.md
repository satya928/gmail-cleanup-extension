# Gmail Cleanup — Inbox Organiser

A Chrome Extension (Manifest V3) that scans your Gmail inbox, groups emails by sender and category, and lets you archive or trash them in bulk.

## Features
- 📧 Scans full inbox — thousands of emails in minutes (50 parallel workers)
- 🗂️ Groups by category: Jobs, Shopping, Social, Finance, Travel, Entertainment, Tech, News…
- 📁 Archive or 🗑️ Trash entire sender groups with one click
- 🛡️ Protect senders you want to keep — excluded from all cleaning
- 👥 Multi-account support — scan multiple Gmail accounts together
- 🔒 All processing is local — no data ever leaves your browser

## Privacy
All email data is processed locally in your browser. No backend server, no analytics, no data collection.  
→ [Full Privacy Policy](https://satya928.github.io/gmail-cleanup-extension/privacy-policy.html)

## Development

```bash
npm install
npm run build      # build extension into dist/
npm run package    # build + create gmail-cleanup-v1.0.0.zip
```

Load unpacked from `dist/` in `chrome://extensions`.

## Publishing
The `.zip` produced by `npm run package` is ready to upload to the Chrome Web Store.
