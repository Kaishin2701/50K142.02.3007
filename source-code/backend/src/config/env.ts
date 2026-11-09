import 'dotenv/config';
import { z } from 'zod';
const schema = z.object({
 DATABASE_URL: z.string().startsWith('postgres'), PG_SSL: z.enum(['true','false']).default('true'),
 PORT: z.coerce.number().int().min(1).max(65535).default(3000), HOST: z.string().default('127.0.0.1'),
 FRONTEND_ORIGINS: z.string().default('http://127.0.0.1:5173,http://localhost:5173'),
 NODE_ENV: z.enum(['development','test','production']).default('development'),
 SESSION_HOURS: z.coerce.number().int().min(1).max(168).default(12),
 QR_GATEWAY_URL: z.string().optional(), QR_GATEWAY_TOKEN: z.string().optional(), QR_WEBHOOK_SECRET: z.string().optional(),
 PDF_FONT_PATH: z.string().optional(),
 TRUST_PROXY:z.coerce.number().int().min(0).max(3).default(0),
 QR_PROVIDER:z.enum(['disabled','http','sepay']).default('disabled'),
 SEPAY_BANK:z.string().optional(),SEPAY_ACCOUNT_NUMBER:z.string().optional(),SEPAY_WEBHOOK_API_KEY:z.string().optional(),
});
export function loadEnv() { return schema.parse(process.env); }
