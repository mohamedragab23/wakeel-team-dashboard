import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { invalidateSalaryCaches } from '../lib/cacheInvalidation';

invalidateSalaryCaches().then(() => console.log('Salary caches cleared (L1 in this process is irrelevant; L2 Redis cleared).'));
