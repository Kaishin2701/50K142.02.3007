import { useState, type FormEvent } from 'react';
import { useSession } from '../../app/auth';
import { useTask } from '../../app/data';
import { Button, ErrorMessage, Field } from '../../components/ui';

export default function LoginPage() {
  const session = useSession();
  const task = useTask();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void task.run(async () => {
      await session.login(username.trim(), password);
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
        <form className="login-form" onSubmit={submit}>
          <h2>Đăng nhập</h2>
          <Field
            label="Tên tài khoản"
            autoComplete="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            required
            maxLength={50}
          />
          <div className="password-field">
            <Field
              label="Mật khẩu"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
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
          <ErrorMessage message={task.error || session.error} />
          <Button variant="primary" type="submit" disabled={task.pending}>
            Đăng nhập
          </Button>
        </form>
      </section>
    </main>
  );
}
