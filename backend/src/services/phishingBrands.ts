export type Category =
  | 'banking' | 'social' | 'streaming' | 'shopping' | 'email'
  | 'delivery' | 'security' | 'crypto' | 'telecom' | 'gaming' | 'saas';

export interface BrandEntry {
  brand: string;
  category: Category;
}

export const VARIANTS = ['login', 'verify', 'otp', 'card', 'pin'] as const;
export type Variant = (typeof VARIANTS)[number];

export const BRAND_CATALOG: BrandEntry[] = [
  // banking (30)
  { brand: 'Santander', category: 'banking' },
  { brand: 'BBVA', category: 'banking' },
  { brand: 'CaixaBank', category: 'banking' },
  { brand: 'Banco Sabadell', category: 'banking' },
  { brand: 'ING', category: 'banking' },
  { brand: 'Deutsche Bank', category: 'banking' },
  { brand: 'Commerzbank', category: 'banking' },
  { brand: 'BNP Paribas', category: 'banking' },
  { brand: 'Societe Generale', category: 'banking' },
  { brand: 'Credit Agricole', category: 'banking' },
  { brand: 'HSBC', category: 'banking' },
  { brand: 'Barclays', category: 'banking' },
  { brand: 'Lloyds Bank', category: 'banking' },
  { brand: 'NatWest', category: 'banking' },
  { brand: 'UniCredit', category: 'banking' },
  { brand: 'Intesa Sanpaolo', category: 'banking' },
  { brand: 'Itau', category: 'banking' },
  { brand: 'Bradesco', category: 'banking' },
  { brand: 'Nubank', category: 'banking' },
  { brand: 'Banco do Brasil', category: 'banking' },
  { brand: 'Bank of America', category: 'banking' },
  { brand: 'Chase', category: 'banking' },
  { brand: 'Wells Fargo', category: 'banking' },
  { brand: 'Citibank', category: 'banking' },
  { brand: 'Capital One', category: 'banking' },
  { brand: 'TD Bank', category: 'banking' },
  { brand: 'RBC', category: 'banking' },
  { brand: 'UBS', category: 'banking' },
  { brand: 'Santander UK', category: 'banking' },
  { brand: 'Monzo', category: 'banking' },

  // crypto (20)
  { brand: 'Binance', category: 'crypto' },
  { brand: 'Coinbase', category: 'crypto' },
  { brand: 'Kraken', category: 'crypto' },
  { brand: 'KuCoin', category: 'crypto' },
  { brand: 'Bybit', category: 'crypto' },
  { brand: 'OKX', category: 'crypto' },
  { brand: 'Gate.io', category: 'crypto' },
  { brand: 'Bitfinex', category: 'crypto' },
  { brand: 'Gemini', category: 'crypto' },
  { brand: 'Crypto.com', category: 'crypto' },
  { brand: 'Trust Wallet', category: 'crypto' },
  { brand: 'MetaMask', category: 'crypto' },
  { brand: 'Exodus', category: 'crypto' },
  { brand: 'Trezor', category: 'crypto' },
  { brand: 'Ledger Live', category: 'crypto' },
  { brand: 'Bitget', category: 'crypto' },
  { brand: 'MEXC', category: 'crypto' },
  { brand: 'HTX', category: 'crypto' },
  { brand: 'Bitstamp', category: 'crypto' },
  { brand: 'Blockchain.com', category: 'crypto' },

  // social (8)
  { brand: 'Facebook', category: 'social' },
  { brand: 'Instagram', category: 'social' },
  { brand: 'WhatsApp', category: 'social' },
  { brand: 'Telegram', category: 'social' },
  { brand: 'TikTok', category: 'social' },
  { brand: 'Snapchat', category: 'social' },
  { brand: 'X', category: 'social' },
  { brand: 'LinkedIn', category: 'social' },

  // streaming (6)
  { brand: 'Netflix', category: 'streaming' },
  { brand: 'Disney Plus', category: 'streaming' },
  { brand: 'HBO Max', category: 'streaming' },
  { brand: 'Prime Video', category: 'streaming' },
  { brand: 'Spotify', category: 'streaming' },
  { brand: 'YouTube', category: 'streaming' },

  // shopping (6)
  { brand: 'Amazon', category: 'shopping' },
  { brand: 'eBay', category: 'shopping' },
  { brand: 'AliExpress', category: 'shopping' },
  { brand: 'Etsy', category: 'shopping' },
  { brand: 'Shopee', category: 'shopping' },
  { brand: 'MercadoLibre', category: 'shopping' },

  // email (5)
  { brand: 'Gmail', category: 'email' },
  { brand: 'Outlook', category: 'email' },
  { brand: 'Yahoo Mail', category: 'email' },
  { brand: 'ProtonMail', category: 'email' },
  { brand: 'iCloud Mail', category: 'email' },

  // delivery (3)
  { brand: 'DHL', category: 'delivery' },
  { brand: 'FedEx', category: 'delivery' },
  { brand: 'UPS', category: 'delivery' },

  // security (2)
  { brand: 'Norton', category: 'security' },
  { brand: 'McAfee', category: 'security' },

  // telecom (2)
  { brand: 'Verizon', category: 'telecom' },
  { brand: 'Vodafone', category: 'telecom' },

  // gaming (3)
  { brand: 'Steam', category: 'gaming' },
  { brand: 'Epic Games', category: 'gaming' },
  { brand: 'Xbox', category: 'gaming' },

  // saas (1)
  { brand: 'GitHub', category: 'saas' },
];
