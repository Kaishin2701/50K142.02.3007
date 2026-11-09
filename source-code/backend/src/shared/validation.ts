import { z } from 'zod';
export const id = z.uuid();
export const money = z.number().int().min(0).max(99_999_999_999_999);
export const quantity = z.number().min(0).max(99_999_999_999.999).multipleOf(0.001);
export const date = z.iso.date();
export const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const text = (length: number) => z.string().trim().min(1).max(length);
export const role = z.enum(['Quản lý', 'Nhân viên']);
export const pageQuery = z.object({ page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20) });
export function distinct<T>(items: T[], key: (item: T) => string) {
  return new Set(items.map(key)).size === items.length;
}
