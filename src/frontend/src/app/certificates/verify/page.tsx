'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ShieldCheck, ShieldX } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

function VerifyInner() {
  const searchParams = useSearchParams();
  const id = searchParams.get('id') || '';
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    fetch(`${API_URL}/api/certificates/verify?certificate_id=${id}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Not found');
        setResult(data);
      })
      .catch((err: any) => setError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="card max-w-lg w-full text-center">
        <h1 className="text-2xl font-bold mb-4">Certificate verification</h1>
        {!id && <p className="text-gray-600">Pass <code>?id=&lt;certificate-uuid&gt;</code> to verify.</p>}
        {error && <p className="text-red-500">{error}</p>}
        {result && result.valid && (
          <div>
            <ShieldCheck className="h-16 w-16 text-green-600 mx-auto mb-4" />
            <p className="text-green-700 font-bold text-lg mb-2">Valid signature ✓</p>
            <p className="font-medium">{result.certificate.title}</p>
            <p className="text-gray-600 text-sm">{result.certificate.certificate_type} · {result.certificate.recipient_type}</p>
            <p className="text-gray-500 text-xs mt-4 break-all">sig {result.certificate.signature?.slice(0, 32)}…</p>
          </div>
        )}
        {result && !result.valid && (
          <div>
            <ShieldX className="h-16 w-16 text-red-500 mx-auto mb-4" />
            <p className="text-red-600 font-bold text-lg">Invalid or unknown certificate</p>
          </div>
        )}
        <Link href="/events" className="btn-secondary mt-6 inline-block">Browse events</Link>
      </div>
    </div>
  );
}

export default function VerifyPage() {
  return (
    <Suspense>
      <VerifyInner />
    </Suspense>
  );
}
