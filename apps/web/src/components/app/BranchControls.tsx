import type { UseFormRegisterReturn } from 'react-hook-form';
import { useBranchOptions } from '@/lib/queries';
import { NativeSelect } from '@/components/ui/native-select';
import { FilterSelect } from './DataTable';
import { Field } from './form';
import type { TableStateApi } from './useTableState';

/** Branch filter for a list; hidden for users who only have one branch to see. */
export function BranchFilter({ state }: { state: TableStateApi }) {
  const branches = useBranchOptions();
  if ((branches.data?.length ?? 0) < 2) return null;
  return (
    <FilterSelect
      label="Branch"
      value={state.filters.branchId}
      onChange={(v) => state.setFilter('branchId', v)}
      options={(branches.data ?? []).map((b) => ({ value: b.id, label: b.name }))}
    />
  );
}

/** Branch choice on a document form; hidden when there is only one branch to choose. */
export function BranchField({
  registration,
  error,
  current,
}: {
  registration: UseFormRegisterReturn;
  error?: string;
  /** Name of the branch the document is already in, when editing. */
  current?: string;
}) {
  const branches = useBranchOptions();
  if ((branches.data?.length ?? 0) < 2) return null;
  return (
    <Field label="Branch" error={error}>
      <NativeSelect {...registration}>
        <option value="">{current ? `Keep ${current}` : 'My default branch'}</option>
        {branches.data?.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </NativeSelect>
    </Field>
  );
}
