/**
 * System Database - Primary Data Source
 * Uses IndexedDB for client-side storage
 * Google Sheets becomes sync/backup only
 */

interface Rider {
  riderId: string;
  riderName: string;
  zone: string;
  supervisorId: string;
  assignedDate: string;
  status: 'active' | 'inactive';
  phone?: string;
  joinDate?: string;
}

interface PerformanceData {
  id?: number;
  date: string;
  riderId: string;
  workHours: number;
  breaks: number;
  delay: number;
  absence: boolean;
  orders: number;
  acceptanceRate: number;
  wallet: number; // المحفظة
  createdAt: string;
}

interface SupervisorConfig {
  supervisorId: string;
  salaryMethod: 'fixed' | 'commission';
  fixedSalary?: number;
  commissionRate?: number; // سعر الطلب بالجنيه
  hoursMultipliers?: {
    minHours: number;
    maxHours: number;
    multiplier: number;
  }[];
  customFormula?: string;
  updatedAt: string;
}

interface Debt {
  id?: number;
  riderId: string;
  amount: number;
  date: string;
  notes?: string;
  createdAt: string;
}

class SystemDatabase {
  private dbName = '007SupDB';
  private version = 1;
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Riders store
        if (!db.objectStoreNames.contains('riders')) {
          const ridersStore = db.createObjectStore('riders', { keyPath: 'riderId' });
          ridersStore.createIndex('supervisorId', 'supervisorId', { unique: false });
          ridersStore.createIndex('status', 'status', { unique: false });
        }

        // Performance store
        if (!db.objectStoreNames.contains('performance')) {
          const performanceStore = db.createObjectStore('performance', { keyPath: 'id', autoIncrement: true });
          performanceStore.createIndex('riderId', 'riderId', { unique: false });
          performanceStore.createIndex('date', 'date', { unique: false });
          performanceStore.createIndex('riderDate', ['riderId', 'date'], { unique: false });
        }

        // Supervisor config store
        if (!db.objectStoreNames.contains('supervisorConfig')) {
          const configStore = db.createObjectStore('supervisorConfig', { keyPath: 'supervisorId' });
        }

        // Debts store
        if (!db.objectStoreNames.contains('debts')) {
          const debtsStore = db.createObjectStore('debts', { keyPath: 'id', autoIncrement: true });
          debtsStore.createIndex('riderId', 'riderId', { unique: false });
          debtsStore.createIndex('date', 'date', { unique: false });
        }

        // Sync status store
        if (!db.objectStoreNames.contains('syncStatus')) {
          db.createObjectStore('syncStatus', { keyPath: 'key' });
        }
      };
    });
  }

  // ========== RIDERS ==========

  async addRiders(riders: Rider[]): Promise<{ added: number; errors: string[] }> {
    if (!this.db) await this.init();

    const errors: string[] = [];
    let added = 0;

    const transaction = this.db!.transaction(['riders'], 'readwrite');
    const store = transaction.objectStore('riders');

    for (const rider of riders) {
      try {
        await new Promise<void>((resolve, reject) => {
          const request = store.put(rider);
          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
        });
        added++;
      } catch (error: any) {
        errors.push(`فشل إضافة ${rider.riderId}: ${error.message}`);
      }
    }

    return { added, errors };
  }

  async getRiders(supervisorId?: string): Promise<Rider[]> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['riders'], 'readonly');
      const store = transaction.objectStore('riders');
      const request = supervisorId
        ? store.index('supervisorId').getAll(supervisorId)
        : store.getAll();

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async getRider(riderId: string): Promise<Rider | null> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['riders'], 'readonly');
      const store = transaction.objectStore('riders');
      const request = store.get(riderId);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  // ========== PERFORMANCE ==========

  async addPerformanceData(data: Omit<PerformanceData, 'id' | 'createdAt'>[]): Promise<number> {
    if (!this.db) await this.init();

    const transaction = this.db!.transaction(['performance'], 'readwrite');
    const store = transaction.objectStore('performance');

    let added = 0;

    for (const record of data) {
      try {
        await new Promise<void>((resolve, reject) => {
          const request = store.add({
            ...record,
            createdAt: new Date().toISOString(),
          });
          request.onsuccess = () => {
            added++;
            resolve();
          };
          request.onerror = () => reject(request.error);
        });
      } catch (error) {
        console.error('Error adding performance record:', error);
      }
    }

    return added;
  }

  async getPerformanceData(
    supervisorId: string,
    startDate?: string,
    endDate?: string
  ): Promise<PerformanceData[]> {
    if (!this.db) await this.init();

    // Get supervisor's riders first
    const riders = await this.getRiders(supervisorId);
    const riderIds = new Set(riders.map((r) => r.riderId));

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['performance'], 'readonly');
      const store = transaction.objectStore('performance');
      const request = store.getAll();

      request.onsuccess = () => {
        let results = request.result || [];

        // Filter by rider IDs
        results = results.filter((record: PerformanceData) => riderIds.has(record.riderId));

        // Filter by date range
        if (startDate || endDate) {
          results = results.filter((record: PerformanceData) => {
            const recordDate = record.date;
            if (startDate && recordDate < startDate) return false;
            if (endDate && recordDate > endDate) return false;
            return true;
          });
        }

        // Sort by date descending
        results.sort((a: PerformanceData, b: PerformanceData) => {
          return new Date(b.date).getTime() - new Date(a.date).getTime();
        });

        resolve(results);
      };

      request.onerror = () => reject(request.error);
    });
  }

  // ========== SUPERVISOR CONFIG ==========

  async setSupervisorConfig(config: SupervisorConfig): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['supervisorConfig'], 'readwrite');
      const store = transaction.objectStore('supervisorConfig');
      const request = store.put({
        ...config,
        updatedAt: new Date().toISOString(),
      });

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getSupervisorConfig(supervisorId: string): Promise<SupervisorConfig | null> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['supervisorConfig'], 'readonly');
      const store = transaction.objectStore('supervisorConfig');
      const request = store.get(supervisorId);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async getAllSupervisorConfigs(): Promise<SupervisorConfig[]> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['supervisorConfig'], 'readonly');
      const store = transaction.objectStore('supervisorConfig');
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  // ========== DEBTS ==========

  async addDebts(debts: Omit<Debt, 'id' | 'createdAt'>[]): Promise<number> {
    if (!this.db) await this.init();

    const transaction = this.db!.transaction(['debts'], 'readwrite');
    const store = transaction.objectStore('debts');

    let added = 0;

    for (const debt of debts) {
      try {
        await new Promise<void>((resolve, reject) => {
          const request = store.add({
            ...debt,
            createdAt: new Date().toISOString(),
          });
          request.onsuccess = () => {
            added++;
            resolve();
          };
          request.onerror = () => reject(request.error);
        });
      } catch (error) {
        console.error('Error adding debt:', error);
      }
    }

    return added;
  }

  async getDebts(supervisorId?: string): Promise<Debt[]> {
    if (!this.db) await this.init();

    // If supervisorId provided, get their riders first
    let riderIds: Set<string> | null = null;
    if (supervisorId) {
      const riders = await this.getRiders(supervisorId);
      riderIds = new Set(riders.map((r) => r.riderId));
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['debts'], 'readonly');
      const store = transaction.objectStore('debts');
      const request = store.getAll();

      request.onsuccess = () => {
        let results = request.result || [];

        // Filter by rider IDs if supervisor specified
        if (riderIds) {
          results = results.filter((debt: Debt) => riderIds!.has(debt.riderId));
        }

        resolve(results);
      };

      request.onerror = () => reject(request.error);
    });
  }

  // ========== SYNC STATUS ==========

  async setSyncStatus(key: string, status: any): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['syncStatus'], 'readwrite');
      const store = transaction.objectStore('syncStatus');
      const request = store.put({ key, value: status, timestamp: Date.now() });

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getSyncStatus(key: string): Promise<any> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['syncStatus'], 'readonly');
      const store = transaction.objectStore('syncStatus');
      const request = store.get(key);

      request.onsuccess = () => resolve(request.result?.value || null);
      request.onerror = () => reject(request.error);
    });
  }

  // ========== UTILITY ==========

  async clearAll(): Promise<void> {
    if (!this.db) await this.init();

    const stores = ['riders', 'performance', 'supervisorConfig', 'debts', 'syncStatus'];

    for (const storeName of stores) {
      await new Promise<void>((resolve, reject) => {
        const transaction = this.db!.transaction([storeName], 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.clear();

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    }
  }
}

// Export singleton instance
export const systemDB = new SystemDatabase();

// Export types
export type { Rider, PerformanceData, SupervisorConfig, Debt };

