import {defineConfig} from 'vitest/config';
export default defineConfig({test:{environment:'jsdom',include:['tests/**/*.test.tsx'],restoreMocks:true,testTimeout:10000,setupFiles:['./tests/setup.ts']}});
