import { useEffect, useState } from 'react';
import { useDataStore, useResource, useTask } from '../../app/data';
import { api, query } from '../../services/api';
import type { User } from '../../services/models';
import {
  Button,
  Loading,
  Modal,
  Pagination,
} from '../../components/ui';

import CreateAccountDialog from './CreateAccountDialog';
import EditAccountDialog from './EditAccountDialog';
import AccountStatusDialog from './AccountStatusDialog';
import { useSession } from '../../app/auth';

export default function AccountsPage() {
  const { user: currentUser } = useSession();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<User | 'new' | null>(null);
  const [detail, setDetail] = useState<User | null>(null);
  const [status, setStatus] = useState<User | null>(null);
  const [createSuccessNotice, setCreateSuccessNotice] = useState(false);
  const [editSuccessNotice, setEditSuccessNotice] = useState(false);
  const [editFailNotice, setEditFailNotice] = useState(false);
  const [statusToast, setStatusToast] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const task = useTask();
  const { refresh } = useDataStore();
  const users = useResource<User[]>(
    '/users?' + query({ page, limit: 20, search: filter }),
    [],
  );

  const openEditor = (user: User | 'new') => {
    setStatusToast(null);
    setEditSuccessNotice(false);
    setEditFailNotice(false);
    setEditing(user);
  };

  useEffect(() => {
    if (!createSuccessNotice) return;
    const timer = window.setTimeout(() => setCreateSuccessNotice(false), 4000);
    return () => window.clearTimeout(timer);
  }, [createSuccessNotice]);

  useEffect(() => {
    if (!editSuccessNotice) return;
    const timer = window.setTimeout(() => setEditSuccessNotice(false), 4000);
    return () => window.clearTimeout(timer);
  }, [editSuccessNotice]);

  useEffect(() => {
    if (!editFailNotice) return;
    const timer = window.setTimeout(() => setEditFailNotice(false), 4000);
    return () => window.clearTimeout(timer);
  }, [editFailNotice]);

  useEffect(() => {
    if (!statusToast) return;
    const timer = window.setTimeout(() => setStatusToast(null), 4000);
    return () => window.clearTimeout(timer);
  }, [statusToast]);

  return (
    <div className="accounts-page">
      <div className="accounts-top-bar">
        <div className="accounts-title-group">
          <p className="accounts-breadcrumb">
            QUẢN LÝ TÀI KHOẢN / DANH SÁCH TÀI KHOẢN
          </p>
          <h1 className="accounts-title">Quản lý tài khoản</h1>
        </div>
        <Button
          variant="primary"
          className="accounts-create-btn"
          onClick={() => openEditor('new')}
        >
          Tạo tài khoản
        </Button>
      </div>

      <div className="accounts-search-card">
        <form
          className="accounts-search-form"
          onSubmit={(event) => {
            event.preventDefault();
            setFilter(search.trim());
            setPage(1);
          }}
        >
          <input
            className="accounts-search-input"
            aria-label="Tìm kiếm"
            placeholder="Tìm kiếm"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            maxLength={100}
          />
          <button type="submit" className="accounts-search-btn">
            Tìm kiếm
          </button>
        </form>
      </div>

      <div className="accounts-card">
        <h2 className="accounts-card-title">Danh sách tài khoản</h2>
        <hr className="accounts-card-divider" />

        <Loading active={users.loading} />

        {users.error ? (
          <div className="accounts-message-box is-error" role="alert">
            Không thể tải danh sách tài khoản. Vui lòng thử lại
          </div>
        ) : users.data.length === 0 ? (
          <div className="accounts-message-box">
            {filter ? 'Không tìm thấy tài khoản' : 'Chưa có tài khoản nào'}
          </div>
        ) : (
          <div className="accounts-table-wrapper">
            <table className="accounts-table">
              <thead>
                <tr>
                  <th scope="col">Tên đăng nhập</th>
                  <th scope="col">Họ và tên</th>
                  <th scope="col">Số điện thoại</th>
                  <th scope="col">Vai trò</th>
                  <th scope="col">Trạng thái tài khoản</th>
                  <th scope="col" className="accounts-col-actions">
                    <span className="sr-only">Thao tác</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {users.data.map((user) => (
                  <tr key={user.ma_nguoi_dung}>
                    <td className="accounts-td-username">{user.ten_dang_nhap}</td>
                    <td className="accounts-td-name">{user.ho_ten}</td>
                    <td className="accounts-td-phone">{user.so_dien_thoai}</td>
                    <td className="accounts-td-role">{user.vai_tro}</td>
                    <td className="accounts-td-status">
                      <span
                        className={`accounts-status-badge ${
                          user.trang_thai === 'Đã khóa'
                            ? 'is-locked'
                            : 'is-active'
                        }`}
                      >
                        {user.trang_thai}
                      </span>
                    </td>
                    <td className="accounts-col-actions">
                      <div className="accounts-row-actions">
                        <Button
                          variant="quiet"
                          className="accounts-action-btn"
                          onClick={() => setDetail(user)}
                        >
                          Chi tiết
                        </Button>
                        <Button
                          variant="quiet"
                          className="accounts-action-btn"
                          onClick={() => openEditor(user)}
                        >
                          Chỉnh sửa
                        </Button>
                        <Button
                          variant="quiet"
                          className="accounts-action-btn"
                          onClick={() => {
                            task.setError('');
                            setCreateSuccessNotice(false);
                            setEditSuccessNotice(false);
                            setEditFailNotice(false);
                            setStatusToast(null);
                            setStatus(user);
                          }}
                        >
                          {user.trang_thai === 'Đã khóa' ? 'Kích hoạt' : 'Khóa'}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {(page > 1 || users.data.length === 20) && (
          <Pagination
            page={page}
            hasMore={users.data.length === 20}
            onChange={setPage}
          />
        )}
      </div>

      {editing === 'new' && (
        <CreateAccountDialog onClose={() => setEditing(null)} onCreated={() => {
          setEditing(null);
          refresh();
          setCreateSuccessNotice(true);
        }} />
      )}

      {/* CHỈNH SỬA TÀI KHOẢN DIALOG */}
      {editing && editing !== 'new' && (
        <EditAccountDialog
          user={editing}
          onClose={() => setEditing(null)}
          onUpdated={() => {
            setEditing(null);
            refresh();
            setEditFailNotice(false);
            setEditSuccessNotice(true);
          }}
          onFailed={() => {
            setEditSuccessNotice(false);
            setEditFailNotice(true);
          }}
        />
      )}

      {/* CHI TIẾT TÀI KHOẢN DIALOG */}
      {detail && (
        <Modal
          title="Chi tiết tài khoản"
          onClose={() => setDetail(null)}
          className="accounts-detail-modal"
        >
          <div className="accounts-detail-body">
            <div className="accounts-detail-grid">
              <div className="accounts-detail-field">
                <label className="accounts-detail-label" htmlFor="account-detail-username">Tên đăng nhập</label>
                <input
                  type="text"
                  readOnly
                  className="accounts-detail-input"
                  id="account-detail-username"
                  value={detail.ten_dang_nhap}
                />
              </div>

              <div className="accounts-detail-field">
                <label className="accounts-detail-label" htmlFor="account-detail-name">Họ và tên</label>
                <input
                  type="text"
                  readOnly
                  className="accounts-detail-input"
                  id="account-detail-name"
                  value={detail.ho_ten}
                />
              </div>

              <div className="accounts-detail-field">
                <label className="accounts-detail-label" htmlFor="account-detail-phone">Số điện thoại</label>
                <input
                  type="text"
                  readOnly
                  className="accounts-detail-input"
                  id="account-detail-phone"
                  value={detail.so_dien_thoai}
                />
              </div>

              <div className="accounts-detail-field">
                <label className="accounts-detail-label" htmlFor="account-detail-role">Vai trò</label>
                <input
                  type="text"
                  readOnly
                  className="accounts-detail-input"
                  id="account-detail-role"
                  value={detail.vai_tro}
                />
              </div>

              <div className="accounts-detail-field is-full">
                <label className="accounts-detail-label" htmlFor="account-detail-status">
                  Trạng thái tài khoản
                </label>
                <input
                  type="text"
                  readOnly
                  className="accounts-detail-input"
                  id="account-detail-status"
                  value={detail.trang_thai}
                />
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* KHÓA HOẶC KÍCH HOẠT TÀI KHOẢN DIALOG */}
      {status && (
        <AccountStatusDialog
          user={status}
          currentUser={currentUser}
          onClose={() => setStatus(null)}
          onSuccess={(action) => {
            setStatus(null);
            refresh();
            setStatusToast({
              type: 'success',
              message:
                action === 'lock'
                  ? 'Khóa tài khoản thành công'
                  : 'Kích hoạt tài khoản thành công',
            });
          }}
          onError={(action) => {
            setStatusToast({
              type: 'error',
              message:
                action === 'lock'
                  ? 'Khóa tài khoản thất bại'
                  : 'Kích hoạt tài khoản thất bại',
            });
          }}
        />
      )}
      {/* THÔNG BÁO TẠO THÀNH CÔNG THEO tải xuống (7).png */}
      {createSuccessNotice && (
        <div className="accounts-toast-success" role="status">
          Tạo tài khoản thành công
        </div>
      )}
      {/* THÔNG BÁO CẬP NHẬT THÀNH CÔNG THEO tải xuống (5).png */}
      {editSuccessNotice && (
        <div className="accounts-toast-success" role="status">
          Cập nhật thông tin tài khoản thành công
        </div>
      )}
      {/* THÔNG BÁO CẬP NHẬT THẤT BÀI THEO tải xuống (6).png */}
      {editFailNotice && (
        <div className="accounts-toast-error" role="alert">
          Cập nhật thông tin tài khoản thất bại
        </div>
      )}
      {/* THÔNG BÁO KHÓA / KÍCH HOẠT THEO tải xuống (2).png, (3).png, (4).png */}
      {statusToast && (
        <div
          className={
            statusToast.type === 'success'
              ? 'accounts-toast-success'
              : 'accounts-toast-error'
          }
          role={statusToast.type === 'success' ? 'status' : 'alert'}
        >
          {statusToast.message}
        </div>
      )}
    </div>
  );
}
