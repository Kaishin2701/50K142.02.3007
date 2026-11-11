import { useState, type FormEvent } from 'react';
import { useDataStore, useResource, useTask } from '../../app/data';
import { api, query } from '../../services/api';
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
  vai_tro: User['vai_tro'];
  mat_khau: string;
  xac_nhan_mat_khau: string;
};
const emptyForm: AccountForm = {
  ten_dang_nhap: '',
  ho_ten: '',
  so_dien_thoai: '',
  vai_tro: 'Nhân viên',
  mat_khau: '',
  xac_nhan_mat_khau: '',
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
          },
    );
  };
  const field = (key: keyof AccountForm, value: string) =>
    setForm((previous) => ({ ...previous, [key]: value }));
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (editing === 'new' && form.mat_khau !== form.xac_nhan_mat_khau) {
      task.setError('Mật khẩu xác nhận không khớp.');
      return;
    }
    task.setError('');
    setConfirming(true);
  };
  const save = () =>
    void task.run(async () => {
      const { mat_khau, xac_nhan_mat_khau, ...profile } = form;
      await api(
        '/users' + (editing === 'new' ? '' : '/' + editing!.ma_nguoi_dung),
        {
          method: editing === 'new' ? 'POST' : 'PATCH',
          body: editing === 'new' ? form : profile,
        },
      );
      setEditing(null);
      setConfirming(false);
      refresh();
      notice(
        editing === 'new'
          ? 'Tạo tài khoản thành công.'
          : 'Lưu thay đổi thành công.',
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
          <form onSubmit={submit}>
            <div className="dialog-body">
              <div className="form-grid">
                <Field
                  label="Tên đăng nhập"
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
                  value={form.ho_ten}
                  onChange={(event) => field('ho_ten', event.target.value)}
                  maxLength={100}
                  required
                />
                <Field
                  label="Số điện thoại"
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
                  value={form.vai_tro}
                  onChange={(event) => field('vai_tro', event.target.value)}
                >
                  <option>Nhân viên</option>
                  <option>Quản lý</option>
                </SelectField>
                {editing === 'new' && (
                  <>
                    <Field
                      label="Mật khẩu"
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
          title={
            editing === 'new'
              ? 'Xác nhận tạo tài khoản'
              : 'Xác nhận lưu thay đổi'
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
        <Modal title="Chi tiết tài khoản" onClose={() => setDetail(null)}>
          <div className="dialog-body">
            <dl className="detail-grid">
              <dt>Tên đăng nhập</dt>
              <dd>{detail.ten_dang_nhap}</dd>
              <dt>Họ và tên</dt>
              <dd>{detail.ho_ten}</dd>
              <dt>Số điện thoại</dt>
              <dd>{detail.so_dien_thoai}</dd>
              <dt>Vai trò</dt>
              <dd>{detail.vai_tro}</dd>
              <dt>Trạng thái tài khoản</dt>
              <dd>{detail.trang_thai}</dd>
            </dl>
          </div>
        </Modal>
      )}
      {status && (
        <Confirm
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
              notice('Cập nhật trạng thái tài khoản thành công.');
            })
          }
        >
          {status.ho_ten} · {status.ten_dang_nhap}
        </Confirm>
      )}
    </>
  );
}
