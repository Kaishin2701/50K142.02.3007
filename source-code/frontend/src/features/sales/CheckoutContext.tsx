import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useSession } from '../../app/auth';
import { useDataStore, useTask } from '../../app/data';
import { api, ApiError, download } from '../../services/api';
import type { CartLine, MenuItem, Order, Payment } from '../../services/models';

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
  const storageKey = 'me-cafe-checkout-state:' + user!.ma_nguoi_dung;
  const legacyKey = 'me-cafe-checkout:' + user!.ma_nguoi_dung;
  const [stored, setStored] = useState(() =>
    readCheckout(storageKey, legacyKey),
  );
  const [order, setOrder] = useState<Order | null>(null);
  const [payment, setPayment] = useState<Payment | undefined>(
    stored.orderId ? stored.payment : undefined,
  );
  const [restoring, setRestoring] = useState(Boolean(stored.orderId));
  const [reviewing, setReviewing] = useState(Boolean(stored.orderId));
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
      if (selected)
        return selected.ma_giao_dich === previous?.ma_giao_dich
          ? { ...previous, ...selected }
          : selected;
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
    const controller = new AbortController();
    api<Order>(`/orders/${stored.orderId}`, { signal: controller.signal })
      .then((found) => {
        if (controller.signal.aborted) return;
        if (found.trang_thai_pha_che === 'Hoàn tất pha chế') {
          setStored((previous) => ({
            ...previous,
            orderId: undefined,
            cart: [],
          }));
          setOrder(null);
          setPayment(undefined);
          setReviewing(false);
        } else storeOrder(found);
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
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
        if (!controller.signal.aborted) setRestoring(false);
      });
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
  const clear = () => {
    requestKey.current = crypto.randomUUID();
    setStored({ cart: [], requestKey: requestKey.current });
    setOrder(null);
    setPayment(undefined);
    setReviewing(false);
    task.setError('');
  };
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
  const createQr = () =>
    task.run(async () => {
      setPayment(
        await api<Payment>('/payments/qr', {
          method: 'POST',
          body: { ma_don: stored.orderId },
        }),
      );
    });
  const reconcile = () =>
    task.run(async () => {
      if (!payment) throw new Error('Chưa có giao dịch QR để đối soát.');
      setPayment(
        await api<Payment>(`/payments/${payment.ma_giao_dich}/reconcile`, {
          method: 'POST',
        }),
      );
      storeOrder(await api<Order>(`/orders/${stored.orderId}`));
      refresh();
    });
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
  const cancel = () =>
    task.run(async () => {
      if (stored.orderId)
        await api(`/orders/${stored.orderId}`, { method: 'DELETE' });
      clear();
      refresh();
    });
  return {
    cart,
    order,
    payment,
    restoring,
    reviewing,
    setReviewing,
    task,
    add,
    quantity,
    remove,
    clear,
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
