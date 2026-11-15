import { useEffect, useState } from 'react';
import { api } from '../../services/api';
import type { PreparationTicket } from '../../services/models';
import { Button, ErrorMessage, Loading, Modal } from '../../components/ui';
import './preparation-ticket.css';

export default function PreparationTicketButton({
  orderId,
  paid,
}: {
  orderId: string;
  paid: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [retry, setRetry] = useState(0);
  const [ticket, setTicket] = useState<PreparationTicket | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoading(true);
    setError('');
    api<PreparationTicket>(`/orders/${orderId}/preparation-ticket`, {
      signal: controller.signal,
    })
      .then((result) => {
        if (!controller.signal.aborted) setTicket(result);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted)
          setError(cause instanceof Error ? cause.message : 'Không thể tải phiếu pha chế.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [open, orderId, retry]);

  return (
    <>
      <Button
        variant="secondary"
        disabled={!paid}
        onClick={() => {
          setTicket(null);
          setOpen(true);
        }}
      >
        Phiếu pha chế
      </Button>
      {open && (
        <Modal title="Phiếu pha chế" onClose={() => setOpen(false)}>
          <div className="dialog-body preparation-ticket-body">
            <Loading active={loading} />
            <ErrorMessage message={error} />
            {error && <Button onClick={() => setRetry((value) => value + 1)}>Thử tải lại</Button>}
            {ticket && (
              <>
                <article className="preparation-ticket-print" id="preparation-ticket-print">
                  <h1>Phiếu pha chế</h1>
                  <p>Mã đơn: {ticket.ma_don_hien_thi}</p>
                  <p>Trạng thái: {ticket.trang_thai_pha_che}</p>
                  <ul>
                    {ticket.items.map((line, index) => (
                      <li key={`${line.ten_mon}-${index}`}>
                        <span>{line.ten_mon}</span>
                        <strong>× {line.so_luong}</strong>
                      </li>
                    ))}
                  </ul>
                </article>
                <footer className="dialog-actions">
                  <Button onClick={() => setOpen(false)}>Đóng</Button>
                  <Button variant="primary" onClick={() => window.print()}>In phiếu</Button>
                </footer>
              </>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
