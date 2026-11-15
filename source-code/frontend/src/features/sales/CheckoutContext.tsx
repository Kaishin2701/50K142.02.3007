import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useSession } from '../../app/auth';
import { useDataStore, useResource, useTask } from '../../app/data';
import { api, ApiError, download } from '../../services/api';
import type {
  CartLine,
  MenuItem,
  Order,
  Payment,
  QrModeResponse,
} from '../../services/models';

type StoredCheckout = {
  cart: CartLine[];
  orderId?: string;
  requestKey: string;
  payment?: Payment;
};
function readCheckout(key: string, legacyKey: string): StoredCheckout {
  try {
    const saved = JSON.parse(sessionStorage.getItem(key) ?? 'null');
    if (
      saved &&
      Array.isArray(saved.cart) &&
      typeof saved.requestKey === 'string'
    )
      return saved;
  } catch {
    /* A previous browser session may contain incomplete local data. */
  }
  return {
    cart: [],
    orderId: sessionStorage.getItem(legacyKey) ?? undefined,
    requestKey: crypto.randomUUID(),
  };
}
type Checkout = ReturnType<typeof useCheckoutModel>;
const Context = createContext<Checkout | null>(null);

export function CheckoutProvider({ children }: { children: ReactNode }) {
  const checkout = useCheckoutModel();
  return <Context.Provider value={checkout}>{children}</Context.Provider>;
}
export function useCheckout() {
  const checkout = useContext(Context);
  if (!checkout) throw new Error('CheckoutProvider is required');
  return checkout;
}
function useCheckoutModel() {
  const { user } = useSession();
  const { version, refresh } = useDataStore();
  const qrModeResource = useResource<QrModeResponse | null>(
    '/payments/mode',
    null,
  );
  const storageKey = 'me-cafe-checkout-state:' + user!.ma_nguoi_dung;
  const legacyKey = 'me-cafe-checkout:' + user!.ma_nguoi_dung;
  const [stored, setStored] = useState(() =>
    readCheckout(storageKey, legacyKey),
  );
  const [order, setOrder] = useState<Order | null>(null);
  const [payment, setPayment] = useState<Payment | undefined>(
    stored.orderId ? stored.payment : undefined,
  );
  const [orderSyncError, setOrderSyncError] = useState('');
  const [orderSyncPending, setOrderSyncPending] = useState(false);
  const orderRef = useRef(order);
  orderRef.current = order;
  const paymentRef = useRef(payment);
  paymentRef.current = payment;
  const [restoring, setRestoring] = useState(Boolean(stored.orderId));
  const [reviewing, setReviewing] = useState(Boolean(stored.orderId));
  const [cancelledOrder, setCancelledOrder] = useState<{
    id: string;
    code: string;
  } | null>(null);
  const [cancelToast, setCancelToast] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const [stopNotice, setStopNotice] = useState<string | null>(null);
  const task = useTask();
  const requestKey = useRef(stored.requestKey);
  const cart = stored.cart;
  const storeOrder = (found: Order) => {
    setOrder(found);
    const successful = found.payments?.find(
      (item) => item.trang_thai === 'Thành công',
    );
    setPayment((previous) => {
      if (successful) return successful;
      const pending = found.payments?.filter(
        (item) =>
          item.phuong_thuc === 'Chuyển khoản qua QR' &&
          item.trang_thai === 'Chờ xác nhận',
      );
      const selected =
        pending?.find((item) => item.ma_giao_dich === previous?.ma_giao_dich) ??
        pending?.at(-1);
      if (selected) {
        const restored =
          selected.ma_giao_dich === previous?.ma_giao_dich
            ? { ...previous, ...selected }
            : selected;
        if (
          restored.qr_mo_phong &&
          restored.qrContent?.startsWith('DEMO|')
        ) {
          return { ...restored, qrContent: undefined, qrImageUrl: undefined };
        }
        return restored;
      }
      return previous?.ma_don === found.ma_don ? previous : undefined;
    });
    const complete = found.trang_thai_pha_che === 'Hoàn tất pha chế';
    setStored((previous) => ({
      ...previous,
      orderId: complete ? undefined : found.ma_don,
      cart: complete ? [] : previous.cart,
    }));
    return found;
  };
  useEffect(() => {
    sessionStorage.setItem(storageKey, JSON.stringify({ ...stored, payment }));
    if (stored.orderId) sessionStorage.setItem(legacyKey, stored.orderId);
    else sessionStorage.removeItem(legacyKey);
  }, [stored, payment, storageKey, legacyKey]);
  useEffect(() => {
    if (!stored.orderId) {
      setRestoring(false);
      return;
    }
    if (task.pending) return;
    const currentOrder = orderRef.current;
    const currentPayment = paymentRef.current;
    const locallyPaid =
      currentOrder?.ma_don === stored.orderId &&
      currentOrder.da_thanh_toan;
    const controller = new AbortController();
    api<Order>(`/orders/${stored.orderId}`, { signal: controller.signal })
      .then((found) => {
        if (controller.signal.aborted) return;
        const selectedPayment =
          currentPayment &&
          currentPayment.ma_don === stored.orderId &&
          currentPayment.trang_thai === 'Thành công'
            ? found.payments?.find(
                (item) =>
                  item.ma_giao_dich === currentPayment.ma_giao_dich &&
                  item.ma_don === stored.orderId &&
                  item.trang_thai === 'Thành công',
              )
            : undefined;
        if (locallyPaid && (!found.da_thanh_toan || (currentPayment?.trang_thai === 'Thành công' && !selectedPayment))) {
          setOrderSyncError(
            'Thanh toán đã được xác nhận, nhưng chi tiết đơn chưa đồng bộ.',
          );
          return;
        }
        if (found.trang_thai_pha_che === 'Hoàn tất pha chế') {
          setStored((previous) => ({
            ...previous,
            orderId: undefined,
            cart: [],
          }));
          setOrder(null);
          setPayment(undefined);
          setReviewing(false);
        } else {
          storeOrder(found);
          setOrderSyncError('');
        }
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        if (locallyPaid) {
          setOrderSyncError(
            'Thanh toán đã được xác nhận, nhưng chưa đồng bộ được chi tiết đơn.',
          );
          return;
        }
        if (error instanceof ApiError && [403, 404].includes(error.status)) {
          setStored((previous) => ({
            ...previous,
            orderId: undefined,
            cart: [],
          }));
          setOrder(null);
          setPayment(undefined);
          setReviewing(false);
        } else task.setError(error.message ?? 'Không thể tải lại đơn hàng.');
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setRestoring(false);
          if (locallyPaid) setOrderSyncPending(false);
        }
      });
    if (locallyPaid) setOrderSyncPending(true);
    return () => controller.abort();
  }, [stored.orderId, version, task.pending]);
  const changeCart = (next: CartLine[]) => {
    if (stored.orderId || order || task.pending) return;
    task.setError('');
    setStored((previous) => ({ ...previous, cart: next }));
  };
  const add = (item: MenuItem) => {
    const existing = cart.find((line) => line.ma_mon === item.ma_mon);
    changeCart(
      existing
        ? cart.map((line) =>
            line.ma_mon === item.ma_mon
              ? {
                  ...line,
                  so_luong: String(
                    Math.min(1000, Number(line.so_luong || 0) + 1),
                  ),
                }
              : line,
          )
        : [...cart, { ...item, so_luong: '1' }],
    );
  };
  const quantity = (id: string, value: string) =>
    changeCart(
      cart.map((line) =>
        line.ma_mon === id ? { ...line, so_luong: value } : line,
      ),
    );
  const remove = (id: string) =>
    changeCart(cart.filter((line) => line.ma_mon !== id));
  const replaceItem = (oldId: string, newItem: MenuItem) => {
    if (stored.orderId || order || task.pending) return;
    task.setError('');
    const existing = cart.find((line) => line.ma_mon === oldId);
    if (!existing) return;
    const qty = existing.so_luong;
    changeCart(
      cart.map((line) =>
        line.ma_mon === oldId
          ? { ...newItem, so_luong: qty }
          : line,
      ),
    );
  };
  const clear = () => {
    requestKey.current = crypto.randomUUID();
    setStored({ cart: [], requestKey: requestKey.current });
    setOrder(null);
    setPayment(undefined);
    setOrderSyncError('');
    setOrderSyncPending(false);
    setReviewing(false);
    task.setError('');
  };
  const clearStopNotice = () => setStopNotice(null);
  const stopOrder = () =>
    task.run(async () => {
      const currentOrderId = stored.orderId;
      if (currentOrderId) {
        try {
          await api(`/orders/${currentOrderId}`, { method: 'DELETE' });
        } catch (error) {
          // DELETE can return 404 when the draft was already removed, but
          // network/server/permission errors must not be reported as success.
          if (!(error instanceof ApiError && error.status === 404)) throw error;
        }
      }
      clear();
      setStopNotice(
        'Đã dừng đặt hàng. Phần tồn đã giữ được giải phóng, không phát sinh đơn.',
      );
      refresh();
    });
  const check = (shiftId?: string) =>
    task.run(async () => {
      let id = stored.orderId;
      if (!id) {
        if (!shiftId)
          throw new Error('Bạn cần được phân công vào ca đang diễn ra.');
        if (
          !cart.length ||
          cart.some(
            (line) =>
              !Number.isInteger(Number(line.so_luong)) ||
              Number(line.so_luong) < 1 ||
              Number(line.so_luong) > 1000,
          )
        )
          throw new Error(
            'Số lượng là số nguyên từ 1 đến 1000. Đơn cần ít nhất một món.',
          );
        const draft = await api<Order>('/orders/drafts', {
          method: 'POST',
          key: requestKey.current,
          body: {
            ma_ca: shiftId,
            items: cart.map((line) => ({
              ma_mon: line.ma_mon,
              so_luong: Number(line.so_luong),
            })),
          },
        });
        id = draft.ma_don;
        const next = { ...stored, orderId: id };
        sessionStorage.setItem(storageKey, JSON.stringify(next));
        setStored(next);
      }
      storeOrder(await api<Order>(`/orders/${id}`));
      setReviewing(true);
      refresh();
    });
  const confirm = () =>
    task.run(async () => {
      await api(`/orders/${stored.orderId}/confirm`, { method: 'POST' });
      storeOrder(await api<Order>(`/orders/${stored.orderId}`));
      refresh();
    });
  const payCash = (received: number) =>
    task.run(async () => {
      const result = await api<Payment>('/payments/cash', {
        method: 'POST',
        body: { ma_don: stored.orderId, so_tien_nhan: received },
      });
      setPayment(result);
      storeOrder(await api<Order>(`/orders/${stored.orderId}`));
      refresh();
    });
  const createQr = async () => {
    let created: Payment | undefined;
    const succeeded = await task.run(async () => {
      created = await api<Payment>('/payments/qr', {
          method: 'POST',
          body: { ma_don: stored.orderId },
        });
      setPayment(created);
    });
    return succeeded ? created : undefined;
  };
  const reconcile = () =>
    task.run(async () => {
      const currentPayment = payment;
      const currentOrder = order;
      const orderId = stored.orderId;
      if (
        !currentPayment ||
        !currentOrder ||
        !orderId ||
        currentPayment.ma_don !== orderId ||
        currentOrder.ma_don !== orderId
      )
        throw new Error('Không tìm thấy giao dịch QR của đơn hiện tại.');

      const isConfirmed = (
        candidate: Payment | undefined,
      ): candidate is Payment =>
        candidate?.ma_giao_dich === currentPayment.ma_giao_dich &&
        candidate.ma_don === orderId &&
        candidate.phuong_thuc === 'Chuyển khoản qua QR' &&
        candidate.trang_thai === 'Thành công' &&
        Number(candidate.so_tien_thanh_toan) === Number(currentOrder.tong_tien);
      const acceptConfirmation = (confirmed: Payment) => {
        setPayment(confirmed);
        setOrder((previous) =>
          previous?.ma_don === orderId
            ? {
                ...previous,
                da_thanh_toan: true,
                payments: [
                  ...(previous.payments ?? []).filter(
                    (item) => item.ma_giao_dich !== confirmed.ma_giao_dich,
                  ),
                  confirmed,
                ],
              }
            : previous,
        );
        setOrderSyncError('');
        refresh();
      };

      let reconciled: Payment;
      try {
        reconciled = await api<Payment>(
          `/payments/${currentPayment.ma_giao_dich}/reconcile`,
          { method: 'POST' },
        );
      } catch (error) {
        if (error instanceof ApiError && error.status < 500) throw error;
        let current: Order;
        try {
          current = await api<Order>(`/orders/${orderId}`);
        } catch {
          throw new Error(
            'Không nhận được phản hồi đối soát và chưa kiểm tra được trạng thái đơn. Chưa thể xác nhận giao dịch đã thanh toán.',
          );
        }
        const confirmed = current.payments?.find(
          (item) => item.ma_giao_dich === currentPayment.ma_giao_dich,
        );
        if (
          current.ma_don === orderId &&
          current.da_thanh_toan &&
          isConfirmed(confirmed)
        ) {
          acceptConfirmation(confirmed);
          return;
        }
        throw new Error(
          'Không nhận được phản hồi đối soát; đơn chưa có xác nhận thành công cho giao dịch này.',
        );
      }

      if (!isConfirmed(reconciled))
        throw new Error(
          'Phản hồi đối soát không khớp giao dịch QR của đơn hiện tại.',
        );
      acceptConfirmation(reconciled);
    });

  const retryOrderSync = () => {
    if (!stored.orderId || order?.ma_don !== stored.orderId || !order.da_thanh_toan)
      return;
    setOrderSyncError('');
    setOrderSyncPending(true);
    refresh();
  };
  const print = () =>
    task.run(async () => {
      await download(
        `/orders/${stored.orderId}/invoice.pdf`,
        `hoa-don-${order?.ma_don_hien_thi}.pdf`,
      );
      if (order?.trang_thai_pha_che === 'Chưa pha chế')
        await api(`/orders/${stored.orderId}/start-preparing`, {
          method: 'POST',
        });
      storeOrder(await api<Order>(`/orders/${stored.orderId}`));
      refresh();
    });
  const complete = () =>
    task.run(async () => {
      if (!order) throw new Error('Không tìm thấy đơn hàng.');
      const completed = await api<Partial<Order>>(
        `/orders/${stored.orderId}/complete`,
        { method: 'POST' },
      );
      storeOrder({ ...order, ...completed });
      refresh();
    });
  const clearCancelToast = () => setCancelToast(null);
  const resetNewOrder = () => {
    setCancelledOrder(null);
    setCancelToast(null);
    clear();
    refresh();
  };
  const cancel = () =>
    task.run(async () => {
      if (stored.orderId) {
        const orderCode = order?.ma_don_hien_thi
          ? '#' + order.ma_don_hien_thi
          : '#' + stored.orderId;
        const currentOrderId = stored.orderId;
        try {
          await api(`/orders/${currentOrderId}`, { method: 'DELETE' });
          setCancelledOrder({ id: currentOrderId, code: orderCode });
          setCancelToast({
            type: 'success',
            message: `Đã hủy đơn hàng ${orderCode}`,
          });
          clear();
          refresh();
        } catch (error) {
          try {
            const updated = await api<Order>(`/orders/${currentOrderId}`);
            storeOrder(updated);
          } catch {
            /* Keep existing order state if sync fails */
          }
          const message =
            error instanceof Error
              ? error.message
              : 'Đơn hàng không thể hủy do đã thanh toán thành công hoặc đã bắt đầu pha chế.';
          setCancelToast({
            type: 'error',
            message,
          });
          refresh();
          throw error;
        }
      } else {
        clear();
        refresh();
      }
    });
  return {
    cart,
    order,
    payment,
    qrMode: qrModeResource.data?.mode,
    qrModeLoading: qrModeResource.loading,
    qrModeError: qrModeResource.error,
    orderSyncError,
    orderSyncPending,
    retryOrderSync,
    restoring,
    reviewing,
    setReviewing,
    cancelledOrder,
    cancelToast,
    clearCancelToast,
    resetNewOrder,
    task,
    add,
    quantity,
    remove,
    replaceItem,
    clear,
    stopOrder,
    stopNotice,
    clearStopNotice,
    setPayment,
    check,
    confirm,
    payCash,
    createQr,
    reconcile,
    print,
    complete,
    cancel,
    held: Boolean(stored.orderId),
  };
}
