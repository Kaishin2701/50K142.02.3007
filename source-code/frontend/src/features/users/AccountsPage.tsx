import { useState, type FormEvent } from 'react';
import { useDataStore, useResource, useTask } from '../../app/data';
import { api, ApiError, query } from '../../services/api';
import type { User } from '../../services/models';
import {
  Badge,
  Button,
  Confirm,
  DataTable,
  ErrorMessage,
  Field,
  Loading,
  Modal,
  PageHeader,
  Panel,
  Pagination,
  SelectField,
  useNotice,
} from '../../components/ui';

type AccountForm = {
  ten_dang_nhap: string;
  ho_ten: string;
  so_dien_thoai: string;
  vai_tro: User['vai_tro'] | '';
  mat_khau: string;
  xac_nhan_mat_khau: string;
  trang_thai: User['trang_thai'];
};
const emptyForm: AccountForm = {
  ten_dang_nhap: '',
  ho_ten: '',
  so_dien_thoai: '',
  vai_tro: '',
  mat_khau: '',
  xac_nhan_mat_khau: '',
  trang_thai: 'Đang hoạt động',
};

export default function AccountsPage() {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<User | 'new' | null>(null);
  const [detail, setDetail] = useState<User | null>(null);
  const [status, setStatus] = useState<User | null>(null);
  const [form, setForm] = useState<AccountForm>(emptyForm);
  const [confirming, setConfirming] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof AccountForm, string>>>({});
  const [formError, setFormError] = useState('');
  const task = useTask();
  const { refresh } = useDataStore();
  const notice = useNotice();
  const users = useResource<User[]>(
    '/users?' + query({ page, limit: 20, search: filter }),
    [],
  );
  const openEditor = (user: User | 'new') => {
    setEditing(user);
    setConfirming(false);
    setFieldErrors({});
    setFormError('');
    task.setError('');
    setForm(
      user === 'new'
        ? { ...emptyForm }
        : {
            ...emptyForm,
            ten_dang_nhap: user.ten_dang_nhap,
            ho_ten: user.ho_ten,
            so_dien_thoai: user.so_dien_thoai,
            vai_tro: user.vai_tro,
            trang_thai: user.trang_thai,
          },
    );
  };
  const field = (key: keyof AccountForm, value: string) => {
    setForm((previous) => ({ ...previous, [key]: value }));
    setFieldErrors((previous) => {
      const next = { ...previous };
      delete next[key];
      if (key === 'mat_khau') delete next.xac_nhan_mat_khau;
      return next;
    });
    setFormError('');
    task.setError('');
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const errors: Partial<Record<keyof AccountForm, string>> = {};
    const required: (keyof AccountForm)[] = ['ten_dang_nhap', 'ho_ten', 'so_dien_thoai', 'vai_tro'];
    if (editing === 'new') required.push('mat_khau', 'xac_nhan_mat_khau');
    for (const key of required) if (!form[key].trim()) errors[key] = '';
    const missing = Object.keys(errors).length > 0;
    if (!missing) {
      if (!/^[a-zA-Z0-9_.-]{3,50}$/.test(form.ten_dang_nhap))
        errors.ten_dang_nhap = 'Tên đăng nhập không hợp lệ (3–50 ký tự).';
      if (!/^\+?[0-9]{9,15}$/.test(form.so_dien_thoai))
        errors.so_dien_thoai = 'Số điện thoại không hợp lệ.';
      if (editing === 'new' && (form.mat_khau.length < 8 || form.mat_khau.length > 128))
        errors.mat_khau = 'Mật khẩu phải có từ 8 đến 128 ký tự.';
      if (editing === 'new' && form.mat_khau !== form.xac_nhan_mat_khau)
        errors.xac_nhan_mat_khau = 'Vui lòng xác nhận lại mật khẩu';
    }
    setFieldErrors(errors);
    setFormError(missing ? 'Vui lòng điền đầy đủ thông tin bắt buộc' : '');
    task.setError('');
    if (Object.keys(errors).length) return;
    setConfirming(true);
  };
  const save = () =>
    void task.run(async () => {
      const { mat_khau, xac_nhan_mat_khau, ...profile } = form;
      const { trang_thai, ...newProfile } = profile;
      try { await api(
        '/users' + (editing === 'new' ? '' : '/' + editing!.ma_nguoi_dung),
        {
          method: editing === 'new' ? 'POST' : 'PATCH',
          body: editing === 'new' ? { ...newProfile, mat_khau, xac_nhan_mat_khau } : profile,
        },
      ); } catch (error) {
        const key = error instanceof ApiError
          ? error.code === 'DUPLICATE_USERNAME' ? 'ten_dang_nhap'
            : error.code === 'DUPLICATE_PHONE' ? 'so_dien_thoai' : null
          : null;
        if (!key) throw error;
        setFieldErrors({ [key]: key === 'ten_dang_nhap'
          ? 'Tên đăng nhập đã tồn tại. Vui lòng kiểm tra lại'
          : 'Số điện thoại đã tồn tại. Vui lòng kiểm tra lại' });
        setConfirming(false);
        return;
      }
      setEditing(null);
      setConfirming(false);
      refresh();
      notice(
        editing === 'new'
          ? 'Tạo tài khoản thành công'
          : 'Cập nhật thông tin tài khoản thành công',
      );
    });
  return (
    <>
      <PageHeader
        title="Quản lý tài khoản"
        actions={
          <Button variant="primary" onClick={() => openEditor('new')}>
            Tạo tài khoản
          </Button>
        }
      />
      <Panel className="account-search-panel">
        <form
          className="filter-bar"
          onSubmit={(event) => {
            event.preventDefault();
            setFilter(search.trim());
            setPage(1);
          }}
        >
          <Field
            label="Tìm kiếm"
            placeholder="Tìm kiếm"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            maxLength={100}
          />
          <Button type="submit">Tìm kiếm</Button>
        </form>
      </Panel>
      <Panel title="Danh sách tài khoản" className="account-list-panel">
        <Loading active={users.loading} />
        <ErrorMessage message={users.error} />
        <DataTable
          rows={users.data}
          rowKey={(user) => user.ma_nguoi_dung}
          empty="Không tìm thấy tài khoản."
          columns={[
            {
              key: 'username',
              label: 'Tên đăng nhập',
              render: (user) => user.ten_dang_nhap,
            },
            { key: 'name', label: 'Họ và tên', render: (user) => user.ho_ten },
            {
              key: 'phone',
              label: 'Số điện thoại',
              render: (user) => user.so_dien_thoai,
            },
            { key: 'role', label: 'Vai trò', render: (user) => user.vai_tro },
            {
              key: 'status',
              label: 'Trạng thái tài khoản',
              render: (user) => <Badge>{user.trang_thai}</Badge>,
            },
            {
              key: 'actions',
              label: '',
              render: (user) => (
                <div className="table-actions">
                  <Button onClick={() => setDetail(user)}>Chi tiết</Button>
                  <Button onClick={() => openEditor(user)}>Chỉnh sửa</Button>
                  <Button
                    onClick={() => {
                      task.setError('');
                      setStatus(user);
                    }}
                  >
                    {user.trang_thai === 'Đã khóa' ? 'Kích hoạt' : 'Khóa'}
                  </Button>
                </div>
              ),
            },
          ]}
        />
        <Pagination
          page={page}
          hasMore={users.data.length === 20}
          onChange={setPage}
        />
      </Panel>
      <p className="breadcrumb">QUẢN LÝ TÀI KHOẢN</p>
      {editing && (
        <Modal
          title={
            editing === 'new'
              ? 'Tạo tài khoản'
              : 'Chỉnh sửa thông tin tài khoản'
          }
          onClose={() => setEditing(null)}
          busy={task.pending}
          className="account-form-dialog"
        >
          <form onSubmit={submit} noValidate>
            <div className="dialog-body">
              <div className="form-grid">
                <Field
                  label="Tên đăng nhập"
                  aria-invalid={'ten_dang_nhap' in fieldErrors || undefined}
                  error={fieldErrors.ten_dang_nhap}
                  value={form.ten_dang_nhap}
                  onChange={(event) =>
                    field('ten_dang_nhap', event.target.value)
                  }
                  pattern="[a-zA-Z0-9_.-]{3,50}"
                  required
                  autoComplete="off"
                />
                <Field
                  label="Họ và tên"
                  aria-invalid={'ho_ten' in fieldErrors || undefined}
                  error={fieldErrors.ho_ten}
                  value={form.ho_ten}
                  onChange={(event) => field('ho_ten', event.target.value)}
                  maxLength={100}
                  required
                />
                <Field
                  label="Số điện thoại"
                  aria-invalid={'so_dien_thoai' in fieldErrors || undefined}
                  error={fieldErrors.so_dien_thoai}
                  type="tel"
                  value={form.so_dien_thoai}
                  onChange={(event) =>
                    field('so_dien_thoai', event.target.value)
                  }
                  pattern="\+?[0-9]{9,15}"
                  required
                />
                <SelectField
                  label="Vai trò"
                  required
                  aria-invalid={'vai_tro' in fieldErrors || undefined}
                  value={form.vai_tro}
                  onChange={(event) => field('vai_tro', event.target.value)}
                >
                  <option value="" disabled></option>
                  <option>Nhân viên</option>
                  <option>Quản lý</option>
                </SelectField>
                {editing !== 'new' && <SelectField label="Trạng thái tài khoản" value={form.trang_thai} onChange={event => field('trang_thai', event.target.value)} className="account-status-field">
                  <option>Đang hoạt động</option><option>Đã khóa</option>
                </SelectField>}
                {editing === 'new' && (
                  <>
                    <Field
                      label="Mật khẩu"
                      aria-invalid={'mat_khau' in fieldErrors || undefined}
                      error={fieldErrors.mat_khau}
                      type="password"
                      autoComplete="new-password"
                      minLength={8}
                      maxLength={128}
                      required
                      value={form.mat_khau}
                      onChange={(event) =>
                        field('mat_khau', event.target.value)
                      }
                    />
                    <Field
                      label="Xác nhận mật khẩu"
                      aria-invalid={'xac_nhan_mat_khau' in fieldErrors || undefined}
                      error={fieldErrors.xac_nhan_mat_khau}
                      type="password"
                      autoComplete="new-password"
                      required
                      value={form.xac_nhan_mat_khau}
                      onChange={(event) =>
                        field('xac_nhan_mat_khau', event.target.value)
                      }
                    />
                  </>
                )}
              </div>
              {formError && <p className="account-form-error" role="alert">{formError}</p>}
            </div>
            <div className="dialog-error">
              <ErrorMessage message={task.error} />
            </div>
            <footer className="dialog-actions">
              <Button variant="primary" type="submit" disabled={task.pending}>
                {editing === 'new' ? 'Tạo tài khoản' : 'Lưu'}
              </Button>
            </footer>
          </form>
        </Modal>
      )}
      {editing && confirming && (
        <Confirm
          className="account-confirm-dialog"
          title={
            editing === 'new'
              ? 'Xác nhận tạo tài khoản'
              : 'Xác nhận thay đổi thông tin tài khoản'
          }
          confirmLabel={editing === 'new' ? 'Tạo tài khoản' : 'Lưu'}
          onClose={() => setConfirming(false)}
          onConfirm={save}
          pending={task.pending}
          error={task.error}
        >
          {null}
        </Confirm>
      )}
      {detail && (
        <Modal title="Chi tiết tài khoản" className="account-detail-dialog" onClose={() => setDetail(null)}>
          <div className="dialog-body">
            <div className="form-grid">
              <Field label="Tên đăng nhập" value={detail.ten_dang_nhap} readOnly />
              <Field label="Họ và tên" value={detail.ho_ten} readOnly />
              <Field label="Số điện thoại" value={detail.so_dien_thoai} readOnly />
              <Field label="Vai trò" value={detail.vai_tro} readOnly />
              <Field label="Trạng thái tài khoản" value={detail.trang_thai} readOnly />
            </div>
          </div>
        </Modal>
      )}
      {status && (
        <Confirm
          className="account-status-dialog"
          title={
            status.trang_thai === 'Đã khóa'
              ? 'Kích hoạt tài khoản'
              : 'Khóa tài khoản'
          }
          onClose={() => setStatus(null)}
          pending={task.pending}
          error={task.error}
          confirmLabel={status.trang_thai === 'Đã khóa' ? 'Kích hoạt' : 'Khóa'}
          onConfirm={() =>
            void task.run(async () => {
              await api(`/users/${status.ma_nguoi_dung}/status`, {
                method: 'PATCH',
                body: {
                  trang_thai:
                    status.trang_thai === 'Đã khóa'
                      ? 'Đang hoạt động'
                      : 'Đã khóa',
                },
              });
              setStatus(null);
              refresh();
              notice(status.trang_thai === 'Đã khóa' ? 'Kích hoạt tài khoản thành công' : 'Khóa tài khoản thành công');
            })
          }
        >
          <div className="account-status-summary"><span>Tên đăng nhập</span><strong>{status.ten_dang_nhap}</strong></div>
        </Confirm>
      )}
    </>
  );
}
