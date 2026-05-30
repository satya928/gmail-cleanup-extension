import { SenderGroup } from '../../types';

/* ── Category definitions ──────────────────────────────────────────────────── */
export interface Category {
  id: string;
  label: string;
  icon: string;
  color: string;
  bg: string;
}

export const CATEGORIES: Record<string, Category> = {
  social:        { id: 'social',        label: 'Social Media',      icon: '📱', color: '#3b82f6', bg: '#eff6ff' },
  jobs:          { id: 'jobs',          label: 'Jobs & Recruiting',  icon: '💼', color: '#8b5cf6', bg: '#f5f3ff' },
  shopping:      { id: 'shopping',      label: 'Shopping',           icon: '🛒', color: '#f59e0b', bg: '#fffbeb' },
  finance:       { id: 'finance',       label: 'Finance & Banking',  icon: '💰', color: '#10b981', bg: '#ecfdf5' },
  travel:        { id: 'travel',        label: 'Travel',             icon: '✈️', color: '#0ea5e9', bg: '#f0f9ff' },
  entertainment: { id: 'entertainment', label: 'Entertainment',      icon: '🎬', color: '#ec4899', bg: '#fdf2f8' },
  tech:          { id: 'tech',          label: 'Tech & Dev',         icon: '💻', color: '#14b8a6', bg: '#f0fdfa' },
  education:     { id: 'education',     label: 'Education',          icon: '📚', color: '#f97316', bg: '#fff7ed' },
  health:        { id: 'health',        label: 'Health & Wellness',  icon: '🏥', color: '#22c55e', bg: '#f0fdf4' },
  news:          { id: 'news',          label: 'News & Media',       icon: '📰', color: '#6366f1', bg: '#eef2ff' },
  newsletters:   { id: 'newsletters',   label: 'Newsletters',        icon: '📧', color: '#a78bfa', bg: '#f5f3ff' },
  notifications: { id: 'notifications', label: 'Notifications',      icon: '🔔', color: '#64748b', bg: '#f8fafc' },
  other:         { id: 'other',         label: 'Other',              icon: '📦', color: '#6b7280', bg: '#f9fafb' },
};

/* ── Domain → category mapping ─────────────────────────────────────────────── */
const DOMAIN_MAP: Record<string, string> = {
  // ── Social Media ──
  'facebook.com': 'social', 'facebookmail.com': 'social', 'fb.com': 'social',
  'instagram.com': 'social', 'twitter.com': 'social', 'x.com': 'social',
  'youtube.com': 'social', 'youtubemail.com': 'social',
  'tiktok.com': 'social', 'snapchat.com': 'social', 'pinterest.com': 'social',
  'reddit.com': 'social', 'whatsapp.com': 'social', 'discord.com': 'social',
  'tumblr.com': 'social', 'quora.com': 'social', 'medium.com': 'social',

  // ── Jobs & Recruiting ──
  'linkedin.com': 'jobs', 'linkedin-ei.com': 'jobs',
  'indeed.com': 'jobs', 'glassdoor.com': 'jobs',
  'naukri.com': 'jobs', 'naukrimailer.com': 'jobs',
  'monster.com': 'jobs', 'shine.com': 'jobs',
  'ziprecruiter.com': 'jobs', 'greenhouse.io': 'jobs',
  'lever.co': 'jobs', 'workday.com': 'jobs', 'myworkday.com': 'jobs',
  'smartrecruiters.com': 'jobs', 'icims.com': 'jobs',
  'hirist.com': 'jobs', 'iimjobs.com': 'jobs',
  'angel.co': 'jobs', 'wellfound.com': 'jobs',
  'instahyre.com': 'jobs', 'cutshort.io': 'jobs',

  // ── Shopping ──
  'amazon.com': 'shopping', 'amazon.in': 'shopping', 'ses.amazon.com': 'shopping',
  'flipkart.com': 'shopping', 'myntra.com': 'shopping',
  'ebay.com': 'shopping', 'etsy.com': 'shopping',
  'aliexpress.com': 'shopping', 'alibaba.com': 'shopping',
  'meesho.com': 'shopping', 'ajio.com': 'shopping',
  'nykaa.com': 'shopping', 'nykaafashion.com': 'shopping',
  'shopify.com': 'shopping', 'bigbasket.com': 'shopping',
  'grofers.com': 'shopping', 'blinkit.com': 'shopping',
  'zepto.com': 'shopping', 'jiomart.com': 'shopping',
  'tatacliq.com': 'shopping', 'croma.com': 'shopping',
  'snapdeal.com': 'shopping', 'zara.com': 'shopping',

  // ── Food delivery ──
  'swiggy.com': 'shopping', 'zomato.com': 'shopping',
  'doordash.com': 'shopping', 'ubereats.com': 'shopping',

  // ── Finance & Banking ──
  'paypal.com': 'finance', 'stripe.com': 'finance',
  'razorpay.com': 'finance', 'paytm.com': 'finance',
  'phonepe.com': 'finance', 'gpay.com': 'finance',
  'hdfcbank.com': 'finance', 'icicibank.com': 'finance',
  'sbi.co.in': 'finance', 'axisbank.com': 'finance',
  'kotakbank.com': 'finance', 'yesbank.in': 'finance',
  'citibank.com': 'finance', 'americanexpress.com': 'finance',
  'visa.com': 'finance', 'mastercard.com': 'finance',
  'squareup.com': 'finance', 'wise.com': 'finance',
  'coinbase.com': 'finance', 'binance.com': 'finance',
  'groww.in': 'finance', 'zerodha.com': 'finance',
  'upstox.com': 'finance', 'icicidirect.com': 'finance',

  // ── Travel ──
  'makemytrip.com': 'travel', 'goibibo.com': 'travel',
  'booking.com': 'travel', 'airbnb.com': 'travel',
  'expedia.com': 'travel', 'tripadvisor.com': 'travel',
  'cleartrip.com': 'travel', 'ixigo.com': 'travel',
  'easemytrip.com': 'travel', 'yatra.com': 'travel',
  'indigo.in': 'travel', 'airindia.in': 'travel',
  'spicejet.com': 'travel', 'vistara.com': 'travel',
  'airasia.com': 'travel', 'emirates.com': 'travel',
  'hotels.com': 'travel', 'agoda.com': 'travel',
  'oyo.com': 'travel', 'treebo.com': 'travel',
  'uber.com': 'travel', 'ola.com': 'travel',
  'rapido.bike': 'travel',

  // ── Entertainment ──
  'netflix.com': 'entertainment', 'spotify.com': 'entertainment',
  'primevideo.com': 'entertainment', 'hotstar.com': 'entertainment',
  'disneyplushotstar.com': 'entertainment', 'disney.com': 'entertainment',
  'hulu.com': 'entertainment', 'hbomax.com': 'entertainment',
  'appletv.apple.com': 'entertainment',
  'sonyliv.com': 'entertainment', 'zee5.com': 'entertainment',
  'mxplayer.in': 'entertainment', 'altbalaji.com': 'entertainment',
  'gaana.com': 'entertainment', 'jiosaavn.com': 'entertainment',
  'wynk.in': 'entertainment', 'hungama.com': 'entertainment',
  'steampowered.com': 'entertainment', 'epicgames.com': 'entertainment',
  'ea.com': 'entertainment', 'xbox.com': 'entertainment',
  'playstation.com': 'entertainment', 'nintendo.com': 'entertainment',

  // ── Tech & Dev ──
  'github.com': 'tech', 'gitlab.com': 'tech',
  'stackoverflow.com': 'tech', 'stackexchange.com': 'tech',
  'aws.amazon.com': 'tech', 'cloud.google.com': 'tech',
  'azure.com': 'tech', 'microsoft.com': 'tech',
  'npm.com': 'tech', 'npmjs.com': 'tech',
  'docker.com': 'tech', 'digitalocean.com': 'tech',
  'heroku.com': 'tech', 'netlify.com': 'tech',
  'vercel.com': 'tech', 'cloudflare.com': 'tech',
  'atlassian.com': 'tech', 'jira.com': 'tech',
  'slack.com': 'tech', 'notion.so': 'tech',
  'figma.com': 'tech', 'postman.com': 'tech',
  'twilio.com': 'tech', 'sendgrid.com': 'tech',
  'sentry.io': 'tech', 'datadog.com': 'tech',
  'newrelic.com': 'tech', 'hashicorp.com': 'tech',

  // ── Education ──
  'coursera.org': 'education', 'udemy.com': 'education',
  'edx.org': 'education', 'khanacademy.org': 'education',
  'skillshare.com': 'education', 'pluralsight.com': 'education',
  'linkedin.com/learning': 'education',
  'duolingo.com': 'education', 'byju.com': 'education',
  'byjus.com': 'education', 'unacademy.com': 'education',
  'vedantu.com': 'education', 'toppr.com': 'education',
  'brillant.org': 'education', 'codecademy.com': 'education',
  'freecodecamp.org': 'education', 'udacity.com': 'education',

  // ── Health ──
  'apollo247.com': 'health', 'practo.com': 'health',
  '1mg.com': 'health', 'healthkart.com': 'health',
  'netmeds.com': 'health', 'pharmeasy.in': 'health',
  'fitbit.com': 'health', 'strava.com': 'health',

  // ── News & Media ──
  'thehindu.com': 'news', 'timesofindia.com': 'news',
  'ndtv.com': 'news', 'hindustantimes.com': 'news',
  'economictimes.com': 'news', 'livemint.com': 'news',
  'businessstandard.com': 'news', 'techcrunch.com': 'news',
  'theverge.com': 'news', 'wired.com': 'news',
  'reuters.com': 'news', 'bbc.com': 'news',
  'cnn.com': 'news', 'nytimes.com': 'news',
  'washingtonpost.com': 'news', 'guardian.com': 'news',
  'scroll.in': 'news', 'thewire.in': 'news',
  'morningbrew.com': 'newsletters', 'substack.com': 'newsletters',
  'beehiiv.com': 'newsletters', 'mailchimp.com': 'newsletters',
  'constantcontact.com': 'newsletters', 'sendinblue.com': 'newsletters',
  'campaignmonitor.com': 'newsletters',
};

/* ── Keyword rules (checked against domain parts + sender name) ────────────── */
const KEYWORD_RULES: { keywords: string[]; category: string }[] = [
  { keywords: ['recruit', 'talent', 'hiring', 'career', 'hr@', 'jobs@', 'staffing', 'placement', 'headhunt'], category: 'jobs' },
  { keywords: ['naukri', 'jobalert', 'job-alert', 'jobnotif'], category: 'jobs' },
  { keywords: ['invoice', 'payment', 'transaction', 'statement', 'bank', 'credit', 'debit', 'loan', 'emi', 'wallet', 'upi', 'transfer'], category: 'finance' },
  { keywords: ['order', 'shipment', 'delivery', 'dispatch', 'tracking', 'cart', 'purchase', 'refund', 'return', 'exchange'], category: 'shopping' },
  { keywords: ['flight', 'hotel', 'booking', 'reservation', 'itinerary', 'checkin', 'check-in', 'trip', 'travel', 'ticket'], category: 'travel' },
  { keywords: ['newsletter', 'digest', 'weekly', 'daily', 'monthly', 'roundup', 'bulletin', 'update@', 'news@', 'hello@', 'hi@'], category: 'newsletters' },
  { keywords: ['github', 'gitlab', 'bitbucket', 'devops', 'deploy', 'pipeline', 'ci/cd', 'docker', 'kubernetes', 'cloud'], category: 'tech' },
  { keywords: ['course', 'class', 'lesson', 'learn', 'certificate', 'diploma', 'degree', 'study', 'exam', 'quiz', 'student'], category: 'education' },
  { keywords: ['health', 'medicine', 'medical', 'doctor', 'pharmacy', 'fitness', 'workout', 'gym', 'diet', 'nutrition'], category: 'health' },
  { keywords: ['noreply', 'no-reply', 'donotreply', 'do-not-reply', 'notification', 'alert@', 'info@', 'mailer@', 'system@', 'auto@'], category: 'notifications' },
  { keywords: ['facebook', 'instagram', 'twitter', 'linkedin', 'youtube', 'social', 'follow', 'friend', 'connect', 'mention'], category: 'social' },
  { keywords: ['netflix', 'spotify', 'prime', 'hotstar', 'stream', 'watch', 'listen', 'music', 'game', 'play'], category: 'entertainment' },
  { keywords: ['news', 'breaking', 'headline', 'report', 'article', 'editorial', 'media', 'press'], category: 'news' },
];

/* ── Main categorization function ───────────────────────────────────────────── */
export function categorize(group: SenderGroup): string {
  const domain     = (group.senderDomain ?? '').toLowerCase();
  const email      = (group.senderEmail ?? '').toLowerCase();
  const name       = (group.senderDisplayName ?? '').toLowerCase();
  const combined   = `${domain} ${email} ${name}`;

  // 1. Exact domain match
  if (DOMAIN_MAP[domain]) return DOMAIN_MAP[domain];

  // 2. Partial domain match (e.g. subdomain like "mail.linkedin.com")
  for (const [d, cat] of Object.entries(DOMAIN_MAP)) {
    if (domain.endsWith(`.${d}`) || domain.includes(d)) return cat;
  }

  // 3. Keyword match against combined string
  for (const rule of KEYWORD_RULES) {
    if (rule.keywords.some(kw => combined.includes(kw))) return rule.category;
  }

  // 4. Gmail label hints from score
  if (group.promotionsCount > 0 && group.hasListUnsubscribeHeader) return 'newsletters';
  if (group.socialCount      > 0)                                   return 'social';
  if (group.promotionsCount  > 0)                                   return 'shopping';

  return 'other';
}

/** Attach category to every group in-place. */
export function categorizeGroups(groups: SenderGroup[]): SenderGroup[] {
  return groups.map(g => ({ ...g, category: categorize(g) }));
}
