import { useState, type FormEvent } from 'react';
import { useSession } from '../../app/auth';
import { useTask } from '../../app/data';
import { Button, Field } from '../../components/ui';
import { ApiError } from '../../services/api';

export default function LoginPage() {
  const session = useSession();
  const task = useTask();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    task.setError('');
    if (!username.trim() || !password) return;
    void task.run(async () => {
      try {
        await session.login(username.trim(), password);
      } catch (error) {
        if (error instanceof ApiError && error.status === 401)
          throw new Error('Tài khoản hoặc mật khẩu không chính xác');
        throw error;
      }
    });
  };
  return (
    <main className="login-page">
      <section className="login-brand">
        <img src="/assets/figma/261-28311/58672.png" alt="" />
        <h1>Mê Cà Phê</h1>
        <p>Hệ thống quản lý</p>
      </section>
      <section className="login-form-region">
        <form className="login-form" onSubmit={submit} noValidate>
          <h2>Đăng nhập</h2>
          <Field
            label="Tên tài khoản"
            autoComplete="username"
            value={username}
            onChange={(event) => { setUsername(event.target.value); task.setError(''); }}
            error={submitted && !username.trim() ? 'Vui lòng nhập tên tài khoản.' : undefined}
            required
            maxLength={50}
          />
          <div className="password-field">
            <Field
              label="Mật khẩu"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              onChange={(event) => { setPassword(event.target.value); task.setError(''); }}
              error={submitted && !password ? 'Vui lòng nhập mật khẩu.' : undefined}
              required
              maxLength={128}
            />
            <button
              type="button"
              className="password-toggle"
              aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
              aria-pressed={showPassword}
              onClick={() => setShowPassword((v) => !v)}
            >
              <img src="/assets/figma/261-28311/cbde3.svg" alt="" />
              <img src="/assets/figma/261-28311/b18d2.svg" alt="" />
            </button>
          </div>
          {(task.error || session.error) && <p className="login-error" role="alert">{task.error || session.error}</p>}
          <Button variant="primary" type="submit" disabled={task.pending}>
            Đăng nhập
          </Button>
        </form>
      </section>
    </main>
  );
}
