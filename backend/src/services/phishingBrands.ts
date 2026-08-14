export type PhishingCategory =
  | 'banking' | 'social' | 'streaming' | 'shopping' | 'email'
  | 'delivery' | 'security' | 'crypto' | 'telecom' | 'gaming' | 'saas';

export interface PhishingBrand {
  brand: string;
  category: PhishingCategory;
}

export const PHISHING_VARIANTS = ['login', 'verify', 'otp', 'card', 'pin'] as const;
export type PhishingVariant = (typeof PHISHING_VARIANTS)[number];

export const PHISHING_CATEGORY_LABELS: Record<string, string> = {
  banking: 'Banking', social: 'Social', streaming: 'Streaming', shopping: 'Shopping',
  email: 'Email', delivery: 'Delivery', security: 'Security', crypto: 'Crypto',
  telecom: 'Telecom', gaming: 'Gaming', saas: 'SaaS',
};

export const PHISHING_BRANDS: PhishingBrand[] = [
  // banking (30)
  { brand: 'Banco de Credito', category: 'banking' },
  { brand: 'Banco do Brasil', category: 'banking' },
  { brand: 'Banco Sabadell', category: 'banking' },
  { brand: 'Bank of America', category: 'banking' },
  { brand: 'Bankinter', category: 'banking' },
  { brand: 'Barclays', category: 'banking' },
  { brand: 'BBVA', category: 'banking' },
  { brand: 'BNP Paribas', category: 'banking' },
  { brand: 'Bradesco', category: 'banking' },
  { brand: 'CaixaBank', category: 'banking' },
  { brand: 'Capital One', category: 'banking' },
  { brand: 'Chase', category: 'banking' },
  { brand: 'Citibank', category: 'banking' },
  { brand: 'Commerzbank', category: 'banking' },
  { brand: 'Credit Agricole', category: 'banking' },
  { brand: 'Deutsche Bank', category: 'banking' },
  { brand: 'HSBC', category: 'banking' },
  { brand: 'ING', category: 'banking' },
  { brand: 'Intesa Sanpaolo', category: 'banking' },
  { brand: 'Itau', category: 'banking' },
  { brand: 'Lloyds Bank', category: 'banking' },
  { brand: 'NatWest', category: 'banking' },
  { brand: 'Nubank', category: 'banking' },
  { brand: 'RBC', category: 'banking' },
  { brand: 'Santander', category: 'banking' },
  { brand: 'Societe Generale', category: 'banking' },
  { brand: 'TD Bank', category: 'banking' },
  { brand: 'UBS', category: 'banking' },
  { brand: 'UniCredit', category: 'banking' },
  { brand: 'Wells Fargo', category: 'banking' },
  // social (12)
  { brand: 'Discord', category: 'social' },
  { brand: 'Facebook', category: 'social' },
  { brand: 'Instagram', category: 'social' },
  { brand: 'LinkedIn', category: 'social' },
  { brand: 'Pinterest', category: 'social' },
  { brand: 'Reddit', category: 'social' },
  { brand: 'Signal', category: 'social' },
  { brand: 'Snapchat', category: 'social' },
  { brand: 'Telegram', category: 'social' },
  { brand: 'TikTok', category: 'social' },
  { brand: 'Twitter/X', category: 'social' },
  { brand: 'WhatsApp', category: 'social' },
  // streaming (6)
  { brand: 'Amazon Prime Video', category: 'streaming' },
  { brand: 'Disney+', category: 'streaming' },
  { brand: 'HBO Max', category: 'streaming' },
  { brand: 'Hulu', category: 'streaming' },
  { brand: 'Netflix', category: 'streaming' },
  { brand: 'Spotify', category: 'streaming' },
  // shopping (8)
  { brand: 'AliExpress', category: 'shopping' },
  { brand: 'Amazon', category: 'shopping' },
  { brand: 'eBay', category: 'shopping' },
  { brand: 'Etsy', category: 'shopping' },
  { brand: 'MercadoLibre', category: 'shopping' },
  { brand: 'Shopify', category: 'shopping' },
  { brand: 'Walmart', category: 'shopping' },
  { brand: 'Zalando', category: 'shopping' },
  // email (4)
  { brand: 'Gmail', category: 'email' },
  { brand: 'Outlook', category: 'email' },
  { brand: 'ProtonMail', category: 'email' },
  { brand: 'Yahoo Mail', category: 'email' },
  // delivery (4)
  { brand: 'DHL', category: 'delivery' },
  { brand: 'FedEx', category: 'delivery' },
  { brand: 'UPS', category: 'delivery' },
  { brand: 'USPS', category: 'delivery' },
  // security (4)
  { brand: 'Avast', category: 'security' },
  { brand: 'Bitdefender', category: 'security' },
  { brand: 'McAfee', category: 'security' },
  { brand: 'Norton', category: 'security' },
  // crypto (5)
  { brand: 'Binance', category: 'crypto' },
  { brand: 'Coinbase', category: 'crypto' },
  { brand: 'Kraken', category: 'crypto' },
  { brand: 'MetaMask', category: 'crypto' },
  { brand: 'Trust Wallet', category: 'crypto' },
  // telecom (5)
  { brand: 'AT&T', category: 'telecom' },
  { brand: 'O2', category: 'telecom' },
  { brand: 'T-Mobile', category: 'telecom' },
  { brand: 'Verizon', category: 'telecom' },
  { brand: 'Vodafone', category: 'telecom' },
  // gaming (4)
  { brand: 'Epic Games', category: 'gaming' },
  { brand: 'PlayStation Network', category: 'gaming' },
  { brand: 'Roblox', category: 'gaming' },
  { brand: 'Steam', category: 'gaming' },
  // saas (4)
  { brand: 'Dropbox', category: 'saas' },
  { brand: 'Google Workspace', category: 'saas' },
  { brand: 'Microsoft 365', category: 'saas' },
  { brand: 'Slack', category: 'saas' },
];

export const TOTAL_PHISHING_VARIANTS = PHISHING_BRANDS.length * PHISHING_VARIANTS.length; // 86 × 5 = 430
