# Gmail Subscription Cleanup Extension — Beast Mode MVP Spec

## 1) One-line product idea
Build a lightweight Chrome extension that scans a user's Gmail inbox, groups email by sender/domain, creates Gmail labels for cleanup buckets, and lets the user bulk archive, trash, or filter future subscription mail.

## 2) Core problem
Gmail inboxes accumulate years of low-value subscription mail, promotions, and newsletter clutter. Users want a safer way to:
- see which senders create the most noise
- organize them quickly
- delete old junk safely
- keep future junk auto-labeled instead of re-flooding the inbox

## 3) Product goal
Turn mailbox cleanup into a 3-step flow:
1. Scan
2. Review grouped senders
3. Apply cleanup actions safely

## 4) Best product shape
Use **Gmail labels + Gmail filters**, not fake local folders.

Why:
- Gmail is label-centric, not traditional-folder centric.
- The Gmail API supports creating and managing labels and modifying labels on messages.
- Gmail filters can automatically add/remove labels for future matching mail.

## 5) Recommended MVP scope
### In scope
- Google sign-in with OAuth
- Scan INBOX / Promotions / Social mail metadata
- Group by sender email and sender domain
- Detect likely subscriptions and promotional senders
- Create cleanup labels such as `Cleanup/Newsletters`, `Cleanup/Promotions`, `Cleanup/<domain>`
- Apply labels to historical mail
- Bulk archive old messages
- Bulk move old messages to Trash
- Create future Gmail filters by sender/domain
- Preview impact before action
- Undo support where possible for label/archive operations

### Out of scope for v1
- AI classification of every message body
- one-click unsubscribe automation across all senders
- background server and live sync
- enterprise admin/multi-mailbox support
- advanced billing or storage analytics

## 6) Target users
### Primary
- individuals with large personal Gmail inboxes
- professionals with many newsletters/promotional emails
- users who never clean Promotions/Updates/Social tabs

### Secondary
- small business owners using Gmail
- productivity enthusiasts
- light email power users

## 7) User stories
- As a user, I want to scan my inbox and identify high-volume senders.
- As a user, I want to see which senders are likely subscriptions.
- As a user, I want to create labels for noisy senders.
- As a user, I want to bulk delete or archive old messages from selected senders.
- As a user, I want future mail from those senders to be auto-labeled.
- As a user, I want a safe review screen before any destructive action.

## 8) User experience flow
### Flow A — First run
1. Install extension
2. Click `Connect Gmail`
3. Consent to Gmail scopes
4. Land on dashboard
5. Run first scan

### Flow B — Scan and review
1. Fetch message metadata only
2. Parse sender name/email/domain
3. Group results
4. Rank by count / recency / suspected subscription score
5. Show action table

### Flow C — Organize
1. User selects one or more sender groups
2. Chooses label strategy
3. Creates labels
4. Applies labels to existing mail

### Flow D — Cleanup
1. User selects retention rule like older than 30/90/180 days
2. Preview number of affected messages
3. Confirm archive or trash
4. Execute bulk action

### Flow E — Prevent future clutter
1. User clicks `Auto-organize future mail`
2. Extension creates Gmail filters by sender/domain
3. Future mail gets labeled automatically
4. Optional: skip inbox for selected categories later version

## 9) Information architecture
### Main screens
1. **Onboarding / Connect Gmail**
2. **Dashboard**
3. **Sender Groups**
4. **Review & Preview Action**
5. **Rules / Filters**
6. **Settings**
7. **Activity Log**

### Dashboard widgets
- total scanned messages
- top noisy senders
- likely subscription senders
- potential cleanup count
- estimated deletable mail older than X days

## 10) Data model
### Local extension storage
- auth state
- label mapping cache
- scan timestamp
- sender stats cache
- user cleanup preferences
- retention rules
- activity history

### SenderGroup object
- senderEmail
- senderDomain
- senderDisplayName
- messageCount
- inboxCount
- promotionsCount
- socialCount
- latestMessageDate
- oldestMessageDate
- suspectedSubscriptionScore
- hasListUnsubscribeHeader
- selectedLabel
- recommendedAction

### CleanupRule object
- ruleId
- senderDomain or senderEmail
- actionType (`label`, `archive`, `trash`, `filterCreate`)
- olderThanDays
- labelName
- enabled

## 11) Functional requirements
### 11.1 Authentication
- Use Google OAuth for user Gmail access.
- Require minimum needed scopes.
- Store tokens securely using Chrome identity/session flow and extension storage patterns.

### 11.2 Inbox scan
- Query Gmail messages from relevant system labels.
- Start with metadata-only mode to reduce cost and risk.
- Paginate results.
- Support scan limits such as 500 / 2,000 / 10,000 messages.

### 11.3 Sender extraction
- Extract sender from `From` header.
- Normalize sender email.
- Derive sender domain.
- Merge aliases where appropriate in later versions.

### 11.4 Subscription detection heuristic
Use a score based on:
- presence of `List-Unsubscribe`
- repeated sender frequency
- promotional domain patterns
- label placement like Promotions/Social
- sender naming patterns like newsletter, digest, updates, deals

### 11.5 Label management
- Create parent cleanup label if missing.
- Create sender/domain labels.
- Reuse existing labels if already present.
- Apply labels in batches.

### 11.6 Bulk actions
- Add labels
- Remove INBOX label to archive
- Move to Trash for old junk
- Mark read/unread later version

### 11.7 Filter creation
- Create Gmail filters for sender/domain
- Auto-apply label on future messages
- Future phase: optionally archive automatically

### 11.8 Preview & safety
- Always show affected count before execution
- Show sample recent messages from affected group
- Require confirmation for trash action
- Keep activity log

## 12) Tech architecture
### Option recommended for MVP
**Chrome Extension (Manifest V3) + Gmail REST API**

### Why this is best
- Fastest to ship
- No backend required for initial version
- Works directly in the browser
- Easier for personal productivity users

### High-level architecture
- Popup UI or side panel UI
- Background service worker
- OAuth/auth integration
- Gmail API service layer
- Scan + grouping engine
- Action execution engine
- Local cache in chrome.storage

### Components
#### Frontend
- React or plain TypeScript UI
- Popup for quick actions
- Full-page options screen for scan dashboard

#### Background worker
- Token management
- Gmail API calls
- long-running scan orchestration
- batch action processing

#### Gmail API modules
- messages.list
- messages.get (metadata/minimal)
- labels.list / create
- messages.modify / batchModify
- filters.list / create

## 13) API mapping
### Scan
Use message listing and metadata retrieval to fetch message IDs and headers.

### Label operations
Use Gmail label APIs to create and manage cleanup labels.

### Apply labels / archive
Use message modify or batch modify to add/remove labels such as INBOX.

### Filters
Use Gmail settings filters APIs to create future organization rules.

## 14) Recommended OAuth scopes
Use the smallest set possible.

### Likely minimum practical scopes
- `gmail.metadata` for scanning metadata
- `gmail.modify` for labeling, archiving, moving to trash
- `gmail.settings.basic` for creating filters

### Notes
- `gmail.modify` allows read/modify operations but not immediate permanent deletion bypassing Trash.
- `gmail.settings.basic` is needed for changing filters/settings.

## 15) Suggested label strategy
### Default labels
- `Cleanup`
- `Cleanup/Newsletters`
- `Cleanup/Promotions`
- `Cleanup/Social`
- `Cleanup/Review`

### Dynamic labels
- `Cleanup/amazon.com`
- `Cleanup/linkedin.com`
- `Cleanup/github.com`

### Rule of thumb
Create domain-based labels by default. Email-address-based labels only for heavy senders that share domains with important operational mail.

## 16) Destructive action strategy
### Safe archive first
Default recommended flow:
1. label
2. archive
3. after review, optionally trash old mail

### Trash strategy
- trash only messages older than X days
- never trash starred mail
- never trash messages from user allowlist
- optionally exclude emails with attachments in v1.1

## 17) Smart heuristics
### Allowlist categories
Never auto-trash by default for:
- banking
- billing
- purchase receipts
- travel itineraries
- identity/security alerts
- OTP/login messages
- HR/payroll

### Detection signals
- from domain reputation list later phase
- transactional keywords in subject/body snippet
- Gmail category labels

## 18) UI details
### Sender group table columns
- sender/domain
- message count
- latest received
- category guess
- subscription score
- proposed label
- actions

### Actions per row
- Preview
- Label
- Archive old
- Trash old
- Create filter
- Add to allowlist

### Bulk actions toolbar
- Select all
- Apply label
- Archive selected
- Trash selected
- Create filters

## 19) Performance strategy
### MVP limits
- scan first 2,000 matching messages by default
- allow advanced scan up to 10,000
- cache sender grouping locally
- incremental rescan later

### Scaling tactics
- fetch metadata only where possible
- use batching where available
- checkpoint progress in local storage
- avoid refetching unchanged groups unless user rescans

## 20) Privacy and trust
### Principles
- no email content leaves the browser in v1
- default to metadata processing only
- no backend required for MVP
- clear action preview before modification
- explain scopes in plain language

### Product trust copy
- We scan sender metadata to help organize clutter.
- We do not upload your mailbox to our servers in MVP mode.
- You approve every cleanup action.

## 21) Edge cases
- senders with multiple aliases
- important and promotional mail from same domain
- newsletters from subdomains
- thread-level label inconsistencies
- Gmail rate limits / partial batch failures
- users with huge inboxes
- user revokes token mid-scan

## 22) Risks
### Product risk
Users may fear granting Gmail permissions.

**Mitigation:**
- clear scope explanation
- local-only first architecture
- no backend in MVP

### Technical risk
Large inbox scanning can be slow.

**Mitigation:**
- limited first scan
- progress indicator
- resumable scan

### Safety risk
Useful emails may get grouped with junk.

**Mitigation:**
- review screen
- allowlist
- default archive-first approach

## 23) Build plan — 2 day MVP
### Day 1
- create MV3 extension shell
- implement Google OAuth
- call Gmail API successfully
- fetch message metadata
- parse sender/domain
- render sender groups

### Day 2
- create labels
- apply label actions
- archive old messages
- trash old messages with confirmation
- create basic filters
- ship usable UI + settings page

## 24) Stretch goals
- one-click unsubscribe suggestions
- AI category suggestions
- storage recovered estimate
- duplicate sender clustering
- scheduled scans
- dashboard for trends over time
- export cleanup report
- Gmail sidebar integration

## 25) Monetization path
### Free
- scan inbox
- basic sender grouping
- create labels
- manual cleanup

### Pro
- advanced heuristics
- one-click rule templates
- larger scans
- cleanup history
- smart allowlists
- recurring cleanup runs
- multi-account support

## 26) Recommended stack
### Fastest
- TypeScript
- React
- Vite
- Chrome Extension Manifest V3
- Chrome Identity API or OAuth flow
- Gmail REST API
- chrome.storage.local

### Alternative
- Google Workspace add-on if you want deeper Gmail-embedded UI later, but extension is faster for MVP.

## 27) Concrete Gmail operations to implement
- list labels
- create label if not exists
- list messages with query / label filters
- get message metadata headers
- batch modify message labels
- remove `INBOX` label for archive behavior
- move messages to Trash when chosen
- create filter by `from:` match

## 28) Example cleanup workflow
### Example
User scans inbox and sees:
- linkedin.com — 1,420 messages
- no-reply.medium.com — 610 messages
- store-news.example.com — 340 messages

User chooses:
- create `Cleanup/linkedin.com`
- label all existing messages from that sender domain
- trash all older than 180 days
- create future filter to auto-label

Result:
- old clutter reduced
- future mail auto-organized
- no server needed

## 29) Antigravity / Visual Studio ready module breakdown
### Modules
1. Auth Module
2. Gmail Client Module
3. Message Scan Module
4. Sender Grouping Engine
5. Label Manager
6. Cleanup Action Engine
7. Filter Rule Engine
8. Options UI
9. Activity Log Module
10. Settings + Allowlist Module

## 30) Suggested folder structure
- `/src/background`
- `/src/popup`
- `/src/options`
- `/src/lib/gmail`
- `/src/lib/auth`
- `/src/lib/grouping`
- `/src/lib/rules`
- `/src/lib/storage`
- `/src/types`

## 31) MVP success criteria
- user connects Gmail in under 2 minutes
- scan completes for first 2,000 messages reliably
- top noisy senders are correctly grouped
- labels are created and applied correctly
- trash/archive actions affect only previewed messages
- filters created successfully for selected senders

## 32) Best recommendation
Build **version 1 as a Chrome extension using Gmail labels + filters + sender grouping**.

Do **not** build literal folders-per-email-ID.
Build **domain/sender cleanup groups** with a safe review flow.
That gives the cleanest, fastest, and most useful outcome for your actual goal: removing waste subscriptions without damaging important email.

## 33) Next execution artifact
Convert this into:
1. manifest.json
2. OAuth setup guide
3. screen wireframes
4. exact Gmail API request map
5. Antigravity-ready implementation tasks

