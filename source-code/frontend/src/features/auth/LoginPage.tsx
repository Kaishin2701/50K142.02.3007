import { useState, type FormEvent } from 'react';
import { useSession } from '../../app/auth';
import { useTask } from '../../app/data';
import { store } from '../../app/store';
import { Button, Modal } from '../../components/ui';
import { ApiError } from '../../services/api';

export default function LoginPage() {
  const session = useSession();
  const task = useTask();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const usernameError =
    submitted && !username.trim() ? 'Vui lòng nhập tên tài khoản.' : '';
  const passwordError =
    submitted && !password ? 'Vui lòng nhập mật khẩu.' : '';
  const serverError = task.error || session.error;
  const locked = session.sessionNotice?.reason === 'locked';
  const dismissNotice = () => {
    session.dismissNotice();
    requestAnimationFrame(() => document.getElementById('login-username')?.focus());
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    const trimmedUser = username.trim();
    if (!trimmedUser || !password) {
      return;
    }
    void task.run(async () => {
      try {
        await session.login(trimmedUser, password);
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          setSubmitted(false);
          setPassword('');
          setShowPassword(false);
          if (error.code === 'ACCOUNT_LOCKED') return;
        }
        throw error;
      }
    });
  };

  return (
    <main className="login-page">
      <section className="login-brand">
        <div className="brand-badge">
          <img src="/logo.png" alt={store.name} />
        </div>
        <h1>{store.name}</h1>
        <p>Hệ thống quản lý</p>
      </section>

      <section className="login-form-region">
        <form className="login-form" onSubmit={submit} noValidate>
          <h2>Đăng nhập</h2>

          <div className="login-field-group">
            <label htmlFor="login-username" className="login-label">
              Tên tài khoản
            </label>
            <input
              id="login-username"
              className={`login-input${usernameError ? ' is-invalid' : ''}`}
              autoComplete="username"
              aria-invalid={Boolean(usernameError)}
              aria-describedby={usernameError ? 'login-username-error' : undefined}
              value={username}
              onChange={(event) => {
                setUsername(event.target.value);
                if (task.error) task.setError('');
              }}
              maxLength={50}
            />
            {usernameError && (
              <span id="login-username-error" className="field-error-message" role="alert">
                {usernameError}
              </span>
            )}
          </div>

          <div className="login-field-group">
            <label htmlFor="login-password" className="login-label">
              Mật khẩu
            </label>
            <div className="password-input-wrapper">
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                className={`login-input${passwordError ? ' is-invalid' : ''}`}
                autoComplete="current-password"
                aria-invalid={Boolean(passwordError)}
                aria-describedby={passwordError || serverError ? 'login-password-error' : undefined}
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  if (task.error) task.setError('');
                }}
                maxLength={128}
              />
              <button
                type="button"
                className="password-toggle-btn"
                aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                aria-controls="login-password"
                onClick={() => setShowPassword((prev) => !prev)}
              >
                {showPassword ? (
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                ) : (
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M1.5 12c3-3 6.5-4.5 10.5-4.5s7.5 1.5 10.5 4.5c-3 3-6.5 4.5-10.5 4.5S4.5 15 1.5 12Z" />
                    <circle cx="12" cy="12" r="2.8" />
                  </svg>
                )}
              </button>
            </div>
            {passwordError && (
              <span id="login-password-error" className="field-error-message" role="alert">
                {passwordError}
              </span>
            )}
            {serverError && !passwordError && (
              <span id="login-password-error" className="field-error-message" role="alert">
                {serverError}
              </span>
            )}
          </div>

          <Button
            variant="primary"
            type="submit"
            className="login-submit-btn"
            disabled={task.pending}
          >
            {task.pending ? 'Đang đăng nhập…' : 'Đăng nhập'}
          </Button>
        </form>
      </section>

      {session.sessionNotice && (
        <Modal
          title="Bạn đã bị đăng xuất"
          className={locked ? "session-ended-card is-locked" : "session-ended-card"}
          onClose={dismissNotice}
        >
          <div
            className="session-ended-content"
          >
            <div className="session-ended-top">
              <div className="session-ended-icon-wrapper" aria-hidden="true">
                <svg
                  width="26"
                  height="30"
                  viewBox="0 0 24 32"
                  fill="none"
                >
                  <path
                    d="M5.5 14V9a6.5 6.5 0 0 1 13 0v5"
                    stroke="#C67D53"
                    strokeWidth="3"
                    strokeLinecap="round"
                  />
                  <rect
                    x="2"
                    y="13"
                    width="20"
                    height="19"
                    rx="4"
                    fill="#C67D53"
                  />
                  <circle cx="12" cy="20" r="1.8" fill="#FFFDF8" />
                  <rect
                    x="11.2"
                    y="20"
                    width="1.6"
                    height="6"
                    rx="0.8"
                    fill="#FFFDF8"
                  />
                </svg>
              </div>

              <div className="session-ended-body">
                <h2 id="session-ended-title" className="session-ended-title">
                  Bạn đã bị đăng xuất
                </h2>

                <div className="session-ended-message">
                  {locked ? (
                    <>
                      <p>Tài khoản của bạn đã bị khóa.</p>
                      <p>
                        Bạn không thể tiếp tục sử dụng hệ thống. Vui lòng liên hệ
                        quản lý.
                      </p>
                    </>
                  ) : (
                    <>
                      <p>Phiên làm việc của bạn đã kết thúc.</p>
                      <p>Vui lòng đăng nhập lại để tiếp tục sử dụng hệ thống.</p>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="session-ended-divider" />

            <button
              type="button"
              className="session-ended-submit-btn"
              onClick={dismissNotice}
              onKeyDown={(event) => {
                if (event.key === 'Tab') {
                  event.preventDefault(); event.currentTarget.focus();
                }
              }}
              autoFocus
            >
              Đã hiểu
            </button>
          </div>
        </Modal>
      )}
    </main>
  );
}
