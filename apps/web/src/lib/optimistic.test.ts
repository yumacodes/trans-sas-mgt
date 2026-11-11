import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { insertRecord, patchRecord } from './optimistic';

const key = ['things'] as const;
const a = { id: 'a', name: 'A' };
const b = { id: 'b', name: 'B' };
const page = (rows: { id: string; name: string }[], total = rows.length, pageSize = 25) => ({
  data: rows,
  meta: { page: 1, pageSize, total, pageCount: 1 },
});
const listKey = (params: Record<string, unknown>) => [...key, 'list', params];

describe('optimistic cache helpers', () => {
  it('patches a record in lists and its detail view, and undoes it', () => {
    const client = new QueryClient();
    const list = listKey({ page: 1 });
    const detail = [...key, 'detail', 'a'];
    client.setQueryData(list, page([a, b]));
    client.setQueryData(detail, a);

    const undo = patchRecord<typeof a>(client, key, 'a', { name: 'Changed' });
    expect(client.getQueryData<ReturnType<typeof page>>(list)?.data[0]?.name).toBe('Changed');
    expect(client.getQueryData<typeof a>(detail)?.name).toBe('Changed');

    undo();
    expect(client.getQueryData<ReturnType<typeof page>>(list)?.data[0]?.name).toBe('A');
    expect(client.getQueryData<typeof a>(detail)?.name).toBe('A');
  });

  it('inserts at the top of the first unfiltered page only', () => {
    const client = new QueryClient();
    const first = listKey({ page: 1, pageSize: 2, sort: 'name:asc', q: undefined });
    const second = listKey({ page: 2, pageSize: 2 });
    const filtered = listKey({ page: 1, pageSize: 2, status: 'void' });
    client.setQueryData(first, page([a, b], 2, 2));
    client.setQueryData(second, page([b], 3, 2));
    client.setQueryData(filtered, page([a], 1, 2));

    insertRecord(client, key, { id: 'new', name: 'New' });

    const result = client.getQueryData<ReturnType<typeof page>>(first);
    expect(result?.data.map((r) => r.id)).toEqual(['new', 'a']);
    expect(result?.meta.total).toBe(3);
    expect(client.getQueryData<ReturnType<typeof page>>(second)?.data).toEqual([b]);
    expect(client.getQueryData<ReturnType<typeof page>>(filtered)?.data).toEqual([a]);
  });

  it('treats a matching list parameter as part of the list', () => {
    const client = new QueryClient();
    const general = listKey({ page: 1, kind: 'general' });
    const tender = listKey({ page: 1, kind: 'tender_in' });
    client.setQueryData(general, page([]));
    client.setQueryData(tender, page([]));

    insertRecord(client, key, { id: 'new', name: 'New' }, { kind: 'general' });

    expect(client.getQueryData<ReturnType<typeof page>>(general)?.data).toHaveLength(1);
    expect(client.getQueryData<ReturnType<typeof page>>(tender)?.data).toHaveLength(0);
  });
});
