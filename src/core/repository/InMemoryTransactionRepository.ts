import type { Transaction, TransactionRepository } from '../types';

export class InMemoryTransactionRepository implements TransactionRepository {
  private items: Transaction[] = [];

  constructor(seed: Transaction[] = [], private readonly max = 1000) {
    this.items = [...seed];
  }

  list(): Transaction[] {
    return [...this.items];
  }
  get(id: string): Transaction | undefined {
    return this.items.find((t) => t.transactionId === id);
  }
  save(tx: Transaction): void {
    const idx = this.items.findIndex((t) => t.transactionId === tx.transactionId);
    if (idx >= 0) this.items[idx] = tx;
    else this.items = [tx, ...this.items].slice(0, this.max);
  }
  clear(): void {
    this.items = [];
  }
  findByPayloadHash(hash: string): Transaction[] {
    return this.items.filter((t) => t.payloadHash === hash);
  }
  findByReference(ref: string): Transaction[] {
    return this.items.filter((t) => t.transactionReference === ref);
  }
}
