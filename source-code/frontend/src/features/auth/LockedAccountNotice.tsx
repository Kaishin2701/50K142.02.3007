import { Button, Modal } from '../../components/ui';

const assets = '/assets/figma/261-45207/';

export function LockedAccountNotice({ onDismiss }: { onDismiss(): void }) {
  return (
    <Modal title="Bạn đã bị đăng xuất" className="locked-account-dialog" showClose={false} onClose={onDismiss}>
      <div className="dialog-body">
        <img className="locked-account-frame" src={assets + '6f095.svg'} alt="" />
        <span className="locked-account-icon" aria-hidden="true">
          <img className="lock-circle" src={assets + 'f5702.svg'} alt="" />
          <img className="lock-shackle" src={assets + 'd53b2.svg'} alt="" />
          <img className="lock-body" src={assets + '280a0.svg'} alt="" />
          <img className="lock-keyhole" src={assets + '02acc.svg'} alt="" />
          <img className="lock-keyhole-stem" src={assets + 'd330c.svg'} alt="" />
        </span>
        <p>Tài khoản của bạn đã bị khóa.<br />Bạn không thể tiếp tục sử dụng<br />hệ thống. Vui lòng liên hệ quản lý.</p>
      </div>
      <footer className="dialog-actions">
        <img className="locked-account-divider" src={assets + '84bfb.svg'} alt="" />
        <Button variant="primary" onClick={onDismiss}>
          <img src={assets + '83787.svg'} alt="" />
          <span>Đã hiểu</span>
        </Button>
      </footer>
    </Modal>
  );
}
