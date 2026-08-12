// backend/src/services/phishingBrands.ts
// Brand database for the phishing page engine.
// 110 brands x 3-4 variants = 430 static page slugs (>= 400 target).

export type PhishingCategory =
  | 'banking'
  | 'social'
  | 'streaming'
  | 'shopping'
  | 'email'
  | 'delivery'
  | 'security'
  | 'crypto'
  | 'telecom'
  | 'gaming'
  | 'saas';

export type PhishingVariant = 'login' | 'otp' | 'verify' | 'update' | 'track' | 'seed';

export interface PhishingBrand {
  slug: string;
  name: string;
  category: PhishingCategory;
  color: string;   // primary brand color
  accent: string;  // secondary color (gradient/links)
  initials: string; // logo fallback (1-2 chars)
  domain: string;  // legit domain, used for footer + post-submit redirect
}

export const PHISHING_CATEGORIES: PhishingCategory[] = [
  'banking', 'social', 'streaming', 'shopping', 'email',
  'delivery', 'security', 'crypto', 'telecom', 'gaming', 'saas',
];

export const PHISHING_CATEGORY_LABELS: Record<PhishingCategory, string> = {
  banking: 'Banking',
  social: 'Social Media',
  streaming: 'Streaming',
  shopping: 'Shopping',
  email: 'Email',
  delivery: 'Delivery',
  security: 'Security & VPN',
  crypto: 'Crypto & Web3',
  telecom: 'Telecom',
  gaming: 'Gaming',
  saas: 'SaaS & Productivity',
};

// Variant sets per category. Sum = 430 pages:
// banking 100 + social 60 + streaming 30 + shopping 40 + email 32
// + delivery 24 + security 24 + crypto 32 + telecom 32 + gaming 32 + saas 24
export const PHISHING_CATEGORY_VARIANTS: Record<PhishingCategory, PhishingVariant[]> = {
  banking:   ['login', 'otp', 'verify', 'update'],
  social:    ['login', 'otp', 'verify', 'update'],
  streaming: ['login', 'verify', 'update'],
  shopping:  ['login', 'otp', 'verify', 'update'],
  email:     ['login', 'otp', 'verify', 'update'],
  delivery:  ['login', 'track', 'verify', 'update'],
  security:  ['login', 'otp', 'verify', 'update'],
  crypto:    ['login', 'seed', 'verify', 'update'],
  telecom:   ['login', 'otp', 'verify', 'update'],
  gaming:    ['login', 'otp', 'verify', 'update'],
  saas:      ['login', 'otp', 'verify', 'update'],
};

export const PHISHING_BRANDS: PhishingBrand[] = [
  // --- Banking (25) ---
  { slug: 'chase', name: 'Chase', category: 'banking', color: '#117ACA', accent: '#003D6B', initials: 'CH', domain: 'chase.com' },
  { slug: 'bank-of-america', name: 'Bank of America', category: 'banking', color: '#012169', accent: '#D42027', initials: 'BA', domain: 'bankofamerica.com' },
  { slug: 'wells-fargo', name: 'Wells Fargo', category: 'banking', color: '#D71E28', accent: '#B5121B', initials: 'WF', domain: 'wellsfargo.com' },
  { slug: 'citibank', name: 'Citi', category: 'banking', color: '#0566AE', accent: '#0B4670', initials: 'CI', domain: 'citi.com' },
  { slug: 'capital-one', name: 'Capital One', category: 'banking', color: '#004977', accent: '#A41E22', initials: 'CO', domain: 'capitalone.com' },
  { slug: 'us-bank', name: 'U.S. Bank', category: 'banking', color: '#003A70', accent: '#FCB714', initials: 'US', domain: 'usbank.com' },
  { slug: 'td-bank', name: 'TD Bank', category: 'banking', color: '#00953B', accent: '#003C1F', initials: 'TD', domain: 'td.com' },
  { slug: 'pnc', name: 'PNC Bank', category: 'banking', color: '#003B7C', accent: '#E00000', initials: 'PNC', domain: 'pnc.com' },
  { slug: 'hsbc', name: 'HSBC', category: 'banking', color: '#DB0011', accent: '#8B0000', initials: 'HSBC', domain: 'hsbc.com' },
  { slug: 'barclays', name: 'Barclays', category: 'banking', color: '#00AEEF', accent: '#00395D', initials: 'BA', domain: 'barclays.co.uk' },
  { slug: 'natwest', name: 'NatWest', category: 'banking', color: '#572C5F', accent: '#3B1D41', initials: 'NW', domain: 'natwest.com' },
  { slug: 'lloyds', name: 'Lloyds Bank', category: 'banking', color: '#00846B', accent: '#00322A', initials: 'LB', domain: 'lloydsbank.co.uk' },
  { slug: 'santander', name: 'Santander', category: 'banking', color: '#EC0000', accent: '#9B0000', initials: 'SA', domain: 'santander.com' },
  { slug: 'deutsche-bank', name: 'Deutsche Bank', category: 'banking', color: '#004B93', accent: '#001C3D', initials: 'DB', domain: 'db.com' },
  { slug: 'bnp-paribas', name: 'BNP Paribas', category: 'banking', color: '#00915F', accent: '#00503A', initials: 'BNP', domain: 'bnpparibas.com' },
  { slug: 'ubs', name: 'UBS', category: 'banking', color: '#D6001C', accent: '#8F0000', initials: 'UBS', domain: 'ubs.com' },
  { slug: 'rbc', name: 'RBC Royal Bank', category: 'banking', color: '#0063B1', accent: '#004E8C', initials: 'RBC', domain: 'rbcroyalbank.com' },
  { slug: 'scotiabank', name: 'Scotiabank', category: 'banking', color: '#E31837', accent: '#A60019', initials: 'SB', domain: 'scotiabank.com' },
  { slug: 'commonwealth-bank', name: 'Commonwealth Bank', category: 'banking', color: '#F6B600', accent: '#000000', initials: 'CBA', domain: 'commbank.com.au' },
  { slug: 'anz', name: 'ANZ', category: 'banking', color: '#161B1F', accent: '#00A9E0', initials: 'ANZ', domain: 'anz.com' },
  { slug: 'hdfc-bank', name: 'HDFC Bank', category: 'banking', color: '#004C8F', accent: '#002B52', initials: 'HDFC', domain: 'hdfcbank.com' },
  { slug: 'icici-bank', name: 'ICICI Bank', category: 'banking', color: '#F58220', accent: '#D96B08', initials: 'ICICI', domain: 'icicibank.com' },
  { slug: 'bbva', name: 'BBVA', category: 'banking', color: '#1464A5', accent: '#0C3F6B', initials: 'BBVA', domain: 'bbva.com' },
  { slug: 'dbs', name: 'DBS Bank', category: 'banking', color: '#004B9B', accent: '#002F60', initials: 'DBS', domain: 'dbs.com' },
  { slug: 'standard-chartered', name: 'Standard Chartered', category: 'banking', color: '#047A7C', accent: '#025354', initials: 'SC', domain: 'sc.com' },

  // --- Social Media (15) ---
  { slug: 'facebook', name: 'Facebook', category: 'social', color: '#1877F2', accent: '#166FE5', initials: 'f', domain: 'facebook.com' },
  { slug: 'instagram', name: 'Instagram', category: 'social', color: '#E1306C', accent: '#833AB4', initials: 'IG', domain: 'instagram.com' },
  { slug: 'whatsapp', name: 'WhatsApp', category: 'social', color: '#25D366', accent: '#128C7E', initials: 'WA', domain: 'whatsapp.com' },
  { slug: 'x', name: 'X', category: 'social', color: '#000000', accent: '#1D9BF0', initials: 'X', domain: 'x.com' },
  { slug: 'snapchat', name: 'Snapchat', category: 'social', color: '#FFFC00', accent: '#111111', initials: 'SC', domain: 'snapchat.com' },
  { slug: 'telegram', name: 'Telegram', category: 'social', color: '#229ED9', accent: '#2AABEE', initials: 'TG', domain: 'telegram.org' },
  { slug: 'discord', name: 'Discord', category: 'social', color: '#5865F2', accent: '#404EED', initials: 'DC', domain: 'discord.com' },
  { slug: 'tiktok', name: 'TikTok', category: 'social', color: '#000000', accent: '#25F4EE', initials: 'TT', domain: 'tiktok.com' },
  { slug: 'linkedin', name: 'LinkedIn', category: 'social', color: '#0A66C2', accent: '#004182', initials: 'in', domain: 'linkedin.com' },
  { slug: 'reddit', name: 'Reddit', category: 'social', color: '#FF4500', accent: '#FF8717', initials: 'RD', domain: 'reddit.com' },
  { slug: 'pinterest', name: 'Pinterest', category: 'social', color: '#E60023', accent: '#B0001A', initials: 'P', domain: 'pinterest.com' },
  { slug: 'threads', name: 'Threads', category: 'social', color: '#000000', accent: '#4E5053', initials: 'TH', domain: 'threads.net' },
  { slug: 'wechat', name: 'WeChat', category: 'social', color: '#07C160', accent: '#059B4E', initials: 'WC', domain: 'wechat.com' },
  { slug: 'viber', name: 'Viber', category: 'social', color: '#7360F2', accent: '#5D4AE0', initials: 'VB', domain: 'viber.com' },
  { slug: 'signal', name: 'Signal', category: 'social', color: '#3A76F0', accent: '#1B2A41', initials: 'SG', domain: 'signal.org' },

  // --- Streaming (10) ---
  { slug: 'netflix', name: 'Netflix', category: 'streaming', color: '#E50914', accent: '#B20710', initials: 'N', domain: 'netflix.com' },
  { slug: 'hulu', name: 'Hulu', category: 'streaming', color: '#1CE783', accent: '#0E5E37', initials: 'HU', domain: 'hulu.com' },
  { slug: 'disney-plus', name: 'Disney+', category: 'streaming', color: '#113CCF', accent: '#1F80E0', initials: 'D+', domain: 'disneyplus.com' },
  { slug: 'hbo-max', name: 'Max', category: 'streaming', color: '#991EEB', accent: '#6B0FB0', initials: 'HB', domain: 'max.com' },
  { slug: 'paramount-plus', name: 'Paramount+', category: 'streaming', color: '#0064FF', accent: '#00A8E1', initials: 'P+', domain: 'paramountplus.com' },
  { slug: 'prime-video', name: 'Prime Video', category: 'streaming', color: '#00A8E1', accent: '#146EB4', initials: 'PV', domain: 'primevideo.com' },
  { slug: 'spotify', name: 'Spotify', category: 'streaming', color: '#1DB954', accent: '#191414', initials: 'SP', domain: 'spotify.com' },
  { slug: 'youtube', name: 'YouTube', category: 'streaming', color: '#FF0000', accent: '#282828', initials: 'YT', domain: 'youtube.com' },
  { slug: 'twitch', name: 'Twitch', category: 'streaming', color: '#9146FF', accent: '#6441A5', initials: 'TW', domain: 'twitch.tv' },
  { slug: 'crunchyroll', name: 'Crunchyroll', category: 'streaming', color: '#F47521', accent: '#23252B', initials: 'CR', domain: 'crunchyroll.com' },

  // --- Shopping (10) ---
  { slug: 'amazon', name: 'Amazon', category: 'shopping', color: '#FF9900', accent: '#131A22', initials: 'AM', domain: 'amazon.com' },
  { slug: 'walmart', name: 'Walmart', category: 'shopping', color: '#0071CE', accent: '#FFC220', initials: 'W', domain: 'walmart.com' },
  { slug: 'ebay', name: 'eBay', category: 'shopping', color: '#E53238', accent: '#0064D2', initials: 'EB', domain: 'ebay.com' },
  { slug: 'etsy', name: 'Etsy', category: 'shopping', color: '#F1641E', accent: '#B8470E', initials: 'ET', domain: 'etsy.com' },
  { slug: 'aliexpress', name: 'AliExpress', category: 'shopping', color: '#E62E04', accent: '#A82000', initials: 'AE', domain: 'aliexpress.com' },
  { slug: 'alibaba', name: 'Alibaba', category: 'shopping', color: '#FF6A00', accent: '#D95A00', initials: 'AB', domain: 'alibaba.com' },
  { slug: 'target', name: 'Target', category: 'shopping', color: '#CC0000', accent: '#990000', initials: 'T', domain: 'target.com' },
  { slug: 'best-buy', name: 'Best Buy', category: 'shopping', color: '#0046BE', accent: '#FFF100', initials: 'BB', domain: 'bestbuy.com' },
  { slug: 'shopify', name: 'Shopify', category: 'shopping', color: '#96BF48', accent: '#5E8E3E', initials: 'SH', domain: 'shopify.com' },
  { slug: 'shein', name: 'SHEIN', category: 'shopping', color: '#111111', accent: '#E60023', initials: 'SH', domain: 'shein.com' },

  // --- Email (8) ---
  { slug: 'gmail', name: 'Gmail', category: 'email', color: '#EA4335', accent: '#4285F4', initials: 'G', domain: 'gmail.com' },
  { slug: 'outlook', name: 'Outlook', category: 'email', color: '#0078D4', accent: '#0F6CBD', initials: 'O', domain: 'outlook.com' },
  { slug: 'yahoo', name: 'Yahoo', category: 'email', color: '#6001D2', accent: '#430297', initials: 'Y', domain: 'yahoo.com' },
  { slug: 'protonmail', name: 'Proton Mail', category: 'email', color: '#6D4AFF', accent: '#4B2BB8', initials: 'P', domain: 'proton.me' },
  { slug: 'icloud', name: 'iCloud', category: 'email', color: '#0071EB', accent: '#005BB5', initials: 'iC', domain: 'icloud.com' },
  { slug: 'aol', name: 'AOL', category: 'email', color: '#0047AB', accent: '#00337A', initials: 'A', domain: 'aol.com' },
  { slug: 'zoho', name: 'Zoho Mail', category: 'email', color: '#F0483E', accent: '#C9332B', initials: 'Z', domain: 'zoho.com' },
  { slug: 'fastmail', name: 'Fastmail', category: 'email', color: '#7742B5', accent: '#5B2F8F', initials: 'FM', domain: 'fastmail.com' },

  // --- Delivery (6) ---
  { slug: 'ups', name: 'UPS', category: 'delivery', color: '#351C15', accent: '#FFB500', initials: 'UPS', domain: 'ups.com' },
  { slug: 'fedex', name: 'FedEx', category: 'delivery', color: '#4D148C', accent: '#FF6600', initials: 'F', domain: 'fedex.com' },
  { slug: 'usps', name: 'USPS', category: 'delivery', color: '#333366', accent: '#DA291C', initials: 'US', domain: 'usps.com' },
  { slug: 'dhl', name: 'DHL', category: 'delivery', color: '#FFCC00', accent: '#D40511', initials: 'DHL', domain: 'dhl.com' },
  { slug: 'royal-mail', name: 'Royal Mail', category: 'delivery', color: '#E4002B', accent: '#5A5A5A', initials: 'RM', domain: 'royalmail.com' },
  { slug: 'canada-post', name: 'Canada Post', category: 'delivery', color: '#E11B22', accent: '#A11217', initials: 'CP', domain: 'canadapost.ca' },

  // --- Security & VPN (6) ---
  { slug: 'nordvpn', name: 'NordVPN', category: 'security', color: '#4687FF', accent: '#1D1E2C', initials: 'NV', domain: 'nordvpn.com' },
  { slug: 'expressvpn', name: 'ExpressVPN', category: 'security', color: '#DA3940', accent: '#262626', initials: 'EV', domain: 'expressvpn.com' },
  { slug: 'surfshark', name: 'Surfshark', category: 'security', color: '#00C08B', accent: '#101A2C', initials: 'SS', domain: 'surfshark.com' },
  { slug: 'bitdefender', name: 'Bitdefender', category: 'security', color: '#ED1C24', accent: '#1B1B1B', initials: 'BD', domain: 'bitdefender.com' },
  { slug: 'kaspersky', name: 'Kaspersky', category: 'security', color: '#00A651', accent: '#1D1D1B', initials: 'KS', domain: 'kaspersky.com' },
  { slug: 'lastpass', name: 'LastPass', category: 'security', color: '#D32D27', accent: '#24292F', initials: 'LP', domain: 'lastpass.com' },

  // --- Crypto & Web3 (8) ---
  { slug: 'binance', name: 'Binance', category: 'crypto', color: '#F0B90B', accent: '#1A1E28', initials: 'BN', domain: 'binance.com' },
  { slug: 'coinbase', name: 'Coinbase', category: 'crypto', color: '#0052FF', accent: '#1652F0', initials: 'CB', domain: 'coinbase.com' },
  { slug: 'kraken', name: 'Kraken', category: 'crypto', color: '#5842E4', accent: '#241C32', initials: 'KR', domain: 'kraken.com' },
  { slug: 'bybit', name: 'Bybit', category: 'crypto', color: '#F7A600', accent: '#1B1F27', initials: 'BY', domain: 'bybit.com' },
  { slug: 'okx', name: 'OKX', category: 'crypto', color: '#101116', accent: '#0C7FEB', initials: 'OK', domain: 'okx.com' },
  { slug: 'metamask', name: 'MetaMask', category: 'crypto', color: '#F6851B', accent: '#E2761B', initials: 'MM', domain: 'metamask.io' },
  { slug: 'trust-wallet', name: 'Trust Wallet', category: 'crypto', color: '#0500FF', accent: '#0B0B1A', initials: 'TW', domain: 'trustwallet.com' },
  { slug: 'ledger', name: 'Ledger', category: 'crypto', color: '#111111', accent: '#3B82F6', initials: 'LD', domain: 'ledger.com' },

  // --- Telecom (8) ---
  { slug: 'at-t', name: 'AT&T', category: 'telecom', color: '#009FDB', accent: '#004E73', initials: 'AT', domain: 'att.com' },
  { slug: 'verizon', name: 'Verizon', category: 'telecom', color: '#CD040B', accent: '#8E0307', initials: 'VZ', domain: 'verizon.com' },
  { slug: 't-mobile', name: 'T-Mobile', category: 'telecom', color: '#E20074', accent: '#000000', initials: 'TM', domain: 't-mobile.com' },
  { slug: 'vodafone', name: 'Vodafone', category: 'telecom', color: '#E60000', accent: '#000000', initials: 'VF', domain: 'vodafone.com' },
  { slug: 'orange', name: 'Orange', category: 'telecom', color: '#FF7900', accent: '#CC6100', initials: 'O', domain: 'orange.com' },
  { slug: 'o2', name: 'O2', category: 'telecom', color: '#0050AA', accent: '#003A7D', initials: 'O2', domain: 'o2.co.uk' },
  { slug: 'telenor', name: 'Telenor', category: 'telecom', color: '#00509E', accent: '#003666', initials: 'TN', domain: 'telenor.com' },
  { slug: 'airtel', name: 'Airtel', category: 'telecom', color: '#ED1C24', accent: '#B3121A', initials: 'AI', domain: 'airtel.in' },

  // --- Gaming (8) ---
  { slug: 'steam', name: 'Steam', category: 'gaming', color: '#1B2838', accent: '#66C0F4', initials: 'ST', domain: 'steampowered.com' },
  { slug: 'epic-games', name: 'Epic Games', category: 'gaming', color: '#000000', accent: '#FFFFFF', initials: 'EG', domain: 'epicgames.com' },
  { slug: 'roblox', name: 'Roblox', category: 'gaming', color: '#00A2FF', accent: '#111111', initials: 'RB', domain: 'roblox.com' },
  { slug: 'riot-games', name: 'Riot Games', category: 'gaming', color: '#E8403F', accent: '#0A0A0A', initials: 'RT', domain: 'riotgames.com' },
  { slug: 'xbox', name: 'Xbox', category: 'gaming', color: '#107C10', accent: '#0E5F0E', initials: 'XB', domain: 'xbox.com' },
  { slug: 'playstation', name: 'PlayStation', category: 'gaming', color: '#003791', accent: '#FFFFFF', initials: 'PS', domain: 'playstation.com' },
  { slug: 'nintendo', name: 'Nintendo', category: 'gaming', color: '#E60012', accent: '#7B8794', initials: 'NI', domain: 'nintendo.com' },
  { slug: 'ubisoft', name: 'Ubisoft', category: 'gaming', color: '#0078FF', accent: '#004EA0', initials: 'UB', domain: 'ubisoft.com' },

  // --- SaaS & Productivity (6) ---
  { slug: 'google-workspace', name: 'Google Workspace', category: 'saas', color: '#4285F4', accent: '#EA4335', initials: 'G', domain: 'workspace.google.com' },
  { slug: 'microsoft-365', name: 'Microsoft 365', category: 'saas', color: '#D83B01', accent: '#0078D4', initials: 'MS', domain: 'microsoft365.com' },
  { slug: 'slack', name: 'Slack', category: 'saas', color: '#4A154B', accent: '#36C5F0', initials: 'SL', domain: 'slack.com' },
  { slug: 'dropbox', name: 'Dropbox', category: 'saas', color: '#0061FF', accent: '#47525D', initials: 'DB', domain: 'dropbox.com' },
  { slug: 'adobe', name: 'Adobe', category: 'saas', color: '#FA0F00', accent: '#00005B', initials: 'AD', domain: 'adobe.com' },
  { slug: 'figma', name: 'Figma', category: 'saas', color: '#F24E1E', accent: '#A259FF', initials: 'FG', domain: 'figma.com' },
];

const PHISHING_BRAND_MAP: Map<string, PhishingBrand> = new Map(
  PHISHING_BRANDS.map((b) => [b.slug, b])
);

export function getPhishingBrand(slug: string): PhishingBrand | undefined {
  return PHISHING_BRAND_MAP.get(slug);
}

export function getBrandsByCategory(category: PhishingCategory): PhishingBrand[] {
  return PHISHING_BRANDS.filter((b) => b.category === category);
}

export function getVariantsForBrand(brand: PhishingBrand): PhishingVariant[] {
  return PHISHING_CATEGORY_VARIANTS[brand.category] ?? ['login'];
}

export function getTotalVariantCount(): number {
  return PHISHING_BRANDS.reduce((sum, b) => sum + getVariantsForBrand(b).length, 0);
}
