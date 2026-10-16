import { useState } from 'react';
import { categoryApi, subCategoryApi } from '../api/assetApi';
import { useData } from '../context/DataContext';
import { useToast } from '../context/ToastContext';
import { Field, Modal } from './ui';

export type CategoryLevel = 'category' | 'subcategory';

// Creates a category or subcategory on the AssetAPI and refreshes the shared lookups.
// Rendered inside other forms, so buttons are type="button" and Enter is handled here.
interface Props {
  open: boolean;
  level: CategoryLevel;
  parentId?: number | null;
  onClose: () => void;
  onCreated?: (created: { level: CategoryLevel; id: number; categoryId: number }) => void;
}

export function CategoryQuickAdd(props: Props) {
  return props.open ? <QuickAddDialog {...props} /> : null;
}

function QuickAddDialog({ level, parentId, onClose, onCreated }: Props) {
  const { categories, reload } = useData();
  const toast = useToast();
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState<number | null>(parentId ?? null);
  const [busy, setBusy] = useState(false);
  const parents = categories.filter((c) => c.level === 'category').sort((a, b) => a.name.localeCompare(b.name));

  const valid = name.trim() && (level === 'category' || categoryId);

  const save = async () => {
    if (!valid || busy) return;
    setBusy(true);
    try {
      if (level === 'category') {
        const c = await categoryApi.create({ categoryName: name.trim() });
        await reload(['categories']);
        onCreated?.({ level, id: c.categoryId, categoryId: c.categoryId });
      } else {
        const s = await subCategoryApi.create({ categoryId, subCategoryName: name.trim() });
        await reload(['categories']);
        onCreated?.({ level, id: s.subCategoryId, categoryId: s.categoryId || categoryId! });
      }
      toast.success(`${level === 'category' ? 'Category' : 'Subcategory'} "${name.trim()}" created`);
      onClose();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={level === 'category' ? 'New category' : 'New subcategory'}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={save} disabled={!valid || busy}>
            Create
          </button>
        </>
      }
    >
      <div className="stack">
        {level === 'subcategory' && (
          <Field label="Parent category" required>
            <select className="select" value={categoryId ?? ''} onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : null)}>
              <option value="">Select category…</option>
              {parents.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {parents.length === 0 && <div className="hint">Create a category first.</div>}
          </Field>
        )}
        <Field label="Name" required>
          <input
            className="input"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                save();
              }
            }}
            placeholder={level === 'category' ? 'e.g. IT Equipment' : 'e.g. Laptops'}
          />
        </Field>
      </div>
    </Modal>
  );
}
