import { api, ApiError } from '@/lib/api-client';

/**
 * 入住成功後依規則產生當月帳單；全額時再標記已付。
 * 若該月帳單已存在（409），改用既有帳單 id。
 */
export async function postCheckinGenerateAndMaybePay(params: {
  paymentType: 'full' | 'partial' | 'deposit_only';
  roomId: string;
  tenantId: string;
  paymentMonth: string;
  paidAmountCents: number;
}): Promise<void> {
  const markPaid = params.paymentType === 'full';
  let paymentId: string;

  try {
    const created = await api.post<{ id: string }>('/api/payments/generate', {
      roomId: params.roomId,
      tenantId: params.tenantId,
      paymentMonth: params.paymentMonth,
    });
    paymentId = created.id;
  } catch (e) {
    if (
      e instanceof ApiError &&
      e.status === 409 &&
      e.data &&
      typeof e.data === 'object' &&
      'id' in e.data
    ) {
      paymentId = String((e.data as { id: string }).id);
    } else {
      throw e;
    }
  }

  if (markPaid && paymentId && params.paidAmountCents > 0) {
    await api.patch(`/api/payments/${paymentId}/pay`, {
      amount: params.paidAmountCents,
      paymentMethod: 'cash',
    });
  }
}
