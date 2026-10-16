import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { FolderTree, Plus, Trash2 } from 'lucide-react';
import { assetApi, assetTypeApi, categoryApi, subCategoryApi } from '../api/assetApi';
import { useAuth } from '../context/AuthContext';
import { assetTypeNodeId, CategoryNode, categoryNodeId, subCategoryNodeId, useData } from '../context/DataContext';
import { useToast } from '../context/ToastContext';
import { useFetch } from '../lib/hooks';
import { Card, Confirm, Empty, Field, PageHeader, SearchInput } from '../components/ui';
import { TreeView } from '../components/TreeView';

type Level = CategoryNode['level'];
const LEVEL_LABEL: Record<Level, string> = { category: 'Category', subcategory: 'Subcategory', type: 'Asset type' };
const CHILD_LEVEL: Partial<Record<Level, Level>> = { category: 'subcategory', subcategory: 'type' };
const ASSET_FILTER: Record<Level, string> = { category: 'category', subcategory: 'subcategory', type: 'assetType' };

interface Draft {
  _id?: string;
  id?: number;
  level: Level;
  name: string;
  categoryId: number | null;
  subCategoryId: number | null;
}

const toDraft = (c: CategoryNode): Draft => ({ _id: c._id, id: c.id, level: c.level, name: c.name, categoryId: c.categoryId || null, subCategoryId: c.subCategoryId || null });

async function fetchDraft(c: CategoryNode): Promise<Draft> {
  const base = toDraft(c);
  if (c.level === 'category') {
    const x = await categoryApi.get(c.id);
    return { ...base, name: x.categoryName || '' };
  }
  if (c.level === 'subcategory') {
    const x = await subCategoryApi.get(c.id);
    return { ...base, name: x.subCategoryName || '', categoryId: x.categoryId };
  }
  const x = await assetTypeApi.get(c.id);
  return { ...base, name: x.typeName || '', subCategoryId: x.subCategoryId };
}

export default function CategoriesPage() {
  const { categories, reload } = useData();
  const { can } = useAuth();
  const toast = useToast();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const [saving, setSaving] = useState(false);
  const { data: assets } = useFetch(() => assetApi.list().catch(() => []), []);

  const selected = useMemo(() => categories.find((c) => c._id === selectedId), [categories, selectedId]);
  const byLevel = useMemo(() => {
    const sort = (l: Level) => categories.filter((c) => c.level === l).sort((a, b) => a.name.localeCompare(b.name));
    return { category: sort('category'), subcategory: sort('subcategory'), type: sort('type') };
  }, [categories]);

  const assetCount = useMemo(() => {
    const counts = new Map<string, number>();
    for (const a of assets || []) {
      const ids = [categoryNodeId(a.categoryId), subCategoryNodeId(a.subCategoryId), assetTypeNodeId(a.assetTypeId)].filter(Boolean) as string[];
      ids.forEach((k) => counts.set(k, (counts.get(k) || 0) + 1));
    }
    return counts;
  }, [assets]);

  useEffect(() => {
    if (!selected) return;
    setDraft(toDraft(selected));
    let live = true;
    fetchDraft(selected)
      .then((d) => live && setDraft(d))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [selected]);

  useEffect(() => {
    if (!selectedId && !draft && categories.length) setSelectedId(byLevel.category[0]?._id || null);
  }, [categories, selectedId, byLevel, draft]);

  const startNew = (level: Level, parent?: CategoryNode) => {
    setSelectedId(null);
    setDraft({
      level,
      name: '',
      categoryId: parent?.categoryId || selected?.categoryId || null,
      subCategoryId: level === 'type' ? parent?.subCategoryId || (selected?.level !== 'category' ? selected?.subCategoryId : null) || null : null,
    });
  };

  const save = async () => {
    if (!draft) return;
    const name = draft.name.trim();
    setSaving(true);
    try {
      if (draft.level === 'category') {
        const c = draft.id ? await categoryApi.update(draft.id, { categoryName: name }) : await categoryApi.create({ categoryName: name });
        setSelectedId(categoryNodeId(c?.categoryId || draft.id));
      } else if (draft.level === 'subcategory') {
        const body = { categoryId: draft.categoryId, subCategoryName: name };
        const s = draft.id ? await subCategoryApi.update(draft.id, body) : await subCategoryApi.create(body);
        setSelectedId(subCategoryNodeId(s?.subCategoryId || draft.id));
      } else {
        const body = { subCategoryId: draft.subCategoryId, typeName: name };
        const t = draft.id ? await assetTypeApi.update(draft.id, body) : await assetTypeApi.create(body);
        setSelectedId(assetTypeNodeId(t?.assetTypeId || draft.id));
      }
      toast.success(draft.id ? 'Saved' : `${LEVEL_LABEL[draft.level]} created`);
      await reload(['categories']);
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  };

  const children = draft?._id ? categories.filter((c) => c.parent === draft._id) : [];
  const inUse = draft?._id ? assetCount.get(draft._id) || 0 : 0;

  const remove = async () => {
    if (!draft?.id) return;
    try {
      if (draft.level === 'category') await categoryApi.remove(draft.id);
      else if (draft.level === 'subcategory') await subCategoryApi.remove(draft.id);
      else await assetTypeApi.remove(draft.id);
      toast.success('Deleted');
      setSelectedId(null);
      setDraft(null);
      await reload(['categories']);
    } catch (err) {
      toast.error(err);
    } finally {
      setConfirmDel(false);
    }
  };

  const editable = can('categories', draft?.id ? 'edit' : 'create');
  const blocked = children.length > 0 || inUse > 0;
  const childLevel = draft ? CHILD_LEVEL[draft.level] : undefined;
  const valid = Boolean(draft?.name.trim()) && (draft?.level !== 'subcategory' || draft.categoryId) && (draft?.level !== 'type' || draft.subCategoryId);

  return (
    <>
      <PageHeader
        title="Asset Categorization"
        subtitle={`Category → Subcategory → Asset type · ${byLevel.category.length} categories, ${byLevel.subcategory.length} subcategories, ${byLevel.type.length} asset types`}
        actions={
          can('categories', 'create') && (
            <>
              <button className="btn" onClick={() => startNew('type')} disabled={byLevel.subcategory.length === 0} title={byLevel.subcategory.length === 0 ? 'Create a subcategory first' : undefined}>
                <Plus size={16} /> New asset type
              </button>
              <button className="btn" onClick={() => startNew('subcategory')} disabled={byLevel.category.length === 0} title={byLevel.category.length === 0 ? 'Create a category first' : undefined}>
                <Plus size={16} /> New subcategory
              </button>
              <button className="btn btn-primary" onClick={() => startNew('category')}>
                <Plus size={16} /> New category
              </button>
            </>
          )
        }
      />
      <div className="grid grid-3" style={{ alignItems: 'start' }}>
        <div className="card">
          <div className="toolbar">
            <SearchInput value={filter} onChange={setFilter} placeholder="Filter categories…" />
          </div>
          <div style={{ maxHeight: 'calc(100vh - 260px)', overflowY: 'auto' }}>
            {categories.length === 0 ? (
              <Empty
                title="No categories yet"
                message="Create your first category, then add subcategories and asset types under it."
                action={
                  can('categories', 'create') && (
                    <button className="btn btn-sm btn-primary" onClick={() => startNew('category')}>
                      <Plus size={14} /> New category
                    </button>
                  )
                }
              />
            ) : (
              <TreeView
                items={categories}
                selected={selectedId}
                filter={filter}
                defaultDepth={2}
                onSelect={(c) => setSelectedId(c._id)}
                renderMeta={(c) => <span className="count">{assetCount.get(c._id) || 0}</span>}
              />
            )}
          </div>
        </div>

        <div className="span-2">
          {!draft ? (
            <Card>
              <Empty icon={<FolderTree size={24} />} title="Select a category" message="Pick a node on the left, or create a new category." />
            </Card>
          ) : (
            <Card
              title={draft.id ? draft.name || '(unnamed)' : `New ${LEVEL_LABEL[draft.level].toLowerCase()}`}
              subtitle={
                <>
                  {LEVEL_LABEL[draft.level]}
                  {draft._id && (
                    <>
                      {' · '}
                      <Link to={`/assets?${ASSET_FILTER[draft.level]}=${draft.id}`}>{inUse} assets</Link>
                    </>
                  )}
                </>
              }
              actions={
                draft.id && (
                  <>
                    {childLevel && can('categories', 'create') && selected && (
                      <button className="btn btn-sm" onClick={() => startNew(childLevel, selected)}>
                        <Plus size={14} /> Add {LEVEL_LABEL[childLevel].toLowerCase()}
                      </button>
                    )}
                    {can('categories', 'delete') && (
                      <button className="btn btn-sm btn-ghost" onClick={() => setConfirmDel(true)}>
                        <Trash2 size={14} />
                      </button>
                    )}
                  </>
                )
              }
            >
              <div className="form-grid">
                <Field label="Name" required>
                  <input className="input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} disabled={!editable} autoFocus={!draft.id} />
                </Field>
                {draft.level === 'subcategory' && (
                  <Field label="Parent category" required>
                    <select className="select" value={draft.categoryId ?? ''} onChange={(e) => setDraft({ ...draft, categoryId: e.target.value ? Number(e.target.value) : null })} disabled={!editable}>
                      <option value="">Select category…</option>
                      {byLevel.category.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                )}
                {draft.level === 'type' && (
                  <Field label="Parent subcategory" required>
                    <select className="select" value={draft.subCategoryId ?? ''} onChange={(e) => setDraft({ ...draft, subCategoryId: e.target.value ? Number(e.target.value) : null })} disabled={!editable}>
                      <option value="">Select subcategory…</option>
                      {byLevel.subcategory.map((s) => (
                        <option key={s.id} value={s.id}>
                          {categories.find((c) => c._id === s.parent)?.name || '—'} › {s.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                )}
              </div>

              {childLevel && draft._id && (
                <>
                  <div className="divider" />
                  <h4 className="small bold" style={{ marginBottom: 12 }}>
                    {LEVEL_LABEL[childLevel]}s
                  </h4>
                  {children.length === 0 ? (
                    <div className="small muted">None yet.</div>
                  ) : (
                    <div className="row wrap" style={{ gap: 6 }}>
                      {children.map((c) => (
                        <button key={c._id} type="button" className="chip" onClick={() => setSelectedId(c._id)}>
                          {c.name}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}

              {editable && (
                <div className="row mt" style={{ justifyContent: 'flex-end' }}>
                  {!draft.id && (
                    <button className="btn" onClick={() => setDraft(selected ? toDraft(selected) : null)}>
                      Cancel
                    </button>
                  )}
                  <button className="btn btn-primary" onClick={save} disabled={saving || !valid}>
                    {draft.id ? 'Save changes' : 'Create'}
                  </button>
                </div>
              )}
            </Card>
          )}
        </div>
      </div>
      <Confirm
        open={confirmDel}
        title={`Delete ${draft ? LEVEL_LABEL[draft.level].toLowerCase() : ''}?`}
        danger={!blocked}
        confirmText={blocked ? 'OK' : 'Delete'}
        message={
          blocked
            ? `This ${draft ? LEVEL_LABEL[draft.level].toLowerCase() : ''} still has ${[children.length && `${children.length} child items`, inUse && `${inUse} assets`].filter(Boolean).join(' and ')}. Move or delete them first.`
            : `Delete "${draft?.name}"? This cannot be undone.`
        }
        onClose={() => setConfirmDel(false)}
        onConfirm={blocked ? () => setConfirmDel(false) : remove}
      />
    </>
  );
}
