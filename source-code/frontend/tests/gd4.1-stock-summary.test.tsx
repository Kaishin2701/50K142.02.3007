import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DataProvider } from '../src/app/data';
import InventoryPage from '../src/features/inventory/InventoryPage';

const warningMaterial = {
  ma_nguyen_lieu: '12345678-1234-4234-8234-123456789012',
  ten_nguyen_lieu: 'Cà phê hạt',
  don_vi_tinh: 'kg',
  ton_ly_thuyet: 5.5,
  ton_kha_dung: 4.5,
  ton_thuc_te_gan_nhat: 3.5,
  muc_ton_toi_thieu: 6,
  trang_thai: 'Sắp hết',
};
const normalMaterial = {
  ...warningMaterial,
  ma_nguyen_lieu: '22345678-1234-4234-8234-123456789012',
  ten_nguyen_lieu: 'Đường',
  ton_ly_thuyet: 10,
  ton_thuc_te_gan_nhat: 10.5,
  muc_ton_toi_thieu: 3,
  trang_thai: 'Đủ tồn',
};

function response(data: unknown, status = 200) {
  return new Response(
    JSON.stringify(
      status < 400
        ? { data }
        : { error: { code: 'TEST_ERROR', message: 'Không thể tải dữ liệu.' } },
    ),
    { status, headers: { 'Content-Type': 'application/json' } },
  );
}

let fetchMock: ReturnType<typeof vi.fn>;
let materials: typeof warningMaterial[] = [];
let failRequest = false;

beforeEach(() => {
  materials = [];
  failRequest = false;
  fetchMock = vi.fn(async () =>
    failRequest ? response(null, 500) : response(materials),
  );
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderStock() {
  return render(
    <DataProvider>
      <InventoryPage page="stock" />
    </DataProvider>,
  );
}

function expectReadOnlyMaterialsRequest() {
  for (const [input, options] of fetchMock.mock.calls) {
    const url = new URL(String(input), 'http://localhost');
    expect(url.pathname).toBe('/api/inventory/materials');
    expect(options?.method ?? 'GET').toBe('GET');
    expect(options?.body).toBeUndefined();
  }
}

describe('GD4.1 stock summary', () => {
  it('counts warning materials from the API and formats material IDs and quantities', async () => {
    materials = [warningMaterial, normalMaterial];
    renderStock();

    expect(
      await screen.findByText('Có 1 nguyên liệu dưới mức tồn tối thiểu'),
    ).toBeTruthy();
    expect(screen.getByText('12345678')).toBeTruthy();
    expect(screen.getByText('5,5')).toBeTruthy();
    expect(screen.queryByText(/khả dụng/)).toBeNull();
    expect(screen.getByText('Bình thường')).toBeTruthy();
    expect(screen.getByText('Sắp hết')).toBeTruthy();
    expectReadOnlyMaterialsRequest();
  });

  it('shows the normal notice when all materials are above the minimum', async () => {
    materials = [normalMaterial];
    renderStock();

    expect(
      await screen.findByText(
        'Tất cả nguyên liệu đều trên mức tồn tối thiểu.',
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/Có \d+ nguyên liệu/)).toBeNull();
    expectReadOnlyMaterialsRequest();
  });

  it('shows the dedicated empty state without a successful-stock notice', async () => {
    renderStock();

    expect(
      await screen.findByText('Chưa có nguyên liệu nào trong kho.'),
    ).toBeTruthy();
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByRole('table')).toBeNull();
    expectReadOnlyMaterialsRequest();
  });

  it('does not present a loading request as an empty inventory', async () => {
    let releaseRequest: ((value: Response) => void) | undefined;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          releaseRequest = resolve;
        }),
    );
    renderStock();

    expect(await screen.findByRole('status')).toBeTruthy();
    expect(screen.queryByText('Chưa có nguyên liệu nào trong kho.')).toBeNull();
    expect(screen.queryByText(/Có \d+ nguyên liệu/)).toBeNull();

    await waitFor(() => expect(releaseRequest).toBeDefined());
    releaseRequest?.(response([]));
    expect(
      await screen.findByText('Chưa có nguyên liệu nào trong kho.'),
    ).toBeTruthy();
  });

  it('shows the error state and retries the same read-only endpoint', async () => {
    failRequest = true;
    renderStock();
    const user = userEvent.setup();

    expect(
      await screen.findByText(
        'Không thể tải dữ liệu tồn kho. Vui lòng thử lại.',
      ),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Tải lại' })).toBeTruthy();
    expect(screen.queryByText('Chưa có nguyên liệu nào trong kho.')).toBeNull();
    expect(screen.queryByRole('table')).toBeNull();

    failRequest = false;
    await user.click(screen.getByRole('button', { name: 'Tải lại' }));
    expect(
      await screen.findByText('Chưa có nguyên liệu nào trong kho.'),
    ).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expectReadOnlyMaterialsRequest();
  });
});
