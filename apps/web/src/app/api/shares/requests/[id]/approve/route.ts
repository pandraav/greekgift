import { decide } from '@/lib/share-decision';

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return decide((await params).id, 'approved');
}
