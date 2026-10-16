import { Hourglass } from 'lucide-react';
import { Empty, PageHeader } from './ui';

export function ComingSoon({ title }: { title?: string }) {
  const body = (
    <Empty
      icon={<Hourglass size={24} />}
      title="Coming soon"
      message="This module is not available yet — the AssetAPI backend does not provide endpoints for it."
    />
  );
  if (!title) return body;
  return (
    <>
      <PageHeader title={title} />
      <div className="card">{body}</div>
    </>
  );
}
